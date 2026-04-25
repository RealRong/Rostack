# Whiteboard 性能底层设施规划

## 数据源统一

### 先说结论

底层数据源应该只保留三层：

1. `document`
   - 持久化真值。
   - 来源是 engine snapshot。
   - 只表达 committed document，不表达 preview / draft / hover / layout / spatial。
2. `scene`
   - 当前编辑世界的真值。
   - 来源是 `@whiteboard/editor-graph` 的 projection runtime。
   - 包含 projected node/edge、geometry、scope、spatial query、frame query、mindmap/group query、scene order。
3. `session`
   - 纯交互态和面板态。
   - 包含 tool / viewport / selection / interaction / chrome / panel。

除此之外，不再允许出现“第三种可直接读业务数据的入口”。

这意味着：

- `IndexState`
- `SpatialIndexState`
- `ProjectionSources`
- `WorkingState.graph`
- `WorkingState.ui`

都只能是 `scene` 的内部实现细节，不能再成为上层直接依赖的数据源。

### 为什么现在会乱

现状里同一份业务信息经常可以从多个地方拿到：

- `createEditor(...)` 同时把 `document` 和 `graph` 注入 action / input / write / read / layout，调用方天然会混着读：[createEditor.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/editor/createEditor.ts:65)
- `DocumentRead` 暴露 committed node/edge 及其几何：[document/read.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/document/read.ts:32)
- `GraphRead` 暴露 projection query，但也把 `ProjectionSources` 和 raw family store 暴露了出去：[read/graph.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/read/graph.ts:29)
- `GraphNodeRead` / `GraphEdgeRead` 继续把 `.graph` / `.ui` / `.committed` 这种底层口子往外漏：[read/node.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/read/node.ts:42)、[read/edge.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/read/edge.ts:64)
- `editor-graph` runtime 里其实已经有一套正式 query，但很多能力又被上层绕开，改成自己拼 snapshot / geometry / index：[runtime/query.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor-graph/src/runtime/query.ts:134)

当前污染面也已经不小：

- `whiteboard-editor/src` 里有 `18` 处直接 `.graph.get(...)`
- 有 `19` 处直接 `.committed.get(...)`
- 有 `8` 处直接 `.item.get(...)`

这会带来两个直接问题：

1. 调用方很难判断自己现在需要 committed 还是 projected。
2. 任何底层缓存、scope、geometry、spatial 想复用时，都不知道该挂在哪一层。

### 最终分层

最终只保留这个依赖方向：

```ts
engine snapshot
  -> document

engine snapshot + session + layout
  -> editor-graph runtime
  -> scene

session state
  -> session
```

约束：

- `document` 只能回答 committed 数据。
- `scene` 只能回答当前 projection 数据。
- `session` 只能回答交互/UI 数据。
- 任何模块如果需要 index / spatial / geometry / frame / scope，只能从 `scene` 拿，不允许碰内部 state。

### 最终 API

命名先统一成三个词：

- `document`
- `scene`
- `session`

内部统一接口：

```ts
type EditorSources = {
  document: EditorDocumentSource
  scene: EditorSceneSource
  session: EditorSessionSource
}

type EditorDocumentSource = {
  get(): Document
  node(nodeId: NodeId): Node | undefined
  edge(edgeId: EdgeId): Edge | undefined
  nodes(nodeIds: readonly NodeId[]): readonly Node[]
  edges(edgeIds: readonly EdgeId[]): readonly Edge[]
  bounds(): Rect
  slice(input: {
    nodeIds?: readonly NodeId[]
    edgeIds?: readonly EdgeId[]
  }): SliceExportResult | undefined
}

type EditorSceneSource = {
  node(nodeId: NodeId): SceneNode | undefined
  edge(edgeId: EdgeId): SceneEdge | undefined
  items(): readonly SceneItem[]
  query: {
    rect(rect: Rect, options?: SceneQueryOptions): readonly SpatialRecord[]
    visible(options?: SceneQueryOptions): readonly SpatialRecord[]
  }
  geometry: GeometryCache
  scope: EditorScopeRead
  frame: {
    pick(point: Point, options?: {
      excludeIds?: readonly NodeId[]
    }): NodeId | undefined
    parent(nodeId: NodeId, options?: {
      excludeIds?: readonly NodeId[]
    }): NodeId | undefined
  }
  mindmap: {
    id(value: string): MindmapId | undefined
    structure(value: MindmapId | NodeId): MindmapStructure | undefined
  }
  group: {
    ofNode(nodeId: NodeId): GroupId | undefined
    ofEdge(edgeId: EdgeId): GroupId | undefined
    exact(target: SelectionTarget): readonly GroupId[]
  }
}

type EditorSessionSource = {
  tool: ReadStore<Tool>
  viewport: SessionRead['viewport']
  selection: ReadStore<SelectionTarget>
  interaction: ReadStore<EditorInteractionState>
  chrome: EditorChromeRead
  panel: EditorPanelRead
}
```

设计规则：

- `document.node(id)` / `document.edge(id)` 返回 committed model，不再返回 `committed.get(...)` store 细节。
- `scene.node(id)` / `scene.edge(id)` 返回 projected model，不再暴露 `.graph.get(...)` / `.ui.get(...)`。
- `geometry` / `scope` / `frame` / `query` 都归 `scene`。
- `index` 和 `spatial` 不再单独成为 editor 层 API。
- `ProjectionSources` 只留在 projection controller 和 scene adapter 内部。

### 什么场景该读哪一层

- 写入前校验、编辑初始文本、clipboard/export、存在性过滤：
  - 读 `document`
- 命中、拖拽、edge route、edge connect、selection bounds、snap、visible、frame、group、mindmap layout：
  - 读 `scene`
- tool / viewport / interaction / chrome / panel：
  - 读 `session`

只有一种情况允许同时读 `document + scene`：

- 代码明确要比较 committed 和 projected 的差异。
- 例如：
  - edit commit
  - preview 覆盖 committed
  - write 前做“当前投影态”辅助判断

除此之外，普通 feature 不应该同时依赖两个层。

### 迁移计划

#### P0. 先立规矩，不改行为

- 在文档和类型层明确：
  - `document = committed`
  - `scene = projected`
  - `session = transient`
- `GraphRead` 内部语义改名为 `SceneRead`
  - 先加 type alias，兼容旧名
- 新增 `EditorSources`
  - `createEditor(...)` 内部统一先组装 `sources.document / sources.scene / sources.session`
  - action / input / write / layout 后续只从这里裁剪依赖

#### P1. 先把“直接摸底层 store”收口

- 用稳定 getter 代替这些直接访问：
  - `node.graph.get(...)`
  - `edge.graph.get(...)`
  - `node.committed.get(...)`
  - `edge.item.get(...)`
- 第一批替换模块：
  - `input/features/*`
  - `action/*`
  - `write/*`
  - `read/public.ts`
- 目标：
  - feature 层不再知道 raw family store 的存在

#### P2. 把 query / geometry / scope 归并到 scene

- 把后面几节里的能力都挂到 `scene`：
  - `scope`
  - `geometry`
  - `query.visible`
  - `frame`
- 调用方统一从 `scene` 拿：
  - bounds
  - visible
  - frame
  - related edges
  - move scope
  - geometry cache

#### P3. 隐藏内部实现细节

- `IndexState` / `SpatialIndexState` 不再穿出 `editor-graph`
- `ProjectionSources` 不再作为 editor 层通用依赖类型
- `GraphNodeRead` / `GraphEdgeRead` 去掉这些对外字段：
  - `committed`
  - `graph`
  - `ui`
  - `all`
- 上层如果还需要这些能力，必须先在 `scene` 上补正式 API，再迁过去

#### P4. 再做性能设施替换

- 在数据源统一后，再把热点逻辑切到：
  - `scene.scope`
  - `scene.geometry`
  - `scene.query.visible`
  - `session.chrome.*`
  - `session.panel.*`

原因：

- 如果不先统一数据源，后面的 geometry cache / scope / field-level read 做出来之后，上层还是会继续绕开它们。

### 兼容策略

- 对外 public API 不一次性打断：
  - 先保留 `editor.read.node` / `editor.read.edge` / `editor.read.items` / `editor.read.query`
  - 内部先改成从 `scene` 转发
- 等内部调用收敛后，再决定 public API 是否显式改成：
  - `editor.read.scene.*`
  - `editor.read.document.*`
  - `editor.read.session.*`

现阶段重点不是 public rename，而是先把“谁才是唯一数据源”定死。

## 背景

最近几次性能问题暴露出来的共性，不是某一个组件或某一条逻辑特别差，而是底层缺少几类“表达成本模型”的设施，导致上层只能靠局部 patch 自救：

1. 同一帧里重复做同一份纯派生计算。
2. 上层只拿得到“全量视图”，所以交互只能全量扫。
3. 输入和订阅默认走最重路径，没有声明“我这次其实只需要 world point / 一个字段 / 可见区子集”。

这会同时放大非渲染成本和渲染成本。

## 已确认的共性浪费

### 1. 交互续帧默认走最重输入解析

- `whiteboard/packages/whiteboard-react/src/dom/host/input.ts`
- `whiteboard/packages/whiteboard-react/src/runtime/bridge/pointer.ts`
- 现象：
  - captured drag session 的 `move/up` 原本仍会走 `resolvePoint -> elementFromPoint`。
  - 但大多数 active interaction 的 `move/up` 只读 `world/screen/modifiers/samples`，并不依赖 `pick`。
- 类似点：
  - `selection/move`
  - `selection/marquee`
  - `mindmap/drag`
  - `transform`
  - `draw`
  - `edge-move`
  - `edge-label`
  - `edge-route`
  - `edge-connect`

### 2. 上层交互拿不到“受影响邻域”，只能全量扫

- `whiteboard/packages/whiteboard-editor/src/input/features/selection/move.ts:128`
- 现象：
  - `node-drag` 初始化直接把 `projection.node.all()` / `projection.edge.all()` 喂给 move state。
  - 这说明底层没有一个“按选区展开 move 邻域”的正式 query，只能拿全量投影数据。
- 旁证：
  - runtime 里其实已经有零散能力：
    - `relatedEdges(...)`
    - `frame.descendants(...)`
    - `spatial.rect(...)`
  - 但这些能力没有被封装成上层直接可用的邻域 API。

### 3. 同一帧重复计算节点/边几何

- `whiteboard/packages/whiteboard-editor-graph/src/domain/edge.ts`
- `whiteboard/packages/whiteboard-editor-graph/src/domain/node.ts:186`
- `whiteboard/packages/whiteboard-editor/src/read/edge.ts:251`
- `whiteboard/packages/whiteboard-editor/src/document/read.ts:90`
- `whiteboard/packages/whiteboard-editor/src/input/features/edge/connect.ts:406`
- 现象：
  - 同一个 node 的 outline geometry，会在 graph phase、read layer、交互 preview 里重复被算多次。
  - 同一个 edge 的 resolved view，也会在 projector 和 read 层重复 `edgeApi.view.resolve(...)`。
  - scene order 这种纯查表信息，也曾经在 spatial patch 中被反复 `findIndex`。

### 4. React 层大量订阅整块 store，而不是订阅字段

- `whiteboard/packages/whiteboard-react/src/features/node/components/NodeOverlayLayer.tsx:151`
- `whiteboard/packages/whiteboard-react/src/features/edge/components/EdgeOverlayLayer.tsx:24`
- `whiteboard/packages/whiteboard-react/src/features/draw/DrawLayer.tsx:8`
- `whiteboard/packages/whiteboard-react/src/features/selection/Marquee.tsx:4`
- `whiteboard/packages/whiteboard-react/src/features/selection/chrome/SelectionToolbar.tsx:19`
- `whiteboard/packages/whiteboard-react/src/features/edge/components/EdgeItem.tsx:160`
- `whiteboard/packages/whiteboard-react/src/features/node/components/NodeTransformHandles.tsx:382`
- `whiteboard/packages/whiteboard-react/src/features/viewport/ViewportDock.tsx:37`
- 现象：
  - 很多组件订阅的是整块 `editor.read.chrome`、`editor.read.panel`、`editor.store.viewport`。
  - 组件实际只用其中 1 个字段，但任何无关字段变化都会让它 rerender。
- 旁证：
  - `shared/react/src/useLazySelectorValue.ts` 已经存在按字段懒读的底层能力，但当前几乎没被使用。

### 5. Scene 仍然是“全量 DOM + 全量样式树”

- `whiteboard/packages/whiteboard-react/src/canvas/CanvasScene.tsx:13`
- 现象：
  - scene 直接渲染 `editor.read.items` 的全部内容。
  - 这会让 render 和 Recalculate Style 成本跟总节点数走，而不是跟可见节点数走。
- 这也是 zoom、pan、大量节点场景下 style 和 render 层面持续偏高的根因之一。

### 6. trace 有时长，但缺少“为什么慢”的结构化指标

- `shared/projector/src/projector/update.ts:93`
- `shared/projector/src/metrics.ts:1`
- 现象：
  - trace 里有 phase duration。
  - 但很多时候没有统一的 fanout、rebuild、cache hit/miss、touched entity 数。
  - 结果是每次性能分析都要重新读 flame chart，很难把优化沉淀为制度化指标。

## 最终 API 设计

这一版只保留最终建议，不再保留多套路线。

命名原则：

1. 一个概念只用一个词，不用 `expand`、`resolve`、`manager` 这种过度抽象命名。
2. API 默认返回“调用方马上能用的结果”，不把拼接工作继续甩给上层。
3. 字段只保留调用方真正需要的最小集合。

## 1. 交互输入模式

### 最终命名

`pointer`

### 最终 API

```ts
type PointerMode =
  | 'full'
  | 'point'

type InteractionSession = {
  mode: InteractionMode
  pointerId?: number
  chrome?: boolean
  gesture?: ActiveGesture | null
  pointer?: {
    move?: PointerMode
    up?: PointerMode
  }
}
```

### 语义

- `full`
  - 保持现状，包含 `pick/editable/ignore*`。
- `point`
  - 只解析 `client/screen/world/modifiers/samples`。
  - 不做 DOM 命中。
  - `pick` 固定为 `background`。
- `down` 默认一直走 `full`，不开放配置。

### 使用示例

```ts
const session: InteractionSession = {
  mode: 'node-drag',
  pointerId: input.pointerId,
  pointer: {
    move: 'point',
    up: 'point'
  }
}
```

### 直接收益

- 不再靠 pointer bridge 写特判。
- 所有 captured interaction 都能统一走轻量输入路径。

### 优先级

P0

## 2. 邻域读取

### 最终命名

`editor.read.scope`

内部实现归属：

- 对外暴露在 `editor.read.scope`
- 实际实现放在 `@whiteboard/editor-graph`
- `editor` 这一层只做转发，不自己重建索引

### 最终 API

```ts
type MoveScope = {
  nodes: readonly Node[]
  edges: readonly Edge[]
}

type EditorScopeRead = {
  move(target: SelectionTarget): MoveScope
  relatedEdges(nodeIds: readonly NodeId[]): readonly EdgeId[]
  bounds(target: SelectionTarget): Rect | undefined
}
```

### 语义

- `move(target)`
  - 返回拖拽这个选区真正需要的 nodes 和 edges。
  - 内部已经包含 frame descendants 和相关 edges。
- `relatedEdges(nodeIds)`
  - 返回这些节点相连的 edge id。
- `bounds(target)`
  - 返回目标在当前 projection 下的聚合 bounds。

### 内部实现

- 直接复用现有：
  - `edgeIdsByNode`
  - `ownerByNode`
  - `spatial.tree`
  - graph/projection 里的当前 node rect / frame rect
- 不新增持久化的 `frameParentByNode` / `frameChildrenByNode`

实现原则：

- `move(target)` 基于“当前 projection 几何”做展开，不基于文档层结构。
- root 里如果包含 frame，只对这些 frame 走 descendants 展开。
- descendants 展开先用 `spatial.rect(frameRect)` 收窄候选，再用 containment 判断确认成员。
- 相关 edges 继续直接走 `edgeIdsByNode`。

原因：

- frame 在我们这里表达的是空间包含，不是 ownership tree。
- 当前 `childrenByNode` / `parentByNode` 只表示 mindmap tree，不能拿来表达 frame descendants。
- 给 frame 单独补一套 parent/children 持久索引，会把“几何关系”错误建模成“结构关系”，后面容易把语义越用越歪。

### 使用示例

```ts
const scope = editor.read.scope.move(target)
const state = nodeApi.move.state.start({
  nodes: scope.nodes,
  edges: scope.edges,
  target,
  startWorld,
  nodeSize
})
```

### 直接收益

- `selection/move.ts` 不再拿全量 `node.all()` / `edge.all()`。
- 之后的 scene windowing、selection toolbar、fit/bounds 也能复用。

### 优先级

P0

## 3. 几何缓存

### 最终命名

`geometry`

对外位置：

- `editor.read.geometry`

内部实现归属：

- 对外挂在 `editor.read`
- 实际实现放在 `@whiteboard/editor-graph` 的 `Read.geometry`
- 不走 React store 订阅，默认按需读取

### 最终 API

```ts
type CachedNode = {
  node: Node
  geometry: NodeGeometry
}

type GeometryCache = {
  node(nodeId: NodeId): CachedNode | undefined
  edge(edgeId: EdgeId): CoreEdgeView | undefined
  order(item: SceneItemRef): number
}
```

### 语义

- `node(nodeId)`
  - 返回当前 projection 下的节点快照。
  - `node` 是已经带上 `position/size/rotation` 的 spatial node，不是 document 原始 record。
  - `geometry` 是完整 `NodeGeometry`，包含 outline / bounds。
- `edge(edgeId)`
  - 返回完整 `edgeApi.view.resolve(...)` 结果。
- `order(item)`
  - 返回 scene order。
- 生命周期绑定当前 projector revision，不做全局长生命周期缓存。

### 内部结构

```ts
type GeometryState = {
  revision: Revision
  nodes: Map<NodeId, CachedNode | undefined>
  edges: Map<EdgeId, CoreEdgeView | undefined>
  orderByItem: Map<string, number>
}
```

说明：

- `nodes`
  - 缓存“当前投影态”的 node snapshot。
- `edges`
  - 缓存完整 edge resolved view，给 hit-test / preview / read 复用。
- `orderByItem`
  - key 直接用 `${kind}:${id}`，避免每次再扫 `items`。

### 构建方式

#### 1. node

- 在 graph phase 的 `patchNode(...)` 里生成。
- 直接复用已经存在的投影计算链：
  - projected rect
  - projected rotation
  - `nodeApi.outline.geometry(...)`
- 这里不再额外发明一套 node 几何算法，只是把已经算出来的结果留下来。

#### 2. edge

- 在 graph phase 的 `patchEdge(...)` 里生成。
- 现状里 `patchEdge(...)` 本来就会调用一次 `edgeApi.view.resolve(...)`，但后面只保留 render 用的 route/box/labels，完整 resolved view 被丢掉。
- GeometryCache 的做法是：
  - 把这份 resolved view 存进 `geometry.edges`
  - `EdgeView.route`、`EdgeView.box`、label placement 都从这份结果继续派生
  - read 层和交互层禁止再自己 resolve 一遍

#### 3. order

- 基于 `working.items` 建一个 `orderByItem` map。
- 只在以下情况下重建：
  - `delta.order === true`
  - `items` 真的 changed

### 利用的基础设施

- `graph phase`
  - 已经天然提供“一次 projector update”的生命周期，适合挂 phase cache。
- `GraphDelta.geometry.nodes / edges`
  - 已经告诉我们哪些 node / edge 几何脏了，适合做精准失效。
- `patchEdge(...)` 里的 `nodeSnapshotCache`
  - 现在已经有一版临时 node snapshot cache，可以直接提升为正式 geometry node cache。
- `WorkingState.graph.nodes / edges`
  - 已经是当前 projection 的主数据，不需要再从 document 重建一次。
- `working.items`
  - 已经是 scene order 的发布结果，适合直接建 `orderByItem`。
- `Snapshot.revision`
  - 适合给 geometry cache 绑定 revision，避免跨 revision 混用。
- `editor-graph Read`
  - 已经是 query 汇聚点，适合挂 `read.geometry`。

### 失效策略

- node entry 失效条件：
  - node 自己的 rect / rotation / size 变化
  - 归属的 mindmap layout 改变，导致投影 rect 变化
  - node 被删除
- edge entry 失效条件：
  - edge 自己的 patch / labels / route 变化
  - source / target 任一端 node geometry 变化
  - edge 被删除
- order entry 失效条件：
  - canvas order 变化
  - item 新增 / 删除
- projector dispose 或 reset 时整体清空

### 首批替换点

- `whiteboard-editor-graph/src/domain/edge.ts`
  - 现在 `toEdgeNodeSnapshot(...)` 里还会重新做一次 `nodeApi.outline.geometry(...)`
  - 改成直接读 `geometry.node(nodeId)`
- `whiteboard-editor/src/read/edge.ts`
  - `readResolvedNodeSnapshot(...)`
  - `readEdgeGeometry(...)`
  - `connectCandidates(...)`
  - 这几处都改成直接读 geometry cache
- `whiteboard-editor/src/input/features/edge/connect.ts`
  - preview path 读取 node snapshot 时不再现场重建 geometry

### 不做的事

- 不做跨 session / 全局 LRU 缓存。
- 不把 committed document geometry 和 projected geometry 混在一起。
- 不把 GeometryCache 做成新的响应式 store 家族。

### 使用示例

```ts
const source = geometry.node(edge.source.nodeId)
const target = geometry.node(edge.target.nodeId)
const view = geometry.edge(edgeId)
const order = geometry.order({
  kind: 'edge',
  id: edgeId
})
```

### 直接收益

- projector、read 层、交互 preview 可以共享同一份几何结果。
- 避免同一帧多次 `outline.geometry` / `edge.view.resolve`。
- edge hit-test、edge connect preview、selection move 这种热点路径可以直接吃缓存，不再重复拼 node snapshot。

### 优先级

P0

## 4. 字段级读接口

### 最终命名

- `editor.read.chrome.*`
- `editor.read.panel.*`
- `editor.store.zoom`
- `editor.store.center`

### 最终 API

```ts
type EditorChromeRead = {
  marquee: ReadStore<MarqueePreview | undefined>
  draw: ReadStore<DrawPreview | null>
  edgeGuide: ReadStore<EdgeGuide>
  selection: ReadStore<SelectionOverlay | undefined>
}

type EditorPanelRead = {
  selectionToolbar: ReadStore<SelectionToolbarContext | undefined>
}

type EditorStore = {
  viewport: ReadStore<Viewport>
  zoom: ReadStore<number>
  center: ReadStore<Point>
}
```

### 语义

- React 组件默认订阅字段，不再订阅整块对象。
- 全量对象保留给确实需要整块数据的地方。

### 使用示例

```ts
const marquee = useStoreValue(editor.read.chrome.marquee)
const overlay = useStoreValue(editor.read.chrome.selection)
const zoom = useStoreValue(editor.store.zoom)
const toolbar = useStoreValue(editor.read.panel.selectionToolbar)
```

### 直接收益

- `NodeOverlayLayer`、`DrawLayer`、`Marquee`、`SelectionToolbar`、`EdgeItem`、`NodeTransformHandles` 都能降 rerender 范围。

### 优先级

P0

## 5. 可渲染场景

### 最终命名

`editor.read.scene.render`

### 最终 API

```ts
type EditorSceneRead = {
  render: ReadStore<readonly SceneItem[]>
}
```

### 语义

- `render`
  - 返回“当前应该渲染的 scene items”。
  - 内部规则固定为：`visible + pinned`。
- `pinned` 由底层决定，至少包含：
  - selected
  - editing
  - active interaction 涉及项

### 使用示例

```ts
const scene = useStoreValue(editor.read.scene.render)
```

### 直接收益

- `CanvasScene` 不再被全量 DOM 绑死。
- zoom/pan 的 render 和 style recalc 成本会跟可见区走。

### 优先级

P1

## 6. 诊断指标

### 最终命名

`StageMetrics`

### 最终 API

```ts
type StageMetrics = {
  touched?: number
  patched?: number
  reused?: number
  fanout?: number
  hit?: number
  miss?: number
}
```

### 语义

- `touched`
  - 本阶段收到的输入规模。
- `patched`
  - 本阶段真正重建或更新的实体数。
- `reused`
  - 直接复用的实体数。
- `fanout`
  - 由本阶段扩散出来的额外实体数。
- `hit` / `miss`
  - 缓存命中情况。

### 使用示例

```ts
return {
  action: 'sync',
  metrics: {
    touched: touchedEdgeIds.size,
    patched: patchedEdgeCount,
    fanout: fanoutEdgeCount,
    hit: cacheHitCount,
    miss: cacheMissCount
  }
}
```

### 直接收益

- trace 不再只有时长。
- 之后可以直接用 trace 判断“慢在 fanout 还是慢在单次 rebuild”。

### 优先级

P1

## 推荐实施顺序

### 第一批：先把“局部 patch 升级成设施”

1. `InteractionInputPolicy`
2. `ProjectionNeighborhoodQuery`
3. `ProjectorFrameCache`
4. `Selectorized Read Stores`

这四项会同时改善：

- drag 非渲染耗时
- zoom 触发的无关 rerender
- pointer move 命中解析
- 同帧重复几何计算

### 第二批：处理大规模 DOM 的结构性上限

5. `ViewportWindowedScene`

这项主要解决：

- render
- style recalc
- 大量节点下 zoom/pan 的天花板

### 第三批：把性能优化制度化

6. `Projector Diagnostics`

这项主要解决：

- 未来定位效率
- 回归监控
- 避免每次都重新人工做 profile

## 我认为最值得先做的 3 个设施

如果只选 3 个，我建议是：

1. `Selectorized Read Stores`
2. `ProjectionNeighborhoodQuery`
3. `ProjectorFrameCache`

原因：

- 它们能同时覆盖 render 和 non-render。
- 它们不是一次性 patch，而是会持续减少之后的新性能债。
- 它们都已经有部分底层能力，只是还没有被组织成正式设施。

## 结论

目前这些性能问题并不说明“DOM 方案就是这么慢”，而是说明当前架构里缺少：

- 输入成本分级
- 邻域查询
- 同帧派生缓存
- 字段级订阅
- 可见区 scene
- 结构化性能诊断

把这些设施补齐之后，局部 patch 会变少，性能优化也会从“撞热点修热点”变成“有统一杠杆可用”。
