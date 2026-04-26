# WHITEBOARD_COMMITTED_DOCUMENT_INFRA_FINAL

## 目标

彻底重做现在这条 committed document 读取链，目标是长期最优，不做局部补丁：

- 删掉 `CommittedNodeView` / `CommittedEdgeView`
- 删掉 `editor-scene` 里常驻的 committed node/edge view map
- 让 `editor-scene.query.document` 成为唯一公共 document 读取面
- 把 committed-only 派生收敛成 `editor-scene` 内部按 revision 失效的 resolver
- 删除 `editor` 侧重复的 `EditorDocumentSource` 包装层

这里不考虑兼容，不保留旧实现。

## 结论

最终不应该是“完全不要 committed read”，而应该是：

- 公共层不再暴露任何 `Committed*View`
- 公共层不再暴露 `stores.document.node` / `stores.document.edge`
- `editor-scene.query.document` 直接返回 raw committed document / node / edge
- committed-only 的 node geometry、edge path、edge bounds、document bounds 都变成 `editor-scene` 内部 lazy resolver cache
- `editor.document` 不再是单独一套 source 设计，直接等于 `editor.scene.query.document`

一句话总结：

`committed` 只保留为 `editor-scene` 内部 resolver 语义；对外只剩 `document query`，不再有 committed wrapper view。`

## 当前实现的问题

### 1. `CommittedEdgeView` 是高成本低复用层

相关实现：

- [whiteboard/packages/whiteboard-core/src/edge/committed.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/edge/committed.ts:1)
- [whiteboard/packages/whiteboard-editor-scene/src/model/document/patch.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor-scene/src/model/document/patch.ts:1)

现状：

- `patchDocumentState(...)` 在 patch 阶段维护 `working.document.edges: Map<EdgeId, CommittedEdgeView>`
- node touched 时会扫一遍全部 `snapshot.edges`，把相关 edge 加进 touched 集合
- `resolveCommittedEdgeView(...)` 对每条 edge 都重新解析两端 node committed geometry
- `document.bounds()` 又不会复用这张 map，而是再次走 `resolveCommittedEdgeRenderView(...)`

问题：

- patch 阶段引入了不必要的全量 edge 扫描
- 同一个高连接度 node 的 geometry / outline 会在多条 edge 上重复计算
- 已经维护了一张 committed edge map，但 `bounds()` 还在重新算 path，复用很差

这就是你前面看到 `resolveCommittedEdgeView` 很卡的根因。

### 2. `CommittedNodeView` 把 raw node 和 geometry 硬绑在一起

相关实现：

- [whiteboard/packages/whiteboard-core/src/node/committed.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/node/committed.ts:1)
- [whiteboard/packages/whiteboard-editor/src/layout/runtime.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/layout/runtime.ts:531)
- [whiteboard/packages/whiteboard-editor/src/write/node.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/write/node.ts:1)

现状：

- `CommittedNodeView` 同时携带 `node`、`rect`、`bounds`、`rotation`
- editor 侧绝大多数调用只是立刻取 `.node` 或 `.rect`

问题：

- “raw committed node” 和 “committed node geometry” 是两个概念
- 现在被一个 wrapper 类型绑死，导致 API 表意不清晰
- 也导致 layout / write / action 这些模块误以为自己需要“committed view”，其实它们多数只需要 raw node，少数地方再额外要 geometry

### 3. `query.document` 已经存在，但外面又包了一层 `EditorDocumentSource`

相关实现：

- [whiteboard/packages/whiteboard-editor/src/editor/createEditor.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/editor/createEditor.ts:93)
- [whiteboard/packages/whiteboard-editor/src/types/editor.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/types/editor.ts:237)

现状：

- `scene.query.document` 已经有 `get / bounds / slice / node / edge`
- `createEditor.ts` 再组装一遍 `EditorDocumentSource`
- editor 内部大量模块都依赖这层二次包装

问题：

- public read surface 被重复定义了两遍
- `editor-scene` 才是真正的数据源，但 editor 内部并没有直接依赖它
- 后续任何 query 收敛、命名调整、缓存策略调整，都要同步维护两份面

### 4. `DocumentState` 现在不是“数据源”，而是几套半重叠缓存拼在一起

相关实现：

- [whiteboard/packages/whiteboard-editor-scene/src/contracts/state.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor-scene/src/contracts/state.ts:67)
- [whiteboard/packages/whiteboard-editor-scene/src/runtime/read.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor-scene/src/runtime/read.ts:838)

现状：

- `document.snapshot`
- `document.background`
- `document.nodes`
- `document.edges`
- `document.bounds()` 还走另一条 read 路径

问题：

- snapshot、node map、edge map、bounds 不是一套明确的主从关系
- `document.nodes` / `document.edges` 看上去像 canonical state，实际上只是 eager derived cache
- 这会持续制造“这个读应该信 snapshot 还是信 committed view map”的混乱

## 最终 API 设计

## 1. `whiteboard-core` 最终形态

### 1.1 删除

删除文件与导出：

- 删除 [whiteboard/packages/whiteboard-core/src/node/committed.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/node/committed.ts:1)
- 删除 [whiteboard/packages/whiteboard-core/src/edge/committed.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/edge/committed.ts:1)
- 删除 `CommittedNodeView`
- 删除 `CommittedEdgeView`
- 删除 `resolveCommittedNodeView(...)`
- 删除 `resolveCommittedEdgeView(...)`
- 删除 `resolveCommittedEdgeRenderView(...)`
- 删除 `node.geometry.committed`
- 删除 `edge.view.committed`

### 1.2 新增 node primitive

新增文件：

- `whiteboard/packages/whiteboard-core/src/node/document.ts`

新增类型与函数：

```ts
export interface DocumentNodeGeometry {
  rect: Rect
  bounds: Rect
  rotation: number
}

export interface ResolvedDocumentNodeGeometry extends DocumentNodeGeometry {
  outline: NodeOutline
}

export const resolveDocumentNodeGeometry(input: {
  node: Node
  nodeSize: Size
}): ResolvedDocumentNodeGeometry
```

说明：

- 这是 committed document read 唯一需要新增的 core primitive
- public query 只暴露 `DocumentNodeGeometry`
- `outline` 只给 scene 内部 resolver 复用，不给外部当常规数据面

### 1.3 edge 复用现有 pure primitive，不再新增 committed helper

直接复用已有能力：

- `resolveEdgeEnds(...)`
- `resolveEdgePathFromRects(...)`
- `edge.path.bounds(...)`

不再为 committed document 额外定义一套 edge view API。

原因：

- `CommittedEdgeView` 本来就是多余包装
- scene 内部 resolver 已经能拿到 raw node + cached node geometry
- 再新增 committed edge helper 只会继续制造重复层

## 2. `editor-scene` public API 最终形态

### 2.1 `Query.document`

在 [whiteboard/packages/whiteboard-editor-scene/src/contracts/editor.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor-scene/src/contracts/editor.ts:731) 中定义独立接口：

```ts
export interface DocumentQuery {
  get(): WhiteboardDocument
  background(): WhiteboardDocument['background'] | undefined

  node(id: NodeId): Node | undefined
  edge(id: EdgeId): Edge | undefined

  nodeIds(): readonly NodeId[]
  edgeIds(): readonly EdgeId[]

  nodeGeometry(id: NodeId): DocumentNodeGeometry | undefined

  bounds(): Rect
  slice(input: {
    nodeIds?: readonly NodeId[]
    edgeIds?: readonly EdgeId[]
  }): SliceExportResult | undefined
}
```

`Query` 最终改成：

```ts
export interface Query {
  revision(): Revision
  document: DocumentQuery
  ...
}
```

规则：

- `document.node(id)` / `document.edge(id)` 只返回 raw committed record
- `document.nodeGeometry(id)` 返回 committed-only geometry
- `document.bounds()` 返回 committed-only document bounds
- 外部不再感知任何 `Committed*View`

### 2.2 `RuntimeStores.document`

最终只保留：

```ts
document: {
  revision: store.ReadStore<Revision>
  background: store.ReadStore<WhiteboardDocument['background'] | undefined>
}
```

说明：

- `background` 给 React 订阅
- `revision` 给 editor 内部那些必须做 reactive derived read 的模块，例如 layout draft
- 不再公开 `stores.document.node`
- 不再公开 `stores.document.edge`
- 不再公开 `stores.document.snapshot`
- 不再公开 `stores.document.nodeGeometry`

也就是说：

`query.document` 负责“读什么”，`stores.document` 只负责“何时重算”。`

## 3. `editor-scene` internal 最终形态

### 3.1 `DocumentState`

在 [whiteboard/packages/whiteboard-editor-scene/src/contracts/state.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor-scene/src/contracts/state.ts:67) 中收缩为：

```ts
export interface DocumentState {
  snapshot: WhiteboardDocument
  background?: WhiteboardDocument['background']
}
```

删除：

- `nodes: Map<NodeId, CommittedNodeView>`
- `edges: Map<EdgeId, CommittedEdgeView>`

`DocumentState` 只保留 source data，不再保留 eager derived cache。

### 3.2 `DocumentResolver`

新增文件：

- `whiteboard/packages/whiteboard-editor-scene/src/model/document/resolver.ts`

新增内部接口：

```ts
export interface DocumentResolver {
  node(id: NodeId): Node | undefined
  edge(id: EdgeId): Edge | undefined
  nodeIds(): readonly NodeId[]
  edgeIds(): readonly EdgeId[]
  nodeGeometry(id: NodeId): DocumentNodeGeometry | undefined
  bounds(): Rect
  slice(input: {
    nodeIds?: readonly NodeId[]
    edgeIds?: readonly EdgeId[]
  }): SliceExportResult | undefined
}
```

内部 cache：

```ts
type ResolverCache = {
  revision: Revision
  nodeIds: readonly NodeId[] | null
  edgeIds: readonly EdgeId[] | null
  nodeGeometry: Map<NodeId, ResolvedDocumentNodeGeometry | null>
  edgePath: Map<EdgeId, ResolvedEdgePathFromRects | null>
  edgeBounds: Map<EdgeId, Rect | null>
  bounds: Rect | null
}
```

规则：

- 以 `state.revision.document` 为唯一失效边界
- 同一 revision 内全部 lazy 计算
- `nodeGeometry(id)` 先读 cache，没有再算
- `edgePath(id)` 内部通过 raw edge + cached node geometry 调 `resolveEdgePathFromRects(...)`
- `edgeBounds(id)` 通过 cached edge path 取 `edge.path.bounds(...)`
- `bounds()` 只在第一次调用时扫描全部 node / edge，结果缓存到当前 revision

注意：

- `edgePath` / `edgeBounds` 是 resolver 内部实现，不进入 public API
- committed edge 派生不再放进 `State`

### 3.3 `patchDocumentState(...)`

[whiteboard/packages/whiteboard-editor-scene/src/model/document/patch.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor-scene/src/model/document/patch.ts:1) 最终只做两件事：

```ts
input.working.document.snapshot = snapshot
input.working.document.background = snapshot.background
```

明确删除：

- node committed map 更新
- edge committed map 更新
- touched node 触发的全量 edge 扫描

### 3.4 删除 `model/document/read.ts`

删除文件：

- [whiteboard/packages/whiteboard-editor-scene/src/model/document/read.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor-scene/src/model/document/read.ts:1)

原因：

- `bounds()` / `slice()` 不需要额外 helper 层
- `bounds()` 应直接委托 `DocumentResolver`
- `slice()` 应直接在 `runtime/read.ts` 里走 raw snapshot export

## 4. `editor` 最终形态

### 4.1 删除 `EditorDocumentSource`

删除类型：

- [whiteboard/packages/whiteboard-editor/src/types/editor.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/types/editor.ts:237) 里的 `EditorDocumentSource`

改为直接复用 `editor-scene`：

```ts
import type { DocumentQuery } from '@whiteboard/editor-scene'

export type Editor = {
  document: DocumentQuery
  scene: EditorSceneSource
  ...
}
```

也就是说：

- `editor.document` 不是一套新的 source
- `editor.document === editor.scene.query.document`

### 4.2 editor 内部模块不再依赖 committed wrapper

最终 editor 内部只依赖两类东西：

- raw committed document read：`document.node(id)` / `document.edge(id)` / `document.get()`
- committed geometry read：`document.nodeGeometry(id)`

不再有：

- `.node.get(id)?.node`
- `.edge.get(id)?.edge`
- `CommittedNodeView`
- `CommittedEdgeView`

## 要删除的旧实现

## core

- 删除 `whiteboard/packages/whiteboard-core/src/node/committed.ts`
- 删除 `whiteboard/packages/whiteboard-core/src/edge/committed.ts`
- 删除 `whiteboard/packages/whiteboard-core/src/node/index.ts` 里 `CommittedNodeView` 相关导出
- 删除 `whiteboard/packages/whiteboard-core/src/edge/index.ts` 里 `CommittedEdgeView` / `resolveCommittedEdgeView` / `resolveCommittedEdgeRenderView` 相关导出

## editor-scene

- 删除 `whiteboard/packages/whiteboard-editor-scene/src/model/document/read.ts`
- 删除 `whiteboard/packages/whiteboard-editor-scene/src/index.ts` 里 `CommittedNodeView` / `CommittedEdgeView` 导出
- 删除 `whiteboard/packages/whiteboard-editor-scene/src/contracts/state.ts` 中 `document.nodes`
- 删除 `whiteboard/packages/whiteboard-editor-scene/src/contracts/state.ts` 中 `document.edges`
- 删除 `whiteboard/packages/whiteboard-editor-scene/src/runtime/model.ts` 中 `stores.document.node`
- 删除 `whiteboard/packages/whiteboard-editor-scene/src/runtime/model.ts` 中 `stores.document.edge`
- 删除 `whiteboard/packages/whiteboard-editor-scene/src/runtime/read.ts` 中 `query.document.node -> state.document.nodes.get`
- 删除 `whiteboard/packages/whiteboard-editor-scene/src/runtime/read.ts` 中 `query.document.edge -> state.document.edges.get`

## editor

- 删除 `whiteboard/packages/whiteboard-editor/src/types/editor.ts` 里的 `EditorDocumentSource`
- 删除 `whiteboard/packages/whiteboard-editor/src/write/index.ts` 中对 `CommittedNodeView` / `CommittedEdgeView` 的类型约束
- 删除 `whiteboard/packages/whiteboard-editor/src/layout/runtime.ts` 中对 `CommittedNodeView` 的 import 和依赖
- 删除所有 `document.node.get(id)?.node`
- 删除所有 `document.edge.get(id)?.edge`

## 详细实施清单

## 阶段 1. core 收口

修改清单：

- 新增 `whiteboard/packages/whiteboard-core/src/node/document.ts`
- 修改 `whiteboard/packages/whiteboard-core/src/node/index.ts`
- 修改 `whiteboard/packages/whiteboard-core/src/edge/index.ts`
- 删除 `whiteboard/packages/whiteboard-core/src/node/committed.ts`
- 删除 `whiteboard/packages/whiteboard-core/src/edge/committed.ts`

具体动作：

- 在 `node/document.ts` 新增 `DocumentNodeGeometry` / `ResolvedDocumentNodeGeometry` / `resolveDocumentNodeGeometry(...)`
- `node/index.ts` 改为导出 `resolveDocumentNodeGeometry`
- `edge/index.ts` 删除全部 committed export
- 保留 `resolveEdgeEnds(...)`、`resolveEdgePathFromRects(...)`、`resolveEdgeViewFromNodeGeometry(...)`

## 阶段 2. editor-scene contract 收口

修改清单：

- 修改 `whiteboard/packages/whiteboard-editor-scene/src/contracts/editor.ts`
- 修改 `whiteboard/packages/whiteboard-editor-scene/src/contracts/state.ts`
- 修改 `whiteboard/packages/whiteboard-editor-scene/src/index.ts`

具体动作：

- 新增 `DocumentQuery`
- `Query.document` 改成 `DocumentQuery`
- `RuntimeStores.document` 改成只保留 `revision` / `background`
- `DocumentState` 改成只保留 `snapshot` / `background`
- 删掉 `CommittedNodeView` / `CommittedEdgeView` export

## 阶段 3. editor-scene document resolver 落地

修改清单：

- 新增 `whiteboard/packages/whiteboard-editor-scene/src/model/document/resolver.ts`
- 修改 `whiteboard/packages/whiteboard-editor-scene/src/model/document/patch.ts`
- 删除 `whiteboard/packages/whiteboard-editor-scene/src/model/document/read.ts`
- 修改 `whiteboard/packages/whiteboard-editor-scene/src/runtime/model.ts`
- 修改 `whiteboard/packages/whiteboard-editor-scene/src/runtime/read.ts`

具体动作：

- `patchDocumentState(...)` 只更新 snapshot/background
- `runtime/model.ts` 暴露 `stores.document.revision` / `stores.document.background`
- `runtime/read.ts` 创建单例 `DocumentResolver`
- `query.document.get()` 直接读 snapshot
- `query.document.background()` 直接读 background
- `query.document.node(id)` 直接读 `snapshot.nodes[id]`
- `query.document.edge(id)` 直接读 `snapshot.edges[id]`
- `query.document.nodeIds()` / `edgeIds()` 委托 resolver cache
- `query.document.nodeGeometry(id)` 委托 resolver cache
- `query.document.bounds()` 委托 resolver cache
- `query.document.slice(...)` 直接基于 snapshot 调 `document.slice.export.selection(...)`

## 阶段 4. editor-scene 其他内部调用改到 snapshot / resolver

修改清单：

- 修改 `whiteboard/packages/whiteboard-editor-scene/src/model/graph/patch.ts`
- 修改 `whiteboard/packages/whiteboard-editor-scene/src/runtime/read.ts`

具体动作：

- `graph/patch.ts` reset 逻辑里，node seed 改为 `Object.keys(snapshot.nodes)`，edge seed 改为 `Object.keys(snapshot.edges)`，不再依赖 `working.document.nodes.keys()` / `working.document.edges.keys()`
- `runtime/read.ts` 中 `mindmap.ofNodes(...)` 的 committed fallback 改成直接读 `runtime.state().document.snapshot.nodes[nodeId]`

## 阶段 5. editor public surface 收口

修改清单：

- 修改 `whiteboard/packages/whiteboard-editor/src/types/editor.ts`
- 修改 `whiteboard/packages/whiteboard-editor/src/editor/createEditor.ts`

具体动作：

- `types/editor.ts` 删除 `EditorDocumentSource`
- `Editor['document']` 改成 `DocumentQuery`
- `createEditor.ts` 中不再手工组装 `document` wrapper
- `const document = scene.query.document`
- `editor.document = scene.query.document`

## 阶段 6. layout 改成 raw node + geometry query

修改清单：

- 修改 `whiteboard/packages/whiteboard-editor/src/layout/runtime.ts`
- 修改 `whiteboard/packages/whiteboard-editor/src/editor/createEditor.ts`

具体动作：

- `layout/runtime.ts` 删除 `CommittedNodeView`
- layout read 输入改成：

```ts
read: {
  document: Pick<DocumentQuery, 'node' | 'nodeGeometry'>
  revision: store.ReadStore<number>
}
```

- `measureDraftNodeLayout(...)` 改为接收：
  - `node: Node | undefined`
  - `geometry: DocumentNodeGeometry | undefined`
- 所有原来读 `committed.node` / `committed.rect` 的地方拆成 `node` + `geometry`
- `createEditor.ts` 把 `scene.query.document` 和 `scene.stores.document.revision` 传给 layout

## 阶段 7. write 改成 raw document query

修改清单：

- 修改 `whiteboard/packages/whiteboard-editor/src/write/node.ts`
- 修改 `whiteboard/packages/whiteboard-editor/src/write/edge/index.ts`
- 修改 `whiteboard/packages/whiteboard-editor/src/write/index.ts`

具体动作：

- `write/node.ts` 读取节点时改用 `document.node(id)`
- 需要 geometry 的地方改用 `document.nodeGeometry(id)`
- `write/edge/index.ts` 读取 edge 时改用 `document.edge(id)`
- `write/index.ts` 删除所有 `CommittedNodeView` / `CommittedEdgeView` 类型约束
- `createNodeWrite(...)` / `createEdgeWrite(...)` 直接接收 `DocumentQuery`

## 阶段 8. action / input / session / events 全量替换

修改清单：

- 修改 `whiteboard/packages/whiteboard-editor/src/action/index.ts`
- 修改 `whiteboard/packages/whiteboard-editor/src/input/helpers.ts`
- 修改 `whiteboard/packages/whiteboard-editor/src/input/features/selection/press.ts`
- 修改 `whiteboard/packages/whiteboard-editor/src/input/features/draw.ts`
- 修改 `whiteboard/packages/whiteboard-editor/src/input/features/mindmap/drag.ts`
- 修改 `whiteboard/packages/whiteboard-editor/src/session/selection.ts`
- 修改 `whiteboard/packages/whiteboard-editor/src/editor/events.ts`
- 修改其他所有依赖 `EditorDocumentSource` 的文件

具体动作：

- 所有 `document.node.get(id)?.node` 改成 `document.node(id)`
- 所有 `document.edge.get(id)?.edge` 改成 `document.edge(id)`
- `document.node.ids()` / `document.edge.ids()` 调用点改成 `document.nodeIds()` / `document.edgeIds()`
- 所有只做存在性判断的地方直接 `Boolean(document.node(id))` / `Boolean(document.edge(id))`

## 最终达标标准

- `CommittedNodeView` 不存在
- `CommittedEdgeView` 不存在
- `resolveCommittedNodeView(...)` 不存在
- `resolveCommittedEdgeView(...)` 不存在
- `resolveCommittedEdgeRenderView(...)` 不存在
- `EditorDocumentSource` 不存在
- `editor.document === editor.scene.query.document`
- `DocumentState` 只保留 `snapshot/background`
- `editor-scene` 不再维护任何 committed node/edge eager map
- `query.document` 成为唯一公共 document read surface
- committed-only geometry / edge path / bounds 全部进入 `DocumentResolver` 的按 revision lazy cache

## 预期收益

- 删除 node touched 时的全量 edge 扫描
- 删除 committed edge view 维护和重复 endpoint / outline 计算
- 删除 editor 侧重复 document source 包装层
- 让 raw document、committed geometry、lazy edge 派生三层职责彻底分开
- 后续如果继续做 document query / bounds / hit / export 优化，都会有唯一入口，而不是继续在 wrapper view 上打补丁
