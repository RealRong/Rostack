# WHITEBOARD_VISIBLE_WORLD_DOM_PLAN

## 目标

本文回答三个问题：

1. 在当前 whiteboard 的 DOM 渲染方案下，`visibleWorld` 是否仍然需要保留。
2. 如果 `visibleWorld` 不驱动渲染，pan 时是否还应该重建 `visible`。
3. 更合理的职责划分应该是什么。

本文的目标不是讨论“要不要做虚拟化”，而是明确：

- `visibleWorld` 是查询边界，不是渲染边界。
- `visible` 不应在 pan 时作为 published scene state 被 eager 重建。
- 当前应该改的是数据流和订阅结构，而不是先上 DOM 卸载。

## 结论

结论固定为：

- `visibleWorld` 需要保留。
- 但 `visibleWorld` 在当前 DOM 方案里应当只是 query helper，不应当驱动 published `scene.visible`。
- 如果 `visibleWorld` 不驱动渲染，那么 pan 时不应该 eager 重建 `visible`。
- 当前更合理的模型是：
  - `scene.items` 继续发布
  - `spatial` 继续维护索引
  - `visible` 改成按需查询

换句话说：

- 要保留的是“可见区查询能力”。
- 不需要保留的是“每次 viewport 变化就预先发布一份 visible snapshot”。

## 当前问题

### 1. `flushWheel` 会先触发 viewport 更新

`flushWheel` 在：

- `whiteboard/packages/whiteboard-react/src/runtime/viewport/useBindViewportInput.ts:91-103`

它最终会调用：

- `editor.input.wheel(input)`

继续走到：

- `whiteboard/packages/whiteboard-editor/src/input/host.ts:251-265`

最后落到：

- `whiteboard/packages/whiteboard-editor/src/session/viewport.ts:161-170`

这里会真正更新 viewport store。

### 2. `Surface` 自己订阅了 viewport，pan 时父组件先重渲染

`Surface` 在：

- `whiteboard/packages/whiteboard-react/src/canvas/Surface.tsx:33`

直接：

```ts
const viewport = useStoreValue(editor.store.viewport)
```

然后在：

- `whiteboard/packages/whiteboard-react/src/canvas/Surface.tsx:42-48`

重新生成 transform style。

这意味着：

- 每次 pan，`Surface` 本身都会 rerender。
- `CanvasScene`、`NodeOverlayLayer`、`EdgeOverlayLayer`、`DrawLayer` 都在它的子树下。
- 即使它们自己的 store 没变，也会先被父组件带着执行一次 render。

### 3. projection 还会把 viewport 变化翻译成 visible 重建

projection controller 订阅 viewport 的位置在：

- `whiteboard/packages/whiteboard-editor/src/projection/controller.ts:357-359`

它会对每次 viewport 变化执行：

```ts
mark(createViewportDelta())
```

随后：

- `whiteboard/packages/whiteboard-editor-graph/src/runtime/planner.ts:40-44`

把 scene delta 翻译成 spatial 的 `visible` scope。

接着：

- `whiteboard/packages/whiteboard-editor-graph/src/runtime/spatial/update.ts:335-339`

会把 `delta.visible` 标记为 `true`。

再往后：

- `whiteboard/packages/whiteboard-editor-graph/src/runtime/publish/delta.ts:79-85`

把 spatial visible 变化同步到 scene publish delta。

最终：

- `whiteboard/packages/whiteboard-editor-graph/src/runtime/publish/scene.ts:14-39`

会返回一个新的 `SceneSnapshot`。

问题在于：

- 这条链路隐含前提是“viewport 一变，就应该预先算好 visible 并发布”。
- 如果 `visibleWorld` 不驱动渲染，这个前提就是错的。

### 4. `CanvasScene` 订阅的是整个 `scene.view`

`CanvasScene` 在：

- `whiteboard/packages/whiteboard-react/src/canvas/CanvasScene.tsx:12`

读取：

```ts
const scene = useStoreValue(editor.read.scene.view).items
```

这里的问题有两个：

1. 它订的是整个 `scene.view`，不是更细的 `items` store。
2. 它消费的是 `scene.items`，不是某种“真正需要随视口变的可见集”。

所以：

- 只要 `SceneSnapshot` 外层对象换引用，它就会被通知。
- 即使变化的只是 `visible` 或 `pick`，它也会重新执行整段 `scene.map(...)`。

### 5. 当前 `visibleWorld` 甚至没有真正进入 queryRect 路径

graph runtime 的 scene phase 接口支持：

- `whiteboard/packages/whiteboard-editor-graph/src/contracts/editor.ts:333-336`

```ts
export interface ViewportInput {
  viewport: Viewport
  visibleWorld?: Rect
}
```

scene 构造时也支持：

- `whiteboard/packages/whiteboard-editor-graph/src/runtime/scene.ts:38-50`

有 `visibleWorld` 时走 `queryRect`，否则走 `queryAll`。

但当前 projection input 实际只传了：

- `whiteboard/packages/whiteboard-editor/src/projection/input.ts:717-719`

```ts
viewport: {
  viewport: store.read(session.viewport.read)
}
```

也就是说：

- 现在既有 eager visible rebuild
- 又没有真的用上 `visibleWorld`

这是最糟糕的组合：既付出了预计算成本，又没拿到查询收敛收益。

## Profile 结论

### `flush.json`

关键信息：

- `flushWheel -> flush -> update -> buildSceneSnapshot`
- `buildSceneSnapshot -> queryAll`

这说明当前 pan flush 时：

- scene phase 正在参与 viewport 更新链
- `visible` 是 eager 重建的
- 而且还退化成了全量空间查询

### `render.json`

关键信息：

- 绝大多数时间都在 `CanvasScene`
- 成本主要落在 React beginWork / JSX 创建

这说明当前瓶颈更偏向：

- `CanvasScene` 被频繁打醒
- 醒来后又在为全量 `scene.items` 重建 React 元素

而不是单纯的 spatial query 本身太慢。

## 为什么 `visibleWorld` 仍然要保留

### 1. 它是查询边界，不等于 visible snapshot

`visibleWorld` 的核心价值首先是：

- 表示“当前相机对应的 world rect”

它的自然用途是：

- `spatial.rect(visibleWorld)` 的输入
- hover / marquee / edge connect 等局部候选收敛
- 只与当前视口有关的 overlay / pick 查询

这不要求它必须被发布成 snapshot。

### 2. 当前 DOM 方案里，更重要的是裁剪计算，不是裁剪生命期

白板节点不是轻量 cell，它们通常还带着：

- 文本编辑状态
- selection / hover / transform chrome
- edge 连接关系
- shape / marker / label 子树
- focus / composition / contenteditable 状态

如果把 `visibleWorld` 直接变成硬 mount/unmount 边界，会引入：

- React reconciliation 抖动
- DOM 创建与销毁
- focus / IME 断裂
- 刚出边界就卸载、刚进边界又挂载的 thrash

因此：

- `visibleWorld` 应用于“缩小查询范围”是合理的
- `visibleWorld` 应用于“严格控制节点生命期”在当前阶段不合理

## 正确的职责划分

### 1. `scene.items`

职责：

- 表示画布顺序
- 表示场景实体全集
- 驱动 `CanvasScene` 主渲染

更新时机：

- document order 变化
- graph order 变化
- 实体增删导致 items 结构变化

不应因为以下事件更新：

- pan
- zoom
- 当前视口变化

### 2. `spatial`

职责：

- 维护常驻空间索引
- 支持 `all / rect / point` 查询

更新时机：

- 几何变化
- order 变化
- 实体增删

不应因为以下事件更新记录本身：

- pan
- zoom

### 3. `visible`

职责：

- 某次查询的结果

它不应该是：

- published scene snapshot 的一部分
- viewport 每次变化都要 eager 维护的常驻状态

它应该是：

- 调用方按需从 `spatial` 查询出来的临时结果

### 4. `visibleWorld`

职责：

- 某次 query 的输入参数

它可以：

- 由 viewport + container rect 在读取时计算
- 或者作为薄缓存的 key 一部分

它不应该：

- 强制驱动 runtime phase
- 强制触发 scene publish

## 设计原则

### 1. `visible` 改为 lazy query

规则固定为：

- 没有消费者，就不算
- 需要时再查
- 相同输入可缓存

### 2. `pan` 只改 viewport transform，不重建 visible

pan 的主成本应该是：

- transform 更新

不应该是：

- `scene.visible` eager rebuild
- `CanvasScene` 全量 rerender

### 3. 查询按调用场景区分，不做统一 eager visible 集

不同能力直接调用不同查询：

- hover: `point(worldPoint)`
- marquee: `rect(worldRect)`
- edge connect: 局部 `point/rect`
- 视口统计或 viewport overlay: `rect(visibleWorld)`

没有必要为了所有场景都先预建一份“当前视口所有可见元素”。

### 4. 如果多处需要同一份 visible query，使用懒缓存而不是 phase publish

如果担心同一帧重复查多次同一个 `visibleWorld`，允许加一层薄缓存。

缓存 key 建议包含：

- `spatialRevision`
- `viewportToken`
- `queryKind`

这仍然是：

- 按需计算
- 按 revision 失效

不是：

- pan 时无条件发布新 snapshot

## 目标架构

### A. 发布层

发布层只保留稳定、结构性的内容：

- `scene.items`
- `graph.*`
- `ui.*`

不再发布：

- `scene.visible`
- `scene.pick` 中依赖当前 viewport 的 eager 结果

### B. 查询层

查询层直接读：

- `spatial`
- `viewport`

在调用时组合得到：

- `visibleWorld`
- `visibleItems`
- `pickCandidates`

### C. React 层

React 层应满足：

- `CanvasScene` 只订阅稳定的 `scene.items`
- viewport 变化不再通过 scene publish 打醒 `CanvasScene`
- 需要 visible 候选的组件，按需调用更细粒度 query

## 详细实施方案

### 阶段 1. 去掉 pan 对 published visible 的依赖

#### 要改什么

- `whiteboard/packages/whiteboard-editor/src/projection/controller.ts`
- `whiteboard/packages/whiteboard-editor/src/projection/input.ts`
- `whiteboard/packages/whiteboard-editor-graph/src/runtime/planner.ts`
- `whiteboard/packages/whiteboard-editor-graph/src/runtime/publish/delta.ts`
- `whiteboard/packages/whiteboard-editor-graph/src/runtime/publish/scene.ts`
- `whiteboard/packages/whiteboard-editor-graph/src/phases/scene.ts`

#### 改造目标

让 viewport delta 不再驱动：

- spatial visible dirty
- scene visible rebuild
- scene publish

也就是说，pan 时不再有“published visible 重建”这条链。

#### 原则

- 如果 scene 主渲染不依赖 visible，那么 viewport delta 不应进入 scene publish。
- scene phase 应只处理结构性 scene 数据，而不是当前相机查询结果。

### 阶段 2. 明确 scene 只发布 `items`

#### 要改什么

- `whiteboard/packages/whiteboard-editor-graph/src/contracts/editor.ts`
- `whiteboard/packages/whiteboard-editor-graph/src/runtime/createEmptySnapshot.ts`
- `whiteboard/packages/whiteboard-editor-graph/src/runtime/scene.ts`
- `whiteboard/packages/whiteboard-editor/src/projection/sources.ts`
- `whiteboard/packages/whiteboard-editor/src/read/graph.ts`

#### 改造方向

把当前的 scene 语义收缩为：

- `items`

如果仍需保留 `visible / pick` 字段，也必须改成：

- 非 viewport 驱动的 published 数据
- 或仅作为非默认、非主链路的 read helper

更推荐的方向是直接把 viewport 相关的 `visible / pick` 从 published scene 中拿掉。

### 阶段 3. 引入 lazy visible query

#### 要改什么

- `whiteboard/packages/whiteboard-editor/src/read/graph.ts`
- 新增一层 query/read helper

#### 目标 API

例如：

```ts
visible: {
  rect(worldRect: Rect, options?): readonly SpatialRecord[]
  point(worldPoint: Point, options?): readonly SpatialRecord[]
  viewport(options?): readonly SpatialRecord[]
}
```

其中：

- `viewport()` 内部再读取当前 viewport 与 container rect，计算 `visibleWorld`
- 然后调用 `spatial.rect(visibleWorld)`

#### 原则

- 这是 query API，不是 store snapshot。
- 调用方主动拉取，而不是 projection 主动推送。

### 阶段 4. 给 lazy query 增加可选缓存

#### 什么时候需要

当出现以下情况时再做：

- 同一帧多个消费者重复请求同一个 viewport visible rect
- query 成本开始明显进入 profile

#### 缓存策略

- key: `spatialRevision + viewportToken + queryKind`
- value: query result
- spatial revision 变化时失效
- viewport token 变化时失效

#### 原则

- 先有正确职责，再做缓存
- 不要反过来用“缓存”去合理化 eager publish

### 阶段 5. 再处理 `Surface` 与 `CanvasScene` 的 rerender 链

#### 当前问题

即使去掉 published visible，`Surface` 仍会因为订阅 viewport 而 rerender，并把 `CanvasScene` 带着一起 render。

#### 要改什么

- `whiteboard/packages/whiteboard-react/src/canvas/Surface.tsx`
- `whiteboard/packages/whiteboard-react/src/canvas/CanvasScene.tsx`

#### 改造方向

优先级从高到低：

1. 给 `CanvasScene`、`NodeOverlayLayer`、`EdgeOverlayLayer` 做 `memo` 隔离。
2. 把 viewport transform 的更新从大组件 render 收缩到更小的 host 层。
3. 如仍不够，再考虑让 transform 走 ref + layout effect。

#### 原则

- pan 的主工作应该是改 transform。
- 不应让主 scene 子树反复执行 render 才得到位移。

### 阶段 6. 如未来需要裁剪，只做软裁剪

只有在完成前五阶段、且 profiling 证明“全 DOM 保活”仍然是主瓶颈后，才允许进入这一阶段。

#### 策略约束

- 必须使用 overscan，而不是严格裁边。
- 必须加入 hysteresis，避免边界抖动。
- 以下对象必须保活：
  - 正在编辑的节点
  - 当前选中的节点
  - 当前 hover 的节点
  - 正在连接或变换中的节点
  - 其关联 edge 仍在可视候选中的关键端点节点

#### 原则

- 软裁剪是最后一步，不是第一步。
- 只有在订阅结构和 query 结构都正确之后，它才有意义。

## 非目标

当前方案明确不做：

- 在 pan 过程中 eager 重建 published `visible`
- 把 `visibleWorld` 变成 scene 主渲染输入
- 在未拆掉 eager visible publish 之前直接上 DOM virtualization
- 在当前阶段按视口硬卸载 node DOM

## 验收标准

完成阶段 1-5 后，应满足：

1. pan 不再触发 scene visible rebuild / publish。
2. `CanvasScene` 不再因为 `scene.visible` 或等价物变化被动 rerender。
3. `CanvasScene` 不再因为 `Surface` 订阅 viewport 而被父组件连带 rerender。
4. 需要 visible 候选时，可以通过 lazy query 获取。
5. 相同 viewport query 如有重复，可通过 revision/token 缓存复用。
6. 当前 DOM 方案仍保持节点保活，不因为可视边界抖动而出现 mount/unmount thrash。

## 建议的实施顺序

顺序固定为：

1. 先去掉 published visible 的 pan 重建链。
2. 再把 scene 收缩成稳定的 `items` 发布面。
3. 再引入 lazy visible query。
4. 需要时补 query cache。
5. 最后处理 `Surface` 与 `CanvasScene` 的 rerender 隔离。
6. 再评估是否需要软裁剪。

这个顺序不能反过来。

如果先讨论 DOM 卸载，会把真正的问题掩盖掉：

- viewport 不该驱动 visible publish
- `CanvasScene` 不该订过粗的数据面
- `Surface` 不该在 pan 时带着整棵 scene 子树 render

## 结论

`visibleWorld` 在当前 DOM 白板里是需要的，但它的职责应当是：

- 作为 query 输入
- 帮助收敛空间查询
- 为按需 visible 计算提供边界

而不是：

- 成为 published scene snapshot 的一部分
- 在 pan 时被 eager 重建
- 直接承担 DOM 生命期控制

当前最应该修的是：

- 去掉 viewport -> visible publish 这条错误链路
- 让 `scene.items` 回到稳定发布面
- 把 `visible` 改成 lazy query
- 再拆 `Surface` 与 `CanvasScene` 的 rerender 关系

这些问题修完之后，再讨论是否需要软裁剪，顺序才是正确的。
