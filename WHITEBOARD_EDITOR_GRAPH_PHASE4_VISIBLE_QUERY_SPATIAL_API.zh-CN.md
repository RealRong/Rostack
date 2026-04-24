# `whiteboard-editor-graph` 阶段四 `scene visible / editor spatial query` 详细设计

## 1. 文档目标

这份文档只讨论迁移总文档里的阶段四：

> 让 `scene.visible` 和 editor 热路径查询正式切到 `SpatialIndex`。

这里不讨论：

- `SpatialIndexState / SpatialDelta` 本身怎么建
- delta-driven publisher
- `PublishDelta`
- DOM pick / overlay pick
- node snap 专用 index 的替换

这份文档只回答一个问题：

> 在阶段三已经完成正式 `SpatialIndexState`、`SpatialDelta`、`runtime.query.spatial` 的前提下，  
> 阶段四要怎样把 `scene.visible`、`idsInRect`、marquee candidate、hover candidate、edge connect candidate 这些真实消费方切到 spatial。

---

## 2. 硬约束

这份设计继承迁移总文档和前三阶段文档里的前提：

- 单轨重构
- 不保兼容 facade
- 不保 old/new 双实现并行
- 允许重构中途暂时无法跑通

阶段四还要额外写死下面几条边界：

1. 已经切到 spatial 的查询路径，不允许再保留默认全量扫描 fallback。
2. `SpatialIndex` 只做 world query，不承担 DOM pick。
3. `group` 继续是结构 owner，不 materialize 成 `SpatialRecord`。
4. spatial 只负责候选集；最终精确命中仍然由 geometry 逻辑负责。
5. 不为了减少改动面，再往 `ProjectionSources` 里塞一个新的订阅源来“模拟 spatial store”。

也就是说，阶段四允许一次性改 runtime truth、read、input、React 消费侧；  
但不允许为了“中途还能跑”继续长期保留：

- `document.list -> 全量 scan -> geometry filter`
- `working.graph -> 全量 scan -> visible`
- “旧 read API + 新 spatial API” 双轨长期并存

---

## 3. 阶段四要解决的核心问题

阶段三之后，runtime 内部已经有了正式 spatial state，但实际收益还没有落下来。核心问题有四个。

### 3.1 `SpatialIndex` 已经存在，但大部分消费方还没切过去

现在已经有：

- `working.spatial`
- `working.delta.spatial`
- `runtime.query.spatial.rect`
- `runtime.query.spatial.point`

但 editor 的热点查询仍主要沿用旧路径：

- 扫 document list
- 读 graph view
- 再做几何过滤

这意味着阶段三只是把“index 能力”建出来了，还没有把“真实查询收益”接到产品路径上。

### 3.2 `scene.visible` 仍然在扫 graph family

当前 `whiteboard-editor-graph/src/runtime/scene.ts` 仍然是：

1. 从 canvas order 构造 `scene.items`
2. 扫 `graph.nodes`
3. 扫 `graph.edges`
4. 扫 `graph.owners.mindmaps`
5. 再用 bounds 和 `visibleWorld` 做过滤

这和阶段三已经建立起来的 `SpatialIndexState` 是脱节的。

更重要的是，当前 `scene` phase 虽然依赖 `spatial` phase，但它还没有真正消费 `working.spatial`。

### 3.3 editor 热查询仍然默认整图扫描

当前几个热点入口都还是旧实现：

- `read/node.ts`
  - `node.idsInRect(...)` 先扫 `document.node.list`
- `read/edge.ts`
  - `edge.idsInRect(...)` 先扫 `document.edge.list`
  - `edge.connectCandidates(...)` 先走 `node.idsInRect(...)`
- `input/features/selection/marquee.ts`
  - 继续依赖上述 `idsInRect(...)`

所以即使 spatial 里已经有了：

- `kind`
- `bounds`
- `order`

这些查询也还没有真正把它当成候选底座来用。

### 3.4 `ProjectionController` 已经有 `runtime.query`，但 editor read 还拿不到它

当前 `ProjectionController` 已经同时持有：

- `sources`
- `runtime.query`

但 `createGraphRead(...)` 只消费了 `sources`，没有把 `runtime.query.spatial` 往 editor read / input 层传。

如果阶段四不把这条线接上，就会出现两个坏方向：

- 要么在 editor 层重新造一份 spatial store
- 要么让 read/input 继续只能依赖 snapshot stores 做扫描

这两条都不对。

---

## 4. 阶段四结束后的目标状态

阶段四结束后，应满足下面这条结构：

```txt
InputDelta
  -> graph patch
  -> SpatialIndex patch
  -> scene phase 从 spatial 派生 visible
  -> editor query 从 spatial 取候选
  -> geometry exact hit / capability filter / selection/group promotion
```

这里有五个关键边界：

1. graph 仍然是上游 truth。
2. spatial 是 graph 的正式下游候选 index。
3. `scene.visible` 改由 spatial 派生，但 `scene.items` 仍然保留完整 scene order 语义。
4. editor query 先拿 spatial candidate，再做精确 geometry 判定。
5. DOM pick / overlay pick 不在这一阶段切到 spatial。

用一句话概括：

> 阶段三解决的是“正式 index state 已经存在”；  
> 阶段四解决的是“让 visible 和热点查询真正开始消费它”。

---

## 5. 当前代码结构对阶段四意味着什么

### 5.1 `runtime.query.spatial` 已经满足候选查询的最小能力

当前 `SpatialRead` 已经有：

```ts
interface SpatialRead {
  get(key: SpatialKey): SpatialRecord | undefined
  rect(
    worldRect: Rect,
    options?: {
      kinds?: readonly SpatialKind[]
    }
  ): readonly SpatialRecord[]
  point(
    worldPoint: Point,
    options?: {
      kinds?: readonly SpatialKind[]
    }
  ): readonly SpatialRecord[]
}
```

而且 `rect / point` 已经保证：

- 按 `record.order` 稳定排序
- 支持按 `kind` 过滤

这足够支撑：

- `scene.visible`
- node / edge `idsInRect`
- edge connect candidate 预筛选
- 后续的 point hover helper

阶段四不需要重新发明一套 query API。

### 5.2 `group` 已经被正确排除在 spatial 外

当前 `SpatialKey / SpatialRecord` 只覆盖：

- `node`
- `edge`
- `mindmap`

这正是阶段四需要的边界。

因此这阶段的 marquee / visible / connect candidate 迁移，不能偷偷把 group 再塞进 spatial。  
group shell 仍然必须从：

- 命中的 member
- selection summary
- marquee 结果
- drag 结果

这些下游语义里归约出来。

### 5.3 `ProjectionSources` 不应该承担 spatial query 注入职责

`ProjectionSources` 的职责是：

- 暴露 published snapshot 的 store 订阅面

而 `runtime.query.spatial` 的职责是：

- 暴露 imperative world query

这两者不是一回事。

因此阶段四推荐：

- `ProjectionSources` 保持 snapshot-only
- `GraphRead` 显式增加 `spatial`
- `createGraphRead(...)` 直接接收 `runtime.query.spatial`

这样 editor read / input 只有一个统一的 `GraphRead` 入口，不会把 React 订阅层拆成双源。

### 5.4 “切到 spatial”不等于“用 bounds 代替精确几何”

阶段四必须坚持：

- spatial 负责候选预筛选
- geometry 负责精确语义判断

例如：

- node rect query 仍要跑 `nodeApi.hit.matchRect`
- edge rect query 仍要跑 `edgeApi.hit.test`
- connect candidate 仍要跑 node capability / connector geometry

如果直接把 spatial bounds 命中当成最终命中，语义会退化。

---

## 6. editor 侧 contract 设计

## 6.1 `GraphRead` 增加 `spatial`

阶段四推荐把 editor 侧统一读口扩成：

```ts
export type GraphRead = {
  snapshot: ProjectionSources['snapshot']
  scene: {
    view: ProjectionSources['scene']
  }
  spatial: EditorGraphQuery['spatial']
  node: GraphNodeRead
  edge: GraphEdgeRead
  selection: GraphSelectionRead
  mindmap: {
    view: ProjectionSources['mindmap']
  }
  group: {
    view: ProjectionSources['group']
  }
  ui: ProjectionSources['ui']
  chrome: ProjectionSources['chrome']
  graph: ProjectionSources['graph']
}
```

这里要注意两个点：

1. `spatial` 是 query，不是 store。
2. 它进入 `GraphRead` 后，editor input / action / read 都继续只依赖一个对象。

这能直接避免：

- React 组件要不要再订阅一个 `spatial source`
- read 层要不要再拆一个 `ProjectionSpatialSources`

这些不必要的问题。

### 6.2 `createGraphRead(...)` 的输入要显式接 `spatial`

推荐把 `createGraphRead(...)` 改成：

```ts
export const createGraphRead = ({
  document,
  sources,
  spatial,
  selection,
  nodeType
}: {
  document: ...
  sources: ...
  spatial: EditorGraphQuery['spatial']
  selection: ...
  nodeType: ...
}): GraphRead
```

然后在 `createEditor(...)` 里把：

- `projection.sources`
- `projection.query.spatial`

同时传给 `createGraphRead(...)`。

### 6.3 `ProjectionSources` 保持不变

阶段四明确不建议：

- 在 `ProjectionSources` 里新增 `spatial`
- 把 `runtime.query.spatial` 包成 `store.ReadStore`

原因很简单：

- spatial 不是 published snapshot 字段
- 它没有必要加入订阅模型
- editor 查询大多是按事件即时读取，不是按 React store diff 订阅

所以这里最正确的方向，是把 spatial 当作 `GraphRead` 的 imperative 能力，而不是新的 subscription family。

---

## 7. `scene.visible` 的详细设计

## 7.1 `scene.items` 保持完整 scene order，不做 viewport 裁剪

当前 React scene 渲染仍然主要消费：

- `scene.items`

阶段四不要求把渲染直接切成“只渲染 visible items”。

所以这里要把边界写死：

- `scene.items`
  - 仍然来自 document canvas order
  - 表示完整场景顺序
- `scene.visible`
  - 才是 viewport 相关的可见候选

阶段四只切 `scene.visible` 的来源，不改 `scene.items` 的语义。

## 7.2 `scene.visible` 改成从 spatial 记录派生

推荐把 `buildSceneSnapshot(...)` 的 visible 部分改成下面这套语义：

```ts
interface VisibleSceneBuildInput {
  spatial: SpatialIndexState
  visibleWorld?: Rect
}
```

派生规则：

1. `visibleWorld` 存在时：
   - 用 `queryRect({ state: spatial, worldRect: visibleWorld })` 取候选 record
   - 语义上等价于 `runtime.query.spatial.rect(visibleWorld)`
2. `visibleWorld` 不存在时：
   - 取全部 `spatial.records`
   - 按 `record.order` 排序
3. 再从同一批 record 一次性派生：
   - `visible.items`
   - `visible.nodeIds`
   - `visible.edgeIds`
   - `visible.mindmapIds`

推荐结果结构仍保持当前 public contract：

```ts
interface VisibleSceneView {
  items: readonly SceneItem[]
  nodeIds: readonly NodeId[]
  edgeIds: readonly EdgeId[]
  mindmapIds: readonly MindmapId[]
}
```

但它的唯一数据源改成 spatial record 列表，而不是再扫 graph family。

### 7.3 `scene.spatial` 和 `scene.pick` 不再各自重复扫描

当前 `scene.spatial` 和 `scene.pick` 本质都在重复表达 visible 结果。

阶段四推荐把它们收敛成同一份 visible 结果的薄投影：

- `scene.spatial.nodes = scene.visible.nodeIds`
- `scene.spatial.edges = scene.visible.edgeIds`
- `scene.spatial.mindmaps = scene.visible.mindmapIds`
- `scene.pick.items = scene.visible.items.map(toCanvasItemRef)`

这里要强调：

- 这不意味着 phase 4 要把 `scene.pick` 升级成真实 pick 系统
- 这里只是保留当前 snapshot contract，同时去掉多余扫描

### 7.4 “没有 spatial record” 就等于“不进入 visible candidate”

阶段四之后，`scene.visible` 的存在性语义以 spatial materialization 为准。

也就是说：

- 没有对应 `SpatialRecord`
- 就不会进入 `scene.visible`

这比旧逻辑里“`bounds` 不存在也当 visible”更合理，  
因为阶段三已经明确规定：

- node / edge / mindmap 是否进入空间查询，取决于是否 materialize 成 spatial record

---

## 8. node rect query 的详细设计

## 8.1 `GraphNodeRead['idsInRect']` 的对外签名保持不变

阶段四不建议再造一套新的 node spatial query API。  
推荐继续保留：

```ts
idsInRect(rect: Rect, options?: NodeRectHitOptions): NodeId[]
```

真正改变的是它的内部候选来源。

## 8.2 新的执行链

推荐把 node rect query 改成：

```txt
spatial.rect(rect, { kinds: ['node'] })
  -> candidate node ids
  -> exclude filter
  -> nodeApi.hit.matchRect exact filter
  -> return node ids
```

对应到实现层，推荐保持下面这些语义不变：

- `match`
- `policy`
- `exclude`
- 返回值为 `NodeId[]`

也就是说，阶段四不是改 node rect query 的业务语义，  
而是把“候选集来源”从：

- `document.node.list`

改成：

- `GraphRead.spatial.rect(...)`

### 8.3 为什么不能直接返回 spatial node 命中

因为 node 的 rect hit 仍然依赖：

- 旋转
- 实际 geometry
- selection-marquee policy

所以 spatial 只能给出：

- bounds 相交候选

最终是否命中仍要靠当前已经存在的 `nodeApi.hit` 逻辑裁决。

---

## 9. edge rect query 和 connect candidate 的详细设计

## 9.1 `GraphEdgeRead['idsInRect']` 先走 edge spatial record

推荐把 edge rect query 改成：

```txt
spatial.rect(rect, { kinds: ['edge'] })
  -> candidate edge ids
  -> edgeApi.hit.test(path, rect, mode)
  -> return edge ids
```

这样可以把当前：

- 扫整份 `document.edge.list`

收敛成：

- 只对 bounds 已经过筛的 edge 做 path 命中测试

### 9.2 `connectCandidates(rect)` 改成直接读 spatial node 候选

当前 `edge.connectCandidates(rect)` 还要先绕一圈：

```txt
node.idsInRect(rect)
  -> read node graph entry
  -> capability filter
  -> build EdgeConnectCandidate[]
```

阶段四推荐收敛成：

```txt
spatial.rect(rect, { kinds: ['node'] })
  -> candidate node ids
  -> read node graph entry
  -> capability filter
  -> build EdgeConnectCandidate[]
```

这里故意不再经过 `node.idsInRect(...)`，原因是：

- connect candidate 只需要 spatial bounds 级别预筛选
- 它不需要 selection-marquee 那套 exact rect policy
- 继续复用 `node.idsInRect(...)` 会把 connect query 和 node rect hit 语义耦死

也就是说：

- `node.idsInRect(...)`
  - 是“精确 rect 命中 API”
- `edge.connectCandidates(...)`
  - 是“连接候选预筛选 API”

它们都从 spatial 起步，但不应该彼此串用。

### 9.3 hover candidate 的边界

迁移总文档里提到的 `hover candidate`，阶段四这里要限定成：

- 非 DOM 的 world-space hover 候选预筛选

最直接的落点就是：

- edge tool 的 connect / guide hover 预筛选

这类逻辑可以通过：

- `spatial.rect(...)`
- 或未来更直接的 `spatial.point(...)`

拿到候选，再做更精确的几何判断。

但下面这些不在阶段四里切：

- `pointer.pick`
- DOM 命中的 node / edge / group hover target
- overlay / chrome hit test

必须继续坚持：

> spatial 是 world query；pick 是 DOM hit。

---

## 10. marquee 与 group 语义的详细设计

## 10.1 marquee 入口不需要新增专用 API

当前 marquee 已经通过：

- `projection.node.idsInRect(...)`
- `projection.edge.idsInRect(...)`

取候选。

所以阶段四推荐不新增：

- `marqueeCandidates(...)`
- `selectionSpatialQuery(...)`

而是直接让现有 marquee 入口自动吃到 phase 4 的收益。

这样可以把改动收敛在：

- `read/node.ts`
- `read/edge.ts`

而不是把 callsite 重新散开一遍。

## 10.2 group shell 继续从命中 member 派生

因为 group 不在 spatial 中，所以 marquee 的 group 语义仍然应该是：

1. 先命中 node / edge member
2. 再根据 group 结构把结果提升或归约成 group shell / selection affordance

也就是说：

- marquee 不直接 query group
- `scene.visible` 不直接返回 group
- rect / point query 都不返回 `group:${id}`

这和前三阶段已经确定的 group 边界保持一致。

## 10.3 `scene.visible` 和 marquee 只共享候选底座，不共享最终语义

虽然二者都开始消费 spatial，但它们的最终语义不同：

- `scene.visible`
  - 只看 record bounds 与 viewport 的关系
- marquee
  - 还要看 exact geometry hit policy

所以阶段四不能做成一个“大而全的 spatial 统一判定器”。

统一的是：

- 候选集底座

不统一的是：

- 最终业务命中规则

---

## 11. 文件落位建议

阶段四推荐主要改下面这些文件：

```txt
whiteboard/packages/whiteboard-editor-graph/src/runtime/scene.ts
whiteboard/packages/whiteboard-editor-graph/src/phases/scene.ts

whiteboard/packages/whiteboard-editor/src/editor/createEditor.ts
whiteboard/packages/whiteboard-editor/src/read/graph.ts
whiteboard/packages/whiteboard-editor/src/read/node.ts
whiteboard/packages/whiteboard-editor/src/read/edge.ts
whiteboard/packages/whiteboard-editor/src/input/runtime.ts
```

如有必要，可以补一个很小的 runtime helper，例如：

```txt
whiteboard/packages/whiteboard-editor-graph/src/runtime/sceneVisible.ts
```

或 editor 侧的小型 query helper，但不建议再造新的 facade 目录。

### 各文件职责

#### `editor-graph/src/runtime/scene.ts`

改成：

- 保留 `scene.items` 的完整 order 构造
- visible 改从 spatial records 派生
- `scene.spatial / scene.pick` 改成 visible 的薄投影

#### `editor-graph/src/phases/scene.ts`

继续只做 orchestrator，但真正消费：

- `working.spatial`

而不再只把它当 phase dependency。

#### `editor/src/read/graph.ts`

改成：

- 在 `GraphRead` 暴露 `spatial`
- `createGraphRead(...)` 接收 `spatial`

#### `editor/src/read/node.ts`

改成：

- node `idsInRect(...)` 的候选来源切到 `graph.spatial.rect(...)`

#### `editor/src/read/edge.ts`

改成：

- edge `idsInRect(...)` 的候选来源切到 `graph.spatial.rect(...)`
- `connectCandidates(...)` 不再绕 `node.idsInRect(...)`

#### `editor/src/editor/createEditor.ts`

改成：

- 把 `projection.query.spatial` 传给 `createGraphRead(...)`

#### `editor/src/input/runtime.ts`

通常只需要跟着 `GraphRead` 类型改动收口；  
不应在这里再新增一层 spatial adapter。

---

## 12. 实施方案

这一节不再讨论“设计应该是什么”，而是明确“代码应该按什么顺序落”。

阶段四推荐按下面这条切线顺序推进：

```txt
先接 editor query 注入口
  -> 再切 scene.visible
  -> 再切 node / edge rect query
  -> 再切 connect candidate
  -> 最后清理旧扫描路径和补测试
```

这里故意不建议“按文件分散着改一点点”，而是按消费链切。  
原因很简单：

- phase 4 的收益点在消费方
- 不是在 spatial state 本身

### 12.1 第一步：先把 `runtime.query.spatial` 接进 `GraphRead`

先做这一步，是为了后面的 query 迁移能都挂在同一个 editor 读口上。

推荐修改：

```txt
whiteboard/packages/whiteboard-editor/src/read/graph.ts
whiteboard/packages/whiteboard-editor/src/editor/createEditor.ts
whiteboard/packages/whiteboard-editor/src/input/runtime.ts
```

具体动作：

1. 在 `GraphRead` 上新增 `spatial`。
2. `createGraphRead(...)` 改成显式接收 `spatial`。
3. `createEditor(...)` 把 `projection.query.spatial` 传进去。
4. 收口所有因为 `GraphRead` 类型变化而报错的 editor input / action / read 代码。

这一步的目标不是行为变化，而是把后续所有 spatial 消费都接到统一入口。

这一步完成时，应满足：

- editor 层只有一个 `GraphRead` 入口
- 没有新增 `ProjectionSources.spatial`
- 没有新增新的 store 订阅面

### 12.2 第二步：切 `scene.visible`，先让 runtime 自己开始消费 spatial

这一步推荐只动 `editor-graph` runtime，不同时改 editor query。

推荐修改：

```txt
whiteboard/packages/whiteboard-editor-graph/src/runtime/scene.ts
whiteboard/packages/whiteboard-editor-graph/src/phases/scene.ts
```

如有必要，再补：

```txt
whiteboard/packages/whiteboard-editor-graph/src/runtime/sceneVisible.ts
```

具体动作：

1. 保留 `scene.items` 的完整 canvas order 构造。
2. 新增一个只负责从 `SpatialIndexState` 派生 visible 结果的小 helper。
3. `buildSceneSnapshot(...)` 改成：
   - `items` 继续来自 document order
   - `visible` 改来自 spatial
   - `scene.spatial / scene.pick` 改成 visible 的薄投影
4. 删除 `runtime/scene.ts` 里对 `graph.nodes / graph.edges / graph.owners.mindmaps` 的 visible 扫描逻辑。

这一步完成时，应满足：

- viewport visible 已经不再依赖全量扫 graph family
- `scene.pick.items` 只是 `scene.visible.items` 的映射，不再自扫一遍
- `scene.spatial.*` 只是 visible 的映射，不再自扫一遍

### 12.3 第三步：切 node / edge rect query

这一步开始让 editor 热查询真正吃到 spatial 候选收益。

推荐修改：

```txt
whiteboard/packages/whiteboard-editor/src/read/node.ts
whiteboard/packages/whiteboard-editor/src/read/edge.ts
```

具体动作：

1. `node.idsInRect(...)`：
   - 候选来源改为 `graph.spatial.rect(rect, { kinds: ['node'] })`
   - 保留 `exclude / match / policy`
   - 继续走 `nodeApi.hit.matchRect`
2. `edge.idsInRect(...)`：
   - 候选来源改为 `graph.spatial.rect(rect, { kinds: ['edge'] })`
   - 保留 `match`
   - 继续走 `edgeApi.hit.test`
3. 删除这两条路径里对 `document.node.list`、`document.edge.list` 的默认整表扫描。

这里要明确一条实现原则：

> 候选来源可以切，但精确命中语义不能退。

如果改完以后：

- marquee contain/touch 语义变了
- 旋转 node 命中退化了
- edge path 命中退化成 bounds 命中

那就是实现错误，不是可接受 tradeoff。

### 12.4 第四步：切 `edge.connectCandidates(...)`

这一步单独拆出来，不要和 `edge.idsInRect(...)` 混成一个 helper。

推荐修改：

```txt
whiteboard/packages/whiteboard-editor/src/read/edge.ts
whiteboard/packages/whiteboard-editor/src/input/runtime.ts
```

具体动作：

1. `connectCandidates(rect)` 直接调用：
   - `graph.spatial.rect(rect, { kinds: ['node'] })`
2. 从 candidate node ids 读取 node graph entry。
3. 保留 capability 过滤。
4. 继续构造现有 `EdgeConnectCandidate[]` 输出。
5. 删除通过 `node.idsInRect(...)` 间接取 connect candidate 的旧链路。

之所以把这一步单独列出来，是因为它和 node rect query 的目标不同：

- node `idsInRect(...)`
  - 是精确 rect 命中
- `connectCandidates(...)`
  - 是连接候选预筛选

二者都可以从 spatial 开始，但不能为了省事强行共用同一套“最终命中” helper。

### 12.5 第五步：清理旧路径，并补行为测试

当前阶段四的最大风险不是“类型改不过”，而是：

- 旧扫描路径还偷偷留着
- 测试看起来都过了，但实际语义退化

所以最后一步必须明确做清理和验证。

推荐动作：

1. 删除或收口已经不再需要的整图扫描 helper。
2. 删掉只为旧扫描路径存在的临时变量和 import。
3. 让 `read/node.ts`、`read/edge.ts` 中新的 spatial 候选链路成为唯一实现。
4. 跑 editor-graph 和 editor 两侧的针对性测试。

### 12.6 推荐的提交/落地边界

虽然本次重构允许中途暂时不通过，但阶段四仍然推荐收敛成下面这几个落地块：

1. `GraphRead.spatial` 接线。
2. `scene.visible` 切到 spatial。
3. node / edge `idsInRect(...)` 切到 spatial。
4. `edge.connectCandidates(...)` 切到 spatial。
5. 清理旧路径和补测试。

这样拆的好处是：

- 每一块都对应一类明确消费方
- 出问题时容易定位是 scene、rect query 还是 connect query
- 不需要为了排障再引入兼容层

### 12.7 推荐的验收与测试清单

阶段四建议至少覆盖下面几类验证。

#### runtime / projection 侧

重点回归：

- `whiteboard/packages/whiteboard-editor-graph/test/runtime.test.ts`
  - `scene.visible.items`
  - `scene.visible.nodeIds`
  - `scene.visible.edgeIds`
  - `scene.visible.mindmapIds`
  - `scene.spatial.*`
  - `scene.pick.items`
- `whiteboard/packages/whiteboard-editor-graph/test/graphDelta.test.ts`
  - viewport-only input 只标记 `spatial.visible`
  - group 仍然不进入 spatial

#### editor query / interaction 侧

重点回归：

- `whiteboard/packages/whiteboard-editor/test/selection-move-session.test.ts`
  - marquee / selection 相关 rect query
- `whiteboard/packages/whiteboard-editor/test/edge-connect-session.test.ts`
  - connect candidate / connect guide
- `whiteboard/packages/whiteboard-editor/test/node-edit-selection-chrome.test.ts`
  - node hover / selection chrome 相关表现

如果 draw / eraser 仍然依赖 `node.idsInRect(...)`，还应补跑：

- `whiteboard/packages/whiteboard-editor/src/input/features/draw.ts` 相关测试覆盖

### 12.8 实施时最容易犯的错误

阶段四实现时最容易踩的坑主要有五类：

1. `scene.visible` 虽然切了 spatial，但 `scene.pick` / `scene.spatial` 还在各自重扫。
2. node / edge query 直接把 bounds 命中当最终命中，导致精度退化。
3. `connectCandidates(...)` 继续绕 `node.idsInRect(...)`，把两种语义重新耦合回去。
4. 为了让 React 订阅方便，把 `runtime.query.spatial` 包成新的 store source。
5. 为了中途跑通，保留“spatial miss 时 fallback 整图扫描”。

这五条都不应该接受。

---

## 13. 阶段四完成标准

阶段四完成时，应满足下面这些结果：

1. `scene.visible` 不再默认扫 `working.graph.nodes / edges / mindmaps`。
2. `scene.visible` 的排序来源是 `SpatialRecord.order`，不是新的临时排序规则。
3. `scene.spatial` 和 `scene.pick` 不再各自重复扫描 graph。
4. node `idsInRect(...)` 不再默认扫 `document.node.list`。
5. edge `idsInRect(...)` 不再默认扫 `document.edge.list`。
6. `edge.connectCandidates(...)` 直接从 spatial node record 预筛选。
7. marquee 自动吃到 spatial 候选收益，但 group 仍不进入 spatial。
8. `GraphRead` 已经能直接访问 `runtime.query.spatial`。
9. `ProjectionSources` 没有被扩成新的 spatial 订阅面。
10. DOM pick / overlay pick 仍未切到 spatial。
11. 已切换的查询路径不再保留默认全量扫描 fallback。

---

## 14. 这一阶段故意不解决什么

为了把范围收住，阶段四明确不解决：

- delta-driven publisher
- `PublishDelta`
- `scene.items` 的渲染裁剪
- node snap 专用 index 的替换
- DOM pick / overlay pick
- group 的空白 shell 点击命中

尤其最后三条边界要再写一次：

1. node snap 继续是专用对齐索引问题，不和 spatial 候选查询混为一谈。
2. DOM pointer hit 继续走 DOM / chrome 系统，不让 spatial 越权。
3. group shell 若需要点击空白 frame，入口仍然放在 DOM/chrome pick，而不是常驻 spatial。

---

## 15. 最终结论

阶段四最核心的设计，不是“再给 spatial 增加更多状态”，而是把它真正接成消费底座。

最终要固定住下面这些结构约束：

1. `scene.visible` 由 spatial records 派生，不再重复扫 graph family。
2. editor 热查询先走 spatial 候选，再走精确 geometry 逻辑。
3. `GraphRead` 直接暴露 `runtime.query.spatial`，而不是新增订阅源。
4. `group` 继续停留在结构 / selection / chrome 语义层，不进入 spatial。
5. DOM pick 继续和 world query 分离。

用一句话总结：

> 阶段三把正式 `SpatialIndexState` 建出来；  
> 阶段四把 `scene.visible` 和 editor 热查询正式挂到这棵 index 上。
