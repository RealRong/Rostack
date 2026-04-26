# WHITEBOARD_COMMITTED_DOCUMENT_INFRA_FINAL

## 目标

把 `editor-scene` 里现在这条“committed document / committed node view / committed edge view”链条重做成长期最优形态。

目标不是修一个热函数，而是一次性解决下面几个结构性问题：

- `CommittedEdgeView` 维护成本很高，但复用极低
- `query.document.*` 背后挂着一层厚缓存，语义和用途都不清晰
- `editor` / `layout` / `write` 大量依赖 `CommittedNodeView` / `CommittedEdgeView`，但很多地方其实只想读 raw document
- committed-only 几何、edge ends、document bounds 没有被收成统一基础设施

这里不做兼容设计，直接定义最终形态。

## 结论

最终形态不是“完全不要 committed”，而是：

- 删除 public `CommittedEdgeView`
- 删除 `editor-scene` 内部的 committed edge map
- 删除 public `CommittedNodeView`
- 保留一层更薄、更清晰的 committed node geometry 基础设施
- 把 committed-only 读取统一收进 `editor-scene.query.document`
- 把低频且昂贵的 committed edge 派生改成 lazy resolver，而不是每次 document patch 都全量/增量维护一张 edge committed map

一句话总结：

`editor-scene` 对外只暴露 raw committed document read + committed node geometry read；edge committed 派生不再维护成常驻 view map。`

## 当前问题

### 1. `CommittedEdgeView` 是高成本低复用层

当前定义：

- `whiteboard/packages/whiteboard-core/src/edge/committed.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/model/document/patch.ts`

现状：

- `patchDocumentState(...)` 为每条 touched edge 维护 `working.document.edges: Map<EdgeId, CommittedEdgeView>`
- `resolveCommittedEdgeView(...)` 每次都会重新解析 source/target node geometry 和 outline
- node touched 时，`patchDocumentState(...)` 还会扫一遍全部 `snapshot.edges` 找受影响 edge

问题：

- 先有一次 `O(全部 edge 数)` 的全量扫描
- 再对每条 touched edge 重算两端 node committed geometry
- 被拖动 node 连很多 edge 时，同一个 node committed geometry 会重复计算很多次

这条链是现在 `resolveCommittedEdgeView` 卡的直接原因。

### 2. `CommittedNodeView` 被 public API 放大了

当前：

- `query.document.node(id)` 返回 `CommittedNodeView`
- `EditorDocumentSource.node.get(id)` 返回 `CommittedNodeView`
- `write/node.ts`、`layout/runtime.ts`、`action/index.ts` 等都依赖它

但实际调用里，大量地方只是马上取：

- `committed.node`
- `committed.rect`
- `committed.bounds`

也就是说：

- raw committed node read
- committed node geometry read

这两个概念本该分开，现在被一个 wrapper 类型捆在一起。

### 3. `query.document` 背后数据源过厚，但又没真正统一

当前：

- raw committed snapshot 在 `state.document.snapshot`
- committed node map 在 `state.document.nodes`
- committed edge map 在 `state.document.edges`
- committed bounds 读取又重新走 `resolveCommittedEdgeRenderView(...)`

问题：

- 有 snapshot
- 有 node committed map
- 有 edge committed map
- 还有 bounds 的现算路径

这不是统一数据源，而是多套半重叠实现并存。

### 4. public `stores.document.*` 暴露过多

当前 public surface：

- `stores.document.node`
- `stores.document.edge`
- `stores.document.background`

但真正需要 reactive public store 的只有极少数：

- `background`
- committed node geometry 给 layout 之类内部依赖

raw committed node / edge 本身并不值得继续作为 public family store 暴露。

## 最终 API 设计

## 1. 删除的 public API

删除：

- `@whiteboard/editor-scene` 导出的 `CommittedNodeView`
- `@whiteboard/editor-scene` 导出的 `CommittedEdgeView`
- `RuntimeStores['document']['node']`
- `RuntimeStores['document']['edge']`
- `Query['document'].node(id): CommittedNodeView | undefined`
- `Query['document'].edge(id): CommittedEdgeView | undefined`

删除后，不再存在“committed edge view map”这层 public / internal 常驻对象。

## 2. 新的 committed document public query

文件：

- `whiteboard/packages/whiteboard-editor-scene/src/contracts/editor.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/runtime/read.ts`

新增并固定：

```ts
export interface DocumentNodeGeometry {
  rect: Rect
  bounds: Rect
  rotation: number
}
```

最终 `Query['document']`：

```ts
document: {
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

约束：

- `document.node(id)` / `document.edge(id)` 返回 raw committed record
- `document.nodeGeometry(id)` 返回 committed-only geometry
- `document.bounds()` 返回 committed-only document bounds
- 不再返回 `CommittedNodeView`
- 不再返回 `CommittedEdgeView`

## 3. 新的 public document store surface

文件：

- `whiteboard/packages/whiteboard-editor-scene/src/contracts/editor.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/runtime/model.ts`

最终只保留：

```ts
document: {
  snapshot: store.ReadStore<WhiteboardDocument>
  background: store.ReadStore<WhiteboardDocument['background'] | undefined>
  nodeGeometry: FamilyReadStore<NodeId, DocumentNodeGeometry>
}
```

说明：

- `snapshot` 给确实需要 reactive raw committed document 的地方
- `background` 给 React background 这类最简单的订阅点
- `nodeGeometry` 给 layout / draft 测量等内部高复用 committed geometry 依赖
- 不再公开 raw committed node/edge family store

## 4. internal committed document resolver

新增内部基础设施：

- `whiteboard/packages/whiteboard-editor-scene/src/model/document/resolver.ts`

最终内部接口：

```ts
export interface DocumentResolver {
  node(id: NodeId): Node | undefined
  edge(id: EdgeId): Edge | undefined
  nodeIds(): readonly NodeId[]
  edgeIds(): readonly EdgeId[]
  nodeGeometry(id: NodeId): DocumentNodeGeometry | undefined
  edgeEnds(id: EdgeId): ResolvedEdgeEnds | undefined
  edgeBounds(id: EdgeId): Rect | undefined
  bounds(): Rect
  slice(input: {
    nodeIds?: readonly NodeId[]
    edgeIds?: readonly EdgeId[]
  }): SliceExportResult | undefined
}
```

说明：

- 这是 `editor-scene` 内部 resolver，不直接暴露给 editor/react
- `edgeEnds` / `edgeBounds` 不进入 public query
- 它们是 committed-only lazy cache

## 5. internal state 最终形态

文件：

- `whiteboard/packages/whiteboard-editor-scene/src/contracts/state.ts`

`DocumentState` 最终改成：

```ts
export interface DocumentState {
  snapshot: WhiteboardDocument
  background?: WhiteboardDocument['background']
  nodeGeometry: Map<NodeId, DocumentNodeGeometry>
}
```

删除：

- `document.nodes: Map<NodeId, CommittedNodeView>`
- `document.edges: Map<EdgeId, CommittedEdgeView>`

说明：

- raw committed node / edge 从 `snapshot` 直接读
- committed node geometry 常驻缓存保留
- committed edge 派生不再常驻

## 要新增的基础设施

## 1. committed node geometry primitive

文件：

- `whiteboard/packages/whiteboard-core/src/node/committed.ts`

最终替换现有 `CommittedNodeView` 方向，新增：

```ts
export interface DocumentNodeGeometry {
  rect: Rect
  bounds: Rect
  rotation: number
}

export const resolveCommittedNodeGeometry(input: {
  node: Node
  nodeSize: Size
}): DocumentNodeGeometry
```

说明：

- 这是 committed node 的真正高复用 primitive
- 它不再包 `node` 自身
- 只负责 geometry

## 2. committed edge resolver primitive

文件：

- `whiteboard/packages/whiteboard-core/src/edge/committed.ts`

删除：

- `resolveCommittedEdgeView(...)`

新增：

```ts
export const resolveCommittedEdgeEnds(input: {
  edge: Edge
  readNodeGeometry(nodeId: NodeId): {
    node: Node
    geometry: {
      rect: Rect
      bounds: Rect
      rotation: number
      outline: ReturnType<typeof getNodeGeometry>['outline']
    }
  } | undefined
}): ResolvedEdgeEnds | undefined

export const resolveCommittedEdgeBounds(input: {
  edge: Edge
  readNodeGeometry(nodeId: NodeId): {
    node: Node
    geometry: {
      rect: Rect
      bounds: Rect
      rotation: number
      outline: ReturnType<typeof getNodeGeometry>['outline']
    }
  } | undefined
}): Rect | undefined
```

说明：

- edge committed 派生不再返回 wrapper view
- 只暴露真正需要复用的 ends / bounds primitive
- 由 `editor-scene` 的 document resolver 统一组织 cache

## 3. document resolver lazy cache

文件：

- `whiteboard/packages/whiteboard-editor-scene/src/model/document/resolver.ts`

内部 cache：

- `nodeGeometryById: Map<NodeId, DocumentNodeGeometry>`
- `nodeOutlineById: Map<NodeId, NodeOutline>`
- `edgeEndsById: Map<EdgeId, ResolvedEdgeEnds | null>`
- `edgeBoundsById: Map<EdgeId, Rect | null>`
- `nodeIdsCache: readonly NodeId[] | null`
- `edgeIdsCache: readonly EdgeId[] | null`
- `boundsCache: Rect | null`

规则：

- 以 document revision 为失效边界
- 同一 revision 内 lazy 计算并缓存
- 不做 eager edge committed map 维护

## 要删除的实现

删除：

- `whiteboard/packages/whiteboard-core/src/edge/committed.ts` 中 `CommittedEdgeView`
- `whiteboard/packages/whiteboard-core/src/edge/committed.ts` 中 `resolveCommittedEdgeView(...)`
- `whiteboard/packages/whiteboard-core/src/node/committed.ts` 中 `CommittedNodeView`
- `whiteboard/packages/whiteboard-core/src/node/committed.ts` 中 `resolveCommittedNodeView(...)`
- `whiteboard/packages/whiteboard-editor-scene/src/model/document/patch.ts` 中 committed edge map 维护
- `whiteboard/packages/whiteboard-editor-scene/src/model/document/read.ts` 中基于 `resolveCommittedEdgeRenderView(...)` 的 bounds 现算路径
- `whiteboard/packages/whiteboard-editor-scene/src/index.ts` 中 `CommittedNodeView` / `CommittedEdgeView` export

## editor-scene 需要修改的文件

### 1. `contracts/editor.ts`

修改：

- 删除 `CommittedNodeView` / `CommittedEdgeView` import
- 新增 `DocumentNodeGeometry`
- 修改 `RuntimeStores.document`
- 修改 `Query.document`

### 2. `contracts/state.ts`

修改：

- `DocumentState` 改为只保留 `snapshot/background/nodeGeometry`

### 3. `model/document/patch.ts`

修改：

- 只维护 `document.snapshot`
- 只维护 `document.background`
- 只增量维护 `document.nodeGeometry`
- 删除 touched node 时扫描全部 edge 的逻辑
- 删除 committed edge map 的任何更新逻辑

### 4. `model/document/read.ts`

修改：

- 删除当前 `readCommittedDocumentBounds(...)` 的 edge render 重算实现
- 改为委托 `DocumentResolver.bounds()`
- `slice(...)` 直接继续复用 raw snapshot export

### 5. `runtime/read.ts`

修改：

- `query.document.node(id)` 改为 `runtime.state().document.snapshot.nodes[id]`
- `query.document.edge(id)` 改为 `runtime.state().document.snapshot.edges[id]`
- 新增 `query.document.background()`
- 新增 `query.document.nodeIds()`
- 新增 `query.document.edgeIds()`
- 新增 `query.document.nodeGeometry(id)`
- `bounds()` / `slice()` 改为走 `DocumentResolver`

### 6. `runtime/model.ts`

修改：

- `stores.document.snapshot = value({ read: (state) => state.document.snapshot })`
- `stores.document.background = value({ read: (state) => state.document.background })`
- `stores.document.nodeGeometry = family({ read: (state) => ({ ids, byId }) })`
- 删除 `stores.document.node`
- 删除 `stores.document.edge`

## editor 需要修改的文件

## 1. `types/editor.ts`

修改 `EditorDocumentSource` 为：

```ts
export type EditorDocumentSource = {
  get(): Document
  bounds(): Rect
  slice(input: {
    nodeIds?: readonly NodeId[]
    edgeIds?: readonly EdgeId[]
  }): SliceExportResult | undefined
  node: {
    get(id: NodeId): Node | undefined
    ids(): readonly NodeId[]
    geometry(id: NodeId): DocumentNodeGeometry | undefined
  }
  edge: {
    get(id: EdgeId): Edge | undefined
    ids(): readonly EdgeId[]
  }
}
```

删除：

- `CommittedNodeView`
- `CommittedEdgeView`

## 2. `editor/createEditor.ts`

修改：

- 删除 `committedNode` 临时变量
- 不再读取 `projection.stores.document.node.byId`
- `document.node.ids()` 改为 `Object.keys(scene.query.document.get().nodes)`
- `document.edge.ids()` 改为 `Object.keys(scene.query.document.get().edges)`
- `document.node.geometry(id)` 直接转发 `scene.query.document.nodeGeometry(id)`

## 3. `layout/runtime.ts`

修改：

- 删除对 `CommittedNodeView` 的依赖
- `read.node.committed` 改成：
  - `node(id): Node | undefined`
  - `geometry: store.KeyedReadStore<NodeId, DocumentNodeGeometry | undefined>`
- `measureDraftNodeLayout(...)` 改为吃 raw node + committed geometry

## 4. `write/node.ts`

修改：

- `CommittedNodeView` 依赖改成 raw node + committed geometry 分离
- `lock.toggle`、`shape.set` 之类只读 raw committed node

## 5. `write/edge/index.ts`

修改：

- 删除 `CommittedEdgeView` 类型依赖
- `read.document.edge.get(id)` 改成直接返回 raw `Edge | undefined`
- `lock.toggle` 直接读 raw committed edge 的 `locked`

## 6. `write/index.ts`

修改：

- 删除 `CommittedNodeView` / `CommittedEdgeView` type 约束
- `createNodeWrite(...)` 传：
  - raw committed node read
  - committed node geometry read
- `createEdgeWrite(...)` 传 raw committed edge read

## 7. `action/index.ts`

修改：

- 所有 `document.node.get(id)?.node` 改为 `document.node.get(id)`
- 所有 `document.edge.get(id)?.edge` 改为 `document.edge.get(id)`
- mindmap / edit / patch / label 逻辑统一直接读 raw committed node/edge

## 8. `input/helpers.ts` 与其他 editor 内 helper

修改：

- 所有 `document.node.get(id)?.node` 改为 `document.node.get(id)`
- 所有 `document.edge.get(id)?.edge` 改为 `document.edge.get(id)`

## 实施顺序

### 阶段 1. 定义新 API

修改：

- `whiteboard/packages/whiteboard-editor-scene/src/contracts/editor.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/contracts/state.ts`
- `whiteboard/packages/whiteboard-editor/src/types/editor.ts`

动作：

- 引入 `DocumentNodeGeometry`
- 收窄 `Query.document`
- 收窄 `RuntimeStores.document`
- 收窄 `EditorDocumentSource`

### 阶段 2. 落地 committed node geometry 基础设施

修改：

- `whiteboard/packages/whiteboard-core/src/node/committed.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/model/document/patch.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/runtime/model.ts`

动作：

- `resolveCommittedNodeGeometry(...)` 替代 `CommittedNodeView`
- `DocumentState.nodeGeometry` 增量维护
- `stores.document.nodeGeometry` 建立

### 阶段 3. 删除 eager committed edge map

修改：

- `whiteboard/packages/whiteboard-core/src/edge/committed.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/model/document/patch.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/contracts/state.ts`

动作：

- 删除 `CommittedEdgeView`
- 删除 `resolveCommittedEdgeView(...)`
- 删除 `document.edges` map
- 删除 node touched 时全量扫描 edge 的逻辑

### 阶段 4. 落地 document resolver

修改：

- `whiteboard/packages/whiteboard-editor-scene/src/model/document/resolver.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/model/document/read.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/runtime/read.ts`

动作：

- 新建 per-revision lazy resolver
- `bounds()` 走 resolver cache
- `node()/edge()/nodeIds()/edgeIds()/nodeGeometry()` 全部收进 `query.document`

### 阶段 5. 迁移 editor 侧调用方

修改：

- `whiteboard/packages/whiteboard-editor/src/editor/createEditor.ts`
- `whiteboard/packages/whiteboard-editor/src/layout/runtime.ts`
- `whiteboard/packages/whiteboard-editor/src/write/node.ts`
- `whiteboard/packages/whiteboard-editor/src/write/edge/index.ts`
- `whiteboard/packages/whiteboard-editor/src/write/index.ts`
- `whiteboard/packages/whiteboard-editor/src/action/index.ts`
- `whiteboard/packages/whiteboard-editor/src/input/helpers.ts`

动作：

- 全部从 committed wrapper 改成 raw document + nodeGeometry

### 阶段 6. 清理 public export

修改：

- `whiteboard/packages/whiteboard-editor-scene/src/index.ts`

动作：

- 删除 `CommittedNodeView` export
- 删除 `CommittedEdgeView` export

## 最终态判断标准

- `editor-scene` 不再维护 committed edge map
- `resolveCommittedEdgeView(...)` 不再存在
- `CommittedEdgeView` public type 不再存在
- `CommittedNodeView` public type 不再存在
- `query.document.node(id)` / `edge(id)` 返回 raw committed record
- committed node geometry 成为唯一保留的常驻 committed 几何缓存
- committed edge 派生统一走 document resolver lazy cache
- `editor` / `write` / `layout` 不再直接依赖 committed wrapper view

## 预期收益

- 删除 document patch 阶段对 touched node 的全量 edge 扫描
- 删除 committed edge view 的重复 endpoint / outline 重算
- 把 committed-only 读取收成清晰的数据面
- 减少 `editor-scene` public surface 中的重复 wrapper 类型
- 给后续 document/query 性能优化留出统一基础设施入口
