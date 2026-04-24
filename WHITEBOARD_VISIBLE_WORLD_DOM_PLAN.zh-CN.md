# WHITEBOARD_VISIBLE_WORLD_DOM_PLAN

## 目标

本文只回答四个问题：

1. 在当前 whiteboard 的 DOM 渲染方案下，`visible` 这个概念到底有没有必要。
2. `visibleWorld` 是否还需要保留。
3. 架构最小能收敛成什么模型。
4. 是否可以只剩一个 `query.visible()`。

本文不讨论“以后要不要做更激进的 DOM 裁剪”，只讨论当前模型应该如何收敛。

## 结论

结论固定为：

- `visible` 有用，但它只应该作为懒查询语义存在，不应该作为 published snapshot/state 存在。
- `visibleWorld` 可以保留，但它只应该存在于 query 组合层，不应该驱动 graph runtime phase，也不应该进入 published `scene`。
- `query.visible()` 不够，它只能是一个便利函数，不能成为唯一查询原语。
- 最小且足够的模型是：
  - published: `scene.items`
  - query primitive: `query.rect(worldRect, options?)`
  - query helper: `query.visible(options?)`
- `scene.visible`、`scene.pick`、`scene.spatial` 都应删除。

换句话说：

- 要保留的是“按当前 viewport 做一次 visible 查询的能力”。
- 不需要保留的是“每次 viewport 改变时预先发布一份 visible snapshot”。

## 生产路径核验

### 1. `CanvasScene` 只消费 `scene.items`

当前生产渲染路径里：

- `whiteboard/packages/whiteboard-react/src/canvas/CanvasScene.tsx:12`

只读取：

```ts
const scene = useStoreValue(editor.read.scene.view).items
```

这说明当前主 scene 渲染实际依赖的是：

- 场景顺序
- 场景全集

而不是：

- `scene.visible`
- `scene.pick`
- `scene.spatial`

### 2. DOM pick 不消费 `scene.pick`

当前 pointer/pick 命中路径走的是：

- `whiteboard/packages/whiteboard-react/src/dom/host/input.ts`
- `whiteboard/packages/whiteboard-react/src/dom/host/pickRegistry.ts`

也就是说当前命中是：

- DOM element -> `PickRegistry` -> `EditorPick`

不是：

- `scene.pick`
- `spatial.point(...)`

因此 `scene.pick` 在当前生产路径中没有实际存在价值。

### 3. `visibleWorld` 目前只停留在 runtime 接口和测试里

graph runtime 的接口支持：

- `whiteboard/packages/whiteboard-editor-graph/src/contracts/editor.ts:332-336`

scene phase 也支持：

- `whiteboard/packages/whiteboard-editor-graph/src/runtime/scene.ts:38-50`

但 projection 实际输入只传了：

- `whiteboard/packages/whiteboard-editor/src/projection/input.ts:717-719`

```ts
viewport: {
  viewport: store.read(session.viewport.read)
}
```

这说明现在的问题不是“`visibleWorld` 很重要所以必须 eager 发布”，而是：

- 当前代码既保留了 visible publish 链
- 又没有真正把 `visibleWorld` 用作 query 输入

### 4. 真实生产需求是任意 rect query，不是 viewport query 一种

当前已有生产使用：

- `whiteboard/packages/whiteboard-editor/src/read/node.ts:206-223`
- `whiteboard/packages/whiteboard-editor/src/read/edge.ts:355-430`

都依赖：

- `spatial.rect(rect, ...)`

这些能力包括：

- 选区命中候选收敛
- edge connect 候选收敛
- edge rect hit 收敛

它们都不是“当前 viewport 可见集”的同义词。

### 5. `scene.visible` / `scene.pick` / `scene.spatial` 没有生产消费者

当前代码搜索结果显示，这几个字段的主要使用面只剩：

- graph runtime 内部构造和 publish
- tests

没有生产 React/UI 直接消费它们。

所以这些字段更像历史遗留发布面，而不是仍然必要的架构核心。

## 为什么不能只剩 `query.visible()`

答案是不能。

原因不是抽象偏好，而是当前产品已经有真实需求：

- 给任意 marquee rect 找节点候选
- 给任意 edge query rect 找边候选
- 给任意 connect 区域找可连接节点

这些都要求：

- “给我一个 world rect，返回候选集”

而不是：

- “给我当前 viewport 的 visible 集”

因此：

- `visible()` 只是 `rect(currentViewportWorldRect)` 的一个特例
- 真正的最小查询原语应该是 `rect`

如果继续强推“整个系统只保留 `visible()`”，最后只会出现两种结果：

- 要么调用方绕回去自己算 rect，再去找别的底层接口
- 要么不断给 `visible()` 增加不自然的参数，直到它变相重新长成 `rect(...)`

这两种都不干净。

## 最小收敛模型

### 1. Published 层

published `scene` 只保留：

- `items`

职责：

- 表示场景顺序
- 表示场景实体全集
- 驱动 `CanvasScene`

不再保留：

- `scene.visible`
- `scene.pick`
- `scene.spatial`

### 2. Query 层

最小公共查询面只保留两层：

```ts
interface EditorQuery {
  rect(worldRect: Rect, options?: QueryOptions): readonly SpatialRecord[]
  visible(options?: QueryOptions): readonly SpatialRecord[]
}
```

其中：

- `rect(...)` 是唯一必要的底层查询原语
- `visible()` 只是 sugar

其内部展开应当等价于：

```ts
query.rect(viewport.worldRect(), options)
```

### 3. Viewport 层

viewport 需要提供一个稳定的只读 helper：

```ts
interface ViewportRead {
  get(): Viewport
  pointer(input: { clientX: number, clientY: number }): ViewportPointer
  worldToScreen(point: Point): Point
  worldRect(): Rect
}
```

这里的 `worldRect()` 才是 `visibleWorld` 最合理的存在形态。

它属于：

- session/editor read 侧的读取辅助

不属于：

- graph runtime input contract
- scene snapshot

### 4. Spatial 层

`spatial` 仍然是底层常驻索引，但它是内部能力，不再是 scene published 语义。

它的职责仍然是：

- 维护几何索引
- 支持 `rect` 查询

`all()` 和 `point()` 是否保留，取决于是否还有真实消费者：

- 以当前生产路径看，它们不是最小模型必须部分
- 可以保留为内部能力或测试辅助
- 不应再主导公开架构表达

## 职责划分

### 1. `scene.items`

职责：

- 主渲染顺序
- 场景全集

更新时机：

- document order 变化
- graph order 变化
- 实体增删

不应因以下事件更新：

- pan
- zoom
- viewport 变化

### 2. `spatial`

职责：

- 维护常驻空间索引
- 提供 `rect` 查询底座

更新时机：

- 几何变化
- order 变化
- 实体增删

不应因以下事件更新记录本身：

- pan
- zoom

### 3. `viewport.worldRect()`

职责：

- 在读取时把当前 viewport 和 container rect 组合成 world rect

它是：

- query 输入

不是：

- scene phase 输入
- published snapshot 字段

### 4. `visible()`

职责：

- 一个便利查询

它是：

- `rect(viewport.worldRect())` 的别名

不是：

- 常驻 state
- store
- publish 结果

## 数据流

正确的数据流应收敛为：

### 1. 文档/几何变化

- graph 更新
- spatial index 更新
- `scene.items` 视需要更新

### 2. viewport 变化

- 只更新 viewport store
- 不触发 scene visible rebuild
- 不触发 scene publish

### 3. 调用方需要 visible 候选时

- 调用 `viewport.worldRect()`
- 调用 `query.rect(worldRect)`

或者直接：

- 调用 `query.visible()`

也就是说：

- visible 是读取阶段的组合结果
- 不是 projection/runtime publish 阶段的产物

## 设计原则

### 1. 不做兼容期、不做双轨期

这次收敛直接按最终模型重构：

- 可以接受中途短时间跑不通
- 不保留旧 `scene.visible` / `scene.pick` / `scene.spatial` 过渡层
- 不做新旧两套 query 并行

原则是：

- 架构先收敛正确，再恢复运行

### 2. `visible` 只做 lazy query

规则固定为：

- 没有消费者，就不算
- 需要时再查
- 相同输入可缓存

### 3. `rect` 是唯一必要的底层查询原语

如果要继续压 API 面，应优先压掉：

- published `visible`
- published `pick`
- published `scene.spatial`

而不是压掉：

- `rect(worldRect)`

### 4. `visible()` 只是 sugar

它的存在是为了：

- 减少调用方重复拼装 viewport world rect

不是为了：

- 重新引入 viewport 驱动的 runtime phase

### 5. 先修数据流，再讨论 DOM 裁剪

当前优先级应该是：

- 去掉 viewport -> visible publish 链
- 去掉 scene 上无消费者的字段
- 收敛 query API
- 隔离 React rerender

不是先做：

- 视口外 DOM 卸载

## 详细实施方案

### 阶段 1. 删除 published `scene.visible` / `scene.pick` / `scene.spatial`

#### 要改什么

- `whiteboard/packages/whiteboard-editor-graph/src/contracts/editor.ts`
- `whiteboard/packages/whiteboard-editor-graph/src/runtime/createEmptySnapshot.ts`
- `whiteboard/packages/whiteboard-editor-graph/src/runtime/scene.ts`
- `whiteboard/packages/whiteboard-editor-graph/src/runtime/publish/scene.ts`
- `whiteboard/packages/whiteboard-editor/src/projection/sources.ts`
- `whiteboard/packages/whiteboard-editor/src/read/graph.ts`
- 所有相关 tests

#### 改造目标

把 scene 收缩为：

```ts
interface SceneSnapshot {
  items: readonly SceneItem[]
}
```

如果 `layers` 没有真实消费者，也应一起评估删除。

### 阶段 2. 删除 viewport -> visible publish 链

#### 要改什么

- `whiteboard/packages/whiteboard-editor/src/projection/controller.ts`
- `whiteboard/packages/whiteboard-editor/src/projection/input.ts`
- `whiteboard/packages/whiteboard-editor-graph/src/runtime/planner.ts`
- `whiteboard/packages/whiteboard-editor-graph/src/runtime/publish/delta.ts`
- `whiteboard/packages/whiteboard-editor-graph/src/phases/scene.ts`
- `whiteboard/packages/whiteboard-editor-graph/src/runtime/spatial/state.ts`
- `whiteboard/packages/whiteboard-editor-graph/src/runtime/spatial/update.ts`

#### 改造目标

让 viewport delta 不再驱动：

- spatial visible dirty
- scene visible rebuild
- scene publish

`visibleWorld` 也不再作为 scene runtime input contract 的一部分存在。

### 阶段 3. 增加最小 query API

#### 要改什么

- `whiteboard/packages/whiteboard-editor/src/read/graph.ts`
- `whiteboard/packages/whiteboard-editor/src/read/public.ts`
- `whiteboard/packages/whiteboard-editor/src/session/viewport.ts`
- 必要时新增 editor query/read helper 文件

#### 目标 API

```ts
interface EditorQuery {
  rect(worldRect: Rect, options?: QueryOptions): readonly SpatialRecord[]
  visible(options?: QueryOptions): readonly SpatialRecord[]
}
```

以及：

```ts
interface ViewportRead {
  worldRect(): Rect
}
```

#### 原则

- `rect(...)` 是 primitive
- `visible(...)` 只是组合 helper
- query API 是 pull，不是 push

### 阶段 4. 收缩 `spatial` 公开表面

#### 要改什么

- `whiteboard/packages/whiteboard-editor-graph/src/runtime/query.ts`
- `whiteboard/packages/whiteboard-editor-graph/src/runtime/spatial/query.ts`
- `whiteboard/packages/whiteboard-editor/src/read/*`
- tests

#### 改造方向

按生产使用面决定：

- `rect` 保留
- `all` / `point` 降为内部能力、测试能力，或直接删除公开暴露

原则是：

- 公开 API 只保留真实需要的最小面

### 阶段 5. 处理 `Surface` 与 `CanvasScene` rerender 链

#### 当前问题

即使拿掉 visible publish，只要 `Surface` 自己订阅 viewport，pan 时父组件仍会先 rerender。

#### 要改什么

- `whiteboard/packages/whiteboard-react/src/canvas/Surface.tsx`
- `whiteboard/packages/whiteboard-react/src/canvas/CanvasScene.tsx`

#### 改造方向

优先级从高到低：

1. 给 `CanvasScene`、`NodeOverlayLayer`、`EdgeOverlayLayer` 做 `memo` 隔离。
2. 把 viewport transform 更新收缩到更小的 host 层。
3. 如仍不够，再考虑让 transform 走 ref + layout effect。

### 阶段 6. 只有 profiling 证明需要时，再补 query cache

#### 什么时候需要

仅当出现以下情况时：

- 同一帧多个消费者重复请求相同 `visible()`
- query 成本开始进入 profile 主路径

#### 缓存策略

- key: `spatialRevision + viewportToken + queryKind`
- value: query result
- revision/token 变化时失效

#### 原则

- cache 是 lazy query 的优化
- 不是 eager publish 的替代品

### 阶段 7. 如未来仍需要裁剪，只做软裁剪

只有在前六阶段完成且 profile 证明“全 DOM 保活”仍然是主瓶颈后，才允许进入这一阶段。

策略约束：

- 必须使用 overscan，而不是严格裁边
- 必须加入 hysteresis，避免边界抖动
- 编辑中、选中、hover、变换中对象必须保活

## 非目标

当前方案明确不做：

- 保留 `scene.visible` / `scene.pick` / `scene.spatial` 作为兼容字段
- 让 viewport 变化继续驱动 scene publish
- 在 graph runtime 里维护 viewport-aware visible state
- 用 `query.visible()` 取代所有任意 rect 查询
- 在未清理数据流前直接上 DOM virtualization
- 在当前阶段按视口硬卸载 node DOM

## 验收标准

完成阶段 1-5 后，应满足：

1. pan/zoom 不再触发 scene visible rebuild / publish。
2. `SceneSnapshot` 不再包含 `visible`、`pick`、`scene.spatial`。
3. `CanvasScene` 只因 `scene.items` 变化而更新，不因 viewport 改变被 scene publish 打醒。
4. 需要 visible 候选时，可通过 `query.visible()` 获取。
5. 需要任意区域候选时，可通过 `query.rect(worldRect)` 获取。
6. DOM pick 继续走 `PickRegistry`，不回退到 scene visible/pick。

## 结论

`visible` 在当前 DOM 白板里不是完全没用，但它的正确形态只能是：

- 一个懒查询概念
- 一个 viewport query helper

不能是：

- published scene state
- viewport 驱动的 runtime phase
- 主渲染订阅面

因此最小且干净的最终模型应当是：

- `scene.items`
- `query.rect(worldRect, options?)`
- `query.visible(options?)`

其中：

- `rect` 是 primitive
- `visible` 是 sugar
- 其余与 visible 相关的 published scene 结构都应删除

这才是当前 whiteboard 在 DOM 方案下最干净、最可维护的收敛方式。
