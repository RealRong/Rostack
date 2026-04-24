# WHITEBOARD_ENGINE_READ_EXIT_GRAPH_AUTHORITY

## 目标

将 whiteboard 的最终架构边界收敛为：

- `engine` 只负责写入、规范化、发布 `snapshot + delta`。
- `engine` 不再保留 `facts`。
- `engine` 不再保留 `query/read`。
- 所有读取路径、结构索引、空间索引、交互查询统一由 `editor-graph` 提供。

本文只描述最终形态，不提供兼容期、双轨期、过渡层方案。

允许重构过程中暂时无法跑通，但落地完成后必须满足：

- `engine` 不再发布任何 read model。
- `editor` 不再依赖 `engine.query`。
- `editor-graph` 成为唯一 read authority。

## 原则

### 1. `engine` 是 write model，不是 read model

`engine` 的职责只包括：

- 接收 command / ops。
- 执行写入闭包。
- 规范化 document。
- 发布 committed `snapshot`。
- 发布 document `delta`。
- 发布 write stream。

`engine` 不负责：

- 发布派生关系图。
- 发布 query API。
- 发布供 UI / interaction 直接消费的索引。

### 2. 派生关系属于 `editor-graph`

`facts`、`nodeOwner`、`ownerNodes`、`edgeNodes`、`groupItems`、`snap candidates`、`frame query`、`spatial tree`、`items`，本质都属于 read-side projection。

这些数据不应在 `engine` commit 时全量重建，更不应作为 committed snapshot 的一部分发布。

### 3. published delta 只表达 document mutation surface

`engine` 发布的 `delta` 只描述：

- 哪些 root flag 变了。
- 哪些 entity id 变了。

不再发布 `relations.graph / ownership / hierarchy` 这类派生布尔位。

这类信息属于 read model，应该由 `editor-graph` 基于：

- `previous snapshot`
- `next snapshot`
- `entity id delta`

在本地精确推导。

## 最终职责边界

### `whiteboard-engine`

保留：

- `execute(...)`
- `apply(...)`
- `writes.subscribe(...)`
- `current()`
- `subscribe(...)`

删除：

- `facts/build.ts`
- `facts/entities.ts`
- `facts/relations.ts`
- `runtime/query.ts`
- `EngineQuery`
- `snapshot.state.facts`
- 所有围绕 committed query 的测试与辅助类型

### `whiteboard-editor-graph`

统一承接：

- graph entity view
- owner / hierarchy / endpoint 等结构索引
- spatial index
- snap query
- frame query
- group signature / exact match query
- items / scene order publish
- editor query/read 的对外接口

### `whiteboard-editor`

只保留两类依赖：

- 写入依赖 `engine`
- 读取依赖 `editor-graph`

`editor` 不再把 `engine` 当作 query source。

## `engine` 最终 API

### `Snapshot`

```ts
export interface EngineSnapshot {
  revision: Revision
  document: Document
}
```

不再保留：

```ts
state: {
  root: Document
  facts: Facts
}
```

### `Delta`

```ts
export interface EngineDelta {
  reset: boolean
  background: boolean
  order: boolean
  nodes: IdDelta<NodeId>
  edges: IdDelta<EdgeId>
  groups: IdDelta<GroupId>
  mindmaps: IdDelta<MindmapId>
}
```

说明：

- `reset` 表示整个 document 语义被整体替换，`editor-graph` 必须按 reset 处理。
- `background` / `order` 是 root-level patch flag。
- `nodes / edges / groups / mindmaps` 是唯一 published entity delta。
- 不再提供 `relations` 字段。

### `Publish`

```ts
export interface EnginePublish {
  rev: Revision
  snapshot: EngineSnapshot
  delta: EngineDelta
}
```

### `Engine`

```ts
export interface Engine {
  readonly config: BoardConfig
  readonly writes: EngineWrites

  current(): EnginePublish
  subscribe(listener: (publish: EnginePublish) => void): () => void

  execute<C extends Command>(
    command: C,
    options?: ExecuteOptions
  ): CommandResult<CommandOutput<C>>

  apply(
    ops: readonly Operation[],
    options?: BatchApplyOptions
  ): CommandResult
}
```

最终状态下：

- `EngineQuery` 整体删除。
- `engine.query.*` 的所有调用点全部删除。

## 为什么 `delta` 不再发布 relation 字段

`nodeOwner`、`edgeNodes`、`groupItems`、`mindmap members` 都是派生关系，不是 committed root data。

如果把这些关系变化继续放在 `engine` published delta 里，会重新引入两个问题：

- `engine` 继续承担 read-side 语义。
- `editor-graph` 继续消费一个由 `engine` 维护的派生模型。

最终收敛应为：

- `engine.delta` 只负责告诉下游“原始 document 哪些部分变了”。
- `editor-graph` 自己根据前后 document 和 changed ids，推导出需要更新哪些结构索引与 query。

也就是说：

- `engine` 不发布 relation delta。
- `editor-graph` 内部生成 patch scope / index scope。

## `editor-graph` 最终输入模型

为避免再从外部拿 `facts`，`editor-graph` 的 document input 必须同时拿到前后 committed snapshot。

```ts
export interface DocumentInput {
  previous: EngineSnapshot | null
  next: EngineSnapshot
  delta: EngineDelta
}
```

其中：

- bootstrap 时 `previous = null`
- 普通 update 时同时持有 `previous` 与 `next`

这样 `editor-graph` 可以只依赖 raw document 做本地推导，不需要依赖 `engine` 维护的任何派生关系。

## `editor-graph` 最终拥有的索引

以下定义的是最终 index API，不是内部存储形状。

原则：

- 命名优先短、直、可读。
- `working` 内部可以用 `Map` / `Set` / family / tree 等结构实现。
- patch phase、query phase、read phase 只通过 index API 访问，不直接散落读取底层 map。

### 1. Entity Graph

```ts
graph: {
  nodes: Family<NodeId, NodeView>
  edges: Family<EdgeId, EdgeView>
  owners: {
    mindmaps: Family<MindmapId, MindmapView>
    groups: Family<GroupId, GroupView>
  }
}
```

这是 committed + session overlay 后的最终 graph view。

### 2. Ownership Index

```ts
interface NodeOwnerIndex {
  owner(nodeId: NodeId): OwnerRef | undefined
  mindmap(mindmapId: MindmapId): readonly NodeId[]
  group(groupId: GroupId): readonly NodeId[]
}
```

用途：

- node owner lookup
- mindmap member lookup
- group node lookup

### 3. Hierarchy Index

```ts
interface TreeIndex {
  parent(nodeId: NodeId): NodeId | undefined
  children(nodeId: NodeId): readonly NodeId[]
  descendants(nodeId: NodeId): readonly NodeId[]
  expand(nodeIds: readonly NodeId[]): readonly NodeId[]
}
```

用途：

- mindmap parent/children/subtree
- drag start member expansion

### 4. Edge Index

```ts
interface EdgeIndex {
  nodes(edgeId: EdgeId): {
    source?: NodeId
    target?: NodeId
  }
  related(nodeId: NodeId): readonly EdgeId[]
  relatedMany(nodeIds: readonly NodeId[]): readonly EdgeId[]
}
```

用途：

- edge route patch fanout
- related edge query

### 5. Group Index

#### Group 不变量

group 的最终语义固定为：

- group 不是 `canvas.order` 中的 item。
- group 不允许嵌套 group。
- group 成员只允许 `node` 与 `edge`。
- group 不包含 `mindmap`。

也就是说，group 不是通用容器，也不是结构 parent，只是：

- 一个扁平的 node / edge 聚合
- 一个 selection / order / chrome 语义单元

最终类型应明确为：

```ts
type GroupItemRef =
  | { kind: 'node'; id: NodeId }
  | { kind: 'edge'; id: EdgeId }
```

```ts
interface GroupIndex {
  items(groupId: GroupId): readonly GroupItemRef[]
  nodes(groupId: GroupId): readonly NodeId[]
  edges(groupId: GroupId): readonly EdgeId[]

  ofNode(nodeId: NodeId): GroupId | undefined
  ofEdge(edgeId: EdgeId): GroupId | undefined

  signature(groupId: GroupId): string | undefined
  exact(target: SelectionTarget): readonly GroupId[]
}
```

用途：

- group structure view
- `group.exact(...)`
- selection capability / panel render
- node / edge group lookup

命名说明：

- `items / nodes / edges` 负责按 group 取成员。
- `ofNode / ofEdge` 负责按 item 反查 group。
- `signature` 是稳定签名，不在 render 期间临时构建。
- `exact` 直接返回 selection target 精确匹配的 group ids。

### 6. Spatial / Query Index

```ts
interface SpatialIndex {
  all(options?: QueryOptions): readonly SpatialRecord[]
  rect(rect: Rect, options?: QueryOptions): readonly SpatialRecord[]
  point(point: Point, options?: QueryOptions): readonly SpatialRecord[]
}

interface SnapIndex {
  rect(rect: Rect, options?: SnapQueryOptions): readonly SnapCandidate[]
}
```

说明：

- `spatial` 是 rect / point / all 的统一基础索引。
- `snap` 是交互热路径 query source，不能再回落到 committed derived read。
- `frame` 不引入独立持久化 index，最终以 `spatial + graph geometry + typed filter` 实现 `FrameQuery`。

### 7. Items Publish State

```ts
interface ItemsIndex {
  all(): readonly SceneItem[]
}
```

`items` 直接由 `editor-graph` 产出并发布，`editor` 和 React 不再去 `engine` 或 committed read 侧重组 scene。

## `editor-graph` 最终 index 组织方式

最终 `working` 内部应收敛为：

```ts
interface GraphIndexes {
  owner: NodeOwnerIndex
  tree: TreeIndex
  edge: EdgeIndex
  group: GroupIndex
  spatial: SpatialIndex
  snap: SnapIndex
  items: ItemsIndex
}
```

要求：

- graph patch 只读 `owner / tree / edge / group`
- spatial patch 只读 graph geometry 与 `items`
- input / read / query 只消费 `indexes`
- 不允许跳过 index API 直接回扫 raw document

## `editor-graph` 最终查询接口

最终由 `editor-graph` 对外提供：

```ts
interface EditorGraphQuery {
  node(id: NodeId): NodeView | undefined
  edge(id: EdgeId): EdgeView | undefined
  mindmap(id: MindmapId): MindmapView | undefined
  group(id: GroupId): GroupView | undefined

  spatial: {
    all(options?: QueryOptions): readonly SpatialRecord[]
    rect(rect: Rect, options?: QueryOptions): readonly SpatialRecord[]
    point(point: Point, options?: QueryOptions): readonly SpatialRecord[]
  }

  snap: {
    rect(rect: Rect, options?: SnapQueryOptions): readonly SnapCandidate[]
  }

  frame: {
    rect(rect: Rect, options?: FrameQueryOptions): readonly NodeId[]
    point(point: Point, options?: FrameQueryOptions): readonly NodeId[]
    pick(point: Point, options?: FramePickOptions): NodeId | undefined
    parent(nodeId: NodeId, options?: FrameParentOptions): NodeId | undefined
    descendants(ids: readonly NodeId[]): readonly NodeId[]
  }

  group: {
    exact(target: SelectionTarget): readonly GroupId[]
  }

  items(): readonly SceneItem[]
}
```

要点：

- `editor` 侧所有 query/read 最终都走这里。
- `document.read.*` 不再承担 interaction query 入口。
- committed raw document 只用于写入边界、导入导出、低频命令。

## `editor-graph` 内部更新模型

最终需要新增一个本地 document analysis / index patch 层，负责把 raw `snapshot + delta` 变成 graph 可消费的 patch scope。

### 输入

```ts
type GraphDocumentPatchInput = {
  previous: Document | null
  next: Document
  delta: EngineDelta
}
```

### 输出

```ts
type GraphDocumentPatchPlan = {
  reset: boolean
  order: boolean

  nodes: IdDelta<NodeId>
  edges: IdDelta<EdgeId>
  groups: IdDelta<GroupId>
  mindmaps: IdDelta<MindmapId>

  touched: {
    owners: Set<NodeId>
    hierarchy: Set<NodeId>
    edgeNodes: Set<EdgeId>
    edgeAdjacencyNodes: Set<NodeId>
    groups: Set<GroupId>
    groupSignatures: Set<GroupId>
    snapNodes: Set<NodeId>
    frameNodes: Set<NodeId>
    spatialItems: Set<string>
    items: boolean
  }
}
```

约束：

- 这些 scope 全部由 `editor-graph` 本地生成。
- 不再要求 `engine` 发布对应关系 delta。
- 所有 patch 都必须只围绕 changed ids 及其必要 fanout 扩散。

## relation index 的性能规则

`editor-graph` 接管 relation 之后，允许做的只有：

- 增量维护 relation index
- 基于 changed ids patch relation index
- 基于 relation index 驱动 graph / spatial / query 更新

明确禁止：

- 在每次 `editor-graph.update(...)` 时全量重建 relation facts
- 把 `engine.buildFacts()` 原样搬到 `editor-graph`
- 在 query/read 调用时临时扫描 document 重建 relation
- 因为 session preview / hover / selection / tool 变化而重新分析 committed relation

也就是说，最终模型必须是：

- `engine publish` 到来时，`editor-graph` 依据 `previous + next + delta` patch 一次 relation index
- session / ui update 只消费既有 relation index，不重新构建 relation
- query 直接读取 `working` 中的 relation index

### relation phase 的触发边界

relation analysis 只允许由 document publish 触发：

- bootstrap
- reset
- entity delta
- order delta

以下输入不得触发 relation rebuild：

- draft
- preview
- edit
- hover
- selection
- marquee
- guides
- tool

这些输入如果影响 graph view，只能在现有 relation index 之上 patch overlay，不允许回到 raw document 再做结构分析。

### relation index 必须是 working state

relation 不是一次性计算结果，而是 `editor-graph.working` 的长期状态。

最终要求：

- ownership / hierarchy / edge adjacency / group signature 都存放在 `working`
- patch phase 只更新受影响的 key
- graph patch / spatial patch / query 全部直接依赖这些 index

不允许：

- `patchNode/patchEdge/patchGroup/patchMindmap` 自己再去扫全量 document 找关系
- `frame/snap/group exact` 在读时重新聚合关系
- React render 期间为了读取关系再做一次 normalize / compare / scan

### 复杂度目标

正常增量更新时，relation patch 的复杂度目标应为：

- ownership: `O(changed nodes)`
- edge endpoints / adjacency: `O(changed edges)`
- hierarchy: `O(changed mindmaps + affected nodes)`
- group items / signature: `O(changed groups + affected item refs)`
- order publish: `O(order delta affected items)`

只有以下场景允许全量构建：

- 首次 bootstrap
- 显式 reset

除此之外，任何普通 commit 都不允许退化为整份 document relation rebuild。

## `editor-graph` 需要如何从 raw document 推导 patch

### Node changed

基于 `previous.nodes[nodeId]` 与 `next.nodes[nodeId]` 直接比较，推导：

- node base / geometry 是否要 patch
- owner 是否变化
- 是否影响 group membership
- 是否影响 frame / snap / spatial
- 需要 fanout 哪些 edge / group / mindmap

### Edge changed

基于 `previous.edges[edgeId]` 与 `next.edges[edgeId]` 推导：

- edge route source/target 依赖是否变化
- endpoint node adjacency 是否变化
- group membership 是否变化
- spatial / items 是否变化

### Group changed

基于 `previous.groups[groupId]` 与 `next.groups[groupId]` 推导：

- group base 是否变化
- structure / signature 是否变化
- items publish 是否变化

### Mindmap changed

基于 `previous.mindmaps[mindmapId]` 与 `next.mindmaps[mindmapId]` 推导：

- members / parent-child hierarchy 是否变化
- connectors / layout / bbox 是否变化
- node subtree patch scope
- spatial / items fanout

### Order changed

只由 `canvas.order` 驱动：

- items reorder
- group item order
- spatial `all()` publish order

不允许在 query/read 阶段读时再修复顺序。

## `editor` 侧最终收敛

### 删除 `engine.query` 依赖

以下方向全部改为消费 `editor-graph`：

- interaction query
- selection query
- group query
- snap query
- frame query
- scene / items
- edge adjacency query

### committed raw document 的合法使用范围

保留在：

- write boundary / procedure
- import / export / serialize
- history / persistence
- 极低频命令型读

不允许再用于：

- pointer / drag / snap / hover 热路径
- React render 期间的结构读取
- scene / spatial / frame / group query

## 必改文件

### `whiteboard-engine`

- `whiteboard/packages/whiteboard-engine/src/contracts/document.ts`
- `whiteboard/packages/whiteboard-engine/src/runtime/engine.ts`
- `whiteboard/packages/whiteboard-engine/src/document/create.ts`
- `whiteboard/packages/whiteboard-engine/src/change/fromReduce.ts`
- 删除 `whiteboard/packages/whiteboard-engine/src/facts/*`
- 删除 `whiteboard/packages/whiteboard-engine/src/runtime/query.ts`
- 删除 / 改写 `whiteboard/packages/whiteboard-engine/test/query.test.ts`

### `whiteboard-editor-graph`

- `whiteboard/packages/whiteboard-editor-graph/src/contracts/editor.ts`
- `whiteboard/packages/whiteboard-editor-graph/src/contracts/working.ts`
- `whiteboard/packages/whiteboard-editor-graph/src/phases/graph.ts`
- `whiteboard/packages/whiteboard-editor-graph/src/runtime/graphPatch/fanout.ts`
- `whiteboard/packages/whiteboard-editor-graph/src/runtime/graphPatch/node.ts`
- `whiteboard/packages/whiteboard-editor-graph/src/runtime/graphPatch/edge.ts`
- `whiteboard/packages/whiteboard-editor-graph/src/runtime/graphPatch/group.ts`
- `whiteboard/packages/whiteboard-editor-graph/src/runtime/graphPatch/mindmap.ts`
- 新增 document analysis / index patch 相关模块

### `whiteboard-editor`

- `whiteboard/packages/whiteboard-editor/src/projection/input.ts`
- `whiteboard/packages/whiteboard-editor/src/projection/controller.ts`
- `whiteboard/packages/whiteboard-editor/src/document/read.ts`
- `whiteboard/packages/whiteboard-editor/src/read/*`
- `whiteboard/packages/whiteboard-editor/src/input/*`
- `whiteboard/packages/whiteboard-editor/src/editor/createEditor.ts`

## 实施顺序

### 阶段 1：先切掉 `engine` published read model

1. 改 `EngineSnapshot` 为 `{ revision, document }`。
2. 改 `EnginePublish.change` 为 `EnginePublish.delta`。
3. 删除 `Facts`、`EngineQuery`、`runtime/query.ts`。
4. 删除 `relations` 派生布尔位，只保留 raw entity delta。

### 阶段 2：让 `editor-graph` 接受前后 committed snapshot

1. `projection/controller` 在 engine publish 时同时传入 previous/next。
2. `editor-graph` input 改为 `document.previous / document.next / document.delta`。
3. 所有 `snapshot.state.facts.*` 读取点改为基于 raw document + local index。

### 阶段 3：在 `editor-graph` 内补齐结构索引

1. ownership index
2. hierarchy index
3. edge adjacency index
4. group items + signature index
5. snap query state

### 阶段 4：把 editor read/query 全部迁走

1. 删掉 `engine.query` 调用点。
2. 把 `document.read` 里的 interaction query 迁到 `editor-graph.query`。
3. committed raw read 仅保留低频边界用途。

### 阶段 5：清理旧实现

1. 删除 facts 相关目录与类型。
2. 删除 engine query tests。
3. 删除 editor/document/read 中已失去意义的 committed query helper。
4. 删除所有以“缺 graph 时 fallback 到 committed query”为目的的分支。

## 最终判断

`facts` 应该退出 `engine`。

而且不是只把 `facts` 挪走，真正正确的最终形态是：

- `engine` 退出 read 能力。
- `engine` 只保留 write + snapshot + delta。
- `editor-graph` 独占所有读取、索引、query、items publish。

这样才能彻底消除：

- commit 时构建 committed read model 的重复成本
- `engine facts` 与 `editor-graph indexes` 双重 authority
- interaction 热路径回落到 committed derived read 的结构性问题

这是长期最优边界，应直接作为最终落地方向执行。
