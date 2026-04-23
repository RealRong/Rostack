# `whiteboard-editor-graph` 阶段一 `graph/ui` 拆层 API 设计

## 1. 文档目标

这份文档只讨论迁移文档里的阶段一：

> 先把 `ui truth` 从 `graph truth` 中拆出去，建立后续 `GraphDelta` 和 `SpatialIndex` 所需的干净 contract。

这里不讨论：

- `SpatialIndexState`
- `GraphDelta` 的完整 patch helper 设计
- `PublishDelta`
- publisher 的最终增量发布实现

这份文档只回答一个问题：

> 阶段一结束时，runtime、query、editor read、React 消费侧的 API 应该长什么样。

---

## 2. 硬约束

这份设计继承迁移总文档里的前提：

- 单轨重构
- 不保兼容 facade
- 不保 old/new 双 contract 并行
- 允许中途某个阶段暂时无法跑通

但这里有一个容易误解的点要先说明：

### 2.1 禁止“兼容层”，不等于禁止“presentation 组合层”

这两者不是一回事。

#### 禁止的东西

- 在 runtime 内再保留一份旧 `NodeView.render.*`
- 在 runtime 外额外做一个 legacy facade 只为了喂旧消费方
- old graph snapshot 和 new graph snapshot 双轨并存

#### 允许且必须存在的东西

- `editor read` 基于 split truth 组合出 editor presentation
- React hooks 基于 split truth 组合出 component props

原因很简单：

- runtime truth 必须干净分层
- 但 editor 和 React 本来就是 presentation consumer

所以：

> 阶段一的目标不是“所有消费方都直接读原始 graph truth”，  
> 而是“runtime 真相分层清楚，consumer 通过正式 presentation API 组合它们”。

这不是兼容层，这是最终架构的一部分。

---

## 3. 阶段一要解决的核心问题

当前最关键的问题不是性能，而是 contract 污染：

- `NodeView.render.selected`
- `NodeView.render.hovered`
- `NodeView.render.editing`
- `NodeView.render.resizing`
- `EdgeView.render.selected`
- `EdgeView.render.activeRouteIndex`
- `EdgeView.render.editingLabelId`
- `EdgeLabelView.editable`
- `EdgeLabelView.caret`

这些字段把两类完全不同的 truth 混在了一起：

### 3.1 `graph truth`

真正属于 graph 的是：

- node 的 live model
- node rect / bounds / rotation
- edge route / bounds / handles
- edge label text / placement / mask / rect
- mindmap layout / bbox / connectors
- group frame bounds

### 3.2 `ui truth`

真正属于 UI 的是：

- selected
- hovered
- editing caret
- active route handle
- preview chrome
- marquee / guides / draw overlay

只要这两层没拆开，后面就会持续出现：

- 改 selection 也算 graph changed
- 改 hover 也算 graph changed
- graph family publish 被 UI 噪音污染
- `GraphDelta.geometry` 无法干净定义

所以阶段一的第一性目标是：

> 把 runtime 真相拆清楚，而不是先做 patch 优化。

---

## 4. 阶段一的最终分层

阶段一结束后，runtime 内应明确只有下面三类状态：

### 4.1 `GraphSnapshot`

只放 graph truth。

### 4.2 `UiSnapshot`

只放 UI truth。

### 4.3 `SceneSnapshot`

阶段一先不做索引重构，仍保留 scene 派生快照，但它只能消费 graph truth，不能再消费 UI truth。

---

## 5. runtime 输入 contract

阶段一不重写整套 runtime input shape，但要先改 `InputDelta` 的边界。

## 5.1 `Input`

阶段一建议保留现有大结构：

```ts
interface Input {
  document: DocumentInput
  session: SessionInput
  measure: MeasureInput
  interaction: InteractionInput
  viewport: ViewportInput
  clock: ClockInput
  delta: InputDelta
}
```

原因：

- 阶段一的关键是输出 truth 拆层
- 不是先把整个 input schema 一起重命名

但 phase 消费边界要变。

### 5.2 `InputDelta`

阶段一建议把它先调整为下面的方向：

```ts
interface InputDelta {
  document: DocumentDelta
  graph: GraphInputDelta
  ui: UiInputDelta
  scene: SceneInputDelta
}

interface GraphInputDelta {
  nodes: {
    draft: IdDelta<NodeId>
    preview: IdDelta<NodeId>
    edit: IdDelta<NodeId>
  }
  edges: {
    preview: IdDelta<EdgeId>
    edit: IdDelta<EdgeId>
  }
  mindmaps: {
    preview: IdDelta<MindmapId>
    tick: ReadonlySet<MindmapId>
  }
}

interface UiInputDelta {
  tool: boolean
  selection: boolean
  hover: boolean
  marquee: boolean
  guides: boolean
  draw: boolean
  edit: boolean
}

interface SceneInputDelta {
  viewport: boolean
}
```

### 5.3 阶段一输入边界规则

阶段一先把下面两条写死：

1. `graph.interaction.selection` 删除
2. `graph.interaction.drag` 删除

原因：

- selection/drag 本身不是 graph truth
- 如果 drag 真的影响 geometry，应该通过 `draft / preview / edit / tick` 精确表达
- 不能再靠 interaction 布尔值粗唤醒 graph

### 5.4 为什么 `graph.preview/edit` 仍然保留

要注意：

- preview/edit 是输入 seed
- 不是输出 truth

例如 edge label 正在编辑时：

- label live text 会影响 geometry
- 所以 `graph.edges.edit` 仍然要唤醒 graph
- 但 caret / active edit chrome 属于 ui truth

也就是说：

- 同一份外部事件可以同时 seed `graph` 和 `ui`
- 但 graph 和 ui 产出的 truth 必须分开

---

## 6. runtime 输出 contract

## 6.1 `Snapshot`

阶段一目标形态：

```ts
interface Snapshot {
  revision: Revision
  documentRevision: Revision
  graph: GraphSnapshot
  scene: SceneSnapshot
  ui: UiSnapshot
}
```

这里的关键不是有没有 `ui` 字段，而是：

- `graph` 里不能再藏 `ui`

---

## 7. `GraphSnapshot` 详细设计

## 7.1 总体结构

```ts
interface GraphSnapshot {
  nodes: Family<NodeId, NodeView>
  edges: Family<EdgeId, EdgeView>
  owners: OwnerViews
}
```

这个结构本身可以保留。

要变的是 family value 的 shape。

---

### 7.2 `NodeView`

阶段一目标：

```ts
interface NodeView {
  base: NodeBaseView
  geometry: NodeGeometryView
}

interface NodeBaseView {
  node: NodeModel
  owner?: OwnerRef
}

interface NodeGeometryView {
  rotation: number
  rect: Rect
  bounds: Rect
}
```

### 7.3 从 `NodeView` 删除的字段

全部删除：

```ts
interface NodeRenderView {
  hidden: boolean
  editing: boolean
  hovered: boolean
  selected: boolean
  patched: boolean
  resizing: boolean
  edit?: NodeRenderEdit
}
```

这些字段全部转移到 `UiSnapshot.nodes`。

### 7.4 `NodeView.base.node` 为什么保留 live text

这是阶段一里最容易误判的一点。

`base.node` 里仍然允许保留：

- live edit text
- live preview patch 后的 node model

原因是它们会影响：

- text layout
- measured size
- bounds
- mindmap layout

这些都属于 graph truth。

因此：

- node 文本内容是 graph truth
- node caret / editing flag 是 ui truth

---

### 7.5 `EdgeView`

阶段一目标：

```ts
interface EdgeView {
  base: EdgeBaseView
  route: EdgeRouteView
  box?: EdgeBoxView
}

interface EdgeBaseView {
  edge: Edge
  nodes: EdgeNodes
}

interface EdgeRouteView {
  points: readonly Point[]
  svgPath?: string
  bounds?: Rect
  source?: Point
  target?: Point
  ends?: ResolvedEdgeEnds
  handles: readonly EdgeHandle[]
  labels: readonly EdgeLabelView[]
}

interface EdgeBoxView {
  rect: Rect
  pad: number
}
```

### 7.6 `EdgeView` 为什么允许保留 `box`

`box` 在阶段一先保留在 graph truth，原因是它只依赖：

- path bounds
- edge style width

它是 geometry/style 派生，不依赖 selection、hover、edit。

后续如果证明它本质上只服务 UI chrome，也可以再迁。

但阶段一不建议同时改掉。

### 7.7 从 `EdgeView` 删除的字段

全部删除：

```ts
interface EdgeRenderView {
  hidden: boolean
  selected: boolean
  patched: boolean
  activeRouteIndex?: number
  editingLabelId?: string
}
```

这些字段全部转移到 `UiSnapshot.edges`。

---

### 7.8 `EdgeLabelView`

阶段一目标：

```ts
interface EdgeLabelView {
  labelId: string
  text: string
  displayText: string
  style: EdgeLabelStyle
  size: Size
  point: Point
  angle: number
  rect: Rect
  maskRect: EdgeLabelMaskRect
}
```

### 7.9 从 `EdgeLabelView` 删除的字段

全部删除：

- `editable`
- `caret`

这两个字段移到 `UiSnapshot.edges[*].labels`。

### 7.10 `text/displayText` 为什么留在 graph

因为它们直接影响：

- label placement
- label rect
- label mask
- edge bounds

也就是说：

- label live text 是 graph truth
- label caret / 正在编辑 是 ui truth

---

### 7.11 `MindmapView` 和 `GroupView`

阶段一原则：

- 不再给 `MindmapView`、`GroupView` 新增任何 UI 字段
- 只保留结构和 geometry truth

推荐继续维持：

```ts
interface MindmapView {
  base: MindmapBaseView
  structure: MindmapStructureView
  tree: MindmapTreeView
  render: MindmapRenderView
}

interface GroupView {
  base: GroupBaseView
  structure: GroupStructureView
  frame: GroupFrameView
}
```

这里的 `MindmapRenderView.connectors` 仍然保留，因为它是 graph layout 派生，不是 UI chrome。

---

## 8. `UiSnapshot` 详细设计

阶段一开始，`UiSnapshot` 不再只是：

- `selection`
- `chrome`

它还必须正式吸收 per-entity UI state。

### 8.1 目标结构

```ts
interface UiSnapshot {
  selection: SelectionView
  chrome: ChromeView
  nodes: Family<NodeId, NodeUiView>
  edges: Family<EdgeId, EdgeUiView>
}
```

这一步非常关键，因为否则这些 UI truth 只会从 graph 搬到一些零散 derived store，依然没有正式归属。

---

### 8.2 `NodeUiView`

阶段一目标：

```ts
interface NodeUiView {
  hidden: boolean
  selected: boolean
  hovered: boolean
  editing: boolean
  patched: boolean
  resizing: boolean
  edit?: NodeUiEdit
}

interface NodeUiEdit {
  field: EditField
  caret: EditCaret
}
```

### 8.3 这些字段的来源

- `hidden`
  - 来自 draw preview / preview hidden state
- `selected`
  - 来自 interaction selection
- `hovered`
  - 来自 hover state
- `editing`
  - 来自 current edit session
- `patched`
  - 来自 preview / draft patch presence
- `resizing`
  - 来自 preview patch 或 active handle 语义
- `edit`
  - 来自 edit session 的 UI 信息

这些字段都属于 UI 真相，不应再进入 graph family。

---

### 8.4 `EdgeUiView`

阶段一目标：

```ts
interface EdgeUiView {
  selected: boolean
  patched: boolean
  activeRouteIndex?: number
  editingLabelId?: string
  labels: ReadonlyMap<string, EdgeLabelUiView>
}

interface EdgeLabelUiView {
  editing: boolean
  caret?: EditCaret
}
```

### 8.5 为什么 `labels` 放在 `EdgeUiView` 里

因为 label edit UI 是 edge 局部 UI state，而不是 graph geometry。

label geometry 仍在：

- `EdgeView.route.labels`

label edit chrome 则在：

- `EdgeUiView.labels`

这样边界最清楚。

---

### 8.6 `SelectionView`

阶段一建议保留现有 shape：

```ts
interface SelectionView {
  target: SelectionState
  kind: 'none' | 'nodes' | 'edges' | 'mixed'
  summary: SelectionSummaryView
  affordance: SelectionAffordanceView
}
```

原因：

- selection summary 和 affordance 本来就属于 UI truth
- 它们依赖 graph geometry，但自身不是 graph truth

---

### 8.7 `ChromeView`

阶段一建议保留当前语义，但职责更纯：

```ts
interface ChromeView {
  overlays: readonly ChromeOverlay[]
  hover: HoverState
  preview: ChromePreviewView
  edit: EditSession | null
}
```

它只表达：

- overlay 真相
- hover 真相
- preview chrome 真相
- edit chrome 真相

它不再承担：

- graph family 的 render mirror

---

## 9. `SceneSnapshot`

阶段一不改 scene 结构，只加一条边界约束：

> scene 只能依赖 graph truth，不能再依赖任何 per-entity ui truth。

也就是说：

- `scene.visible` 仍看 node bounds / edge bounds / mindmap bbox
- 不再看 `selected / hovered / editing / activeRouteIndex`

如果某些 UI overlay 需要 scene-like 顺序，它们属于 `UiSnapshot.chrome`，不属于 `SceneSnapshot`。

---

## 10. `Change` contract 设计

阶段一因为新增了 `UiSnapshot.nodes/edges`，所以 `Change` 也要同步拆。

### 10.1 目标结构

```ts
interface Change {
  graph: GraphChange
  scene: Flags
  ui: UiChange
}

interface GraphChange {
  nodes: Ids<NodeId>
  edges: Ids<EdgeId>
  owners: {
    mindmaps: Ids<MindmapId>
    groups: Ids<GroupId>
  }
}

interface UiChange {
  selection: Flags
  chrome: Flags
  nodes: Ids<NodeId>
  edges: Ids<EdgeId>
}
```

### 10.2 为什么 `UiChange` 要有 `nodes/edges`

因为阶段一以后：

- 节点 selected 变化
- 节点 hovered 变化
- edge activeRouteIndex 变化
- label caret 变化

这些都不应再污染 `graph.change.*`。

它们必须有自己正式的 change 面。

---

## 11. runtime query 设计

阶段一以后，runtime query 应直接反映 split truth。

### 11.1 目标接口

```ts
interface Read {
  snapshot(): Snapshot

  node(id: NodeId): NodeView | undefined
  edge(id: EdgeId): EdgeView | undefined
  mindmap(id: MindmapId): MindmapView | undefined
  group(id: GroupId): GroupView | undefined

  nodeUi(id: NodeId): NodeUiView | undefined
  edgeUi(id: EdgeId): EdgeUiView | undefined

  scene(): SceneSnapshot
  ui(): UiSnapshot
  selection(): SelectionView
  chrome(): ChromeView
}
```

### 11.2 为什么 runtime query 要直接暴露 `nodeUi/edgeUi`

因为这是正式 truth，不是临时派生。

如果 runtime query 不暴露它们，调用方就会自己重复从：

- selection
- hover
- edit
- preview

再拼一遍 per-id UI 状态，最后又把 truth 重新打散。

---

## 12. working state 设计

阶段一以后，working state 也要同步拆层。

### 12.1 目标结构

```ts
interface WorkingState {
  revision: {
    document: Revision
  }
  graph: GraphState
  ui: UiState
  scene: SceneSnapshot
}

interface GraphState {
  nodes: ReadonlyMap<NodeId, NodeView>
  edges: ReadonlyMap<EdgeId, EdgeView>
  owners: {
    mindmaps: ReadonlyMap<MindmapId, MindmapView>
    groups: ReadonlyMap<GroupId, GroupView>
  }
}

interface UiState {
  selection: SelectionView
  chrome: ChromeView
  nodes: ReadonlyMap<NodeId, NodeUiView>
  edges: ReadonlyMap<EdgeId, EdgeUiView>
}
```

这里不需要任何 legacy render mirror。

---

## 13. phase 职责设计

## 13.1 `graph` phase

阶段一开始，`graph` phase 只能做：

- 读 document + draft + preview + measure + tick
- 生成 graph truth

它不能再读：

- selection
- hover
- edit caret UI

更准确地说，`graph` phase 可以消费 live edit text，但不能消费 edit chrome。

### 13.2 `ui` phase

阶段一开始，`ui` phase 负责生成：

- `selection`
- `chrome`
- `nodes`
- `edges`

它的输入来源包括：

- `interaction.selection`
- `interaction.hover`
- `session.edit`
- `session.preview`
- `session.tool`
- `working.graph`

### 13.3 `scene` phase

阶段一开始，`scene` phase 仍然依赖 `graph`，但不依赖 `ui`。

这是后续把 `scene -> spatial` 下沉的前提。

---

## 14. `projection sources` 设计

阶段一以后，projection source 要和 split truth 对齐。

但这里必须明确分两层：

- raw truth source
- consumer-facing presentation source

不能把这两层混成一层，否则 split truth 会直接泄漏到 React 订阅面。

### 14.1 目标结构

```ts
interface ProjectionSources {
  snapshot: ReadStore<Snapshot>
  graph: ReadStore<GraphSnapshot>
  scene: ReadStore<SceneSnapshot>
  ui: ReadStore<UiSnapshot>
  selection: ReadStore<SelectionView>
  chrome: ReadStore<ChromeView>

  nodeGraph: KeyedReadStore<NodeId, NodeView | undefined>
  edgeGraph: KeyedReadStore<EdgeId, EdgeView | undefined>
  mindmap: KeyedReadStore<MindmapId, MindmapView | undefined>
  group: KeyedReadStore<GroupId, GroupView | undefined>

  nodeUi: KeyedReadStore<NodeId, NodeUiView | undefined>
  edgeUi: KeyedReadStore<EdgeId, EdgeUiView | undefined>
}
```

这里的 `ProjectionSources` 是 raw truth source。

它服务：

- editor 内部组合逻辑
- selection/chrome/query 等派生 store
- 少数确实需要原始 graph truth 或 ui truth 的内部调用方

它不是 React 组件最终直接订阅的 API。

### 14.2 为什么 raw source 要分开

因为 runtime truth 本身就是分开的：

- `graph.nodes.byId`
- `ui.nodes.byId`

这层不应该人为混回去。

### 14.3 为什么 consumer-facing source 不能也跟着分开

如果组件层也直接拿：

- `nodeGraph`
- `nodeUi`

那就意味着：

- 每个组件都要订阅两个 keyed store
- 每个组件都要自己再做一次 merge
- split truth 的复杂度被扩散到整个消费面

这不是我们想要的结构。

所以正确边界是：

- raw source split
- consumer-facing presentation source merged

---

### 14.4 应补一个正式 presentation source 层

阶段一建议在 `editor read` 里建立正式 presentation store，而不是让 React 自己拼。

例如：

```ts
interface EditorPresentationSources {
  nodeView: KeyedReadStore<NodeId, EditorNodePresentation | undefined>
  edgeView: KeyedReadStore<EdgeId, EditorEdgePresentation | undefined>
}
```

这层可以由：

- `ProjectionSources.nodeGraph`
- `ProjectionSources.nodeUi`
- `ProjectionSources.edgeGraph`
- `ProjectionSources.edgeUi`

组合得出。

React 组件最终只订阅这一层。

---

## 15. editor read 设计

这里是阶段一里最重要的澄清点：

> runtime truth 必须拆；  
> editor read 允许作为正式 presentation 组合层，把 graph truth 和 ui truth 合成为 editor 读模型。

这不是兼容，而是 editor 自己的读接口职责。

## 15.1 `GraphRead`

建议拆成两级：

- raw truth access
- presentation access

但默认 consumer-facing API 应以 presentation access 为主。

### 15.1 目标结构

```ts
type GraphRead = {
  snapshot: ProjectionSources['snapshot']
  scene: {
    view: ProjectionSources['scene']
  }
  node: {
    graph: ProjectionSources['nodeGraph']
    ui: ProjectionSources['nodeUi']
    view: KeyedReadStore<NodeId, EditorNodePresentation | undefined>
    ...
  }
  edge: {
    graph: ProjectionSources['edgeGraph']
    ui: ProjectionSources['edgeUi']
    view: KeyedReadStore<EdgeId, EditorEdgePresentation | undefined>
    ...
  }
  selection: ...
  chrome: ProjectionSources['chrome']
  graph: ProjectionSources['graph']
}
```

### 15.2 为什么 `node.graph/ui` 和 `node.view` 要同时存在

因为它们服务的层级不同：

- `node.graph`
  - 原始 graph truth
- `node.ui`
  - 原始 ui truth
- `node.view`
  - 给 editor / React 的正式 presentation

这里的关键不是“少一个字段”，而是：

> 原始 truth 和对外 presentation 要明确是两层 API。

如果只有 `graph/ui`，组件层会被迫自己 merge。  
如果只有 `view`，内部又失去原始 truth access。

所以两者都应存在，但主消费面用 `view`。

### 15.3 `view` 必须是单订阅面，不是调用方自行 merge

`node.view` 和 `edge.view` 应该是正式 store，而不是普通 helper 函数。

也就是说：

- 不能让 React hook 订阅 `graph + ui` 两个 store 再本地 merge
- 应该在 `editor read` 内部创建一个 keyed derived store
- 当 graph 或 ui 任一侧变化时，只重算当前 id 的 presentation
只要满足一条：

> `view` 是对外 presentation，不回流进 runtime truth。

### 15.3 editor 节点 presentation 目标

推荐明确一个 editor 层节点 presentation：

```ts
interface EditorNodePresentation {
  nodeId: NodeId
  node: NodeModel
  rect: Rect
  rotation: number
  hidden: boolean
  selected: boolean
  hovered: boolean
  resizing: boolean
  edit?: NodeUiEdit
}
```

这个结构可以由：

- `NodeView`
- `NodeUiView`

组合得出。

`editor.read.node.view` 就应该直接返回这类对象。

### 15.4 editor 边 presentation 目标

推荐明确一个 editor 层边 presentation：

```ts
interface EditorEdgePresentation {
  edgeId: EdgeId
  edge: Edge
  selected: boolean
  box?: EdgeBoxView
  path: {
    svgPath: string
    points: readonly Point[]
  }
  labels: readonly EditorEdgeLabelPresentation[]
}

interface EditorEdgeLabelPresentation {
  id: string
  text: string
  displayText: string
  style: EdgeLabelStyle
  point: Point
  angle: number
  size: Size
  maskRect: EdgeLabelMaskRect
  editing: boolean
  caret?: EditCaret
}
```

这个结构可以由：

- `EdgeView`
- `EdgeUiView`

组合得出。

这里的组合是正式设计，不是过渡 shim。

---

## 16. React hook 设计

阶段一以后，React hook 不应再直接把 runtime raw truth 当成最终 component props。

但这不意味着 hook 自己去订阅两份 store。

正确方式是：

- `editor read` 先产出正式 presentation store
- React hook 再只订阅一个 presentation store

### 16.1 `useNodeView`

目标形态：

```ts
const nodeView = useOptionalKeyedStoreValue(editor.read.node.view, nodeId)
return nodeView
```

也就是说，`useNodeView` 最终仍然只订阅一个源。

### 16.2 `useEdgeView`

目标形态：

```ts
const edgeView = useOptionalKeyedStoreValue(editor.read.edge.view, edgeId)
return edgeView
```

`useEdgeView` 也应只订阅一个源。

### 16.3 `SelectedEdgeChrome`

`selectedEdgeChrome` 不再从 `EdgeView.render.activeRouteIndex` 读取，而改成：

- 路由几何来自 `EdgeView.route`
- active route state 来自 `EdgeUiView.activeRouteIndex`

但 `selectedEdgeChrome` 自己仍应是一个正式 derived store，不要求调用方同时订阅：

- `edge.graph`
- `edge.ui`

---

## 17. 明确删除的字段和 API

阶段一必须显式删掉下面这些 runtime graph 字段：

- `NodeView.render`
- `EdgeView.render`
- `EdgeLabelView.editable`
- `EdgeLabelView.caret`

同时删除下面这种耦合关系：

- graph phase 依赖 selection
- graph phase 依赖 hover
- graph family change 表示 selection changed
- graph family change 表示 caret changed

如果这些耦合还存在，就说明阶段一没有完成。

---

## 18. 阶段一完成标准

阶段一完成时，应满足下面这些 API 结果：

1. runtime graph family 不再携带任何 UI-only 字段。
2. runtime `UiSnapshot` 正式拥有 `nodes` 和 `edges` 两个 per-id UI family。
3. `Change.ui` 正式拥有 `nodes` 和 `edges` 两个 change 面。
4. projection sources 正式暴露 `nodeUi` 和 `edgeUi`。
5. editor read 正式提供 `node.view` / `edge.view` 这类单订阅 presentation store。
6. React hooks 只订阅 presentation store，不直接双订阅 raw graph/ui source。
7. `scene` 只消费 graph truth。
8. `selection / hover / edit chrome` 的变化不再污染 `graph.change.*`。

---

## 19. 这一阶段故意不解决什么

为了让范围收住，阶段一明确不解决：

- graph patch 精确更新
- `GraphDelta.geometry`
- `SpatialIndexState`
- delta-driven publisher
- query 热路径去全量扫描

阶段一的目标不是性能封顶，而是：

> 把后续性能重构所依赖的 API 边界先切干净。

如果这一步不先完成，后面不管是 `GraphDelta` 还是 `SpatialIndex`，都会继续被 UI 噪音污染。

---

## 20. 最终结论

阶段一最核心的 API 设计，不是“把几个字段搬位置”，而是确立下面这条结构约束：

1. runtime `GraphSnapshot` 只表达 graph truth。
2. runtime `UiSnapshot` 只表达 ui truth。
3. runtime `SceneSnapshot` 只消费 graph truth。
4. editor read / React hook 允许作为正式 presentation 组合层，但不能把组合结果回灌成 runtime truth。

用一句话总结：

> 阶段一不是先做 delta，也不是先做 index；  
> 阶段一是把 `graph` 和 `ui` 的 API 边界切成后续可以增量化的样子。
