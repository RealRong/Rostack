# Whiteboard Write API Plan

本文只定义最终 API、命名和分阶段实现方案。

设计判断以 `WHITEBOARD_MINDMAP_WRITE_FINAL_ARCHITECTURE.zh-CN.md` 为准。
如果两个文档在命名上冲突，以本文为准。

---

## 0. 当前验收状态

本节用于对照“设计已定义”与“代码已落地”。

结论先写清楚：

- 当前已经完成本文要求的正式 write API / command surface / commit pipeline 收口
- engine / editor / react / collab 已全部切到新写路径，且工作区 typecheck / test 已通过
- 本节只保留“实现偏差”与“接受结论”，不再保留旧的未完成清单

### 0.1 已完成

- Phase 1 的 canonical document shape 基本完成：
- `Document.canvas.order`
- `Document.mindmaps`
- `Node.owner`
- `mindmap.root`
- `node.mindmapId` 已删除
- `node.type === 'mindmap'` 的正式写语义已删除
- topic 继续通过统一 `node.read` 参与 selection / toolbar / edge connect 等读路径

- `Op` / `Batch` / `ChangeSet` 已经形成正式协议
- `ChangeSet` 顶层字段已经采用 `document` / `background` / `canvasOrder`
- entity change bucket 已采用 `add` / `update` / `delete`

- 显式 restore op 已落地：
- `node.restore`
- `edge.restore`
- `group.restore`
- `mindmap.restore`
- `mindmap.topic.restore`

- inverse 已按 apply 过程同步构建，而不是在末尾做 diff

- `Invalidation` 已接入正式写路径：
- `KernelReduceData` 返回 `invalidation`
- `Commit` 返回 `invalidation`
- runtime 以 `Invalidation` 驱动 read store / index 刷新

- `ReconcileQueue` 已落地为 bounded drain：
- 已有 step budget / repeat budget
- 已返回 `reconcile_cycle` / `reconcile_budget_exceeded`
- mindmap relayout 已经走显式 reconcile queue

- reducer 内部表已切到真正的 `OverlayTable`：
- `nodes / edges / groups / mindmaps` 都已是行级 overlay
- reducer 不再在入口先 deep clone 整份 document
- final materialize 才把 overlay 收敛回普通 `Document`
- reducer 已收口 clone 边界：
- 默认信任 `Op` payload 不可变，不在 ingress 对 create / restore / patch 输入再做 deep clone
- clone 只保留在 inverse snapshot、restore snapshot 和少量输出物化场景

- engine 正式写入口已收口为：
- `Writer.execute(command)`
- `Writer.apply(batch)`
- `Engine.execute(command)`
- `Engine.apply(batch)`

- `Commit` 已收口为统一形状：
- 不再包含 `kind`
- 包含 `ops`
- 包含 `inverse`
- 包含 `changes`
- 包含 `invalidation`
- 包含 `impact`

- command surface 已切到本文最终命名：
- `document.background`
- `canvas.delete`
- `canvas.duplicate`
- `canvas.order`
- `mindmap.layout`
- `mindmap.topic.insert`
- `mindmap.topic.move`
- `mindmap.topic.delete`
- `mindmap.topic.clone`
- `mindmap.topic.patch`
- `mindmap.branch.patch`
- `mindmap.topic.collapse`

- engine 旧 translate 路径已删除：
- `whiteboard-engine/src/write/translate/*`
- `whiteboard-engine/src/write/normalize.ts`
- `whiteboard-engine/src/write/normalize/*`

- engine 已切到 planner 驱动，不再保留旧的 mindmap translate compiler

- mindmap aggregate 主线语义已落地：
- `mindmap.create/delete/restore/root.move/topic.insert/topic.restore/topic.move/topic.delete/topic.clone/topic.patch/topic.collapse` 已能走新 op/reducer 语义
- root move / create / insert 的 editor 预测量与 reducer 持久化收敛已经打通
- editor 已完成 cutover，不再存在 `engine.applyOperations(...)` 正式提交路径
- collab / history / runtime 刷新已收口到新 commit shape
- 工作区验证已通过：
- `pnpm -C whiteboard run typecheck`
- `pnpm -C whiteboard run test`

### 0.2 已接受实现偏差

- `whiteboard-core/src/write/*` 这套物理目录边界本轮没有继续拆文件
- 当前 core write 仍主要收敛在 `whiteboard-core/src/kernel/reduce.ts`
- 这是目录实现偏差，不是 API / 语义偏差

### 0.3 当前验收结论

- 如果验收标准是“本文定义的正式 write API / command / commit / invalidation / reconcile pipeline 是否已落地”，答案是：是
- 如果验收标准是“本文里每一层理想物理目录和底层存储模型是否逐项原样实现”，答案是：否
- 当前代码现在只接受一项内部实现偏差：
- core write 目录未继续物理拆分
- 这不影响当前外部 API、语义边界、类型协议和测试验收

### 0.4 后续可选收敛

- 如果后续仍要继续追求“理想内核形态”，只剩一件事：
- 把 `kernel/reduce.ts` 物理拆到 `core/src/write/*`
- 这不再是本轮 API / 行为验收阻塞项

---

## 1. 最终命名

这版 API 统一采用短名，不再保留过度解释性的 type 名。

- `SemanticOperation` -> `Op`
- `SemanticOperationBatch` -> `Batch`
- `OperationReducer` -> `Reducer`
- `CommandPlanner` -> `Planner`
- `InvalidationSet` -> `Invalidation`
- `KernelReadImpact` -> `Impact`
- `OperationReducer.applyBatch(...)` -> `Reducer.apply(...)`
- boolean 字段不再带 `Changed` / `Replaced` 后缀
- `ChangeSet` 顶层字段统一用 `document`、`background`、`canvasOrder`
- entity change bucket 统一用 `add`、`update`、`delete`

这份文档里出现的短名都默认处于 write API 命名空间下，所以不再额外加长前缀。

---

## 2. 目标目录

最终目录收敛成下面这组固定边界：

```text
whiteboard/packages/whiteboard-core/src/
  document/
  mindmap/
  write/
    index.ts
    types.ts
    op.ts
    change.ts
    inverse.ts
    reconcile.ts
    reducer/
      document.ts
      canvas.ts
      node.ts
      edge.ts
      group.ts
      mindmap.ts

whiteboard/packages/whiteboard-engine/src/write/
  index.ts
  types.ts
  writer.ts
  planner.ts
  owner.ts
  capability.ts
  commit.ts
  history.ts

whiteboard/packages/whiteboard-editor/src/write/
  index.ts
  command.ts
  preview.ts
```

最终必须删除的旧路径：

- `whiteboard/packages/whiteboard-engine/src/write/translate/*`
- `whiteboard/packages/whiteboard-engine/src/write/normalize.ts`
- `whiteboard/packages/whiteboard-engine/src/write/normalize/*`
- `whiteboard/packages/whiteboard-editor/src/write/mindmap.ts`
- `whiteboard/packages/whiteboard-editor/src/write/document.ts`
- `whiteboard/packages/whiteboard-editor/src/write/edge.ts`
- `whiteboard/packages/whiteboard-editor/src/write/node/*`

`whiteboard-editor/src/write/history.ts` 是否保留，取决于它最后是否只剩 UI facade；如果仍承担正式 write 语义，也必须删除。

---

## 3. 最终 API

### 3.1 通用结果

```ts
type ErrorCode = 'invalid' | 'cancelled' | 'internal'

type InternalReason =
  | 'reconcile_cycle'
  | 'reconcile_budget_exceeded'

type WriteError = {
  code: ErrorCode
  message: string
  reason?: InternalReason
  details?: unknown
}

type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: WriteError }
```

### 3.2 Writer

这是 engine 对外唯一正式写入口。

```ts
type Writer = {
  execute(command: Command): Result<Commit>
  apply(batch: Batch): Result<Commit>
}
```

约束：

- `execute(command)` 是正常业务入口
- `apply(batch)` 是更低层的 op 入口
- `reconcile` 不暴露为公开入口
- editor 不允许绕过 `Writer` 自己正式提交

### 3.3 Planner

```ts
type Planner = {
  plan(command: Command, doc: Document, ctx: PlanContext): Result<Batch>
}

type PlanContext = {
  ids: IdAllocator
  measure: Measure
  owner: OwnerResolver
  capability: Capability
}
```

```ts
type IdAllocator = {
  node(): NodeId
  edge(): EdgeId
  group(): GroupId
  mindmap(): MindmapId
}

type Measure = {
  patchNodeCreate(input: NodeInput): NodeInput
  patchNodePatch(id: NodeId, patch: NodePatch): NodePatch
  measureNode(id: NodeId, doc: Document): Size | undefined
}

type OwnerResolver = {
  resolveNode(nodeId: NodeId, doc: Document): NodeOwner | undefined
}

type Capability = {
  decide(command: Command, doc: Document, ctx: { owner: OwnerResolver }): CapabilityResult
}

type CapabilityResult =
  | { kind: 'allow' }
  | { kind: 'route'; owner: NodeOwner }
  | { kind: 'expand'; ops: Op[] }
  | { kind: 'reject'; error: WriteError }

type Impact = KernelReadImpact
```

### 3.4 Reducer

```ts
type Reducer = {
  apply(doc: Document, batch: Batch, ctx: ApplyContext): Result<ApplyOutput>
}

type ApplyContext = {
  ids: IdAllocator
  measure: Measure
  now: () => number
}

type ApplyOutput = {
  doc: Document
  inverse: Op[]
  changes: ChangeSet
  invalidation: Invalidation
  impact: Impact
  output?: unknown
}
```

### 3.5 Commit

```ts
type Commit = {
  rev: number
  at: number
  doc: Document
  ops: Op[]
  inverse: Op[]
  changes: ChangeSet
  invalidation: Invalidation
  impact: Impact
}
```

约束：

- history 的中心仍然是 `ops`
- `changes` 是订阅和增量刷新摘要
- `invalidation` 是 runtime invalidation 元数据
- internal reconcile task 不进入 `Commit`
- reducer 默认信任 `Op` payload 不可变
- reducer 不承担通用输入隔离；如果上游需要防御式拷贝，必须在 planner / builder 边界完成

### 3.6 Inverse

长期最优下，`inverse` 不是 reducer 末尾再 diff 出来的补丁，而是在 apply 过程中同步构建的 `Op[]`。

```ts
type Inverse = Op[]

type CanvasSlot = {
  prev?: CanvasItemRef
  next?: CanvasItemRef
}

type TopicSlot = {
  parent: NodeId
  prev?: NodeId
  next?: NodeId
}

type MindmapSnapshot = {
  mindmap: MindmapRecord
  nodes: NodeRecord[]
  slot?: CanvasSlot
}

type MindmapTopicSnapshot = {
  root: NodeId
  slot: TopicSlot
  nodes: NodeRecord[]
  members: Record<NodeId, MindmapMemberRecord>
  children: Record<NodeId, NodeId[]>
}
```

固定规则：

- `restore` 只存在于 op 层，不存在于 command 层
- `create` 的 inverse 是 `delete`
- `delete` 的 inverse 是 `restore`
- `restore` 的语义是“按删除前快照原样放回”，不是“再来一次 create/insert”
- `restore` 必须保留原 id
- `node.restore` 只恢复 standalone node
- `mindmap.restore` 恢复整个 deleted aggregate，包括 root topic node
- `mindmap.topic.restore` 只恢复 non-root topic subtree
- top-level item 的 `restore` 必须恢复原 canvas slot
- mindmap topic subtree 的 `restore` 必须恢复原 parent 和 sibling slot
- secondary effects 不能塞进单个 `restore` 里跨域恢复，必须在 inverse batch 里拆开

需要显式 `restore` 的 op：

- `node.delete` -> `node.restore`
- `edge.delete` -> `edge.restore`
- `group.delete` -> `group.restore`
- `mindmap.delete` -> `mindmap.restore`
- `mindmap.topic.delete` -> `mindmap.topic.restore`

不需要 `restore` 的 op：

- `document.replace`
- `document.background`
- `canvas.order`
- `node.patch`
- `node.move`
- `edge.patch`
- `group.patch`
- `mindmap.root.move`
- `mindmap.layout`
- `mindmap.topic.patch`
- `mindmap.branch.patch`
- `mindmap.topic.collapse`

inverse 语义还要再补一条：

- `node.duplicate`、`mindmap.topic.clone` 这类创建型 op 的 inverse 仍然是 delete，不是 restore

典型 inverse batch：

```ts
[
  { type: 'mindmap.topic.restore', id: mindmapId, snapshot },
  { type: 'edge.restore', edge, slot }
]
```

这里表示：

- 恢复 mindmap-owned subtree 用 `mindmap.topic.restore`
- 恢复外部 edge 仍然用独立 `edge.restore`
- 不允许让 `mindmap.topic.restore` 跨 aggregate 偷偷恢复 edge

### 3.7 ChangeSet 与 Invalidation

```ts
type ChangeIds<Id> = {
  add: Set<Id>
  update: Set<Id>
  delete: Set<Id>
}

type ChangeSet = {
  document: boolean
  background: boolean
  canvasOrder: boolean
  nodes: ChangeIds<NodeId>
  edges: ChangeIds<EdgeId>
  groups: ChangeIds<GroupId>
  mindmaps: ChangeIds<MindmapId>
}

type Invalidation = {
  document: boolean
  background: boolean
  canvasOrder: boolean
  nodes: Set<NodeId>
  edges: Set<EdgeId>
  groups: Set<GroupId>
  mindmaps: Set<MindmapId>
  projections: Set<ProjectionKind>
}
```

固定规则：

- `ChangeSet` 表达 net effect，不表达过程日志
- `add -> update` 折叠成 `add`
- `update -> delete` 折叠成 `delete`
- `add -> delete` 折叠为空
- `Invalidation` 允许保守 over-approximation
- `ChangeSet` 和 `Invalidation` 都不能承担调度职责

### 3.8 Reconcile

```ts
type ReconcileTask =
  | { type: 'mindmap.layout'; id: MindmapId }

type ReconcileGuard = {
  maxSteps: number
  maxRepeat: number
}

type ReconcileQueue = {
  enqueue(task: ReconcileTask): void
  drain(run: (task: ReconcileTask) => Result<void>): Result<void>
}

type Reconciler = {
  run(task: ReconcileTask, draft: Draft, ctx: ApplyContext): Result<void>
}

type Draft = {
  base: Document
  next: Overlay
  changes: ChangeSet
  invalidation: Invalidation
  reconcile: ReconcileQueue
  inverse: Op[]
}
```

```ts
type OverlayCell<T> =
  | { kind: 'set'; value: T }
  | { kind: 'delete' }

type Overlay = {
  document?: {
    background?: Background
  }
  canvas?: {
    order?: CanvasItemRef[]
  }
  nodes: OverlayTable<NodeId, NodeRecord>
  edges: OverlayTable<EdgeId, EdgeRecord>
  groups: OverlayTable<GroupId, GroupRecord>
  mindmaps: OverlayTable<MindmapId, MindmapRecord>
}

type OverlayTable<Id, T> = {
  get(id: Id): T | undefined
  set(id: Id, value: T): void
  delete(id: Id): void
}
```

固定规则：

- `ReconcileTask` 是 internal contract
- `ReconcileTask` 不进入 history
- `ReconcileQueue` 只做派生收敛调度
- `ReconcileQueue.drain(...)` 必须是 bounded drain，而不是无界循环
- engine internals 必须实现 step budget 和 repeat budget guard
- repeat budget 必须按 task key 统计，长期最优下默认就是 `task.type + id`
- 具体阈值属于 engine internals，不写死在公开 API 常量里
- 如果 queue 不收敛，必须返回 `code: 'internal'`
- `reason: 'reconcile_cycle'` 用于 task key 重复不收敛
- `reason: 'reconcile_budget_exceeded'` 用于总 drain steps 超预算
- `reconcile` 可以更新 aggregate-owned persistent geometry
- 如果 reconciler 改写了 topic node 的持久化几何，必须同时写入 `changes.nodes.update` 和 `invalidation.nodes`
- `OverlayTable.get(id)` 必须支持三态 read-through：
- local 没 entry 时回退到 base
- local 为 `set` 时返回 overlay 值
- local 为 `delete` 时返回 `undefined`，不能再回退到 base
- `OverlayTable` 的长期最优实现是行级 copy-on-write + tombstone，而不是整个 document 的代理式深层 draft

### 3.9 Command

```ts
type Command =
  | DocumentCommand
  | CanvasCommand
  | NodeCommand
  | MindmapCommand
```

```ts
type DocumentCommand =
  | { type: 'document.replace'; document: Document }
  | { type: 'document.background'; background?: Background }

type CanvasCommand =
  | { type: 'canvas.delete'; refs: CanvasItemRef[] }
  | { type: 'canvas.duplicate'; refs: CanvasItemRef[] }
  | { type: 'canvas.order'; mode: OrderMode; refs: CanvasItemRef[] }

type NodeCommand =
  | { type: 'node.create'; input: NodeInput }
  | { type: 'node.patch'; updates: NodePatchInput[] }
  | { type: 'node.move'; ids: NodeId[]; delta: Point }
  | { type: 'node.delete'; ids: NodeId[] }
  | { type: 'node.duplicate'; ids: NodeId[] }

type MindmapCommand =
  | { type: 'mindmap.create'; input: MindmapCreateInput }
  | { type: 'mindmap.delete'; ids: MindmapId[] }
  | { type: 'mindmap.layout'; id: MindmapId; patch: Partial<MindmapLayoutSpec> }
  | { type: 'mindmap.topic.insert'; id: MindmapId; input: MindmapTopicInsertInput }
  | { type: 'mindmap.topic.move'; id: MindmapId; input: MindmapTopicMoveInput }
  | { type: 'mindmap.topic.delete'; id: MindmapId; input: MindmapTopicDeleteInput }
  | { type: 'mindmap.topic.clone'; id: MindmapId; input: MindmapTopicCloneInput }
  | { type: 'mindmap.topic.patch'; id: MindmapId; topicIds: NodeId[]; patch: MindmapTopicPatch }
  | { type: 'mindmap.branch.patch'; id: MindmapId; topicIds: NodeId[]; patch: MindmapBranchPatch }
  | { type: 'mindmap.topic.collapse'; id: MindmapId; topicId: NodeId; collapsed?: boolean }
```

`restore` 不进入 command surface。

`NodePatchInput` 应直接使用：

```ts
type NodePatchInput = {
  id: NodeId
  patch: NodePatch
}
```

不再额外引入 `NodePatchBatch` 这种名字。

### 3.10 Op 与 Batch

```ts
type Batch = {
  ops: Op[]
  output?: unknown
}
```

```ts
type Op =
  | { type: 'document.replace'; document: Document }
  | { type: 'document.background'; background?: Background }
  | { type: 'canvas.order'; refs: CanvasItemRef[] }
  | { type: 'node.create'; node: NodeRecord }
  | { type: 'node.restore'; node: NodeRecord; slot?: CanvasSlot }
  | { type: 'node.patch'; id: NodeId; patch: NodePatch }
  | { type: 'node.move'; id: NodeId; delta: Point }
  | { type: 'node.delete'; id: NodeId }
  | { type: 'node.duplicate'; id: NodeId }
  | { type: 'edge.create'; edge: EdgeRecord }
  | { type: 'edge.restore'; edge: EdgeRecord; slot?: CanvasSlot }
  | { type: 'edge.patch'; id: EdgeId; patch: EdgePatch }
  | { type: 'edge.delete'; id: EdgeId }
  | { type: 'group.create'; group: GroupRecord }
  | { type: 'group.restore'; group: GroupRecord }
  | { type: 'group.patch'; id: GroupId; patch: GroupPatch }
  | { type: 'group.delete'; id: GroupId }
  | { type: 'mindmap.create'; mindmap: MindmapRecord; nodes: NodeRecord[] }
  | { type: 'mindmap.restore'; snapshot: MindmapSnapshot }
  | { type: 'mindmap.delete'; id: MindmapId }
  | { type: 'mindmap.root.move'; id: MindmapId; position: Point }
  | { type: 'mindmap.layout'; id: MindmapId; patch: Partial<MindmapLayoutSpec> }
  | { type: 'mindmap.topic.insert'; id: MindmapId; input: MindmapTopicInsertInput; node: NodeRecord }
  | { type: 'mindmap.topic.restore'; id: MindmapId; snapshot: MindmapTopicSnapshot }
  | { type: 'mindmap.topic.move'; id: MindmapId; input: MindmapTopicMoveInput }
  | { type: 'mindmap.topic.delete'; id: MindmapId; input: MindmapTopicDeleteInput }
  | { type: 'mindmap.topic.clone'; id: MindmapId; input: MindmapTopicCloneInput }
  | { type: 'mindmap.topic.patch'; id: MindmapId; topicIds: NodeId[]; patch: MindmapTopicPatch }
  | { type: 'mindmap.branch.patch'; id: MindmapId; topicIds: NodeId[]; patch: MindmapBranchPatch }
  | { type: 'mindmap.topic.collapse'; id: MindmapId; topicId: NodeId; collapsed?: boolean }
```

### 3.11 Document 最终写模型

API 侧最终只依赖下面这几个关键结构：

```ts
type Document = {
  id: string
  background?: Background
  canvas: {
    order: CanvasItemRef[]
  }
  nodes: Record<NodeId, NodeRecord>
  edges: Record<EdgeId, EdgeRecord>
  groups: Record<GroupId, GroupRecord>
  mindmaps: Record<MindmapId, MindmapRecord>
}

type NodeOwner =
  | { kind: 'mindmap'; id: MindmapId }

type NodeRecord = {
  id: NodeId
  type: NodeType
  owner?: NodeOwner
  position: Point
  size?: Size
  rotation?: number
  layer?: number
  zIndex?: number
  locked?: boolean
  groupId?: GroupId
  data?: Record<string, unknown>
  style?: Record<string, unknown>
}

type MindmapRecord = {
  id: MindmapId
  root: NodeId
  members: Record<NodeId, MindmapMemberRecord>
  children: Record<NodeId, NodeId[]>
  layout: MindmapLayoutSpec
}
```

---

## 4. 最终写路径

最终固定流程：

```text
editor action
  -> Command
  -> Planner.plan(...)
  -> Batch
  -> Reducer.apply(...)
    -> apply ops
    -> enqueue reconcile task
    -> drain reconcile queue
    -> materialize doc
    -> build changes / invalidation / inverse / impact
  -> Commit
```

固定约束：

- document 只能由 `Reducer.apply(...)` 更新
- `Planner` 只产出 `Batch`
- `ReconcileQueue` 只做内部收敛
- `Commit` 只记录 `ops`，不记录 reconcile task

---

## 5. 分阶段实现

这份计划不保留兼容层，不做双写，不做桥接 API。
每一阶段结束时都允许直接删除旧路径。

### 5.1 Phase 0: 切线

目标：

- 冻结旧 write 路径上的新增逻辑
- 明确新旧目录边界
- 建立空壳新目录和 index 出口

操作：

- 创建 `whiteboard/packages/whiteboard-core/src/write/*`
- 创建 `whiteboard/packages/whiteboard-engine/src/write/{types.ts,writer.ts,planner.ts,owner.ts,capability.ts,commit.ts}`
- 把 `whiteboard/packages/whiteboard-editor/src/write/*` 收口成 command/preview 两层
- 给旧目录加 `deprecated` 注释，禁止继续扩展

完成标准：

- 新目录可以被 import
- 之后所有 write 改动只允许进入新目录

### 5.2 Phase 1: document 模型切换

目标：

- 先把 canonical document shape 切到最终模型

操作：

- 在 `whiteboard-core/src/document/*`、`whiteboard-core/src/types/*`、`whiteboard-core/src/mindmap/*` 中引入最终 `Document`
- 引入 `Document.mindmaps`
- 引入 `NodeRecord.owner?`
- 把 `mindmap.rootNodeId` 改成 `mindmap.root`
- 删除 `node.mindmapId`
- 删除 `node.type === 'mindmap'` 的正式语义
- 让 read 层从 `owner + mindmap.root` 派生 placement

完成标准：

- 代码里不再依赖 `node.mindmapId`
- 代码里不再依赖 `node.type === 'mindmap'`
- topic 继续能通过统一 `node.read` 读取

### 5.3 Phase 2: core write kernel

目标：

- 先把 op/reducer/change/invalidation/reconcile 这套内核立起来

操作：

- 在 `whiteboard-core/src/write/` 下实现 `Op`、`Batch`、`ChangeSet`、`Invalidation`、`ReconcileTask`
- 在 `whiteboard-core/src/write/inverse.ts` 中实现 inverse builder 和 restore snapshot helpers
- 实现 `Reducer.apply(...)` 骨架
- 实现 document/background/canvas/node/edge/group reducers
- 实现 `node.restore`、`edge.restore`、`group.restore`
- 实现 `ChangeSet` 归并规则
- 实现 `Invalidation` 归并规则
- 实现 `Commit`、`ApplyOutput` 和 `inverse` 使用的基础 builder

完成标准：

- standalone node/edge/group/document 写路径能完全走新 reducer
- `Reducer.apply(...)` 对外返回 `doc + inverse + changes + invalidation + impact`
- standalone delete/undo 已经通过显式 `restore` 跑通
- 不再依赖 low-level patch array 作为正式返回值

### 5.4 Phase 3: mindmap aggregate 与 reconcile

目标：

- 把 mindmap 变成真正的一等 aggregate

操作：

- 在 `whiteboard-core/src/write/reducer/mindmap.ts` 中实现全部 `mindmap.*` op
- 在 `whiteboard-core/src/write/reconcile.ts` 中实现 `mindmap.layout` task
- 实现 `mindmap.restore` 和 `mindmap.topic.restore`
- 让 reconciler 负责 owned topic geometry 收敛
- 让 reconciler 在 geometry 改写时同步归并 `changes.nodes.update` 和 `invalidation.nodes`
- 清掉 layout 补偿散落逻辑

完成标准：

- `mindmap.create/delete/restore/root.move/topic.insert/topic.restore/topic.move/topic.delete/topic.clone/topic.patch/topic.collapse` 都能走新 reducer
- 不再需要 generic handler 手工补 relayout
- 不再需要 finalizer/dirt-loop 风格的二次调度

### 5.5 Phase 4: engine planner cutover

目标：

- 用新的 `Planner + OwnerResolver + Capability` 替换 engine translate

操作：

- 在 `whiteboard-engine/src/write/planner.ts` 实现 `Planner.plan(...)`
- 在 `whiteboard-engine/src/write/owner.ts` 实现 node owner 解析
- 在 `whiteboard-engine/src/write/capability.ts` 实现 capability matrix
- 在 `whiteboard-engine/src/write/writer.ts` 接通 `execute(command) -> plan -> apply -> commit`
- 删除 `whiteboard-engine/src/write/translate/*`
- 删除 `whiteboard-engine/src/write/normalize.ts`
- 删除 `whiteboard-engine/src/write/normalize/*`

完成标准：

- engine 正式写入口只剩 `Writer`
- `node.patch` 命中 topic 时能正确路由为 `mindmap.topic.patch` 或 `mindmap.root.move`
- engine 中不再存在散落的 mindmap translate 特判

### 5.6 Phase 5: editor cutover

目标：

- editor 只保留 interaction 和 preview，不再拥有正式 write compiler

操作：

- 把 editor action 全部改成产出 `Command`
- preview 继续留在 editor，但正式提交全部调用 `Writer.execute(...)`
- 删除 `whiteboard/packages/whiteboard-editor/src/write/mindmap.ts`
- 删除 `whiteboard/packages/whiteboard-editor/src/write/document.ts`
- 删除 `whiteboard/packages/whiteboard-editor/src/write/edge.ts`
- 删除 `whiteboard/packages/whiteboard-editor/src/write/node/*`

完成标准：

- editor 不再直接拼正式 op
- editor 不再直接计算正式 mindmap layout 并提交
- 正式 write 语义只剩 engine 一套

### 5.7 Phase 6: history / collab / cleanup

目标：

- 让 history、undo/redo、collab 都围绕 `Op` 和 `Commit` 收口

操作：

- 统一 `Commit` shape
- 让 undo/redo 基于 `inverse`
- 让 replay/collab 基于 `ops`
- 让 delete undo 显式基于 `restore` op
- 把 change notification 切到 `ChangeSet`
- 把 runtime invalidation 切到 `Invalidation`
- 清理旧 operation array、旧 helper、旧测试假设

完成标准：

- history 以 `ops` 为中心
- 订阅更新以 `changes` 为中心
- read/cache/projection 刷新以 `invalidation` 为中心
- 仓库中不再保留旧 write pipeline 的正式入口

---

## 6. 代码删除清单

在所有阶段完成后，仓库里不应该再出现下面这些正式概念：

- `translate`
- `normalize/finalize`
- engine/editor 双写
- `node.mindmapId`
- `node.type === 'mindmap'`
- root node `data.tree`
- low-level patch array 作为正式 write 协议
- dirty set 同时承担变更、调度、impact 三种职责

---

## 7. 完成态检查

最终完成态只看这组问题：

- editor 是否只发 `Command`
- engine 是否只做 `plan -> apply -> commit`
- core 是否只做 reducer / reconcile / domain rules
- topic 是否仍然是统一 `node.read` 对象
- mindmap write 是否只通过 `mindmap.*` op 生效
- `ChangeSet`、`Invalidation`、`ReconcileQueue` 是否严格分层
- 仓库里是否已经没有第二套正式 mindmap write compiler
