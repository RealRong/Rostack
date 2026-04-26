# Whiteboard Editor Helper 去重优化清单

## 目标

- 只讨论 `whiteboard/packages/whiteboard-editor` 内 `read* / resolve*` helper 的优化方向。
- 只保留三类结论：
  - 直接复用 `editor-scene`
  - 下沉到 `whiteboard-core` / `shared`
  - 暂时留在本地
- 优先级必须严格遵守：
  1. 先复用 `editor-scene`
  2. 其次下沉到 `whiteboard-core` / `shared`
  3. 最后才保留在 `whiteboard-editor` 本地

---

## 现状结论

- `whiteboard/packages/whiteboard-editor/src` 内大约有 `155` 个 `read* / resolve*` helper 定义。
- 其中大部分只是局部实现细节，不值得单独处理。
- 真正值得清理的重点不是“helper 数量多”，而是以下三类问题：
  - 已有 `editor-scene` 真值源，但 editor 侧又包了一层 read facade
  - 同一套能力判断 / 相等判断 / id 解析在多个文件重复实现
  - 一些 helper 挂在错误模块下，导致 session / input / action 都在反复拼装同类输入

---

## 优先级规则

### P1. 能直接复用 `editor-scene` 的，必须先复用

- 不允许在 `whiteboard-editor` 再做一层等价 `read` 包装。
- 不允许同一份 graph/query 事实源在 `session` / `input` / `scene/host` 各写一套 helper。

### P2. `editor-scene` 没有，但属于纯 primitive 的，下沉到 `whiteboard-core` / `shared`

- 只要逻辑不依赖 editor session UI 语义，就不应继续挂在 `whiteboard-editor`。
- 典型形态：
  - equality
  - capability
  - id resolve
  - geometry/view resolve

### P3. 既不是 query，也不是 primitive，才留在本地

- 只保留真正贴近某个 feature 的局部 helper。
- 这类 helper 必须满足：
  - 使用范围小
  - 只服务单个模块
  - 不被其他 feature 重复依赖

---

## 第一批必须优化

## 1. `scene/host/scope.ts` 仍然是一层重复 read facade

当前代码：

- `whiteboard/packages/whiteboard-editor/src/scene/host/scope.ts`

当前问题：

- `expandMoveNodeIds(...)` 在 editor 侧重新做 frame 展开和 move scope 解析。
- `move(target)` 在 editor 侧重新拼 node / edge move scope。
- `bounds(target)` 在 editor 侧重新拼 selection bounds。
- 这已经不是 host runtime，而是在补一层 scene read。

优化原则：

- 优先复用 `editor-scene`。

优化方案：

- 把以下能力下沉到 `whiteboard-editor-scene`：
  - `query.selection.moveScope(target)`
  - `query.selection.bounds(target)`
- `moveScope` 直接返回：
  - `nodes: readonly Node[]`
  - `edges: readonly Edge[]`
- `bounds` 直接返回 `Rect | undefined`

落点：

- `whiteboard/packages/whiteboard-editor-scene/src/contracts/editor.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/runtime/read.ts`

迁移后：

- `whiteboard-editor/src/scene/host/scope.ts` 删除
- `scene/source.ts` 不再暴露 `host.scope`
- 调用方直接走 `editor.scene.query.selection.*`

---

## 2. edge interaction 读取分散在多个 input feature

当前代码：

- `whiteboard/packages/whiteboard-editor/src/input/features/edge/connect.ts`
- `whiteboard/packages/whiteboard-editor/src/input/features/edge/route.ts`
- `whiteboard/packages/whiteboard-editor/src/input/features/edge/label.ts`
- `whiteboard/packages/whiteboard-editor/src/input/features/edge/move.ts`

典型重复 helper：

- `readConnectNode`
- `readEdgeModel`
- `readEdgeGeometry`
- `readEditableRouteView`

当前问题：

- 多个 feature 都在重复做：
  - `query.edge.get(edgeId)?.base.edge`
  - `host.geometry.edge(edgeId)`
  - `query.node.get(nodeId)?.base.node.locked`
  - edge capability 判定
- 这些 helper 不是 feature 私有逻辑，而是 edge interaction read model。

优化原则：

- 优先复用 `editor-scene`。
- `editor-scene` 无法直接承载能力判断时，再下沉到 core/editor primitive。

优化方案：

- 在 `editor-scene` 增加统一 edge interaction query：
  - `query.edge.model(edgeId): Edge | undefined`
  - `query.edge.geometry(edgeId): CoreEdgeView | undefined`
  - `query.edge.editable(edgeId): { move: boolean, reconnectSource: boolean, reconnectTarget: boolean, editRoute: boolean, editLabel: boolean } | undefined`
  - `query.node.connectable(nodeId): boolean`
- `query.edge.editable` 内部统一处理：
  - edge locked
  - endpoint node locked
  - route / reconnect / label capability

落点：

- `whiteboard/packages/whiteboard-editor-scene/src/contracts/editor.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/runtime/read.ts`

迁移后：

- `edge/connect.ts` 删除 `readConnectNode`
- `edge/route.ts` 删除 `readEdgeModel` / `readEditableRouteView`
- `edge/label.ts` 删除 `readEdgeModel` / `readEdgeGeometry`
- `edge/move.ts` 删除本地 capability 读取拼装

---

## 3. `resolveEdgeCapability` 挂在 `session/edge.ts` 不合理

当前代码：

- `whiteboard/packages/whiteboard-editor/src/session/edge.ts`

当前问题：

- `resolveEdgeCapability(...)` 被 `session/source.ts` 和多个 input feature 共同依赖。
- 它不是 session presentation 逻辑，而是 editor 交互能力 primitive。
- 现在每个调用点都要自己传：
  - `readNodeLocked: (nodeId) => Boolean(query.node.get(nodeId)?.base.node.locked)`

优化优先级：

- 先看能否直接并入 `editor-scene query.edge.editable`
- 若不做 query 扩展，再下沉到 editor/core primitive

最终方案优先级：

1. 最优：
   - 直接并入 `editor-scene.query.edge.editable(edgeId)`
2. 次优：
   - 下沉到 `whiteboard/packages/whiteboard-editor/src/types/edge/support.ts`
   - 改名为 `resolveEdgeEditorCapability`

不推荐：

- 继续保留在 `session/edge.ts`

---

## 4. `session/source.ts` 的 `readNodeLocked` / `readNodeRect` 属于薄包装

当前代码：

- `whiteboard/packages/whiteboard-editor/src/session/source.ts`

当前问题：

- 只是以下表达式的别名：
  - `Boolean(graph.query.node.get(nodeId)?.base.node.locked)`
  - `graph.query.node.get(nodeId)?.geometry.rect`
- 这类 helper 没有独立抽象价值，只会继续制造 “read everywhere”。

优化原则：

- 优先直接复用 `editor-scene query`

优化方案：

- 直接内联
- 不新增替代 helper

迁移后：

- 删除 `readNodeLocked`
- 删除 `readNodeRect`

---

## 5. mindmap id resolve 仍有多处重复

当前代码：

- `whiteboard/packages/whiteboard-editor/src/projection/adapter.ts`
- `whiteboard/packages/whiteboard-editor/src/action/index.ts`
- `whiteboard/packages/whiteboard-editor/src/input/features/mindmap/drag.ts`
- `whiteboard/packages/whiteboard-editor/src/input/features/selection/move.ts`

当前问题：

- 一部分地方用 `query.mindmap.resolve(...)`
- 一部分地方自己写：
  - `owner?.kind === 'mindmap' ? owner.id : undefined`
  - `readMindmapId(snapshot, value)`

优化原则：

- 优先复用 `editor-scene.query.mindmap.resolve`

优化方案：

- 对 runtime graph 读取，一律改为：
  - `query.mindmap.resolve(value)`
- 对 document snapshot 适配层，如果必须脱离 runtime 工作，再补一份纯 snapshot primitive：
  - `whiteboard-core/src/mindmap/tree.ts`
  - `resolveMindmapIdFromDocument(document, value)`

落点优先级：

1. 运行时路径统一复用 `editor-scene.query.mindmap.resolve`
2. 非运行时 snapshot 路径下沉到 `whiteboard-core`

迁移后：

- `projection/adapter.ts` 的本地 `readMindmapId(...)` 删除
- `action/index.ts` / `mindmap/drag.ts` / `selection/move.ts` 不再直接判断 owner

---

## 6. `HoverTarget` equality 已有三份重复实现

当前代码：

- `whiteboard/packages/whiteboard-editor/src/projection/bridge.ts`
- `whiteboard/packages/whiteboard-editor/src/input/host.ts`
- `whiteboard/packages/whiteboard-editor/src/input/hover/store.ts`

当前问题：

- 完全相同的 equality 逻辑复制了三次。
- 这是标准 shared primitive，不应该继续散落。

优化原则：

- 优先下沉到 `shared` 或 editor 内单点 primitive

优化方案：

- 新增统一 helper：
  - `whiteboard/packages/whiteboard-editor/src/input/hover/target.ts`
  - `export const isHoverTargetEqual(...)`
- 如果后续 hover target 还会跨包复用，则继续下沉到 `shared`

落点优先级：

1. 先收敛到 editor 单点 primitive
2. 确认跨包需要后再下沉 `shared`

迁移后：

- 三处本地重复实现删除

---

## 7. `scene/host/geometry.ts` 仍承担了 runtime geometry read facade

当前代码：

- `whiteboard/packages/whiteboard-editor/src/scene/host/geometry.ts`

当前问题：

- `readNodeGeometry`
- `readEdgeGeometry`
- `order`
- revision memo

这些能力虽然现在放在 `host` 下，但本质已经是 runtime read layer，而不是 host 专属能力。

优化原则：

- 优先复用 `editor-scene stores/query`

优化方案：

- `order` 下沉到 `editor-scene`：
  - `query.item.order(item)`
- `edge geometry` 下沉到 `editor-scene`：
  - `query.edge.geometry(edgeId)`
- `node geometry` 若只是 render node view，直接用：
  - `stores.render.node.byId`
  - 或补 `query.node.geometry(nodeId)`

迁移后：

- `scene/host/geometry.ts` 只保留真正 host 侧能力；若无剩余价值则删除整文件

---

## 8. `document/source.ts` 的 committed document read 直接并进 `editor-scene`

当前代码：

- `whiteboard/packages/whiteboard-editor/src/document/source.ts`

当前 helper：

- `buildNodeItem`
- `readCommittedNodeSnapshot`
- `readEdgeItem`
- `readCommittedEdgeView`

当前问题：

- editor 侧单独维护了一条 committed document read 链
- `editor-scene` 同时又直接消费 `input.document.snapshot`
- 两边都在做 node geometry / edge resolve，形成并行实现
- `document/source.ts` 暴露了过大的 public shape，并且和 `editor-scene` 的工作集数据源分离
- 目前调用方必须区分：
  - `editor.document.*`
  - `editor.scene.query.*`
  - `editor.scene.stores.*`
  这不符合统一数据源方向

优化原则：

- committed document read 必须并进 `editor-scene`
- 但不能混入现有 `graph` / `query.node` / `query.edge` working 语义
- committed document 必须成为 `editor-scene` 内一条独立的 `document` 读线
- 优先让 `graph patch`、`query`、`stores` 共同复用这条 committed 读线，再删除 editor 侧 `document/source.ts`

### 最终 API 设计

`whiteboard/packages/whiteboard-editor-scene/src/contracts/editor.ts`

在 `RuntimeStores` 新增：

```ts
export interface RuntimeStores {
  document: {
    background: store.ReadStore<Document['background'] | undefined>
    node: FamilyReadStore<NodeId, CommittedNodeView>
    edge: FamilyReadStore<EdgeId, CommittedEdgeView>
  }
  graph: { ... }
  render: { ... }
  items: store.ReadStore<readonly SceneItem[]>
}
```

新增 committed read model：

```ts
export interface CommittedNodeView {
  id: NodeId
  node: Node
  rect: Rect
  bounds: Rect
  rotation: number
}

export interface CommittedEdgeView {
  id: EdgeId
  edge: Edge
  ends: ResolvedEdgeEnds
}
```

在 `Query` 新增：

```ts
export interface Query {
  document: {
    get(): Document
    node(id: NodeId): CommittedNodeView | undefined
    edge(id: EdgeId): CommittedEdgeView | undefined
    bounds(): Rect
    slice(input: {
      nodeIds?: readonly NodeId[]
      edgeIds?: readonly EdgeId[]
    }): SliceExportResult | undefined
  }
  node: { ... }
  edge: { ... }
  mindmap: { ... }
  group: { ... }
  spatial: SpatialRead
  ...
}
```

关键约束：

- `query.document.*` 只表示 committed document truth
- `query.node.get / query.edge.get` 继续只表示 working scene truth
- committed document 不允许塞进 `query.node` / `query.edge` 命名空间
- committed document 不允许塞进 `stores.graph`

### `State` 最终设计

`whiteboard/packages/whiteboard-editor-scene/src/contracts/state.ts`

在 `State` 新增：

```ts
export interface State {
  revision: {
    document: Revision
  }
  document: DocumentState
  graph: GraphState
  indexes: IndexState
  spatial: SpatialIndexState
  ui: UiState
  render: RenderState
  items: readonly SceneItem[]
}

export interface DocumentState {
  snapshot: Document
  background?: Document['background']
  nodes: Map<NodeId, CommittedNodeView>
  edges: Map<EdgeId, CommittedEdgeView>
}
```

关键约束：

- `document` 是 graph 之前的 committed substate
- `graph` / `indexes` / `render` 都可以复用 `document`
- `graph patch` 不再直接把 `input.document.snapshot.document` 当成唯一读源散读

### runtime 输入补齐

`whiteboard/packages/whiteboard-editor-scene/src/runtime/createEditorSceneRuntime.ts`

当前只收：

- `measure`
- `canNodeConnect`

必须补为：

```ts
createEditorSceneRuntime({
  measure,
  canNodeConnect,
  document: {
    nodeSize: Size
  }
})
```

原因：

- committed node rect / bounds 需要 `nodeSize`
- committed slice export 需要 `nodeSize`
- 这类 document-level primitive 不应继续只存在于 editor 外层

### 推荐文件落点

新增：

- `whiteboard/packages/whiteboard-editor-scene/src/model/document/node.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/model/document/edge.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/model/document/patch.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/model/document/read.ts`

修改：

- `whiteboard/packages/whiteboard-editor-scene/src/contracts/editor.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/contracts/state.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/runtime/model.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/runtime/read.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/runtime/createEditorSceneRuntime.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/model/graph/patch.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/runtime/state.ts`

### 纯 primitive 下沉要求

为了避免 `editor-scene` 内再复制一条私有 committed resolve 链，以下 pure primitive 必须先下沉 `whiteboard-core`：

- committed node view resolve
- committed edge ends resolve
- committed edge view resolve

推荐新增：

- `whiteboard/packages/whiteboard-core/src/node/committed.ts`
- `whiteboard/packages/whiteboard-core/src/edge/committed.ts`

推荐 API：

```ts
resolveCommittedNodeView(input: {
  node: Node
  nodeSize: Size
}): CommittedNodeView

resolveCommittedEdgeView(input: {
  edge: Edge
  document: Document
  nodeSize: Size
}): CommittedEdgeView | undefined

resolveCommittedEdgeRenderView(input: {
  edge: Edge
  document: Document
  nodeSize: Size
}): CoreEdgeView | undefined
```

`editor-scene` 的 `document` 子系统与 `graph patch` 都统一复用这些 primitive。

### 实施方案

#### 阶段 8.1

- 在 `whiteboard-core` 新增 committed primitive
- 替换 `whiteboard-editor/src/document/source.ts` 里的：
  - `buildNodeItem`
  - `readCommittedNodeSnapshot`
  - `readEdgeItem`
  - `readCommittedEdgeView`
- 先让旧 `document/source.ts` 复用 core primitive，停止继续扩散私有实现

#### 阶段 8.2

- 在 `editor-scene contracts` 增加：
  - `CommittedNodeView`
  - `CommittedEdgeView`
  - `RuntimeStores.document`
  - `Query.document`
  - `State.document`
- 在 `createEditorSceneRuntime(...)` 增加 `document.nodeSize`

#### 阶段 8.3

- 在 `editor-scene` 新增 `model/document/*`
- 每次 `input.document.delta` 更新时先 patch committed `document` state
- `graph patch` 改为优先复用 `working.document`
- `runtime.read.ts` 暴露 `query.document.*`

#### 阶段 8.4

- editor 侧调用方迁移：
  - `action/clipboard.ts` 改用 `editor.scene.query.document.slice`
  - `action/index.ts` / `editor/events.ts` / `input/helpers.ts` / `write/*` 改用 `editor.scene.query.document.node/edge`
  - `layout/runtime.ts` 改用 `editor.scene.stores.document.node.byId`
  - `createEditor.ts` 不再创建 `createDocumentSource(...)`

#### 阶段 8.5

- 删除：
  - `whiteboard/packages/whiteboard-editor/src/document/source.ts`
- 删除 editor public type 中独立 `document source` 的旧 shape
- `Editor.document` 改为直接转发 `editor.scene.query.document`

### editor 层最终 public shape

`whiteboard/packages/whiteboard-editor/src/types/editor.ts`

最终不再保留独立 `EditorDocumentRuntimeSource`。

`Editor` 最终只暴露：

```ts
export type Editor = {
  document: {
    get(): Document
    bounds(): Rect
    slice(input: {
      nodeIds?: readonly NodeId[]
      edgeIds?: readonly EdgeId[]
    }): SliceExportResult | undefined
    node: {
      get(id: NodeId): CommittedNodeView | undefined
      ids(): readonly NodeId[]
    }
    edge: {
      get(id: EdgeId): CommittedEdgeView | undefined
      ids(): readonly EdgeId[]
    }
  }
  scene: EditorSceneSource
  session: EditorSessionSource
  write: EditorWrite
  input: EditorInputHost
  events: EditorEvents
  dispose(): void
}
```

这里的 `editor.document` 只是对 `editor.scene.query.document` 的薄转发，不再有独立 runtime/source 文件。

优化方案：

- committed document read 直接并进 `editor-scene`
- `editor/document/source.ts` 不保留
- editor 侧所有 committed document 读取都统一改为：
  - `editor.scene.query.document.*`
  - `editor.scene.stores.document.*`
- 对外 `editor.document` 只保留对 `editor.scene.query.document` 的转发

落点：

- `whiteboard/packages/whiteboard-editor-scene/src/contracts/editor.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/contracts/state.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/model/document/*`
- `whiteboard/packages/whiteboard-editor-scene/src/runtime/read.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/runtime/createEditorSceneRuntime.ts`
- `whiteboard/packages/whiteboard-core/src/node/committed.ts`
- `whiteboard/packages/whiteboard-core/src/edge/committed.ts`

结论：

- 这块不再保留 editor 独立 document source
- committed document read 必须成为 `editor-scene` 的一等子系统
- graph / query / layout / action / clipboard 统一复用这一条数据源

---

## 第二批可优化

## 9. `projection/adapter.ts` helper 数量偏多，但不应全部下沉

当前代码：

- `whiteboard/packages/whiteboard-editor/src/projection/adapter.ts`

当前问题：

- 文件里有大量 `read*`
- 但其中很多本质是 “session/preview/layout -> editor-scene input” 的适配逻辑
- 这类代码不是 query，也不是 core primitive

应拆分的部分：

- `readMindmapId`：应删除，改复用 query/core primitive
- `readInteractionHover`：可复用统一 hover target adapter primitive
- `readInteractionEditingEdge`：可和 `projection/bridge.ts` 的 edge editing mode 判断收敛

应保留的部分：

- `readNodePreviews`
- `readEdgePreviews`
- `readDrawPreview`
- `readNodeDrafts`
- `readChangedPreviewEdgeIds`

原因：

- 这些是 scene input adapter 本地职责
- 不适合下沉到 `editor-scene query`

---

## 10. `action/index.ts` 内局部 resolve helper 需要分流

当前代码：

- `whiteboard/packages/whiteboard-editor/src/action/index.ts`

当前 helper：

- `resolveNodeCommitValue`
- `resolveNodeCapability`
- `readMindmapIdForNodes`
- `readEdgeOrThrow`

优化判断：

- `resolveNodeCommitValue` 留本地
- `readEdgeOrThrow` 留本地
- `resolveNodeCapability` 应改为直接复用 node type support 正式能力接口，避免 action 自己再拼 registry 读取
- `readMindmapIdForNodes` 优先复用 `query.mindmap.resolve`

---

## 11. `input/host.ts` 里 hover target 映射可以收成单点 adapter

当前代码：

- `whiteboard/packages/whiteboard-editor/src/input/host.ts`

当前 helper：

- `readSelectionIntent`
- `readHoverTarget`
- 本地 `isHoverTargetEqual`

优化判断：

- `readSelectionIntent` 留本地
- `readHoverTarget` 可以与 hover primitive 一起收敛成：
  - `toHoverTargetFromPick(pick)`
- 本地 `isHoverTargetEqual` 删除，统一复用单点 primitive

---

## 明确保留在本地的 helper 类型

以下类型默认不需要下沉：

- 单文件样式 / toolbar / panel 计算
- 单文件 pointer gesture / draft patch / preview patch 计算
- 单文件表单值、默认值、文案、局部 merge 逻辑

典型保留文件：

- `session/panel.ts` 中大多数样式/toolbar helper
- `input/features/selection/press.ts` 中手势分支 helper
- `input/features/edge/connect.ts` 中 preview patch / reconnect patch / gesture state helper
- `input/features/edge/route.ts` 中 route patch / point projection helper
- `session/draw/state.ts`
- `layout/textMetrics.ts`

这些 helper 的问题不是“名字叫 read/resolve”，而是是否重复承载了 query / primitive 职责。只要没有，就可以保留。

---

## 最终实施顺序

## P0

- 删除 `session/source.ts` 的 `readNodeLocked` / `readNodeRect`
- 收敛 `HoverTarget` equality 为单点 primitive
- 统一所有 runtime mindmap id resolve 到 `query.mindmap.resolve`

## P1

- 把 `resolveEdgeCapability` 从 `session/edge.ts` 挪走
- 统一 edge capability / geometry / model 读取入口
- 删除 edge feature 里的 `readEdgeModel` / `readEdgeGeometry` / `readEditableRouteView` / `readConnectNode`

## P2

- 把 `scene/host/scope.ts` 下沉为 `editor-scene.query.selection.*`
- 把 `scene/host/geometry.ts` 下沉为 `editor-scene.query.*` / `stores.*`

## P3

- 在 `editor-scene` 落地 `document` committed 子系统
- editor 调用方迁移到 `editor.scene.query.document` / `editor.scene.stores.document`
- 删除 `whiteboard-editor/src/document/source.ts`

---

## 判断标准

做到以下状态才算收敛完成：

- editor 不再为已有 `editor-scene query` 再包一层等价 `read`
- edge interaction 不再在多个 feature 自己拼 model/geometry/capability 读取
- mindmap id resolve 不再在 editor 内出现多套实现
- hover target equality 全项目只保留一份实现
- `scene/host` 不再承载 query/read facade，只保留真正 host runtime
- committed document read 不再在 editor 侧保留第二套 source/runtime
- `editor-scene` 同时提供：
  - working scene read
  - committed document read
  且二者命名空间明确分离
