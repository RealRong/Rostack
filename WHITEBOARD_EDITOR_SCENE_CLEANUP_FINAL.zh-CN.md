# Whiteboard Editor Scene 清理最终迁移清单

## 目标

- 只清理 `whiteboard/packages/whiteboard-editor/src/scene` 这条线。
- 不保留兼容 facade，不保留“先转发再慢慢删”的做法。
- 所有 query 和 view/read model 一律下沉到 `whiteboard-editor-scene`。
- `whiteboard-editor/src/scene` 最终只保留 `source.ts` 和 `host/*`。

---

## 最终目录

```txt
whiteboard/packages/whiteboard-editor/src/scene/
  source.ts
  host/
    geometry.ts
    pick.ts
    scope.ts
    visible.ts

whiteboard/packages/whiteboard-editor/src/session/
  projection/
    selection.ts
  presentation/
    mindmapChrome.ts
```

必须删除：

```txt
whiteboard/packages/whiteboard-editor/src/scene/node.ts
whiteboard/packages/whiteboard-editor/src/scene/edge.ts
whiteboard/packages/whiteboard-editor/src/scene/selection.ts
whiteboard/packages/whiteboard-editor/src/scene/mindmap.ts
whiteboard/packages/whiteboard-editor/src/scene/pick.ts
whiteboard/packages/whiteboard-editor/src/scene/cache/geometry.ts
whiteboard/packages/whiteboard-editor/src/scene/cache/order.ts
whiteboard/packages/whiteboard-editor/src/scene/cache/scope.ts
whiteboard/packages/whiteboard-editor/src/scene/cache/visible.ts
```

---

## 最终 public shape

`whiteboard/packages/whiteboard-editor/src/scene/source.ts` 最终只导出这一套运行时结构：

```ts
export type EditorSceneRuntime = {
  dispose(): void
  revision(): number
  query: Query
  stores: RuntimeStores
  host: {
    pick: ScenePickRuntime
    visible(
      options?: Parameters<Query['spatial']['rect']>[1]
    ): ReturnType<Query['spatial']['rect']>
    geometry: {
      node(nodeId: NodeId): NodeRenderView | undefined
      edge(edgeId: EdgeId): CoreEdgeView | undefined
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

必须删除的根级字段：

- `items`
- `pick`
- `snap`
- `geometry`
- `scope`
- `frame`
- `node`
- `edge`
- `nodes`
- `edges`
- `selection`
- `mindmap`
- `group`
- `chrome`

---

## editor-scene 必须补齐的最终 API

以下接口必须直接落到 `whiteboard/packages/whiteboard-editor-scene/src/contracts/editor.ts` 和 `whiteboard/packages/whiteboard-editor-scene/src/runtime/read.ts`，不允许继续留在 `whiteboard-editor/src/scene` 包一层。

```ts
export interface Query {
  node: {
    get(id: NodeId): NodeView | undefined
    idsInRect(rect: Rect, options?: NodeRectHitOptions): readonly NodeId[]
  }
  edge: {
    get(id: EdgeId): EdgeView | undefined
    related(nodeIds: Iterable<NodeId>): readonly EdgeId[]
    idsInRect(rect: Rect, options?: {
      match?: 'touch' | 'contain'
    }): readonly EdgeId[]
    connectCandidates(rect: Rect): readonly EdgeConnectCandidate[]
  }
  mindmap: {
    get(id: MindmapId): MindmapView | undefined
    resolve(value: string): MindmapId | undefined
    structure(value: MindmapId | NodeId): MindmapView['structure'] | undefined
    navigate(input: {
      id: MindmapId
      fromNodeId: NodeId
      direction: 'parent' | 'first-child' | 'prev-sibling' | 'next-sibling'
    }): NodeId | undefined
  }
  group: {
    get(id: GroupId): GroupView | undefined
    ofNode(nodeId: NodeId): GroupId | undefined
    ofEdge(edgeId: EdgeId): GroupId | undefined
    target(groupId: GroupId): SelectionTarget | undefined
    exact(target: SelectionTarget): readonly GroupId[]
  }
}
```

实现要求：

- `Query.node.idsInRect` 直接迁移 `whiteboard/packages/whiteboard-editor/src/scene/node.ts` 里的 `idsInRect` 逻辑。
- `Query.edge.idsInRect` 直接迁移 `whiteboard/packages/whiteboard-editor/src/scene/edge.ts` 里的 `idsInRect` 逻辑。
- `Query.edge.connectCandidates` 直接迁移 `whiteboard/packages/whiteboard-editor/src/scene/edge.ts` 里的 `connectCandidates` 逻辑。
- `Query.mindmap.navigate` 直接调用 `whiteboard/packages/whiteboard-core/src/mindmap/tree.ts` 新增的 `readMindmapNavigateTarget`。
- `Query.group.ofNode` / `ofEdge` / `target` 直接取 `runtime.state().graph.group` 和 `runtime.state().graph.nodes/edges`，不要再经 `source.ts` 组装 facade。

---

## 纯 primitive 必须迁移到的指定代码

### 1. `toSpatialNode`

源文件：

- `whiteboard/packages/whiteboard-editor/src/scene/node.ts`

目标文件：

- `whiteboard/packages/whiteboard-core/src/node/projection.ts`
- `whiteboard/packages/whiteboard-core/src/node/index.ts`

最终代码要求：

- 在 `whiteboard/packages/whiteboard-core/src/node/projection.ts` 新增并导出 `toSpatialNode(...)`。
- 在 `whiteboard/packages/whiteboard-core/src/node/index.ts` 重新导出 `toSpatialNode`。

调用方修改：

- `whiteboard/packages/whiteboard-editor/src/input/features/transform.ts`
- `whiteboard/packages/whiteboard-editor/src/input/features/edge/connect.ts`
- `whiteboard/packages/whiteboard-editor/src/scene/cache/scope.ts` 删除前的迁移代码
- 其他所有 `@whiteboard/editor/scene/node` 的 `toSpatialNode` 引用

统一改为：

- `import { toSpatialNode } from '@whiteboard/core/node'`

### 2. node capability helper

源文件：

- `whiteboard/packages/whiteboard-editor/src/scene/node.ts`

目标文件：

- `whiteboard/packages/whiteboard-editor/src/types/node/support.ts`
- `whiteboard/packages/whiteboard-editor/src/types/node/index.ts`

最终代码要求：

- 在 `whiteboard/packages/whiteboard-editor/src/types/node/support.ts` 新增 `resolveNodeEditorCapability(node, type)`。
- 逻辑直接迁移当前 `resolveNodeCapability`，包含 mindmap owner 对 `resize/rotate` 的裁剪。
- 在 `whiteboard/packages/whiteboard-editor/src/types/node/index.ts` 重新导出 `resolveNodeEditorCapability`。

调用方修改：

- `whiteboard/packages/whiteboard-editor/src/input/features/transform.ts`
- `whiteboard/packages/whiteboard-editor/src/input/features/selection/press.ts`
- `whiteboard/packages/whiteboard-editor/src/session/projection/selection.ts`
- 其他所有当前依赖 `projection.node.capability(...)` 的地方

统一改为：

- 先读 node model
- 再调用 `resolveNodeEditorCapability(node, nodeType)`

### 3. `resolveGraphEdgeGeometry`

源文件：

- `whiteboard/packages/whiteboard-editor/src/scene/edge.ts`

目标文件：

- `whiteboard/packages/whiteboard-core/src/edge/view.ts`
- `whiteboard/packages/whiteboard-core/src/edge/index.ts`

最终代码要求：

- 在 `whiteboard/packages/whiteboard-core/src/edge/view.ts` 新增 `resolveEdgeViewFromNodeGeometry(...)`。
- 输入直接使用：
  - `edge: Edge`
  - `readNodeGeometry(nodeId): { node: NodeModel; rect: Rect; rotation: number } | undefined`
- 输出直接返回 `CoreEdgeView | undefined`。
- 在 `whiteboard/packages/whiteboard-core/src/edge/index.ts` 重新导出 `resolveEdgeViewFromNodeGeometry`。

调用方修改：

- `whiteboard/packages/whiteboard-editor/src/input/features/edge/connect.ts`
- `whiteboard/packages/whiteboard-editor/src/scene/cache/geometry.ts` 删除前的迁移代码

统一改为：

- `import { resolveEdgeViewFromNodeGeometry } from '@whiteboard/core/edge'`

### 4. `readMindmapNavigateTarget`

源文件：

- `whiteboard/packages/whiteboard-editor/src/scene/mindmap.ts`

目标文件：

- `whiteboard/packages/whiteboard-core/src/mindmap/tree.ts`
- `whiteboard/packages/whiteboard-core/src/mindmap/index.ts`

最终代码要求：

- 在 `whiteboard/packages/whiteboard-core/src/mindmap/tree.ts` 新增 `readMindmapNavigateTarget(...)`。
- 在 `whiteboard/packages/whiteboard-core/src/mindmap/index.ts` 重新导出。

调用方修改：

- `whiteboard/packages/whiteboard-editor-scene/src/runtime/read.ts`

统一改为：

- `query.mindmap.navigate(...)` 内部直接调用 `readMindmapNavigateTarget(...)`

---

## scene 文件逐项迁移清单

### A. `whiteboard/packages/whiteboard-editor/src/scene/source.ts`

必须保留：

- `revision`
- `query`
- `stores`
- `host`
- `dispose`

必须删除：

- `SceneProjectionStores`
- `createSceneProjectionStores`
- 所有 `nodeGraph` / `edgeGraph` / `nodeUi` / `edgeUi` 这类 rename facade
- 所有根级旧接口装配

必须直接改为读取：

- `controller.query`
- `controller.stores`

`host` 内部唯一允许装配的 helper：

- `createScenePick` -> `whiteboard/packages/whiteboard-editor/src/scene/host/pick.ts`
- `createSceneVisible` -> `whiteboard/packages/whiteboard-editor/src/scene/host/visible.ts`
- `createSceneGeometry` -> `whiteboard/packages/whiteboard-editor/src/scene/host/geometry.ts`
- `createSceneScope` -> `whiteboard/packages/whiteboard-editor/src/scene/host/scope.ts`

### B. `whiteboard/packages/whiteboard-editor/src/scene/node.ts`

整文件删除。

迁移落点：

- `toSpatialNode` -> `whiteboard/packages/whiteboard-core/src/node/projection.ts`
- `resolveNodeCapability` -> `whiteboard/packages/whiteboard-editor/src/types/node/support.ts`
- `idsInRect` -> `whiteboard/packages/whiteboard-editor-scene/src/runtime/read.ts` 的 `query.node.idsInRect`

必须删除的本地类型和接口：

- `EditorNodeView`
- `GraphNodeGeometry`
- `GraphNodeRead`
- `createGraphNodeRead`
- `toEditorNodeView`
- `toGraphNodeGeometry`

替代读取方式：

- node base / geometry -> `editor.scene.query.node.get(nodeId)`
- node state -> `editor.scene.stores.graph.state.node.byId`
- node render view -> `editor.scene.stores.render.node.byId`

### C. `whiteboard/packages/whiteboard-editor/src/scene/edge.ts`

整文件删除。

迁移落点：

- `resolveGraphEdgeGeometry` -> `whiteboard/packages/whiteboard-core/src/edge/view.ts`
- `idsInRect` -> `whiteboard/packages/whiteboard-editor-scene/src/runtime/read.ts` 的 `query.edge.idsInRect`
- `connectCandidates` -> `whiteboard/packages/whiteboard-editor-scene/src/runtime/read.ts` 的 `query.edge.connectCandidates`

必须删除的本地类型和接口：

- `EditorEdgeLabelView`
- `EditorEdgeView`
- `EditorEdgeDetail`
- `GraphEdgeRead`
- `createGraphEdgeRead`
- `toEditorEdgeView`

替代读取方式：

- edge base / route / box -> `editor.scene.query.edge.get(edgeId)`
- edge ui state -> `editor.scene.stores.graph.state.edge.byId`
- edge render statics / active / labels / masks / overlay -> `editor.scene.stores.render.edge.*`
- resolved edge geometry -> `editor.scene.host.geometry.edge(edgeId)`

### D. `whiteboard/packages/whiteboard-editor/src/scene/selection.ts`

整文件迁移到：

- `whiteboard/packages/whiteboard-editor/src/session/projection/selection.ts`

迁移规则：

- 文件整体原样迁过去，不保留 scene 版本。
- `createGraphSelectionRead` 改名为 `createSessionSelectionProjection`。
- 输入不再接受 `GraphNodeRead` / `GraphEdgeRead`。
- 输入改为直接接受：
  - `selection: store.ReadStore<SelectionTarget>`
  - `query: Pick<EditorSceneRuntime['query'], 'node' | 'edge'>`
  - `stores: Pick<EditorSceneRuntime['stores'], 'graph' | 'render'>`
  - `nodeType: Pick<NodeTypeSupport, 'capability'>`

文件内替换要求：

- `node.capability(...)` 全部改为 `resolveNodeEditorCapability(...)`
- `node.view` 读取改为 `stores.render.node.byId`
- `edge.bounds` 读取统一改为 `query.edge.get(edgeId)?.route.bounds`

### E. `whiteboard/packages/whiteboard-editor/src/scene/mindmap.ts`

必须拆成两部分：

- `readMindmapNavigateTarget` -> `whiteboard/packages/whiteboard-core/src/mindmap/tree.ts`
- `MindmapChrome` / `isMindmapChromeEqual` / `readAddChildTargets` -> `whiteboard/packages/whiteboard-editor/src/session/presentation/mindmapChrome.ts`

`session/presentation/mindmapChrome.ts` 最终只保留：

- `export type MindmapChrome`
- `export const isMindmapChromeEqual`
- `export const readAddChildTargets`

`session/source.ts` 必须改为从这里导入，不允许再从 `scene/mindmap.ts` 导入。

### F. `whiteboard/packages/whiteboard-editor/src/scene/pick.ts`

迁移到：

- `whiteboard/packages/whiteboard-editor/src/scene/host/pick.ts`

保留内容：

- frame-throttled runtime
- `schedule`
- `get`
- `subscribe`
- `clear`
- `dispose`

必须删除的同步 facade：

- `editor.scene.pick`

同步 pick 能力统一改为：

- candidate query -> `editor.scene.query.spatial.candidates(...)`
- hit resolve -> `editor.scene.query.hit.item(...)`

### G. `whiteboard/packages/whiteboard-editor/src/scene/cache/geometry.ts`

迁移到：

- `whiteboard/packages/whiteboard-editor/src/scene/host/geometry.ts`

同时把：

- `whiteboard/packages/whiteboard-editor/src/scene/cache/order.ts`

并入同一个文件。

最终只保留：

- revision memo
- `node(nodeId)`
- `edge(edgeId)`
- `order(item)`

不得再依赖：

- `scene/edge.ts`

必须直接依赖：

- `stores.render.node.byId`
- `resolveEdgeViewFromNodeGeometry`
- `stores.items`

### H. `whiteboard/packages/whiteboard-editor/src/scene/cache/scope.ts`

迁移到：

- `whiteboard/packages/whiteboard-editor/src/scene/host/scope.ts`

同时修改：

- `import { toSpatialNode } from '@whiteboard/editor/scene/node'`

改为：

- `import { toSpatialNode } from '@whiteboard/core/node'`

最终只保留：

- `move(target)`
- `bounds(target)`

`relatedEdges` 直接删除，调用方统一改用：

- `editor.scene.query.edge.related(nodeIds)`

### I. `whiteboard/packages/whiteboard-editor/src/scene/cache/visible.ts`

迁移到：

- `whiteboard/packages/whiteboard-editor/src/scene/host/visible.ts`

最终只保留 visible rect memo，不再出现 `cache` 目录。

---

## 调用方详细迁移清单

### 输入层

- `whiteboard/packages/whiteboard-editor/src/input/runtime.ts`
  - `projection.snap.rect` -> `projection.query.snap`
  - `projection.edge.connectCandidates` -> `projection.query.edge.connectCandidates`

- `whiteboard/packages/whiteboard-editor/src/input/features/selection/marquee.ts`
  - `projection.node.idsInRect` -> `projection.query.node.idsInRect`
  - `projection.edge.idsInRect` -> `projection.query.edge.idsInRect`

- `whiteboard/packages/whiteboard-editor/src/input/features/draw.ts`
  - `projection.node.idsInRect` -> `projection.query.node.idsInRect`

- `whiteboard/packages/whiteboard-editor/src/input/features/transform.ts`
  - `projection.geometry.node` -> `projection.host.geometry.node`
  - `projection.node.capability(...)` -> `resolveNodeEditorCapability(...)`
  - `projection.selection.summary` -> `sessionSource.selection.summary`
  - `@whiteboard/editor/scene/node` -> `@whiteboard/core/node`

- `whiteboard/packages/whiteboard-editor/src/input/features/edge/connect.ts`
  - `@whiteboard/editor/scene/edge` -> `@whiteboard/core/edge`
  - `@whiteboard/editor/scene/node` -> `@whiteboard/core/node`
  - `projection.edge.model` -> `projection.query.edge.get(edgeId)?.base.edge`
  - `projection.edge.geometry.get` -> `projection.host.geometry.edge`
  - `projection.edge.capabilityOf(edgeId)` -> `resolveEdgeCapability(projection.query.edge.get(edgeId)?.base.edge)`
  - `projection.geometry.node` -> `projection.host.geometry.node`

- `whiteboard/packages/whiteboard-editor/src/input/features/edge/label.ts`
  - `projection.selection.summary` -> `sessionSource.selection.summary`
  - `projection.edge.model` -> `projection.query.edge.get(edgeId)?.base.edge`
  - `projection.edge.geometry.get` -> `projection.host.geometry.edge`
  - `projection.edge.capabilityOf(edgeId)` -> `resolveEdgeCapability(...)`

- `whiteboard/packages/whiteboard-editor/src/input/features/edge/route.ts`
  - `projection.edge.model` -> `projection.query.edge.get(edgeId)?.base.edge`
  - `projection.edge.capabilityOf(edgeId)` -> `resolveEdgeCapability(...)`
  - `projection.edge.geometry.get` -> `projection.host.geometry.edge`

- `whiteboard/packages/whiteboard-editor/src/input/features/selection/press.ts`
  - `projection.selection.summary` -> `sessionSource.selection.summary`
  - `projection.selection.affordance` -> `sessionSource.selection.affordance`
  - `projection.node.capability(node)` -> `resolveNodeEditorCapability(node, nodeType)`
  - `projection.group.ofNode` -> `projection.query.group.ofNode`
  - `projection.group.target` -> `projection.query.group.target`

- `whiteboard/packages/whiteboard-editor/src/input/features/selection/move.ts`
  - `projection.frame.parent` -> `projection.query.frame.parent`
  - `projection.frame.pick` -> `projection.query.frame.pick`
  - `projection.mindmap.id` -> `projection.query.mindmap.resolve`
  - `projection.mindmap.structure` -> `projection.query.mindmap.structure`
  - `projection.mindmap.view` -> `projection.query.mindmap.get`
  - `projection.scope.move` -> `projection.host.scope.move`

- `whiteboard/packages/whiteboard-editor/src/input/features/mindmap/drag.ts`
  - `projection.mindmap.id` -> `projection.query.mindmap.resolve`
  - `projection.mindmap.structure` -> `projection.query.mindmap.structure`
  - `projection.mindmap.view` -> `projection.query.mindmap.get`

- `whiteboard/packages/whiteboard-editor/src/input/host.ts`
  - `projection.group.target` -> `projection.query.group.target`

### session / write / types

- `whiteboard/packages/whiteboard-editor/src/session/source.ts`
  - `readAddChildTargets` / `MindmapChrome` / `isMindmapChromeEqual` 的导入源改为 `whiteboard/packages/whiteboard-editor/src/session/presentation/mindmapChrome.ts`
  - `graph.selection.*` 改为 `createSessionSelectionProjection(...)` 的返回值
  - `graph.edge.detail` 读取改为 `projection.query.edge.get` + `projection.host.geometry.edge`
  - `graph.edge.capability` 改为 `resolveEdgeCapability`
  - `graph.mindmap.structure` -> `projection.query.mindmap.structure`
  - `graph.node.get(nodeId)?.rect` -> `projection.query.node.get(nodeId)?.geometry.rect`
  - `graph.node.get(nodeId)?.node.locked` -> `projection.query.node.get(nodeId)?.base.node.locked`

- `whiteboard/packages/whiteboard-editor/src/write/index.ts`
  - `projection.edge` 不再整体透传给 `createEdgeWrite`
  - 改为只传：
    - `readEdge: (edgeId) => projection.query.edge.get(edgeId)?.base.edge`

- `whiteboard/packages/whiteboard-editor/src/write/edge/index.ts`
  - 所有 `Pick<EditorSceneRuntime['edge'], 'model'>` 改为显式函数签名 `readEdge(edgeId): Edge | undefined`

- `whiteboard/packages/whiteboard-editor/src/types/editor.ts`
  - `MindmapChrome` 导入源改为 `whiteboard/packages/whiteboard-editor/src/session/presentation/mindmapChrome.ts`
  - `EditorSceneSource` 只保留 `revision/query/stores/host`

### 测试

以下旧读取方式必须全部删除：

- `editor.scene.nodes.read`
- `editor.scene.nodes.capability`
- `editor.scene.edges.geometry`
- `editor.scene.pick.candidates`
- `editor.scene.pick.resolve`
- `editor.scene.mindmap.view`

统一替代规则：

- 节点几何断言：
  - `editor.scene.nodes.read.get(id)?.rect`
  - 改为
  - `editor.scene.query.node.get(id)?.geometry.rect`

- 节点 model 断言：
  - `editor.scene.nodes.read.get(id)?.node`
  - 改为
  - `editor.scene.query.node.get(id)?.base.node`

- 节点 state 断言：
  - `hovered / selected / patched / resizing / edit`
  - 改为
  - `store.read(editor.scene.stores.graph.state.node.byId, id)`

- edge geometry 断言：
  - `editor.scene.edges.geometry.get(id)`
  - 改为
  - `editor.scene.host.geometry.edge(id)`

- synchronous pick 断言：
  - `editor.scene.pick.candidates(...)`
  - 改为
  - `editor.scene.query.spatial.candidates(...)`
  - `editor.scene.pick.resolve(...)`
  - 改为
  - `editor.scene.query.hit.item(...)`

- mindmap view 断言：
  - `editor.scene.mindmap.view.get(id)`
  - 改为
  - `editor.scene.query.mindmap.get(id)`

需要改的测试文件至少包括：

- `whiteboard/packages/whiteboard-editor/test/node-edit-selection-chrome.test.ts`
- `whiteboard/packages/whiteboard-editor/test/mindmap-layout-preview-runtime.test.ts`
- `whiteboard/packages/whiteboard-editor/test/mindmap-enter-animation.test.ts`
- `whiteboard/packages/whiteboard-editor/test/text-wrap-runtime.test.ts`
- `whiteboard/packages/whiteboard-editor/test/scene-pick.test.ts`
- `whiteboard/packages/whiteboard-editor/test/mindmap-drag-preview.test.ts`
- `whiteboard/packages/whiteboard-editor/test/mindmap-root-move.test.ts`
- `whiteboard/packages/whiteboard-editor/test/mindmap-root-render.test.ts`
- `whiteboard/packages/whiteboard-editor/test/mindmap-drag-gesture-runtime.test.ts`
- `whiteboard/packages/whiteboard-editor/test/mindmap-edit-relayout-preview.test.ts`

---

## 最终删除检查

以下内容全部删除后，才算完成：

- `whiteboard-editor/src/scene` 下所有非 `source.ts` / `host/*` 文件
- `source.ts` 中所有根级 facade 装配
- `SceneProjectionStores`
- `EditorNodeView`
- `EditorEdgeView`
- `EditorEdgeDetail`
- `GraphNodeRead`
- `GraphEdgeRead`
- `GraphSelectionRead`
- `MindmapChrome` 在 `scene/` 命名空间下的残留定义
- `cache` 目录
- 所有 `@whiteboard/editor/scene/node` / `@whiteboard/editor/scene/edge` / `@whiteboard/editor/scene/mindmap` 导入

最终判断标准：

- `whiteboard-editor/src/scene` 只剩 `source.ts` 和 `host/*`
- query/view 相关代码全部在 `whiteboard-editor-scene`
- session presentation 相关代码全部在 `whiteboard-editor/src/session`
- `whiteboard-editor` 内部不再存在第二套 scene read facade
