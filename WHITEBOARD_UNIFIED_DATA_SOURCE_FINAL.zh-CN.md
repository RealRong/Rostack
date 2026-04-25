# Whiteboard 统一数据源最终方案

## 决策

这份方案明确不兼容现有实现。

目标不是在 `DocumentRead`、`GraphRead`、`ProjectionSources`、`editor.read` 之上继续叠 patch，而是直接重做 editor 的数据源边界，让后续所有性能优化都能挂在同一套长期稳定的抽象上。

约束：

1. 不保留旧读接口作为长期兼容层。
2. 不允许 feature 层同时依赖旧接口和新接口。
3. 不接受“先加一个 adapter，之后再慢慢迁”的主干方案。
4. 可以在单独重构分支里分阶段搬迁，但最终合并必须是一次性切换。

合并标准：

1. `DocumentRead`、`GraphRead`、`ProjectionSources`、`editor.read.*` 旧体系全部删除。
2. feature 层只能从 `editor.document`、`editor.scene`、`editor.session` 读取。
3. `index`、`spatial`、`geometry cache`、`scope` 都只能是 `scene` 的内部能力或正式 API，不能再被绕开。

## 为什么必须重做

现有实现最大的问题不是“少了某个缓存”，而是“同一份业务信息有多个入口”：

- committed document 可以从 `DocumentRead` 读。
- projected scene 可以从 `GraphRead` 读。
- projection 内部状态又能通过 `ProjectionSources` 间接读。
- `IndexState`、`SpatialIndexState` 虽然名义上是内部实现，但很多正式能力实际上又在围着这些内部结构打转。
- `node.graph.get(...)`、`edge.graph.get(...)`、`node.committed.get(...)`、`edge.item.get(...)` 这类底层口子已经扩散到 action / input / write / read / React 层。

结果是：

1. 调用方无法明确自己是在读 committed 还是 projected。
2. 新做的 `scope`、`geometry`、`visible`、`spatial` 很容易被上层绕开。
3. 性能优化没有挂点，因为“唯一正确的数据源”根本不存在。
4. 每次重构都只能做局部 patch，无法形成稳定成本模型。

所以这个问题必须先通过“统一数据源”来解决，之后再谈性能设施。

## 总目标

最终 editor 只能有三类数据源：

1. `document`
   - committed truth
   - 来源是 engine snapshot
   - 不表达 preview、draft、hover、selection、layout、spatial、geometry cache
2. `scene`
   - projected truth
   - 来源是 scene runtime
   - 负责 projection、geometry、scope、spatial query、frame query、scene order、mindmap/group scene 信息
3. `session`
   - transient truth
   - 来源是 session runtime
   - 负责 tool、viewport、selection、interaction、chrome、panel

除此之外，不允许再出现第四种“业务可读数据源”。

这意味着以下对象都必须退回实现细节，不允许继续出现在 feature 依赖面上：

- `IndexState`
- `SpatialIndexState`
- `WorkingState.graph`
- `WorkingState.ui`
- `ProjectionSources`
- `GraphNodeRead.graph`
- `GraphEdgeRead.graph`
- `GraphNodeRead.committed`
- `GraphEdgeRead.committed`

## 设计原则

### 1. 一个概念只有一个数据源

- committed 只从 `document` 读
- projected 只从 `scene` 读
- transient 只从 `session` 读

### 2. 重计算能力必须挂在 scene

以下能力都不是 document 能力，也不是 feature 私有逻辑，必须挂到 `scene`：

- `geometry`
- `scope`
- `query.visible`
- `query.rect`
- `frame.pick`
- `frame.parent`
- `group.exact`
- `mindmap.structure`
- `order`

### 3. UI 状态不能混进 scene 实体

`selected`、`hovered`、`patched`、`editing`、`selection overlay` 这些都属于 `session` 或 `session` 的派生 view，不属于 scene entity。

这条很重要，因为它直接决定未来能否做到字段级订阅和低 fanout。

### 4. 重型派生和轻量视图分离

`SceneNode` / `SceneEdge` 是常用轻量实体。

`GeometryCache` 是重型派生能力，只给命中、边解析、拖拽 scope、可见区计算等热点路径使用，不塞回普通实体结构。

### 5. 命名必须表达语义，而不是历史实现

因此：

- `GraphRead` 这个名字必须删除
- `editor-graph` 这个包名也应该删除
- 最终应该改成 `scene`

原因很简单：它早就不只是 graph 了，它实际上承担的是 projection world 的全部职责。

## 最终包结构

```ts
@whiteboard/editor
  - public facade
  - 组装 document / scene / session / write / input / events

@whiteboard/editor-scene
  - scene runtime
  - projection
  - indexes
  - spatial
  - geometry cache
  - scope
  - frame query
  - scene publish

@whiteboard/editor-session
  - tool
  - viewport
  - selection
  - interaction
  - chrome
  - panel

@whiteboard/editor-document
  - committed document source
  - slice/export helpers
```

如果不想拆成三个 package，至少也必须拆成三个明确 module，并保留同样的语义边界：

- `editor/document`
- `editor/scene`
- `editor/session`

但是 `editor-graph` 这个命名必须退出最终方案。

## 最终 Editor API

最终对外 API 直接改成：

```ts
type Editor = {
  document: EditorDocumentSource
  scene: EditorSceneSource
  session: EditorSessionSource
  write: EditorWrite
  input: EditorInputHost
  events: EditorEvents
  dispose(): void
}
```

旧的这些命名全部删除：

- `editor.read`
- `editor.store`
- `DocumentRead`
- `GraphRead`
- `createGraphRead`
- `createDocumentRead`

原因：

- `read` 和 `store` 把“数据语义”和“响应式实现”混在了一起。
- `document / scene / session` 直接把语义说清楚，不需要用户猜。

## 最终数据源 API

### 1. document

```ts
type EntitySource<TKey, TValue> = {
  get(id: TKey): TValue | undefined
  getMany(ids: readonly TKey[]): readonly TValue[]
  ids(): readonly TKey[]
  read: KeyedReadStore<TKey, TValue | undefined>
}

type EditorDocumentSource = {
  get(): Document
  nodes: EntitySource<NodeId, Node>
  edges: EntitySource<EdgeId, Edge>
  bounds(): Rect
  slice(input: {
    nodeIds?: readonly NodeId[]
    edgeIds?: readonly EdgeId[]
  }): SliceExportResult | undefined
}
```

规则：

- `document` 只返回 committed model
- `document` 不返回 projected rect / projected bounds / preview patch / ui flags
- `document` 不提供 spatial、frame、scope、geometry cache

### 2. scene

```ts
type SceneNode = {
  id: NodeId
  node: NodeModel
  owner?: OwnerRef
  rect: Rect
  bounds: Rect
  rotation: number
}

type SceneEdge = {
  id: EdgeId
  edge: Edge
  route: {
    points: readonly Point[]
    svgPath?: string
    bounds?: Rect
    source?: Point
    target?: Point
    ends?: ResolvedEdgeEnds
    handles: readonly EdgeHandle[]
  }
  box?: {
    rect: Rect
    pad: number
  }
}

type SceneQuery = {
  rect(rect: Rect, options?: {
    kinds?: readonly SceneItemKind[]
    match?: 'touch' | 'contain'
  }): readonly SpatialRecord[]
  visible(options?: {
    kinds?: readonly SceneItemKind[]
    match?: 'touch' | 'contain'
  }): readonly SpatialRecord[]
}

type SceneFrame = {
  pick(point: Point, options?: {
    excludeIds?: readonly NodeId[]
  }): NodeId | undefined
  parent(nodeId: NodeId, options?: {
    excludeIds?: readonly NodeId[]
  }): NodeId | undefined
}

type SceneGroup = {
  ofNode(nodeId: NodeId): GroupId | undefined
  ofEdge(edgeId: EdgeId): GroupId | undefined
  exact(target: SelectionTarget): readonly GroupId[]
}

type SceneMindmap = {
  id(value: string): MindmapId | undefined
  structure(value: MindmapId | NodeId): MindmapStructure | undefined
}

type GeometryCache = {
  node(nodeId: NodeId): CachedNode | undefined
  edge(edgeId: EdgeId): CoreEdgeView | undefined
  order(item: SceneItemRef): number
}

type MoveScope = {
  nodes: readonly Node[]
  edges: readonly Edge[]
}

type SceneScope = {
  move(target: SelectionTarget): MoveScope
  relatedEdges(nodeIds: readonly NodeId[]): readonly EdgeId[]
  bounds(target: SelectionTarget): Rect | undefined
}

type EditorSceneSource = {
  revision(): number
  nodes: EntitySource<NodeId, SceneNode>
  edges: EntitySource<EdgeId, SceneEdge>
  items: ReadStore<readonly SceneItem[]>
  query: SceneQuery
  geometry: GeometryCache
  scope: SceneScope
  frame: SceneFrame
  group: SceneGroup
  mindmap: SceneMindmap
}
```

规则：

- `scene` 是 projected truth
- `scene` 不暴露 raw `index` / raw `spatial tree` / raw `publish delta`
- `scene.nodes.read` / `scene.edges.read` 是实体级订阅入口
- `geometry`、`scope`、`frame`、`query` 全都挂在 `scene`
- feature 层禁止再绕过 `scene` 自己拼 geometry 或自己扫 items

### 3. session

```ts
type EditorChromeRead = {
  marquee: ReadStore<MarqueePreview | undefined>
  draw: ReadStore<DrawPreview | null>
  edgeGuide: ReadStore<EdgeGuide>
  selection: ReadStore<SelectionOverlay | undefined>
}

type EditorPanelRead = {
  selectionToolbar: ReadStore<SelectionToolbarContext | undefined>
  history: ReadStore<HistoryState>
  draw: ReadStore<DrawState>
}

type EditorSessionSource = {
  tool: ReadStore<Tool>
  selection: {
    target: ReadStore<SelectionTarget>
    view: ReadStore<EditorSelectionView>
  }
  interaction: ReadStore<EditorInteractionState>
  viewport: {
    value: ReadStore<Viewport>
    zoom: ReadStore<number>
    center: ReadStore<Point>
    worldRect(): Rect
    worldToScreen(point: Point): Point
    screenToWorld(point: Point): Point
  }
  chrome: EditorChromeRead
  panel: EditorPanelRead
}
```

规则：

- `session` 不包含任何 committed data
- `session` 不包含 projection entity
- `selection target` 属于 session，不属于 scene
- `chrome`、`panel` 是 session 的派生展示态，不属于 scene

## 什么信息应该放在哪里

### document

- Node
- Edge
- Document background
- Export / slice
- committed bounds

### scene

- projected node rect
- projected edge route
- geometry cache
- spatial query
- visible query
- frame containment query
- move scope
- scene order
- mindmap projected structure
- group projected membership

### session

- tool
- viewport
- selection
- interaction
- editing state
- chrome overlay
- panel context

## 明确禁止的做法

### 1. 禁止 scene entity 混入 session flags

禁止这种结构长期存在：

```ts
type BadSceneNode = {
  rect: Rect
  selected: boolean
  hovered: boolean
  patched: boolean
}
```

这会导致 selection / hover 变化时 scene entity 全量失效，直接放大 render 和 query fanout。

### 2. 禁止 feature 层碰内部状态

禁止以下依赖面继续存在：

- `node.graph.get(...)`
- `edge.graph.get(...)`
- `node.committed.get(...)`
- `edge.item.get(...)`
- `projection.sources.*`
- `runtime.indexes.*`
- `runtime.spatial.*`

### 3. 禁止 document 提供 projected 能力

document 不能回答：

- projected rect
- projected edge path
- visible query
- frame parent
- related edges in scene

### 4. 禁止 scene 回头依赖 document read adapter

`scene` 的实体和 query 必须来自 scene runtime 自己的 published state，而不是运行时再回头调用 `document` adapter 拼装。

### 5. 禁止长期保留双轨 API

以下做法禁止作为主干方案：

- 新 API 上线，但旧 `editor.read.*` 继续长期保留
- feature 一部分用新 API，一部分用旧 API
- geometry/scope/visible 做在新层，但旧 feature 继续直接读 raw stores

## 长期最优的内部架构

### 1. document runtime

职责：

- 持有 engine snapshot 的 committed document family
- 提供稳定 `EntitySource`
- 只负责 document 语义，不做 projection

### 2. scene runtime

职责：

- 接收 engine snapshot、session、layout
- 产出 projected node/edge/mindmap/group/items
- 维护内部 index/spatial/geometry cache
- 对外只发布 `SceneSource`

内部状态允许复杂，但只能内部可见：

```ts
type SceneWorkingState = {
  graph: ...
  indexes: ...
  spatial: ...
  geometry: ...
  publish: ...
}
```

但这些对象都不能被 feature 直接依赖。

### 3. session runtime

职责：

- tool
- viewport
- selection
- interaction
- edit
- chrome
- panel

它不拥有 document，也不拥有 projected scene。

## 为性能优化预留的正式挂点

统一数据源之后，后续性能优化都挂在固定位置：

### 1. 指针轻量解析

- 挂在 `input` / `session interaction` 体系
- 不再混在 DOM hit resolution 和 scene query 里

### 2. 邻域展开

- 挂在 `scene.scope`

### 3. 几何缓存

- 挂在 `scene.geometry`

### 4. 可见区裁剪

- 挂在 `scene.query.visible`

### 5. scene order

- 挂在 `scene.geometry.order`

### 6. 字段级订阅

- entity 订阅挂在 `document.nodes.read` / `scene.nodes.read` / `scene.edges.read`
- UI 订阅挂在 `session.chrome.*` / `session.panel.*` / `session.viewport.zoom`

这样以后做性能优化时，调用方不需要再关心 index 在哪、spatial 在哪、geometry cache 在哪。

## 重构方案

这个重构不应该按“边修边兼容”的方式做，而应该按“单分支大切换”做。

## 阶段 A：冻结现状，先定义最终边界

目标：

1. 新建 `editor/document`、`editor/scene`、`editor/session` 三套 source contract
2. 新建 `@whiteboard/editor-scene`
3. 明确 old API 进入删除路线

要求：

- 这一阶段不做 feature patch
- 先把最终 contract 定死，再开始搬代码

输出：

- `Editor` 顶层结构改成 `document / scene / session / write / input / events`
- 所有新类型名定稿

## 阶段 B：重做 scene runtime

目标：

1. 把 `editor-graph` 的 runtime、projection、index、spatial、query、publish 整体迁到 `editor-scene`
2. 对外只暴露 `SceneSource`
3. 在这个阶段同时把 `geometry`、`scope`、`frame`、`query.visible` 一起做到最终形态

要求：

- 不再生成 `GraphRead`
- 不再暴露 `ProjectionSources`
- 不允许 feature 直接接 `scene runtime` 内部状态

输出：

- `createSceneRuntime()`
- `createSceneSource()`

## 阶段 C：重做 document source

目标：

1. 把 `DocumentRead` 改成 `EditorDocumentSource`
2. 删除 committed geometry 和各种 editor 专用拼装
3. 保留最小 committed 能力

要求：

- `document` 只表达 document
- 如果某段逻辑需要 projected geometry，必须改去读 `scene`

输出：

- `createDocumentSource()`

## 阶段 D：重做 session source

目标：

1. 把现有 `editor.store` 和 `editor.read.chrome/panel/viewport` 收敛成 `EditorSessionSource`
2. 拆掉全量结构订阅，直接暴露字段级读接口

输出：

- `createSessionSource()`

## 阶段 E：一次性切换 feature 层

这一阶段是最关键的，不允许分模块长期双轨。

必须一次性切换这些目录：

- `whiteboard/packages/whiteboard-editor/src/action`
- `whiteboard/packages/whiteboard-editor/src/input`
- `whiteboard/packages/whiteboard-editor/src/write`
- `whiteboard/packages/whiteboard-editor/src/read`
- `whiteboard/packages/whiteboard-react/src`

切换原则：

1. 所有 committed 读取改成 `editor.document.*`
2. 所有 projected 读取改成 `editor.scene.*`
3. 所有 transient 读取改成 `editor.session.*`
4. 删除所有 `.graph.get(...)`、`.committed.get(...)`、`.item.get(...)`

合并门槛：

只要还剩下任何 feature 直接碰旧数据源，这个分支就不能合并。

## 阶段 F：删除旧体系

必须直接删除：

- `DocumentRead`
- `GraphRead`
- `createGraphRead`
- `createDocumentRead`
- `ProjectionSources`
- `editor.read`
- `editor.store`
- `@whiteboard/editor-graph`

如果旧体系还保留着，说明这次重构没有完成。

## 模块依赖新规则

### layout

- 只允许读 `document`
- 禁止读 `scene`

原因：

- layout 的职责是生成 layout 结果，不应该回头依赖 projected world

### input

- 允许读 `scene`
- 允许读 `session`
- 只有在 commit 初值或写前校验时允许读 `document`

### actions

- 默认读 `document`
- 需要当前投影态时显式读 `scene`
- 需要选择态或 viewport 时读 `session`

### write

- write 自身不应该依赖 raw projection store
- 如果要基于当前 scene 做辅助判断，必须通过 `scene` 正式 API

### react

- entity 渲染订阅 `scene.nodes.read` / `scene.edges.read`
- chrome / panel 订阅 `session.chrome.*` / `session.panel.*`
- 禁止 React 直接订阅内部 runtime family store

## 命名最终裁决

这部分必须一次定死，不然后面还会反复摇摆。

### 保留

- `document`
- `scene`
- `session`
- `geometry`
- `scope`
- `query`
- `frame`
- `group`
- `mindmap`

### 删除

- `graph`
- `projection sources`
- `read`
- `store`
- `committed`
- `view` 作为顶层数据源命名

说明：

- `graph` 不能表达 scene 的完整语义
- `read` 是动作，不是领域对象
- `store` 是实现手段，不是产品语义
- `view` 太含糊，不知道是 render view 还是 projected model

## 最终收益

如果这套方案落地，后续性能优化会变成正常工程问题，而不是架构赌博：

1. `geometry cache` 有唯一挂点
2. `scope` 有唯一挂点
3. `visible query` 有唯一挂点
4. scene/windowing 不再需要扫全局旧接口
5. React 可以明确区分 entity 订阅和 chrome/panel 订阅
6. committed/projected/transient 三类问题不会再混在一起
7. 后续想换 spatial index、换 scene publish、换 visible windowing，都不需要再重写 feature 层

## 最终一句话

这次重构的本质不是“把现有 read API 整理一下”，而是：

把 editor 从“多个历史数据入口并存”改成“document / scene / session 三层唯一数据源”。

只有先把这个地基换掉，后面的 `geometry`、`scope`、`visible`、`windowing`、`field-level subscription` 才有长期最优解。
