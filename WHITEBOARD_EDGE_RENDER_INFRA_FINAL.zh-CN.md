# Whiteboard Scene Render / Hit 最终 API 设计与实施方案

## 1. 最终结论

### 1.1 `render` 不能只有 edge

`whiteboard-editor-scene` 不应只投影 edge render。

最终应由它统一投影：

- `render.node`
- `render.edge`
- `render.chrome`

原因：

- node 的可见性、选中、hover、editing、resizing、patched、几何变换都属于 scene runtime 真相，不应由 React 再拼一遍。
- 现在 public surface 里同时存在 `node` + `nodeUi`、`edge` + `edgeUi`，本质上是把“语义图数据”和“交互派生状态”拆成了调用方要自己再合成的两半，这不是长期最优。
- edge render 已经证明：真正该由 host 负责的是 DOM 与调度，不是 render 数据建模。

但 `render.node` 的边界要收清楚：

- 进入 `editor-scene` 的是 scene-universal render model。
- 不进入 `editor-scene` 的是节点具体 DOM 结构、editable DOM、React ref、组件内部局部 state。

一句话：

- `editor-scene` 负责“这个 node 在场景里应该怎样被渲染”。
- `whiteboard-react` 负责“具体用什么 DOM / React 组件渲染出来”。

### 1.2 `hit` 不能只有 edge

`hit` 不应只暴露 `edge`。

最终 `editor-scene` 应统一暴露：

- `hit.node(...)`
- `hit.edge(...)`
- `hit.item(...)`

其中：

- `node` 和 `edge` 是高频专用 query。
- `item` 是通用场景命中 query，用于统一 node / edge / mindmap / group 等 winner resolve。

这样：

- React host 的 body hit、scene pick、其他 future query 不再各自维护一套 candidate + precise resolve。
- `scene/pick.ts` 这种 editor 本地逻辑只保留 host runtime / frame scheduling，不再自持 scene truth。

### 1.3 `nodeUi / edgeUi` 不应继续作为 public surface

当前 public surface 同时暴露：

- `graph.node`
- `graph.edge`
- `ui.nodes`
- `ui.edges`
- edge render families

这会带来两个问题：

1. 调用方需要知道“某个需求到底该读 `node`、`nodeUi`、`edge`、`edgeUi`、还是 render”。
2. editor / react 很容易把两三层数据又包装成一份本地 read model。

最终口径：

- `graph.node / graph.edge / graph.mindmap / graph.group` 只放语义图真相。
- `graph.state.node / graph.state.edge / graph.state.chrome` 放交互派生状态。
- `render.*` 只放 DOM-ready render model。

也就是说：

- `nodeUi`
- `edgeUi`

都不应该继续作为 public API 存在。

它们应收敛到：

- `graph.state.node`
- `graph.state.edge`
- `graph.state.chrome`

作为 render projection 的内部输入。

### 1.4 `editor.scene` 不应继续做重复转发包装

当前 `whiteboard-editor/src/scene/source.ts` 的问题不是又算了一套 edge render，而是它已经积累出一层重复包装：

- `query`
- `pick`
- `node` / `nodes`
- `edge` / `edges`
- `geometry`
- `scope`
- `mindmap`
- `group`

而 `editor-scene` 本身已经有：

- `read`
- `stores`

最终应把 `editor.scene` 收敛成三段：

- `read`
- `stores`
- `host`

语义：

- `read`：同步 scene query / query-like API，直接来自 `editor-scene`
- `stores`：reactive family / value surface，直接来自 `editor-scene`
- `host`：只放 editor 本地 helper 与调度能力，例如 pick runtime、visible cache、geometry cache、scope helper

这样才能把“scene truth”与“host convenience”明确分层。

---

## 2. 最终 API 设计

## 2.1 包职责

### `whiteboard-core`

只放纯函数：

- node / edge / mindmap 的 geometry、path、label、mask、hit primitive
- render style normalize / styleKey
- 不依赖 projector state，不依赖 store，不依赖 DOM

### `shared/projector`

只放通用 runtime primitive：

- change lifecycle
- delta helper
- projection runtime
- projector-store bridge

### `whiteboard-editor-scene`

只放 scene canonical runtime：

- graph projection
- spatial projection
- graph state projection
- render projection
- sync read / hit / snap / frame query
- projector stores

### `whiteboard-editor`

只放：

- engine / session / layout -> scene input 组装
- host runtime / schedule / cache
- editor-facing action / write API
- editor-facing convenience host helper

### `whiteboard-react`

只放：

- stores -> DOM
- input host / DOM registry / editable DOM

---

## 2.2 `whiteboard-editor-scene` 最终内部状态分层

最终内部状态建议收敛为：

```ts
type SceneState = {
  revision: {
    document: Revision
  }
  graph: {
    node: Map<NodeId, NodeView>
    edge: Map<EdgeId, EdgeView>
    mindmap: Map<MindmapId, MindmapView>
    group: Map<GroupId, GroupView>
    state: {
      node: Map<NodeId, NodeStateView>
      edge: Map<EdgeId, EdgeStateView>
      chrome: ChromeStateView
    }
  }
  indexes: SceneIndexState
  spatial: SceneSpatialState
  render: {
    node: Map<NodeId, NodeRenderView>
    edge: EdgeRenderState
    chrome: ChromeRenderView
  }
  items: readonly SceneItem[]
}
```

说明：

- `graph.node / graph.edge / graph.mindmap / graph.group` 是语义真相。
- `graph.state.*` 是交互派生状态，只供内部 render 使用。
- `render` 是 public render surface 的直接来源。
- `ui` 这个名字应该退出 public 语义。

---

## 2.3 `graph` public surface

`graph` 继续保留，因为很多逻辑不是 render，而是语义读。

最终 public `stores.graph`：

```ts
type SceneGraphStores = {
  node: FamilyRead<NodeId, NodeView>
  edge: FamilyRead<EdgeId, EdgeView>
  mindmap: FamilyRead<MindmapId, MindmapView>
  group: FamilyRead<GroupId, GroupView>
}
```

最终 public `query`：

```ts
type SceneQuery = {
  revision(): Revision
  node: {
    get(id: NodeId): NodeView | undefined
  }
  edge: {
    get(id: EdgeId): EdgeView | undefined
    related(nodeIds: Iterable<NodeId>): readonly EdgeId[]
  }
  mindmap: {
    get(id: MindmapId): MindmapView | undefined
    resolve(value: string): MindmapId | undefined
    structure(value: MindmapId | NodeId): MindmapView['structure'] | undefined
  }
  group: {
    get(id: GroupId): GroupView | undefined
    exact(target: SelectionTarget): readonly GroupId[]
  }

  spatial: SpatialRead
  snap(rect: Rect): readonly SnapCandidate[]
  frame: {
    point(point: Point): readonly NodeId[]
    rect(rect: Rect): readonly NodeId[]
    pick(point: Point, options?: {
      excludeIds?: readonly NodeId[]
    }): NodeId | undefined
    parent(nodeId: NodeId, options?: {
      excludeIds?: readonly NodeId[]
    }): NodeId | undefined
    descendants(nodeIds: readonly NodeId[]): readonly NodeId[]
  }

  hit: SceneHitQuery
  items(): readonly SceneItem[]
}
```

原则：

- `graph` 负责 scene semantic truth 与 interaction-derived state。
- `render` 负责 DOM-ready truth。
- 不再 public 暴露 `nodeUi` / `edgeUi` / `chrome()`。
- `query` 按实体 namespace 组织，不再保留 `graph` 杂项区。

---

## 2.4 `render` public surface

最终 public `stores.render`：

```ts
type SceneRenderStores = {
  node: FamilyRead<NodeId, NodeRenderView>
  edge: {
    statics: FamilyRead<EdgeStaticId, EdgeStaticView>
    active: FamilyRead<EdgeId, EdgeActiveView>
    labels: FamilyRead<EdgeLabelKey, EdgeLabelView>
    masks: FamilyRead<EdgeId, EdgeMaskView>
  }
  chrome: {
    scene: ReadStore<ChromeRenderView>
    edge: ReadStore<EdgeOverlayView>
  }
}
```

### `NodeRenderView`

`NodeRenderView` 应合并今天 external caller 需要从 `NodeView + graph.state.node` 自己拼的内容：

```ts
type NodeRenderView = {
  id: NodeId
  node: NodeModel
  owner?: OwnerRef
  rect: Rect
  bounds: Rect
  rotation: number
  outline: NodeGeometry
  state: {
    hidden: boolean
    selected: boolean
    hovered: boolean
    editing: boolean
    patched: boolean
    resizing: boolean
  }
  edit?: {
    field: EditField
    caret: EditCaret
  }
}
```

说明：

- 这不是“节点具体 DOM props”。
- 这是 scene-universal node render model。
- React node layer 直接消费它，不再自己同时订阅 `graph.node` 和 `ui.node` 再合成一遍。

### `Edge` render

edge render 继续保持今天已经较好的拆法：

- `statics`
- `active`
- `labels`
- `masks`

但 `overlay` 应明确归属到 `chrome`，因为它渲染在 chrome viewport，而不是 scene content viewport。

### `ChromeRenderView`

最终 `chrome.scene` 应收口所有 chrome viewport render model：

```ts
type ChromeRenderView = {
  marquee?: {
    worldRect: Rect
    match: 'touch' | 'contain'
  }
  guides: readonly Guide[]
  draw: DrawPreview | null
  mindmap: MindmapPreview | null
  edge: EdgeOverlayView
}
```

原则：

- chrome 下的 render 不再一部分挂 `render.edge.overlay`，一部分挂 `chrome`。
- 最终都从 `render.chrome` 出来。

---

## 2.5 `hit` final API

最终 `hit` 应统一成：

```ts
type SceneHitTarget =
  | {
      kind: 'node'
      id: NodeId
    }
  | {
      kind: 'edge'
      id: EdgeId
    }
  | {
      kind: 'mindmap'
      id: MindmapId
    }
  | {
      kind: 'group'
      id: GroupId
    }

type SceneHitQuery = {
  node(input: {
    point: Point
    threshold?: number
    excludeIds?: readonly NodeId[]
  }): NodeId | undefined

  edge(input: {
    point: Point
    threshold?: number
    excludeIds?: readonly EdgeId[]
  }): EdgeId | undefined

  item(input: {
    point: Point
    threshold?: number
    kinds?: readonly SceneHitTarget['kind'][]
    exclude?: Partial<{
      node: readonly NodeId[]
      edge: readonly EdgeId[]
      mindmap: readonly MindmapId[]
      group: readonly GroupId[]
    }>
  }): SceneHitTarget | undefined
}
```

原则：

- `node` / `edge` 提供高频直达 query。
- `item` 提供统一 winner resolve。
- editor host 的 `pick` runtime 不再自己保留第二份 edge / node precise hit 主逻辑。

---

## 2.6 `editor.scene` 最终 public shape

最终 `EditorSceneSource` 不应再是今天这种重复包装形态。

最终应收敛为：

```ts
type EditorSceneSource = {
  revision(): number

  query: SceneQuery

  stores: {
    graph: SceneGraphStores
    render: SceneRenderStores
    items: ReadStore<readonly SceneItem[]>
  }

  host: {
    pick: ScenePickRuntime
    visible: (
      options?: Parameters<SpatialRead['rect']>[1]
    ) => ReturnType<SpatialRead['rect']>
    geometry: {
      node(nodeId: NodeId): NodeRenderView | undefined
      edge(edgeId: EdgeId): EdgeGeometryView | undefined
      order(item: {
        kind: 'node' | 'edge' | 'mindmap'
        id: string
      }): number
    }
    scope: {
      move(target: SelectionTarget): {
        nodes: readonly Node[]
        edges: readonly Edge[]
      }
      bounds(target: SelectionTarget): Rect | undefined
    }
  }
}
```

约束：

- `query` 与 `stores` 直接透传 scene runtime。
- `host` 只放 editor 本地 helper。
- 删除 today 的重复 API：
  - `node` / `nodes`
  - `edge` / `edges`
  - `chrome`
  - 单独再包装一层 `mindmap` / `group` convenience，如果只是同义转发就不应继续存在

能直接从 `query` 或 `stores` 获得的，不要再在 `editor.scene` 上换个名字暴露一遍。

---

## 3. 实施方案

## P0. 先定口径并改 public 命名

目标：

- 先把 surface 简化方向定死，再做实现迁移

修改：

- `whiteboard-editor-scene/src/contracts/editor.ts`
- `whiteboard-editor-scene/src/contracts/state.ts`
- `whiteboard-editor-scene/src/contracts/render.ts`
- `whiteboard-editor/src/types/editor.ts`

动作：

- public `RuntimeStores.graph.nodes / edges / owners.*` 收敛为 `graph.node / edge / mindmap / group`
- public graph state 收敛为 `graph.state.node / edge / chrome`
- public `RuntimeStores.ui.*` 从 public surface 删除
- public `query` 取代 `read`
- public `SceneQuery` 改为 `node / edge / mindmap / group / spatial / frame / snap / hit` 编排
- public `SceneQuery.nodeUi / edgeUi / chrome` 删除
- public `SceneQuery.hit` 扩展为 `node / edge / item`
- public `render.chrome` 成为正式 render namespace

完成标准：

- `editor-scene` public API 不再暴露 `nodeUi` / `edgeUi`
- `editor-scene` public API 不再把 chrome 与 render 分裂在两处
- `SceneRead` 命名退出，统一改为 `SceneQuery`

## P1. 在 `editor-scene` 增加 `render.node`

目标：

- node render 与 edge render 一样，进入 scene runtime

修改：

- `whiteboard-editor-scene/src/model/view/render.ts`
- `whiteboard-editor-scene/src/runtime/model.ts`
- `whiteboard-editor-scene/src/contracts/render.ts`
- `whiteboard-editor-scene/src/contracts/state.ts`

动作：

- 基于 today 的 `NodeView + graph.state.node` 生成 `NodeRenderView`
- `render.node` 以 family publish
- React node layer 后续直接消费 `render.node`

完成标准：

- React 不再需要同时订阅 `graph.node` 与 `graph.state.node`
- node render state 由 `editor-scene` 单点投影

## P2. 统一 `hit`

目标：

- 命中能力不再 edge-only，也不再 host-local 各自 resolve

修改：

- `whiteboard-editor-scene/src/runtime/read.ts`
- `whiteboard-editor-scene/src/runtime/hit/*`
- `whiteboard-editor/src/scene/pick.ts`

动作：

- 新增 `hit.node`
- 新增 `hit.item`
- 提取统一 winner resolve
- `scene/pick.ts` 改成消费 scene hit primitive，而不是自己保留 edge/node precise hit 主逻辑

完成标准：

- edge precise hit 主逻辑只保留一份
- node / edge / other item 的 hit 口径统一

## P3. 收口 chrome render

目标：

- 所有 chrome viewport render model 从一个 namespace 出来

修改：

- `whiteboard-editor-scene/src/contracts/render.ts`
- `whiteboard-editor-scene/src/model/view/render.ts`
- `whiteboard-react/src/features/*chrome*`
- `whiteboard-react/src/features/edge/components/EdgeOverlayLayer.tsx`

动作：

- 把 `edge overlay` 正式并入 `render.chrome`
- `chrome scene render` 与 `edge overlay render` 用统一 value surface 暴露

完成标准：

- chrome viewport render 不再散落在多个 namespace

## P4. 删掉 `editor.scene` 的重复包装层

目标：

- `editor.scene` 只保留 `query / stores / host`

修改：

- `whiteboard-editor/src/scene/source.ts`
- `whiteboard-editor/src/types/editor.ts`
- 调用这些重复包装 API 的 editor / react 代码

动作：

- 删除 `node` / `nodes` 双轨
- 删除 `edge` / `edges` 双轨
- 删除纯转发型 query helper，改为直接用 `query`
- 把 host-only helper 放进 `host`

完成标准：

- `editor.scene` 不再重复包装同一份 scene 数据
- 调用方一眼能分清 `query`、`stores`、`host`

## P5. 迁移 React 消费面

目标：

- React 完全基于 final scene surface 消费

修改：

- node scene layer
- edge scene layer
- chrome layers
- DOM host input

动作：

- node layer 改读 `stores.render.node`
- edge layer 继续读 `stores.render.edge.*`
- chrome layer 改读 `stores.render.chrome.*`
- body hit / generic pick 改用 final `query.hit.*`

完成标准：

- React 不再自己拼 `graph + graph.state`
- React 不再自己做 scene hit resolve

---

## 4. 最终验收标准

1. `render` 不再只有 edge，`render.node` 已进入 `editor-scene`。
2. `hit` 不再只有 edge，至少具备 `hit.node`、`hit.edge`、`hit.item`。
3. `nodeUi`、`edgeUi` 不再作为 public surface 暴露。
4. public surface 只保留 `graph`、`render`、`hit` 三类 scene truth。
5. `editor.scene` 收敛为 `query / stores / host`。
6. `editor.scene` 不再重复包装 `node/nodes`、`edge/edges`、`query` 等同义数据。
7. React 不再自己拼 `graph + graph.state -> render`。
8. host 调度仍留在 `editor` / `react`，不回流到 `editor-scene`。
