# `whiteboard-editor-graph` 阶段二 `graph patch / GraphDelta` 详细设计

## 1. 文档目标

这份文档只讨论迁移总文档里的阶段二：

> 引入 graph patch helpers 和 `GraphDelta`，  
> 让 graph 从“全量 build map”改成“patch touched entries”。

这里不讨论：

- `SpatialIndexState`
- `SpatialDelta`
- `PublishDelta`
- delta-aware publisher
- `scene -> spatial` 的查询切换

这份文档只回答一个问题：

> 在当前已经完成阶段一 `graph/ui` 拆层的前提下，  
> 阶段二的 runtime 内部状态、planner dirty scope、graph patch helper、`GraphDelta` API 应该长什么样。

---

## 2. 硬约束

这份设计继承迁移总文档里的前提：

- 单轨重构
- 不保兼容 facade
- 不保 old/new 双实现并行
- 允许重构中途暂时无法跑通

阶段二也继续遵守这一条：

> 不为了“中途还能运行”保留旧全量 graph build 路径。  
> 不为了“中途还能运行”再造一层 graph delta adapter。  
> 不为了“中途还能运行”做双轨 publish。

阶段二的基础前提也明确一下：

1. 阶段一已经完成。
2. `GraphSnapshot` 和 `UiSnapshot` 已经拆开。
3. React / editor read 的 presentation merge 已经就位。
4. 当前要解决的问题已经不是 graph/ui contract，而是 graph phase 仍然全量重建。

---

## 3. 阶段二要解决的核心问题

阶段一之后，当前代码已经有干净的 truth 分层，但 graph 更新链仍然有三个明显问题：

### 3.1 graph phase 仍然是全量重建

当前 `phases/graph.ts` 的行为本质上还是：

1. 扫全量 document nodes，重建 `GraphNodeEntry` map
2. 扫全量 document edges，重建 `GraphEdgeEntry` map
3. 扫全量 mindmaps，重算 layout / connectors
4. 扫全量 groups，重建 frame
5. 全量替换 `working.graph`

所以现在即使只是：

- 单节点 draft
- 单 edge label edit
- 单 mindmap tick
- 单 preview patch

graph 仍然会跑整图。

### 3.2 planner 只有“跑不跑”，没有“patch scope”

当前 runtime planner 已经支持 `dirty`，但 `whiteboard-editor-graph` 还没有真正使用它。

现在 planner 只表达：

- `graph`
- `ui`
- `scene`

要不要跑。

阶段二必须把它推进到：

- graph 要跑
- graph 这一轮到底 patch 哪些 node / edge / mindmap / group

### 3.3 还没有正式 `GraphDelta`

虽然阶段一已经把 UI 噪音清掉了，但 runtime 内部还没有一份正式的：

```ts
interface GraphDelta {
  order: boolean
  entities: ...
  geometry: ...
}
```

这意味着：

- graph patch 还不能给后续 spatial 提供干净下游
- geometry touched 还没有被显式登记
- 后面进入阶段三时，还得再从 graph patch 里补做一轮抽象

所以阶段二的第一性目标是：

> 不是先做 `SpatialIndex`，  
> 而是先让 graph 自己从全量 build 变成 patch，并在 patch 点顺手产出 `GraphDelta`。

---

## 4. 阶段二结束后的目标状态

阶段二结束后，应满足下面这条更新链：

```txt
InputDelta
  -> planner dirty tokens
  -> graph phase decode patch scope
  -> patch working.graph in place
       -> GraphDelta.entities
       -> GraphDelta.geometry
  -> ui / scene 仍按现有方式运行
  -> publisher 暂时仍可保持当前 compare-driven 实现
```

这里有三个关键边界：

1. graph 是上游，spatial 是下游。
2. 阶段二只把 graph patch 和 `GraphDelta` 建出来，不提前实现 spatial。
3. 阶段二允许 publisher 继续沿用当前 compare-driven 发布，但不能再保留旧 graph 全量 build 路径。

也就是说：

> 阶段二的核心产物不是新的对外 API，  
> 而是 runtime 内部 graph patch 能力，以及给阶段三使用的正式 `GraphDelta`。

---

## 5. 当前代码结构对阶段二意味着什么

先把当前 runtime 的几个事实写清楚：

### 5.1 `working` 是持久态，不是每次 update 新建

`@shared/projection-runtime` 会在 runtime 初始化时创建一次 `working`，之后每次 update 都把 phase 运行在同一个 `working` 上。

这意味着阶段二最自然的实现方式不是：

- 另起一份 graph 临时态
- 每轮 patch 完再拷回 `working`

而是：

> 直接 patch `working.graph` 本身。

### 5.2 当前 `working.graph` 已经是 `Map`

虽然 `contracts/working.ts` 目前把它声明成 `ReadonlyMap`，但实际 `createWorking()` 已经在放 `Map`。

阶段二不需要再起一个 `GraphRuntimeState` 做镜像，直接把 `working.graph` 正式改成可 patch 的内部 `Map` 状态即可。

### 5.3 当前 `buildNodeView / buildEdgeView / buildMindmapView / buildGroupView` 仍然可复用

阶段二的 patch 是“family entry 级 patch”，不是“对象字段级 patch”。

也就是说：

- touched node 仍然可以直接 `buildNodeView(...)`
- touched edge 仍然可以直接 `buildEdgeView(...)`
- touched mindmap 仍然可以直接重算这一棵 tree layout

阶段二真正要改的不是 view builder，而是：

- 只对 touched ids 调 builder
- 用 patch helper 写回 `working.graph`
- 在 patch 点记录 `GraphDelta`

---

## 6. 阶段二的状态与 contract 设计

## 6.1 `WorkingState` 要增加 per-update `graph delta` 槽

阶段二以后，`working` 里要显式带一份本轮 graph patch 的结果：

```ts
interface WorkingState {
  revision: {
    document: Revision
  }
  graph: GraphState
  ui: UiState
  scene: SceneSnapshot
  delta: {
    graph: MutableGraphDelta
  }
}
```

这里故意不直接把它做成完整 `UpdateDelta`，原因是：

- 阶段二只解决 graph patch
- spatial / publish delta 会在后续阶段进入
- 现在先把 `working.delta.graph` 位置定下来即可

### 6.2 `GraphState` 在 working 层改成可变 `Map`

推荐把 `contracts/working.ts` 的 graph state 改成下面这样：

```ts
interface GraphState {
  nodes: Map<NodeId, NodeView>
  edges: Map<EdgeId, EdgeView>
  owners: {
    mindmaps: Map<MindmapId, MindmapView>
    groups: Map<GroupId, GroupView>
  }
}
```

原因很简单：

- 这是 runtime 内部 patch 目标
- 它不是 published snapshot contract
- 没必要继续把内部 patch 目标伪装成只读

### 6.3 正式 `GraphDelta` contract

阶段二要正式落这一份类型：

```ts
interface GraphDelta {
  order: boolean
  entities: {
    nodes: IdDelta<NodeId>
    edges: IdDelta<EdgeId>
    mindmaps: IdDelta<MindmapId>
    groups: IdDelta<GroupId>
  }
  geometry: {
    nodes: ReadonlySet<NodeId>
    edges: ReadonlySet<EdgeId>
    mindmaps: ReadonlySet<MindmapId>
    groups: ReadonlySet<GroupId>
  }
}
```

这里的语义必须写死：

- `entities.*`
  - family entry add/update/remove
- `geometry.*`
  - 这一轮会影响 spatial record 的几何 truth
- `order`
  - 来自 document order/reset 的 graph 级顺序脏位

注意：

> `order` 不是 `GraphSnapshot` 里的字段，  
> 它只是 graph 向后续 spatial 传递的下游信号。

### 6.4 内部 builder 用 mutable 版本

运行时内部建议补一组 mutable 类型：

```ts
interface MutableIdDelta<TId extends string> {
  added: Set<TId>
  updated: Set<TId>
  removed: Set<TId>
}

interface MutableGraphDelta {
  order: boolean
  entities: {
    nodes: MutableIdDelta<NodeId>
    edges: MutableIdDelta<EdgeId>
    mindmaps: MutableIdDelta<MindmapId>
    groups: MutableIdDelta<GroupId>
  }
  geometry: {
    nodes: Set<NodeId>
    edges: Set<EdgeId>
    mindmaps: Set<MindmapId>
    groups: Set<GroupId>
  }
}
```

然后提供：

```ts
function resetGraphDelta(delta: MutableGraphDelta): void
function snapshotGraphDelta(delta: MutableGraphDelta): GraphDelta
```

阶段二里 `snapshotGraphDelta(...)` 暂时可以只服务测试和后续阶段接入，不要求先接进 publisher。

---

## 7. planner dirty 设计

阶段二必须把 runtime planner 的 `dirty` 能力用起来。

但这里有一个很重要的实现细节：

> `dirty` 是 `ReadonlySet<TDirty>`。  
> 如果 `TDirty` 用对象，会因为引用去重而失真。  
> 所以阶段二的 dirty token 必须用字符串，而不是对象。

## 7.1 `GraphDirtyToken`

推荐直接定义成：

```ts
type GraphDirtyToken =
  | 'reset'
  | 'order'
  | `node:${NodeId}`
  | `edge:${EdgeId}`
  | `mindmap:${MindmapId}`
  | `group:${GroupId}`
```

### 为什么用字符串 token

因为 planner 会做：

- `createPlan(...)`
- `mergePlans(...)`
- `fanoutDependents(...)`

这一路都天然适合 `Set<string>` 语义。

如果这里用对象 token，例如：

```ts
{ kind: 'node', id: 'n1' }
```

同一个语义 token 很容易在 plan merge 后因为引用不同而重复存在。

所以阶段二文档把这个约束直接写死：

> dirty token 用稳定字符串。  
> phase 内部再 parse 成结构化 scope。

## 7.2 `GraphPatchScope`

graph phase 在运行时要把 dirty token 解成结构化 scope：

```ts
interface GraphPatchScope {
  reset: boolean
  order: boolean
  nodes: ReadonlySet<NodeId>
  edges: ReadonlySet<EdgeId>
  mindmaps: ReadonlySet<MindmapId>
  groups: ReadonlySet<GroupId>
}
```

同时补一层内部可变队列：

```ts
interface GraphPatchQueue {
  nodes: Set<NodeId>
  edges: Set<EdgeId>
  mindmaps: Set<MindmapId>
  groups: Set<GroupId>
}
```

这里要区分：

- `GraphPatchScope`
  - planner 给 graph phase 的初始 seed
- `GraphPatchQueue`
  - graph phase 在 fanout 过程中不断追加的内部工作集

## 7.3 planner 到 graph scope 的映射

建议规则直接写死：

### `document.reset`

映射成：

```txt
'reset'
```

graph phase 收到以后按“全量 scope”处理，这是 reset 的正常语义，不算保留旧 fallback。

### `document.order`

映射成：

```txt
'order'
```

### `document.nodes.*`

映射成：

```txt
`node:${id}`
```

### `document.edges.*`

映射成：

```txt
`edge:${id}`
```

### `document.mindmaps.*`

映射成：

```txt
`mindmap:${id}`
```

### `document.groups.*`

映射成：

```txt
`group:${id}`
```

### `graph.nodes.{draft,preview,edit}`

全部映射成：

```txt
`node:${id}`
```

### `graph.edges.{preview,edit}`

全部映射成：

```txt
`edge:${id}`
```

### `graph.mindmaps.{preview,tick}`

全部映射成：

```txt
`mindmap:${id}`
```

这里故意不把原因编码进 token，原因是：

- 阶段二的 graph patch 只需要知道“谁 touched”
- 不需要先做基于 reason 的多套 patch 分支
- 真的需要 reason 的地方，可以直接读 `input.delta`

## 7.4 planner 行为

阶段二之后，planner 仍然保持当前 phase 规划逻辑：

- `graph` 变了就跑 graph
- graph 变化 fanout 到 `ui` / `scene`
- 纯 ui 变化只跑 ui
- 纯 viewport 变化只跑 scene

但 graph 的 plan 要附上 dirty：

```ts
createPlan({
  phases: new Set(['graph']),
  dirty: new Map([
    ['graph', graphDirtyTokens]
  ])
})
```

`ui` 和 `scene` 在阶段二仍然不需要 phase-level dirty token。

---

## 8. graph patch helper 设计

阶段二要补的是“小粒度 patch 原语”，不是自动语义引擎。

也就是说：

- helper 只负责 patch `Map`、维护 delta
- 领域语义仍然写在 graph phase 自己手里

## 8.1 `patchFamilyEntry`

最核心的原语是：

```ts
type PatchAction = 'unchanged' | 'added' | 'updated' | 'removed'

function patchFamilyEntry<TId extends string, TValue>(input: {
  family: Map<TId, TValue>
  id: TId
  next: TValue | undefined
  isEqual: (left: TValue, right: TValue) => boolean
  delta: MutableIdDelta<TId>
}): PatchAction
```

语义：

- `next === undefined`
  - 删除现有 entry
- family 中原本没有，且 `next` 存在
  - `added`
- family 中原本有，且 `isEqual(prev, next) === false`
  - `updated`
- family 中原本有，且 `isEqual(prev, next) === true`
  - `unchanged`

这个 helper 只做一件事：

> patch map entry，并把 add/update/remove 写进对应 `MutableIdDelta`。

它不决定 geometry，也不决定 fanout。

## 8.2 `patchOrderedIds`

阶段二同时补一个稳定数组 helper：

```ts
function patchOrderedIds<TValue>(input: {
  previous: readonly TValue[] | undefined
  next: readonly TValue[]
  isEqual?: (left: TValue, right: TValue) => boolean
}): readonly TValue[]
```

语义：

- 如果前后顺序和值都一致，返回 `previous` 引用
- 否则返回 `next`

阶段二里它的用途主要是：

- `MindmapView.structure.nodeIds`
- `GroupView.structure.items`
- 后续若需要稳定 route points / handles / labels，也可复用

但这里要强调：

> `patchOrderedIds` 只是“稳定引用 helper”，  
> 不是“自动 delta 推断 helper”。

## 8.3 `markAdded / markUpdated / markRemoved`

推荐显式暴露这组低层 helper：

```ts
function markAdded<TId extends string>(delta: MutableIdDelta<TId>, id: TId): void
function markUpdated<TId extends string>(delta: MutableIdDelta<TId>, id: TId): void
function markRemoved<TId extends string>(delta: MutableIdDelta<TId>, id: TId): void
```

有些场景不一定走 `patchFamilyEntry`，例如：

- 先做 queue/fanout，再决定 remove
- 某些辅助结构需要先手动登记 lifecycle

这组 helper 保证 delta 写法统一。

## 8.4 `markGeometryTouched`

geometry touched 单独收敛：

```ts
function markGeometryTouched<TId extends string>(
  target: Set<TId>,
  id: TId
): void
```

它只做一件事：

- 把 id 加到 `graph.delta.geometry.*`

geometry 的定义不在 helper 中，而在各 entity patcher 中显式写死。

---

## 9. graph phase 的 patch 上下文

阶段二不建议把 `phases/graph.ts` 再写成一个大函数，而是拆成显式 patch context。

推荐内部语义结构：

```ts
interface GraphPatchContext {
  input: Input
  working: WorkingState
  scope: GraphPatchScope
  queue: GraphPatchQueue
  delta: MutableGraphDelta
}
```

这里：

- `input`
  - 当前 update 的输入
- `working.graph`
  - 本轮 patch 目标
- `scope`
  - planner seed
- `queue`
  - graph phase fanout 工作集
- `delta`
  - 本轮 graph patch 的输出

### 为什么阶段二不单独引 `GraphRuntimeState`

因为当前 runtime 已经有持久 `working`。

如果再额外引一层：

- `runtime.graphState`
- `working.graph`

就会变成重复状态。

阶段二不需要这个复杂度，直接 patch `working.graph` 即可。

---

## 10. graph phase 的总体执行顺序

阶段二建议固定成下面这条顺序：

```txt
decode dirty -> reset graph delta
  -> seed queue from scope
  -> pre-fanout from document relations
  -> patch non-mindmap nodes
  -> patch touched mindmaps
  -> patch member nodes affected by changed mindmap layout
  -> patch touched edges
  -> patch touched groups
```

这里故意不用“自动 fanout 图框架”，而是保留一条显式的领域顺序。

### 为什么顺序是这样

因为依赖关系本身就是单向的：

```txt
node input seed
  -> may affect mindmap layout
  -> final node geometry
  -> edge geometry
  -> group frame
```

更准确地说：

- 非 mindmap-owned node 可以直接 patch
- touched mindmap 要先得到新 layout
- mindmap member node 的最终 rect 要等 owner mindmap layout
- edge 要等 node geometry 稳定
- group 要等 node / mindmap 几何稳定

所以阶段二不做通用递归 fanout，而是固定成这条向前流水线。

---

## 11. 每类 entity 的 patch 规则

## 11.1 `patchNode(nodeId)`

### 输入来源

- `document.snapshot.state.facts.entities.nodes`
- `document.snapshot.state.facts.relations.nodeOwner`
- `input.session.draft.nodes`
- `input.session.preview.nodes`
- `input.session.edit`
- 如果 owner 是 mindmap，再读 `working.graph.owners.mindmaps`

### patch 规则

#### 节点已不存在

如果 document 中已经没有这个 node：

1. 从 `working.graph.nodes` 删除
2. `delta.entities.nodes.removed.add(nodeId)`
3. `delta.geometry.nodes.add(nodeId)`

这里 remove 也算 geometry touched，因为它会影响后续 spatial record remove。

#### 节点仍存在

直接复用现有 `buildNodeView(...)` 生成 next。

然后：

```txt
patchFamilyEntry(nodes, nodeId, next, isNodeViewEqual, delta.entities.nodes)
```

### 什么时候算 `geometry.nodes` touched

节点 geometry touched 的判定必须显式写死成：

- 新增
- 删除
- `rotation` 变化
- `geometry.rect` 变化
- `geometry.bounds` 变化

换句话说：

- `base.node` 里 style/text 变化但 rect/bounds/rotation 不变
  - 只记 `entities.nodes.updated`
  - 不记 `geometry.nodes`

### 节点 patch 后的 fanout

如果 node geometry touched：

1. fanout 到 related edges
2. fanout 到包含该 node 的 groups

如果 node owner 是 mindmap：

- 不在 node patch 后直接重算 owner mindmap
- 而是在 seed 阶段就先把 owner mindmap 放入 queue

这样可避免 mindmap-owned node 用到旧 tree rect。

## 11.2 `patchMindmap(mindmapId)`

### 输入来源

- `document.snapshot.state.facts.entities.owners.mindmaps`
- `document.snapshot.state.facts.relations.ownerNodes.mindmaps`
- `input.session.preview.mindmap`
- `input.measure.text.nodes`
- `input.clock.now`

### patch 规则

阶段二仍然允许一棵 touched mindmap 先整体重算 layout / connectors。

也就是说，当前 `readMindmapEntries(...)` 的大部分逻辑可以保留，但只对 touched `mindmapId` 调一次。

然后直接：

```txt
patchFamilyEntry(mindmaps, mindmapId, next, isMindmapViewEqual, delta.entities.mindmaps)
```

### 什么时候算 `geometry.mindmaps` touched

mindmap geometry touched 的判定直接写死成：

- 新增
- 删除
- `tree.layout` 变化
- `tree.bbox` 变化
- `render.connectors` 变化

### mindmap patch 后如何 fanout member nodes

阶段二最关键的一步是：

> mindmap 自己可以整体重算，  
> 但不能因此把所有 node 重新 patch 一遍。

所以要补一个显式 helper：

```ts
function diffMindmapMemberNodes(input: {
  previous: MindmapView | undefined
  next: MindmapView | undefined
}): ReadonlySet<NodeId>
```

规则：

- add/remove
  - fanout 全体 member node ids
- layout node rect 变化
  - 只 fanout rect 真变的 node ids
- `structure.nodeIds` 变化
  - fanout 新增/删除的 member node ids

这样即使 mindmap layout 是整棵重算，后续 node patch 仍然可以做到只 patch 真正受影响的成员。

### mindmap patch 后的 group fanout

如果 mindmap geometry touched：

- fanout 到包含该 `CanvasItemRef { kind: 'mindmap', id }` 的 group

当前 engine facts 没有 item -> group 的反向索引。

所以阶段二允许这里先反扫：

```txt
snapshot.state.facts.relations.groupItems
```

这不是长期最优，但它仍然比整图重建 graph 更窄，也符合阶段二目标。

## 11.3 `patchEdge(edgeId)`

### 输入来源

- `document.snapshot.state.facts.entities.edges`
- `document.snapshot.state.facts.relations.edgeNodes`
- `input.session.preview.edges`
- `input.session.edit`
- `input.measure.text.edgeLabels`
- `working.graph.nodes`

### patch 规则

直接复用现有 `buildEdgeView(...)`，但只对 queued `edgeId` 调。

然后：

```txt
patchFamilyEntry(edges, edgeId, next, isEdgeViewEqual, delta.entities.edges)
```

### 什么时候算 `geometry.edges` touched

edge geometry touched 的判定写死成：

- 新增
- 删除
- `route.points` 变化
- `route.svgPath` 变化
- `route.bounds/source/target/ends` 变化
- `route.handles` 变化
- `route.labels` 的几何字段变化
- `box` 变化

这里不需要在 helper 里自动推断，直接在 `patchEdge(...)` 内显式 compare。

### edge patch 后的 fanout

阶段二里 edge 不再向 graph 内部继续 fanout。

因为：

- edge 是 graph geometry 的叶子
- 它的下游是后续阶段三的 spatial record

## 11.4 `patchGroup(groupId)`

### 输入来源

- `document.snapshot.state.facts.entities.owners.groups`
- `document.snapshot.state.facts.relations.groupItems`
- `working.graph.nodes`
- `working.graph.owners.mindmaps`

### patch 规则

直接复用现有 `buildGroupView(...)`，但只对 queued `groupId` 调。

然后：

```txt
patchFamilyEntry(groups, groupId, next, isGroupViewEqual, delta.entities.groups)
```

### 什么时候算 `geometry.groups` touched

group geometry touched 的判定写死成：

- 新增
- 删除
- `frame.bounds` 变化

`structure.items` 变化但 bounds 没变时：

- 只记 `entities.groups.updated`
- 不记 `geometry.groups`

---

## 12. fanout 规则

阶段二至少把下面这些 fanout 规则显式写进 graph phase。

## 12.1 seed 阶段 fanout

### node seed

任意来源导致 `node:${id}` 进入 scope 时：

1. 如果 owner 是 mindmap
   - queue owner mindmap
2. queue related edges
3. queue containing groups

这里 related edges 可以直接复用 engine query/facts 的关系数据，不再靠全量 edge 扫描推出来。

### edge seed

`edge:${id}` 只 queue edge 本身，不反向 fanout node。

### mindmap seed

`mindmap:${id}` 先 queue mindmap 本身。

后续 member node fanout 由 `patchMindmap(...)` 自己决定。

### group seed

`group:${id}` 只 queue group 本身。

## 12.2 geometry 阶段 fanout

### node geometry touched

当 `delta.geometry.nodes` 里新增一个 `nodeId`：

1. queue related edges
2. queue containing groups

### mindmap geometry touched

当 `delta.geometry.mindmaps` 里新增一个 `mindmapId`：

1. queue changed member nodes
2. queue containing groups

### edge geometry touched

阶段二里不再向 graph 内部继续 fanout。

### group geometry touched

阶段二里 group 是 graph patch 末端，不再向 graph 内部继续 fanout。

## 12.3 为什么阶段二不做自动 fanout 推导

因为这里的 fanout 不是纯图算法问题，而是白板领域语义：

- node 改了是否一定影响 owner mindmap
- mindmap layout 变了应该 fanout 哪些成员 node
- group 反扫是否可接受

这些都不应该被藏进自动 infra。

阶段二只允许：

- 小粒度 patch helper 复用
- fanout 规则继续手写

---

## 13. graph phase 的推荐伪代码

推荐把 `phases/graph.ts` 收敛成下面这类 orchestrator：

```ts
run(context) {
  const scope = readGraphPatchScope(context.input, context.dirty)
  const patch = createGraphPatchContext(context, scope)

  resetGraphDelta(patch.delta)
  seedGraphPatchQueue(patch)
  preFanoutSeeds(patch)

  patchStandaloneNodes(patch)
  patchMindmaps(patch)
  patchMindmapMemberNodes(patch)
  patchEdges(patch)
  patchGroups(patch)

  patch.working.revision.document = context.input.document.snapshot.revision
  return { action: 'sync' }
}
```

这里的关键不是函数名，而是这三个结构约束：

1. graph phase patch `working.graph`，不是重建临时 graph map。
2. `GraphDelta` 在 patch 点直接写，不做 phase 后 diff。
3. fanout 顺序固定，不引入通用自动系统。

---

## 14. 与 `ui` / `scene` / publisher 的关系

## 14.1 `ui` phase 不需要改 contract

阶段二不改：

- `UiSnapshot`
- `NodeUiView`
- `EdgeUiView`
- editor read / React presentation API

它们只继续消费 graph truth 即可。

## 14.2 `scene` phase 暂时不接 `GraphDelta`

阶段二不引入 `SpatialIndexState`，所以：

- `scene` 仍然可以维持当前实现
- 但 graph phase 必须把 `GraphDelta` 放进 `working.delta.graph`

因为阶段三会直接消费它。

## 14.3 publisher 暂时可维持当前实现

阶段二不要求马上改 publisher。

也就是说：

- `publisher.ts` 暂时仍可继续用当前 compare-driven family publish
- 但 `GraphDelta` 不能缺席

这里要避免的不是“继续用当前 publisher”，而是：

- 新增一条 delta-aware publisher
- 同时保留旧 compare publisher 做双轨对照

阶段二不做双轨。

---

## 15. 文件落位建议

推荐在 `whiteboard-editor-graph` 内新增下面这些文件：

```txt
src/contracts/delta.ts

src/runtime/graphPatch/
  dirty.ts
  delta.ts
  helpers.ts
  fanout.ts
  node.ts
  edge.ts
  mindmap.ts
  group.ts
```

并改动：

```txt
src/contracts/working.ts
src/runtime/createWorking.ts
src/runtime/planner.ts
src/phases/graph.ts
```

### 各文件职责

#### `contracts/delta.ts`

放：

- `GraphDelta`
- `MutableGraphDelta`
- `MutableIdDelta`
- `GraphDirtyToken`
- `GraphPatchScope`

#### `runtime/graphPatch/delta.ts`

放：

- `createMutableGraphDelta`
- `resetGraphDelta`
- `snapshotGraphDelta`
- `markAdded / markUpdated / markRemoved`
- `markGeometryTouched`

#### `runtime/graphPatch/dirty.ts`

放：

- token encode / decode
- `readGraphPatchScope(...)`

#### `runtime/graphPatch/helpers.ts`

放：

- `patchFamilyEntry`
- `patchOrderedIds`

#### `runtime/graphPatch/fanout.ts`

放：

- `seedGraphPatchQueue`
- `fanoutNodeGeometry`
- `fanoutMindmapGeometry`
- `collectContainingGroups`

#### `runtime/graphPatch/{node,edge,mindmap,group}.ts`

放各 entity patcher。

#### `phases/graph.ts`

只保留 orchestrator，不再塞全部实现细节。

---

## 16. 阶段二完成标准

阶段二完成时，应满足下面这些结果：

1. planner 会给 `graph` phase 传正式 dirty token。
2. graph phase 不再扫全量 family，而是只 patch scope + fanout 后的 ids。
3. `working.graph` 被原地 patch，不再每轮整图重建后整体替换。
4. `working.delta.graph` 每轮都能稳定产出 `GraphDelta`。
5. `GraphDelta.entities.*` 和 `GraphDelta.geometry.*` 都在 patch 点顺手写出。
6. 单节点 draft / preview / edit 不再触发整图 graph rebuild。
7. 单 edge preview / label edit 不再触发整图 graph rebuild。
8. 单 `mindmap tick` 至少只会重算该 mindmap，并只 patch受其 layout 影响的 member nodes，而不是整图 node/edge/group。
9. 不保留旧全量 graph build 路径作为 fallback。
10. 不新增 old/new 双轨 publisher。

---

## 17. 这一阶段故意不解决什么

为了把范围收住，阶段二明确不解决：

- `SpatialIndexState`
- `SpatialDelta`
- scene visible 走正式 spatial query
- publisher 增量发布
- query 热路径从 document list 切到 spatial
- group item 反向关系索引优化

尤其最后一条要明确：

如果阶段二为了 group fanout 需要临时反扫：

```txt
relations.groupItems
```

这是允许的。

因为阶段二的目标是：

> 先让 graph patch 从整图重建变成 family entry patch，  
> 并把 `GraphDelta.geometry` 建出来给下游用。

group fanout 的进一步索引化，属于后续阶段再做的事。

---

## 18. 最终结论

阶段二最核心的设计，不是“把 graph phase 写得更快一点”，而是确立下面这条结构约束：

1. planner 给 graph 的不是布尔值，而是正式 dirty scope。
2. graph patch 的目标是持久 `working.graph`，不是临时整图重建。
3. `GraphDelta` 是 patch 副产物，不是 patch 后 diff 产物。
4. graph fanout 规则继续手写，不交给自动推断系统。
5. 阶段二结束后，spatial 仍未落地，但 graph 已经正式成为 spatial 的上游。

用一句话总结：

> 阶段一解决的是 truth 边界；  
> 阶段二解决的是 graph 如何按 touched scope 做 patch，并把 `GraphDelta` 正式写出来。
