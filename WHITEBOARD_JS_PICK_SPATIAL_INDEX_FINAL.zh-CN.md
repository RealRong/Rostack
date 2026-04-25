# Whiteboard JS Pick 前置方案最终文档

## 结论

在 whiteboard 里，把 edge / node / group / mindmap 的 pick 从 DOM 命中迁移到 JS 命中，**不能先迁移 pick，再补底层**。

正确顺序必须是：

1. 先完成**真实 spatial index**
2. 再完成**rect candidate query**
3. 再完成**frame-throttled pick**
4. 最后才允许把主路径 pick 迁移到 JS 方案

在这三个前置能力完成之前，不允许把以下行为切到 JS 命中：

- canvas hover
- edge hover
- node hover
- selection press target resolve
- edge body / label / endpoint / route segment pick
- marquee 以外的主指针命中

原因很简单：

- 现在的 spatial 不是“索引”，而是线性扫描
- point query 不适合 edge 命中
- 原始 `pointermove` 频率太高，不能每次都全量做 JS pick

所以如果不先把这三层设施做完，JS pick 在大数量 edge 下大概率会比 DOM 命中更卡。

---

## 当前问题

当前 spatial 的本质是：

- `Map<key, bounds>`
- query 时遍历所有 record
- 用 `rect.intersects(...)` / `containsPoint(...)` 过滤

这不是 spatial index，只是“带 query API 的全量扫描”。

因此当前成本模型是：

```ts
pick(pointerMove)
  -> scan all records
  -> filter by bounds
  -> sort candidates
  -> run precise geometry hit
```

这条链在大量 edge 下不成立。

如果把 DOM hit path 直接替换成当前这套 JS 查询：

- DOM 负担会下降
- 但 JS 主线程会被线性扫描和几何命中重新吃满

所以必须先把底层变成真正的“候选收窄”模型。

---

## 最终原则

### 1. pick 不允许直接基于 point query

最终主路径命中必须基于：

- `rect candidate query`

而不是：

- `point candidate query`

原因：

1. edge 不是点目标，而是细长路径目标
2. 实际命中半径总是带阈值
3. point query 对 edge 天然收窄能力差
4. rect query 才能统一 node / edge / group / mindmap 的候选逻辑

最终 query 入口应该统一为：

```ts
type SceneSpatialQuery = {
  rect(rect: Rect, options?: {
    kinds?: readonly SceneSpatialKind[]
  }): readonly SceneSpatialRecord[]
}
```

---

### 2. pick 不允许按原始 DOM 事件频率执行

最终主路径命中必须基于：

- `frame-throttled pick`

而不是：

- 每个 `pointermove` 都同步跑一遍 pick

原因：

1. 原始 pointer 频率可能高于渲染帧
2. UI 实际只需要“当前帧最新命中结果”
3. 命中计算和状态提交应该一起并帧

---

### 3. 命中必须分两阶段

最终命中链路必须固定为：

```ts
pointer sample
  -> rect candidate query
  -> small candidate set
  -> precise hit test
  -> choose winner
```

禁止：

```ts
pointer sample
  -> all edges
  -> precise hit test
```

---

## 最优索引方案

## 结论

whiteboard 这里最优的底层方案，不是 R-tree，不是 quadtree，而是：

- **稀疏哈希网格索引**
- **加一个 oversized record 通道**

最终命名建议：

```ts
type SceneSpatialIndex = {
  update(record: SceneSpatialRecord): void
  remove(key: SceneSpatialKey): void
  rect(rect: Rect, options?: SceneSpatialQueryOptions): readonly SceneSpatialRecord[]
}
```

内部实现建议：

- `grid`
- `oversized`
- `records`

即：

```ts
type SceneSpatialIndexState = {
  records: Map<SceneSpatialKey, SceneSpatialRecord>
  grid: Map<GridCellKey, Set<SceneSpatialKey>>
  cellsByRecord: Map<SceneSpatialKey, readonly GridCellKey[]>
  oversized: Set<SceneSpatialKey>
}
```

---

## 为什么不选 R-tree

R-tree 的问题不是理论复杂度，而是**不适合当前 whiteboard 的工程成本模型**。

这里的场景有几个特征：

1. record 更新频繁
2. 拖拽时很多 edge bounds 会在一帧内变化
3. 数据结构必须能被简单、稳定、可诊断地增量更新
4. 我们的 query 形态几乎全是“小 rect 查候选”
5. whiteboard 需要长期维护，不要把空间索引做成难调试黑盒

R-tree 的缺点在这里会比较明显：

- 插入/删除/重平衡复杂
- 实现容易出 bug
- 诊断和可视化难
- 在 JS/TS 里做高频动态更新不一定比网格更稳

---

## 为什么不选 quadtree

quadtree 也不是最优方案。

问题主要有：

1. 适合点或近似均匀分布对象，不适合大量长条 edge bounds
2. 大对象会跨很多象限，处理复杂
3. 动态更新时拆分/合并逻辑不如网格直接
4. 实际命中 query 是小 rect，不需要树结构的复杂层级

---

## 为什么选“稀疏哈希网格 + oversized”

这是这里最适合的方案，因为它同时满足：

1. 实现简单
2. 动态更新便宜
3. query 形式匹配
4. 好诊断
5. 好调参

### 优点

#### 1. 小 rect query 很适配

pointer pick 天然就是“以 pointer 为中心的一小块 query rect”。

这时网格最自然：

- 先算 query rect 覆盖了哪些 cell
- 再把这些 cell 里的 key 合并
- 候选天然局部化

#### 2. 更新便宜

record bounds 改变时只需要：

- 算旧 cell 列表
- 算新 cell 列表
- 做增删

不需要树旋转、重平衡、拆分合并。

#### 3. 可视化和诊断简单

后续想调优时，很容易打出：

- 命中了多少 cell
- 候选多少条 edge
- oversized 命中了多少
- 每帧 pick 的候选分布

这对长期优化很重要。

#### 4. 对 whiteboard 的数据形态更稳

node、edge、group、mindmap 最终都可以落成 AABB。

统一 AABB -> grid 的模型足够稳定，不需要为了少数复杂对象把索引做重。

---

## 为什么需要 oversized 通道

纯网格方案有一个问题：

- 很大的 bounds 会覆盖很多 cell

典型对象：

- 超长 edge
- 特别大的 frame
- mindmap 大树

如果这类对象直接铺进所有 cell，会导致：

- 插入成本高
- 更新成本高
- query 候选污染严重

所以必须有 oversized 通道。

最终规则建议：

```ts
if (
  coveredCellCount > maxCellsPerRecord
  || bounds.width > oversizedWorldSize
  || bounds.height > oversizedWorldSize
) {
  go to oversized
}
```

即：

- 普通对象进 grid
- 超大对象进 `oversized`

query 时：

1. 先查 grid cells
2. 再把 `oversized` 全量过一遍 bounds intersects

这样大对象数量通常很少，可接受。

---

## 最终 API 设计

## 1. Spatial Index

```ts
type SceneSpatialKind =
  | 'node'
  | 'edge'
  | 'group'
  | 'mindmap'

type SceneSpatialKey = string

type SceneSpatialRecord = {
  key: SceneSpatialKey
  kind: SceneSpatialKind
  bounds: Rect
  order: number
  item: {
    kind: SceneSpatialKind
    id: string
  }
}

type SceneSpatialQueryOptions = {
  kinds?: readonly SceneSpatialKind[]
}

type SceneSpatialIndex = {
  get(key: SceneSpatialKey): SceneSpatialRecord | undefined
  rect(
    rect: Rect,
    options?: SceneSpatialQueryOptions
  ): readonly SceneSpatialRecord[]
  update(record: SceneSpatialRecord): void
  remove(key: SceneSpatialKey): void
  reset(): void
}
```

---

## 2. Rect Candidate Query

最终命中层只依赖这个 API：

```ts
type SceneCandidateQuery = {
  pickRect(input: {
    point: Point
    radius: number
  }): Rect
  candidates(input: {
    point: Point
    radius: number
    kinds?: readonly SceneSpatialKind[]
  }): readonly SceneSpatialRecord[]
}
```

语义固定：

- `pickRect`
  - 用 world point + world radius 生成 query rect
- `candidates`
  - 只返回 AABB 粗筛后的局部候选

这层**不负责精确命中**，只负责收窄。

---

## 3. Frame-throttled Pick

最终 pick runtime 必须是 frame 级调度器：

```ts
type ScenePickRequest = {
  client: Point
  screen: Point
  world: Point
  kinds?: readonly SceneSpatialKind[]
}

type ScenePickResult = {
  target?: ScenePickTarget
  candidates: number
}

type ScenePickRuntime = {
  schedule(request: ScenePickRequest): void
  flush(): ScenePickResult | undefined
  subscribe(listener: () => void): () => void
  get(): ScenePickResult | undefined
}
```

要求：

- 同一帧内多次 `schedule` 只保留最后一次
- 只在 frame 中执行一次候选查询和精确命中
- hover/pointer 状态更新和 pick 结果一起提交

---

## 最终 pick 链路

```ts
pointermove
  -> update latest pointer sample
  -> schedule frame pick

raf
  -> build query rect
  -> spatial.rect(queryRect)
  -> candidate records
  -> precise hit test by kind
  -> choose top target
  -> publish pick result
```

---

## 精确命中策略

rect candidate query 只是粗筛。

真正选中目标时还需要按 kind 走精确命中：

```ts
type ScenePreciseHit = {
  node(record, point, radius): number | undefined
  edge(record, point, radius): number | undefined
  group(record, point, radius): number | undefined
  mindmap(record, point, radius): number | undefined
}
```

返回值语义：

- `undefined`
  - 不命中
- `number`
  - 命中距离，越小越优先

最后统一按：

1. 距离
2. scene order
3. kind priority

决出 winner。

这一步必须建立在“小候选集合”前提上，不能直接对全量 records 做。

---

## 网格参数建议

推荐初始参数：

```ts
type SceneSpatialGridConfig = {
  cellSize: number
  maxCellsPerRecord: number
  oversizedWorldSize: number
}
```

推荐默认值：

- `cellSize = 256`
- `maxCellsPerRecord = 24`
- `oversizedWorldSize = 4096`

理由：

- 256 world units 对普通 node / edge bounds 是比较稳的折中
- `maxCellsPerRecord = 24` 能防止超长 edge 污染过多 cell
- 超大 frame / mindmap / 长 edge 会自动进 oversized

最终参数不应该写死在 React 层，而应归 scene / projector 底层控制。

---

## 更新策略

必须支持增量更新。

### `update(record)`

流程：

1. 读旧 record
2. 计算旧 cell 列表
3. 计算新 cell 列表
4. 如果是 oversized：
   - 从旧位置移除
   - 放入 oversized
5. 如果是普通 grid：
   - patch cell membership
6. 更新 `records`

### `remove(key)`

流程：

1. 从 `records` 删除
2. 从 `cellsByRecord` 找到旧 cell
3. 从每个 cell 删除 key
4. 如果在 oversized，也删掉

---

## 必须先完成的验收标准

在把 pick 迁到 JS 方案前，必须满足下面全部条件。

### A. 真实 spatial index 已替换线性扫描

要求：

- `rect()` 不再线性遍历所有 record
- 有明确的 grid / oversized 状态
- 有增量更新逻辑

### B. rect candidate query 已上线

要求：

- pick 主路径只使用 `rect` 查询
- 不允许基于 `point()` 查 edge 候选

### C. frame-throttled pick 已上线

要求：

- 原始 pointer event 不直接触发同步 pick
- 一帧最多只跑一次 pick
- 同帧多次 pointermove 自动合并

### D. 诊断指标已具备

至少能打出：

- query rect 命中 cell 数
- candidate record 数
- precise hit 执行数
- oversized 命中数
- 每次 pick 总耗时

### E. 压测通过

至少要覆盖：

- 大量 edge 静止 hover
- 大量 edge 下快速 pointermove
- 拖拽高连接 node 时并发 hover

只有这些通过，才允许切掉 DOM 主命中。

---

## 明确迁移门槛

最终规则写死：

> **先完成真实 spatial index + rect candidate query + frame-throttled pick，之后才允许把主路径 pick 迁移到 JS 方案。**

反过来不允许。

也就是说：

- 不能先写 `EdgeHitQuery`
- 不能先把透明 hit path 删掉
- 不能先把 hover 改成 JS 再补索引

这些都会导致上线后在大数量 edge 下退化成更差的主线程热点。

---

## 推荐实施顺序

### P0. 替换 spatial 底层

- 用 `sparse hashed grid + oversized` 替换当前线性 spatial tree

### P1. 建 rect candidate query

- 固定所有主命中查询都先转成 query rect

### P2. 建 frame-throttled pick runtime

- 在 runtime 层统一合帧

### P3. 建精确命中层

- node / edge / group / mindmap 分 kind 精确判定

### P4. 建诊断

- 记录 cell/candidate/hit/oversized/latency

### P5. 才迁移 pick

- 先迁 edge hover
- 再迁 node hover
- 最后迁 pointer down 主命中

---

## 最终建议

对于 whiteboard 这里，最优底层设施路线是：

- **真实 spatial index：稀疏哈希网格 + oversized**
- **候选查询：统一 rect candidate query**
- **调度模型：frame-throttled pick**

不是：

- 当前线性 spatial query
- point query
- 原始 pointermove 逐次同步命中

必须先把这三件事做完，JS pick 才值得推进。
