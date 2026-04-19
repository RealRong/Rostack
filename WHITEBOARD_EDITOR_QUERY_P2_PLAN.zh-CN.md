# Whiteboard Editor Query P2 最终方案：Mindmap Layout Runtime、Node/Edge 分层与 Node Type 缓存

## 1. 目标

P2 只做三件事，而且必须一次拉直，不做兼容式过渡：

1. 把 `mindmap` live relayout、root move、enter 动画从 `query` 移到 `layout runtime`。
2. 把 `node`、`edge` 读模型按 `geometry / content / runtime` 分层，不再让一个 projection 混合所有 transient 语义。
3. 把 `node meta / capability` 收成稳定的 type 级缓存，并清掉 `query` 和 `selection` 里对 `registry/schema` 的重复临时读取。

P2 不做下面这些事：

- 不做 viewport virtualization。
- 不做 `target.ts` 的进一步瘦身。
- 不引入新的“通用 runtime 抽象层”或“二次 facade”。
- 不保留旧 API 的并行兼容版本。

P2 的目标很明确：

- `query` 继续收敛成纯读组合层。
- `layout` 成为所有“会主动算布局”的 editor-side owner。
- `node` / `edge` 的公共读模型名字直接表达职责，不再出现 `projection`、`resolved`、`view/state` 这类含义模糊的中间层。

## 2. 当前问题

### 2.1 `query/mindmap/read.ts` 仍在做不该做的事情

当前 `query/mindmap/read.ts` 里直接做了：

- `computeMindmapLayout()`
- live edit size override
- root move 平移
- enter 插值
- RAF clock

这意味着：

- query 不是“读模型”，而是在临时跑布局引擎。
- 任何依赖 `mindmap.item(treeId)` 的地方，都可能把整树 relayout 和动画插值一起带出来。
- `node.item(nodeId)` 只要读到了所属 tree 的 mindmap item，就间接依赖了这条重算链。

这条线必须彻底搬出 query。

### 2.2 `node` / `edge` projection 混合了彼此无关的变化

当前：

- `query/node/projection.ts`
  - geometry patch
  - text preview
  - edit draft
  - mindmap owned layout
- `query/edge/projection.ts`
  - edge patch
  - edge label edit draft

都揉在一个 projection 里。

问题不是“函数长”，而是失效边界不清：

- node 文本 draft 改了，不该让 mindmap layout patch 跟着参与。
- edge label draft 改了，不该让 edge path 几何投影重新参与。
- 现在这些变化都通过“整条 item 重投影”传播，导致无关链路被放大。

### 2.3 `node meta / capability` 现在还不是稳定缓存

当前的 `node.capability()` 把两类语义混在一起：

1. type 级定义：
   - `role`
   - `connect`
   - `resize`
   - `rotate`
   - `enter`
2. instance 级限制：
   - `node.type === 'mindmap'`
   - `Boolean(node.mindmapId)`

这导致它本质上不是“按 type 稳定缓存”的东西。

与此同时，`selection/read.ts` 里还在反复：

- `registry.get(node.type)`
- 读 schema fields
- 读 meta.controls

这些都应该回收到 `node` 命名空间，由 `node` 负责 type 级缓存，其他 query 读只消费缓存结果。

## 3. 最终判断

## 3.1 `mindmap` transient layout 的 owner 必须是 `EditorLayout`

P2 最终不新增新的 service。

最简单、最长期稳定的 owner 就是现有 `EditorLayout`：

- 它已经拥有：
  - `text metrics cache`
  - `patchNodeCreatePayload`
  - `patchNodeUpdate`
  - `editNode`
  - `resolvePreviewPatches`
- 它本来就是 editor 侧“布局相关 runtime 能力”的集中 owner。

所以 P2 直接扩展 `EditorLayout`，不要再新建一个 `mindmapPreviewLayoutService` 或 `queryRuntimeLayout`。

最终判断：

- `text` 布局在 `EditorLayout`
- `mindmap` transient layout 也在 `EditorLayout`
- `query` 只读 `layout` 已经 materialize 好的结果

这是最短路径，也最符合职责。

## 3.2 `EditorLayout.mindmap` 只暴露一个 `item(treeId)` 即可

P2 不需要再发明一套：

- `layout.mindmap.tree(treeId)`
- `layout.mindmap.node(nodeId)`
- `layout.mindmap.computed(treeId)`
- `layout.mindmap.connectors(treeId)`

这些 API 虽然更细，但会让 layout 对外扩散一堆碎片语义。

P2 的最简做法是：

```ts
export type MindmapLayoutRead = {
  item: KeyedReadStore<NodeId, MindmapItem | undefined>
}
```

也就是：

- `layout.mindmap.item(treeId)` 直接返回“最终 transient 投影后的 `MindmapItem`”
- 它已经包含：
  - `node.position`
  - `computed`
  - `connectors`
  - `childNodeIds`
  - `rootLocked`

这样：

- `query.mindmap.item(treeId)` 可以直接转发
- `query.node.geometry(nodeId)` 如果发现 node 属于某棵 mindmap，只需要解析 `treeId` 再读一次 `layout.mindmap.item(treeId)`

这已经足够，并且没有把 `layout` API 切碎。

## 3.3 `node` / `edge` 必须按 `geometry / content / runtime` 分层，但不必把这三层全部都公开成很多概念

P2 的关键不是“多暴露几个 store”，而是 owner 清楚：

- `geometry`
  - 只处理位置、尺寸、rotation、path、bounds、outline、anchor 等几何结果
- `content`
  - 只处理文本、label、draft text、fontSize draft 这类内容结果
- `runtime`
  - 只处理 selected、hovered、hidden、activeRoute、edit caret 这类瞬时 UI 状态

公开 API 上，P2 只保留真正有语义的层：

- `node.geometry`
- `node.content`
- `node.item`
- `node.render`
- `edge.geometry`
- `edge.label.content`
- `edge.label.metrics`
- `edge.label.placement`
- `edge.render`

不再继续保留：

- `query/node/projection.ts`
- `query/edge/projection.ts`
- `node.state`
- `node.view`
- `edge.state`
- `edge.view`
- `edge.resolved`

原因很简单：

- `state/view/resolved/projection` 都是中间翻译层名字，不是业务语义。
- `geometry/content/render` 已经足够表达最终 owner。

## 3.4 `meta` 和 `capability` 必须拆成 “type 级缓存” 与 “instance 级裁剪”

P2 的最终模型是：

1. type capability
   - 只由 `NodeDefinition` 决定
   - 可稳定缓存
2. node capability
   - = type capability + node instance 限制
   - 例如 mindmap root / mindmap child 禁止 resize/rotate

也就是说：

```ts
type NodeTypeCapability = {
  role: NodeRole
  connect: boolean
  enter: boolean
  resize: boolean
  rotate: boolean
}
```

它只按 `NodeType` 缓存。

然后：

```ts
type NodeCapability = NodeTypeCapability
```

但 `node.capability(node)` 的实现是：

- 先读 `node.type.capability(node.type)`
- 再根据 node instance 做少量 clamp

例如：

- `node.type === 'mindmap'`
  - `connect = false`
  - `resize = false`
  - `rotate = false`
- `Boolean(node.mindmapId)`
  - `resize = false`
  - `rotate = false`

这样：

- type 级缓存是稳定的
- instance 级限制仍然正确
- `selection/read.ts` 不需要再直接碰 `registry`

## 3.5 `NodeDefinition.describe` 应该删除

当前 `NodeDefinition` 里有：

```ts
describe?: (node: Node) => NodeMeta
```

但现状里没有真实使用这条动态描述能力。

而它的存在，会直接破坏 P2 对“type 级稳定 meta 缓存”的收敛。

所以 P2 的最终抉择是：

- 删除 `NodeDefinition.describe`
- `NodeDefinition.meta` 保持静态
- `selection`、toolbar、菜单、统计分组，全都只读 `node.type.meta(type)`

如果未来真出现实例级展示信息，它也不应该再叫 `meta`，而应该是独立的、明确按 node 读取的描述能力。P2 不做这类提前抽象。

## 4. 最终 API 设计

## 4.1 `EditorLayout`

P2 后：

```ts
export type MindmapLayoutRead = {
  item: KeyedReadStore<NodeId, MindmapItem | undefined>
}

export type EditorLayout = {
  text: TextMetricsCache
  mindmap: MindmapLayoutRead
  patchNodeCreatePayload: (
    payload: NodeInput
  ) => NodeInput
  patchNodeUpdate: (
    nodeId: NodeId,
    update: NodeUpdateInput,
    options?: {
      origin?: Origin
    }
  ) => NodeUpdateInput
  editNode: (
    input: {
      nodeId: NodeId
      field: EditField
      text: string
    }
  ) => Partial<EditLayout> | undefined
  resolvePreviewPatches: (
    patches: readonly TransformPreviewPatch[]
  ) => readonly TransformPreviewPatch[]
}
```

`createEditorLayout()` 的装配输入改为：

```ts
createEditorLayout({
  read: {
    node: {
      committed: engine.read.node.item
    }
    mindmap: {
      committed: engine.read.mindmap.item
    }
  },
  session: {
    edit: session.state.edit,
    mindmapPreview: session.preview.selectors.mindmapPreview
  },
  registry,
  backend
})
```

这里的关键点：

- `layout` 可以读 committed mindmap item
- `layout` 可以读 edit / mindmap preview
- `layout` 自己 materialize 最终 transient `MindmapItem`

`query` 不再拥有这些输入的组合权。

## 4.2 `NodeDefinition`

P2 后：

```ts
export type NodeDefinition = BaseNodeDefinition & {
  meta: NodeMeta
  role?: NodeRole
  hit?: NodeHit
  connect?: boolean
  rotate?: boolean
  resize?: boolean
  layout?: NodeLayoutSpec
  enter?: boolean
  edit?: {
    fields?: Partial<Record<EditField, EditCapability>>
  }
}
```

删除：

```ts
describe?: (node: Node) => NodeMeta
```

## 4.3 `node.type`

P2 新增：

```ts
export type NodeTypeCapability = {
  role: NodeRole
  connect: boolean
  enter: boolean
  resize: boolean
  rotate: boolean
}

export type NodeTypeRead = {
  meta: (type: NodeType) => NodeMeta
  capability: (type: NodeType) => NodeTypeCapability
}
```

这是 `node` 命名空间下唯一允许直接碰 `registry` 的地方。

其他 query 模块都不再直接读 `registry`。

命名规则在 P2 里明确固定为：

- 定义层：`connect / resize / rotate / enter`
- 能力层：`connect / resize / rotate / enter`
- render 层：`canConnect / canResize / canRotate`

也就是：

- `NodeDefinition.rotate`
- `node.type.capability(type).rotate`
- `node.capability(node).rotate`
- `node.render(nodeId).canRotate`

这样定义层和能力层不再做无意义翻译，只在最终 UI render 层保留 `can*` 语义。

## 4.4 `NodePresentationRead`

P2 后最终形态：

```ts
export type NodeGeometryView = NodeGeometry & {
  rotation: number
}

export type NodeCapability = NodeTypeCapability

export type NodeRenderEdit = {
  field: EditField
  caret: EditCaret
}

export type NodeRender = {
  nodeId: NodeId
  node: Node
  rect: Rect
  bounds: Rect
  rotation: number
  hovered: boolean
  hidden: boolean
  patched: boolean
  resizing: boolean
  selected: boolean
  edit: NodeRenderEdit | undefined
  canConnect: boolean
  canResize: boolean
  canRotate: boolean
}

export type NodeCanvasSnapshot = {
  node: Node
  geometry: NodeGeometryView
}

export type NodePresentationRead = {
  list: EngineRead['node']['list']
  committed: EngineRead['node']['item']
  type: NodeTypeRead
  geometry: KeyedReadStore<NodeId, NodeGeometryView | undefined>
  content: KeyedReadStore<NodeId, Node | undefined>
  item: KeyedReadStore<NodeId, NodeItem | undefined>
  render: KeyedReadStore<NodeId, NodeRender | undefined>
  canvas: KeyedReadStore<NodeId, NodeCanvasSnapshot | undefined>
  rect: KeyedReadStore<NodeId, Rect | undefined>
  bounds: KeyedReadStore<NodeId, Rect | undefined>
  nodes: (nodeIds: readonly NodeId[]) => readonly Node[]
  capability: (node: Pick<Node, 'type' | 'mindmapId'>) => NodeCapability
  idsInRect: (rect: Rect, options?: NodeRectHitOptions) => NodeId[]
  ordered: () => readonly Node[]
}
```

这里要注意两点：

1. `geometry` 和 `content` 是真正的 owner 分层。
2. `item` 只是组合后的便利读，不再承载所有 transient 逻辑本身。

### `node.geometry(nodeId)` 的 owner

只依赖：

- `engine.read.node.item(nodeId)`
- `preview.node(nodeId).patch`
- 如果该 node 属于某棵 mindmap：
  - `layout.mindmap.item(treeId)`

只处理：

- rect
- bounds
- rotation
- outline / geometry

不处理：

- 文本 draft
- caret
- selected

### `node.content(nodeId)` 的 owner

只依赖：

- `engine.read.node.item(nodeId)`
- `preview.node(nodeId).text`
- `edit.node(nodeId)`

只处理：

- `node.data.text`
- `node.data.title`
- sticky edit fontSize
- text widthMode / wrapWidth draft

不处理：

- rect / bounds
- selection
- hover

### `node.capability(node)` 的实现

实现必须非常简单：

1. `const base = node.type.capability(node.type)`
2. 再根据实例做 clamp

不要再让它回头查 `registry`。

## 4.5 `EdgePresentationRead`

P2 后最终形态：

```ts
export type EdgeRuntimeState = {
  patched: boolean
  activeRouteIndex?: number
  selected: boolean
}

export type EdgePresentationRead = {
  list: EngineRead['edge']['list']
  committed: EngineRead['edge']['item']
  item: KeyedReadStore<EdgeId, EdgeItem | undefined>
  geometry: KeyedReadStore<EdgeId, CoreEdgeView | undefined>
  render: KeyedReadStore<EdgeId, EdgeRender | undefined>
  label: {
    list: (edgeId: EdgeId) => readonly EdgeLabelRef[]
    content: (ref: EdgeLabelRef) => EdgeLabelContent | undefined
    metrics: (ref: EdgeLabelRef) => Size | undefined
    placement: (ref: EdgeLabelRef) => EdgeLabelPlacement | undefined
    render: (ref: EdgeLabelRef) => EdgeLabelRender | undefined
  }
  bounds: KeyedReadStore<EdgeId, Rect | undefined>
  box: (edgeId: EdgeId) => EdgeBox | undefined
  capability: (edge: EdgeItem['edge']) => EdgeCapability
  selectedChrome: ReadStore<SelectedEdgeChrome | undefined>
  related: (nodeIds: Iterable<NodeId>) => readonly EdgeId[]
  idsInRect: (rect: Rect, options?: EdgeRectHitOptions) => EdgeId[]
  connectCandidates: (rect: Rect) => readonly EdgeConnectCandidate[]
}
```

这里明确：

- `edge.geometry` 取代现在的 `edge.resolved`
- 删除 `edge.view`
- 删除 `edge.state`

### `edge.item(edgeId)` 的 owner

P2 后 `edge.item` 只做：

- committed edge
- preview patch

不再把 `edge label edit draft` 合进 `edge.item`。

也就是说：

- label draft 只存在于 `edge.label.content(ref)`
- edge path 几何不再跟 label draft 共用一条 projection 链

### `edge.geometry(edgeId)` 的 owner

只依赖：

- `edge.item(edgeId)`
- `node.canvas(source/target)`

只处理：

- resolved ends
- path
- handles
- hit segments

不处理：

- label text
- selected
- active route

### `edge.label.content(ref)` 的 owner

只依赖：

- committed edge label
- `edit.edgeLabel(edgeId)`

只处理：

- text
- displayText
- editable
- caret
- label style
- `t`
- `offset`
- `textMode`
- text metrics spec

## 4.6 `MindmapPresentationRead`

P2 后最终形态：

```ts
export type MindmapRenderView = {
  treeId: NodeId
  rootId: NodeId
  tree: MindmapItem['tree']
  bbox: Rect
  rootRect: Rect
  rootLocked: boolean
  childNodeIds: readonly NodeId[]
  connectors: readonly MindmapRenderConnector[]
  addChildren: readonly {
    targetNodeId: NodeId
    x: number
    y: number
    placement: 'left' | 'right'
  }[]
}

export type MindmapPresentationRead = Omit<EngineRead['mindmap'], 'item'> & {
  item: KeyedReadStore<NodeId, MindmapItem | undefined>
  render: KeyedReadStore<NodeId, MindmapRenderView | undefined>
  navigate: (input: {
    id: NodeId
    fromNodeId: NodeId
    direction: 'parent' | 'first-child' | 'prev-sibling' | 'next-sibling'
  }) => NodeId | undefined
}
```

`query.mindmap.item(treeId)` 的实现直接转发：

```ts
item = layout.mindmap.item
```

`query.mindmap.render(treeId)` 只负责便宜组合：

- `bbox`
- `rootRect`
- `rootLocked`
- `addChildren`

不再负责：

- live relayout
- rootMove translation
- enter animation clock
- interpolateRect

## 4.7 `EditorQuery`

P2 后 `createEditorQuery()` 的关键输入收敛为：

```ts
createEditorQuery({
  engineRead,
  registry,
  history,
  layout,
  session,
  defaults
})
```

其中：

```ts
layout: Pick<EditorLayout, 'text' | 'mindmap'>
```

而不是继续单独传一个：

```ts
textMetrics
```

原因：

- P2 后 query 不只消费 text metrics
- 还要消费 `layout.mindmap.item`
- 用统一 `layout` 读能力比继续拆成多个零散参数更清晰

## 5. 最终数据流

## 5.1 Mindmap

```ts
engine.read.mindmap.item(treeId)
+ session.state.edit
+ session.preview.selectors.mindmapPreview
-> layout.mindmap.item(treeId)
-> query.mindmap.item(treeId)
-> query.node.geometry(nodeId)
-> query.mindmap.render(treeId)
```

关键点：

- 真正“算布局”的地方只剩 `layout.mindmap.item`
- `query` 不再决定是否 relayout

## 5.2 Node

```ts
engine.read.node.item(nodeId)
+ preview.node(nodeId).patch
+ layout.mindmap.item(treeId)
-> node.geometry(nodeId)

engine.read.node.item(nodeId)
+ preview.node(nodeId).text
+ edit.node(nodeId)
-> node.content(nodeId)

selection.node.selected(nodeId)
+ preview.node(nodeId)
+ edit.node(nodeId)
-> node runtime

node.geometry
+ node.content
-> node.item

node.geometry
+ node.content
+ node runtime
+ node.capability(node)
-> node.render
```

## 5.3 Edge

```ts
engine.read.edge.item(edgeId)
+ preview.edge(edgeId).patch
-> edge.item(edgeId)

edge.item(edgeId)
+ node.canvas(source/target)
-> edge.geometry(edgeId)

edge.item(edgeId)
+ edit.edgeLabel(edgeId)
-> edge.label.content(ref)

edge.label.content(ref)
+ layout.text.read(spec)
-> edge.label.metrics(ref)

edge.geometry(edgeId)
+ edge.label.content(ref)
+ edge.label.metrics(ref)
-> edge.label.placement(ref)

edge.geometry(edgeId)
+ edge runtime
+ edge.label.render(ref)
-> edge.render(edgeId)
```

## 6. 详细实现方案

## 6.1 第一阶段：把 `mindmap` 布局运行时移到 `layout`

### 新增文件

新增：

- `whiteboard/packages/whiteboard-editor/src/layout/mindmap.ts`

它负责：

- `readProjectedMindmapItem()` 这类逻辑迁移
- root move 平移
- live edit size override
- enter 动画 clock 与插值
- keyed `item(treeId)` 输出

### 从 `query/mindmap/read.ts` 挪走的逻辑

必须迁走：

- `interpolateRect`
- `readEnterProgress`
- `scheduleFrame`
- `cancelFrame`
- `computeMindmapLayout(...)`
- `anchorMindmapLayout(...)`
- `translateMindmapLayout(...)`
- enter animation 的 clock store

这些逻辑的共同特征是：

- 会主动算
- 会主动跑时钟
- 不是纯读取

所以它们必须出 query。

### `layout/mindmap.ts` 的输入

`layout/mindmap.ts` 直接吃以下输入：

```ts
{
  committed: EngineRead['mindmap']['item']
  nodeCommitted: EngineRead['node']['item']
  edit: ReadStore<EditSession>
  preview: ReadStore<MindmapPreviewState | undefined>
}
```

理由：

- committed tree 与 committed node rect 都在 engine
- edit / preview 在 session
- 这已经是 mindmap transient layout 的完整 owner 输入

### `layout.mindmap.item(treeId)` 的实现

内部直接复用当前 `readProjectedMindmapItem()` 的主体算法，但 owner 要变：

```ts
const item = createKeyedDerivedStore({
  get: (treeId) => {
    const base = readValue(committed, treeId)
    if (!base) {
      return undefined
    }

    return projectMindmapItem({
      treeId,
      base,
      nodeCommitted,
      edit: readValue(edit),
      preview: readValue(preview),
      now: readValue(clock)
    })
  }
})
```

但这只是实现草图，不是最终失效粒度。

最终落地时，比照 P1，收敛到按 tree keyed 的输入：

- `liveEdit(treeId)`
- `rootMove(treeId)`
- `enter(treeId)`

不要让 `layout.mindmap.item(treeId)` 直接依赖整个 `edit` / `preview`。

### `query/mindmap/read.ts` 的最终职责

迁移后它只保留：

- `item = layout.mindmap.item`
- `render(treeId)` 的便宜组合
- `navigate(...)`

不再有任何 `clock / RAF / interpolate / computeMindmapLayout`。

## 6.2 第二阶段：重做 `node/read.ts`

### 删除文件

删除：

- `whiteboard/packages/whiteboard-editor/src/query/node/projection.ts`

原因：

- `projection` 是职责大杂烩名字
- P2 后已经明确拆成 `geometry / content / runtime`
- 再保留一个 `projection.ts` 只会继续回到总装逻辑

### `node.type`

在 `query/node/read.ts` 内先创建 type 级缓存：

```ts
const typeMeta = createKeyedDerivedStore<NodeType, NodeMeta>({...})
const typeCapability = createKeyedDerivedStore<NodeType, NodeTypeCapability>({...})
```

对外暴露：

```ts
type: {
  meta: (type) => readValue(typeMeta, type),
  capability: (type) => readValue(typeCapability, type)
}
```

### `node.geometry(nodeId)`

先读 committed item，再按顺序应用：

1. transform preview patch
2. mindmap layout rect override

最后只产出 geometry 结果，不产出内容 patch。

### `node.content(nodeId)`

先读 committed item，再按顺序应用：

1. text preview patch
2. edit node draft

只返回最终 `Node`，不碰 rect。

### `node.item(nodeId)`

只做一件事：

```ts
{
  node: readValue(content, nodeId),
  rect: readValue(geometry, nodeId)?.rect
}
```

也就是说：

- `item` 不再自己发明 projection 逻辑
- 它只是 geometry + content 的组合结果

### `node.render(nodeId)`

只负责组合：

- geometry
- content
- runtime
- capability

`runtime` 内部依赖：

- `selection.node.selected(nodeId)`
- `preview.node(nodeId)`
- `edit.node(nodeId)`

但 `runtime` 不必作为公共 API 暴露。

## 6.3 第三阶段：重做 `edge/read.ts`

### 删除文件

删除：

- `whiteboard/packages/whiteboard-editor/src/query/edge/projection.ts`

### `edge.item(edgeId)`

只处理：

- committed edge
- preview patch

不再读 `edit.edgeLabel(edgeId)`。

### `edge.geometry(edgeId)`

把当前 `resolved` 的逻辑迁到 `geometry` 名字下：

```ts
geometry: KeyedReadStore<EdgeId, CoreEdgeView | undefined>
```

并删除 `resolved` 这个名字。

### `edge.label.content(ref)`

继续保留 label 命名空间，但 owner 更明确：

- `label.content`
  - committed label + edit draft
- `label.metrics`
  - `layout.text.read(spec)`
- `label.placement`
  - `geometry + content + metrics`
- `label.render`
  - `content + placement`

### `edge.render(edgeId)`

只组合：

- geometry
- runtime
- label.render[]

不再在 `render` 路径里混进 label content patch。

## 6.4 第四阶段：收口 `selection/read.ts`

P2 后：

- `selection/read.ts` 不再直接吃 `registry`
- 不再自己临时解析 meta/schema

它只消费：

- `node.type.meta(type)`
- `node.type.capability(type)`
- `node.capability(node)`

### 具体变化

把现在这些逻辑删掉或回收到 node：

- `readNodeMeta(registry, node)`
- `hasStyleField(schema, path)`
- `supportsStyleField(nodes, registry, ...)`
- `hasControl(nodes, registry, ...)`

最终改成：

- `node.type.meta(type).controls`
- `node.type.meta(type).family`
- `node.type.meta(type).icon`
- `node` 内部私有的 type-style helper

P2 明确不新增公开的 `node.type.schema()` 或 `node.type.style()` API。

style field 支持性判断统一放到 `node` 内部私有 helper 中完成，`selection/read.ts` 只消费结果，不再继续碰 `registry`

也就是说：

- `selection` 不拥有 registry 解析权
- `node` 才拥有

## 6.5 第五阶段：装配调整

### `createEditorLayout()`

增加：

- `read.mindmap.committed`
- `session.edit`
- `session.mindmapPreview`

### `createEditorQuery()`

参数由：

```ts
{
  engineRead,
  registry,
  history,
  textMetrics,
  session,
  defaults
}
```

改成：

```ts
{
  engineRead,
  registry,
  history,
  layout,
  session,
  defaults
}
```

其中 query 只用 `layout` 的读能力：

- `layout.text`
- `layout.mindmap`

### `createSelectionRead()`

不再接收 `registry`。

改为直接接收：

```ts
{
  node,
  edge,
  ...
}
```

由 `node` 提供 type/meta/capability 相关读取。

## 7. 清理清单

P2 落地后必须清理干净下面这些旧实现，不保留兼容：

- 删除 [whiteboard/packages/whiteboard-editor/src/query/node/projection.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/query/node/projection.ts)
- 删除 [whiteboard/packages/whiteboard-editor/src/query/edge/projection.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/query/edge/projection.ts)
- 删除 `query/mindmap/read.ts` 中的 query-side clock 与插值逻辑
- 删除 `NodeDefinition.describe`
- 删除 `node.state`
- 删除 `node.view`
- 删除 `edge.state`
- 删除 `edge.view`
- 删除 `edge.resolved`
- 删除 `selection/read.ts` 中直接读取 `registry/schema` 的逻辑

保留但改造：

- `node.item`
- `node.render`
- `edge.item`
- `edge.render`
- `edge.label.*`
- `mindmap.render`

## 8. 验证标准

P2 完成后，至少满足下面这些条件：

1. `query/mindmap/read.ts` 内不再 import：
   - `computeMindmapLayout`
   - `anchorMindmapLayout`
   - `translateMindmapLayout`
   - `requestAnimationFrame`
2. `query/node/*` 和 `query/edge/*` 中不再存在 `projection.ts`
3. `edge.label` 编辑时，不会重新触发 edge path 几何链
4. mindmap live edit 时，整树 relayout 发生在 `layout`，不是 `query`
5. `selection/read.ts` 不再直接依赖 `registry`
6. `NodeDefinition` 上不再有 `describe`
7. `edge.geometry` 成为唯一的 edge path 几何读入口
8. `node.type.meta / node.type.capability` 成为唯一的 node type 级缓存入口

## 9. 最终结论

P2 的真正目标不是“再加几层缓存”，而是把 owner 拉直：

- 会算布局的，归 `layout`
- 会做纯读组合的，归 `query`
- 会做 type 级解析的，归 `node.type`
- 会做 instance 级裁剪的，归 `node.capability(node)`

最终最简、最稳的形态是：

- `layout.mindmap.item(treeId)` 负责所有 mindmap transient layout
- `node.geometry / node.content / node.render` 语义直接、没有总 projection
- `edge.geometry / edge.label.* / edge.render` 分层清楚
- `selection` 不再自己解析 registry
- `query` 不再承担布局器、动画器、临时总装器的职责

这就是 P2 的长期最优实现方向。
