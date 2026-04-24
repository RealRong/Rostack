# Shared Mutation / Delta 底层设施长期方案

本文综合研究 Dataview 与 Whiteboard 中 operation、change、dirty、impact、delta、publish 相关逻辑，目标是判断哪些能力可以整体下沉到 `shared/core` 或已有 `shared/projection-runtime`，形成长期复用的底层设施。

重点参考文件：

- Dataview
  - `dataview/packages/dataview-core/src/operation/reducer.ts`
  - `dataview/packages/dataview-core/src/operation/executeOperation.ts`
  - `dataview/packages/dataview-core/src/contracts/commit.ts`
  - `dataview/packages/dataview-core/src/commit/impact.ts`
  - `dataview/packages/dataview-engine/src/core/delta.ts`
  - `dataview/packages/dataview-engine/src/active/publish/delta.ts`
- Whiteboard
  - `whiteboard/packages/whiteboard-core/src/kernel/reduce/types.ts`
  - `whiteboard/packages/whiteboard-core/src/kernel/reduce/runtime.ts`
  - `whiteboard/packages/whiteboard-core/src/kernel/reduce/tx.ts`
  - `whiteboard/packages/whiteboard-core/src/kernel/reduce/commit.ts`
  - `whiteboard/packages/whiteboard-engine/src/change/fromReduce.ts`
  - `whiteboard/packages/whiteboard-editor-graph/src/contracts/delta.ts`
  - `whiteboard/packages/whiteboard-editor-graph/src/runtime/graphPatch/delta.ts`
  - `whiteboard/packages/whiteboard-editor-graph/src/runtime/graphPatch/scope.ts`
  - `whiteboard/packages/whiteboard-editor-graph/src/runtime/publisher.ts`
- Shared
  - `shared/core/src/set.ts`
  - `shared/core/src/collection.ts`
  - `shared/projection-runtime/src/publish/change.ts`
  - `shared/projection-runtime/src/publish/family.ts`
  - `shared/projection-runtime/src/dirty/plan.ts`

## 总体结论

可以下沉，而且值得下沉。但不应该把 Dataview 的 `CommitImpact` 或 Whiteboard 的 `ChangeSet/Invalidation` 原样抽成公共类型。它们包含领域语义，不能直接复用。

真正应该下沉的是这些“结构性、代数性、事务性”的底层能力：

1. `KeySet`：支持 `none/some/all` 的集合代数。
2. `IdChangeSet` / `EntityChangeSet`：统一 `add/update/remove` 的净变更规则。
3. `EntityDelta`：统一 `order/set/remove/reset` 的 source patch 语义。
4. `MutationTraceBuilder`：领域无关的 mutation trace 累加器。
5. `MutationTransaction`：领域 reducer 的通用 transaction 骨架。
6. `PlanningContext`：action/command 编译为 operations 的通用上下文。
7. `IssueCollector` / `ValidationContext`：统一校验、问题收集、fail-fast/collect-all。
8. `OperationBuffer` / `InverseBuilder`：统一 operations 与 inverse 队列。
9. `ReadWorkspace`：统一 transaction-local 读取、require、capture、memo。
10. `PatchScope` / `PhaseScope`：带 `reset/all/some` 语义的局部重算范围。
11. `PublishedFamilyDelta`：发布快照时同时产出复用结果与 delta。
12. `SourcePatchApplier` / `SyncContext`：统一 snapshot delta 到外部 source/sink 的应用。
13. `MetricsCollector`：统一 phase timing、running stat、trace 汇总。

领域层仍应保留：

- Dataview 的 record/value/field/view 语义。
- Whiteboard 的 node/edge/group/mindmap/canvas/projection 语义。
- 各自的 invalidation 推导规则、历史 footprint、锁校验、视图计划、空间索引规则。

换句话说，`shared/core` 提供“变更代数”和“事务容器”，项目提供“领域解释器”。

## 阶段 1 当前状态（2026-04-24）

阶段 1 已经按“不保留兼容层”的标准收敛到最终态：

- `shared/core/changeSet` 已固定为 canonical-only 模型：`added/updated/removed`。
- Whiteboard 的 `ChangeIds`、`markChange`、`createChangeIds` 已删除。
- Whiteboard reducer、engine 初始 change、engine change 转换已统一切到 `IdChangeSet`。
- Whiteboard Editor Graph 已直接复用 shared `changeSet`，不再保留本地 mark helper。
- Whiteboard `dirty` API 已收敛为 `touch()` 语义；`node/edge` 不再伪造 `geometry/value` 两套同义入口。
- Whiteboard `Invalidation.projections` 已删除；projection 需求改为提交阶段按需推导，而不是在 reducer 内维护一份死字段。
- Whiteboard Editor Graph `GraphPatchScope` 已切到 shared `KeySet` 语义，不再手写局部 set merge/clone 规则。
- Whiteboard Engine / Editor Graph 的 `IdDelta` 已与 shared `IdChangeSet` 对齐；graph patch / spatial / publish 直接复用 `changeSet.create/reset/assign/hasAny/touched/mark*`。
- Whiteboard Engine `changeFromReduce` 已删除本地 `toIdDelta/hasIdChange`；直接复用 `changeSet.clone/hasAny`。
- Whiteboard Editor Graph `publish/ui` 已删除本地 `markUi*` 薄包装；UI phase 直接写 `changeSet.mark*` 与布尔标记。
- 本文后续若出现旧命名或旧包装，属于历史分析，不再建议保留。

## 阶段 2 当前状态（2026-04-24）

阶段 2 已完成 `planning/compiler context` 合流，且不保留旧基础设施分叉：

- `shared/core` 新增 `planningContext`，统一承载 `read + issueCollector + operationBuffer`。
- Dataview planner 不再自己维护 `issues[] + finish(...ops)` 的底层状态；其 `PlannerScope` 现在只是基于 shared `planningContext` 的领域包装，保留 `resolveTarget` 这类 Dataview 专属辅助。
- Whiteboard compiler 不再自己维护 `ops[] + fail-fast throw` 的底层状态；`createCompilerTx` 现在基于 shared `planningContext` 的 `fail-fast` 模式构建。
- Dataview 的 `ValidationIssue` 已与 shared `ValidationIssue<TCode, TSource>` 对齐，动作位置信息收敛为 `issue.source`，不再维持一套平铺字段模型。
- Whiteboard compiler 的 `emit` / `emitMany` 与 `fail.invalid/cancelled` 已统一落在 shared context 上，compiler tx 只保留 Whiteboard 领域读模型和 id 分配器。

这一步的本质不是“抽一个共同父接口”而已，而是把两边共同的三件事彻底下沉：

1. 读取上下文承载；
2. operation 累积；
3. collect / fail-fast 两种问题处理模式。

因此，后续无论是 Dataview 的 action planner，还是 Whiteboard 的 command compiler，都不应该再各自维护一份 `issues/ops/fail` 生命周期状态机；新增场景直接复用 shared `planningContext`。

## 阶段 3 当前状态（2026-04-24）

阶段 3 已完成 `reduce / mutation context` 合流：

- `shared/core` 新增 `mutationContext`，统一承载 `base + current + inverse + working` 的 mutation 生命周期。
- Dataview 已新增 `DocumentMutationContext`，`applyOperations` 与 `reduceOperations` 不再经过 `executeOperation` 入口，而是通过 `reduceOperation(context, operation)` 驱动。
- Dataview 的旧 `executeOperation.ts` 已退出入口层；操作级副作用逻辑收敛到 `operation/mutation.ts`，公共入口改为 `operation.createContext + operation.reduce.*`。
- Whiteboard `ReduceRuntime` 已改为基于 shared `mutationContext` 创建，`inverse` 不再是裸数组，而是 shared `InverseBuilder`。
- Whiteboard `ReducerTx` 已提升出显式 `tx.inverse` API；各 reducer handler 不再直接操作 `_runtime.inverse.unshift(...)`。
- Whiteboard commit 阶段只消费 `tx.inverse.finish()`，不再泄漏底层 inverse 存储实现。

这一步完成后，两边在 mutation 生命周期上的共同底层已经统一为：

1. base/current 状态承载；
2. inverse builder；
3. working/trace 附属状态。

剩余差异已基本只剩领域层：

- Dataview 的 `CommitImpact` 规则与 record/field/view 语义；
- Whiteboard 的 `draft/changes/dirty/history/reconcile` 规则与 node/edge/group/mindmap 语义。

## 当前重复模式

### 1. add/update/remove 净变更规则重复

Dataview 当前在 `executeOperation.ts` 中手写抵消逻辑：

- record insert 后 remove：删除 inserted 并清理 patched/touched。
- record remove 后 insert：删除 removed 并 mark touched。
- field put/remove、view put/remove 都有类似逻辑。

Whiteboard 原先在 `whiteboard-core/src/kernel/reduce/commit.ts` 中有 `markChange`：

```ts
add    => delete.delete(id); update.delete(id); add.add(id)
update => 如果不在 add/delete 中，则 update.add(id)
delete => 如果 add.delete(id) 成功则抵消，否则 update.delete(id); delete.add(id)
```

Editor Graph 也在 `graphPatch/delta.ts` 中重复实现：

```ts
markAdded
markUpdated
markRemoved
```

这三处本质相同：维护一个 id 的 transaction 内净状态。

应下沉为 `shared/core/changeSet`：

```ts
interface IdChangeSet<TId> {
  added: Set<TId>
  updated: Set<TId>
  removed: Set<TId>
}

const idChangeSet = {
  create<TId>(): IdChangeSet<TId>
  reset<TId>(set: IdChangeSet<TId>): void
  markAdded<TId>(set: IdChangeSet<TId>, id: TId): void
  markUpdated<TId>(set: IdChangeSet<TId>, id: TId): void
  markRemoved<TId>(set: IdChangeSet<TId>, id: TId): void
  hasAny<TId>(set: IdChangeSet<TId>): boolean
  touched<TId>(set: IdChangeSet<TId>): ReadonlySet<TId>
  clone<TId>(set: IdChangeSet<TId>): IdChangeSet<TId>
}
```

命名上建议用 `added/updated/removed`，避免 Whiteboard 的 `add/update/delete` 与 Graph 的 `added/updated/removed` 分裂。

### 2. `Set<T> | 'all'` 与 reset/scope 语义重复

Dataview 的 `CommitImpact` 多处使用：

```ts
Set<T> | 'all'
```

Whiteboard Editor Graph 的 `GraphPatchScope` 使用：

```ts
reset: boolean
nodes: ReadonlySet<NodeId>
edges: ReadonlySet<EdgeId>
...
```

`shared/projection-runtime` 也有 `Plan` 和 phase scope，但 scope 内容本身仍由项目手写。

这些都在表达同一类概念：本次变更影响全部、部分、还是没有影响。

应下沉为 `shared/core/keySet`：

```ts
type KeySet<TKey> =
  | { kind: 'none' }
  | { kind: 'some'; keys: ReadonlySet<TKey> }
  | { kind: 'all' }

const keySet = {
  none<TKey>(): KeySet<TKey>
  all<TKey>(): KeySet<TKey>
  some<TKey>(keys: Iterable<TKey>): KeySet<TKey>
  add<TKey>(set: KeySet<TKey>, key: TKey): KeySet<TKey>
  addMany<TKey>(set: KeySet<TKey>, keys: Iterable<TKey>): KeySet<TKey>
  union<TKey>(...sets: readonly KeySet<TKey>[]): KeySet<TKey>
  subtract<TKey>(set: KeySet<TKey>, keys: Iterable<TKey>): KeySet<TKey>
  has<TKey>(set: KeySet<TKey>, key: TKey): boolean
  intersects<TKey>(left: KeySet<TKey>, right: KeySet<TKey>): boolean
  isEmpty<TKey>(set: KeySet<TKey>): boolean
  materialize<TKey>(set: KeySet<TKey>, allKeys: readonly TKey[]): readonly TKey[]
}
```

之后：

- Dataview 的 `touched?: Set<T> | 'all'` 改为 `KeySet<T>`。
- GraphPatchScope 的 `reset + nodes/edges/...` 可以改为每个 bucket 使用 `KeySet<T>`，或者顶层 reset 吸收所有 bucket。
- Projection runtime 的 phase scope 可以约定使用 `KeySet` 作为推荐局部 scope 类型。

### 3. `CollectionDelta` / `ListedDelta` / `IdDelta` / `GraphDelta` 语义分裂

Dataview 有：

```ts
CollectionDelta<Key> { list?: true; update?: Key[]; remove?: Key[] }
KeyDelta<Key>        { update?: Key[]; remove?: Key[] }
ListedDelta<Key>     { ids?: true; update?: Key[]; remove?: Key[] }
```

Whiteboard engine 有：

```ts
IdDelta<TId> { added: Set<TId>; updated: Set<TId>; removed: Set<TId> }
```

Whiteboard Editor Graph 有：

```ts
GraphDelta {
  order: boolean
  entities: { nodes: IdDelta<NodeId>; ... }
  geometry: { nodes: Set<NodeId>; ... }
}
```

这些类型混合了两种不同层次：

- mutation/change 层：`added/updated/removed`。
- source apply 层：`order/set/remove`。

长期应明确分层：

```ts
// transaction/change 层
interface IdChangeSet<TId> {
  added: Set<TId>
  updated: Set<TId>
  removed: Set<TId>
}

// source patch 层
interface EntityDelta<TKey> {
  order?: true
  set?: readonly TKey[]
  remove?: readonly TKey[]
}
```

`update` 建议在 source patch 层改名为 `set`，因为新增和更新对消费者都是“按当前 snapshot 读取并 set”。

公共 builder：

```ts
const entityDelta = {
  fromChangeSet<TKey>(input: {
    changes: IdChangeSet<TKey>
    includeAdded?: boolean
    includeUpdated?: boolean
    order?: boolean
  }): EntityDelta<TKey> | undefined

  fromSnapshots<TKey, TValue>(input: {
    previousIds: readonly TKey[]
    nextIds: readonly TKey[]
    previousGet: (key: TKey) => TValue | undefined
    nextGet: (key: TKey) => TValue | undefined
    equal?: (left: TValue, right: TValue) => boolean
  }): EntityDelta<TKey> | undefined

  normalize<TKey>(delta: EntityDelta<TKey>): EntityDelta<TKey> | undefined
}
```

这样 Dataview 的 `buildListedDelta`、`buildValueDelta` 返回结构，Whiteboard Graph 的 `IdDelta` 转换，Active source 的 `CollectionDelta` 都可以用同一套规则。

### 4. reducer transaction 模式 Dataview 与 Whiteboard 可统一

Whiteboard 已经有较成熟的 `ReducerTx`：

- `read`：读 draft。
- `node/edge/group/mindmap/document/collection`：写领域对象。
- `_runtime.changes`：记录 add/update/delete。
- `_runtime.dirty`：记录 invalidation。
- `_runtime.inverse`：记录 undo。
- `commit.result()`：产出 doc、changes、invalidation、inverse、impact。

Dataview 目前分裂为：

- `reduceOperation`：只返回 doc。
- `executeOperation`：重新执行 operation，并维护 inverse + `CommitImpact`。

这说明 Whiteboard 的 `ReducerTx` 方向是对的，但它的类型和实现目前强绑定 Whiteboard 领域。

应下沉通用 transaction 骨架到 `shared/core/mutation`，领域层配置 bucket 和 writer：

```ts
interface MutationRuntime<TDocument, TTrace, TInverse> {
  base: TDocument
  draft: unknown
  trace: TTrace
  inverse: TInverse
  working: unknown
}

interface MutationContext<TDocument, TTrace, TInverse, TRead, TWrite> {
  runtime: MutationRuntime<TDocument, TTrace, TInverse>
  read: TRead
  write: TWrite
  commit(): MutationCommit<TDocument, TTrace, TInverse>
}

interface MutationCommit<TDocument, TTrace, TInverse> {
  document: TDocument
  trace: TTrace
  inverse: TInverse
}
```

注意：`shared/core` 不应知道 node/edge/record/field。它只提供 runtime 生命周期、builder 模式、change-set 代数、overlay draft 的可选基础。

Dataview 可以实现：

```ts
DocumentMutationContext = MutationContext<
  DataDoc,
  DataviewMutationTrace,
  DocumentOperation[],
  DataviewReadApi,
  DataviewWriteApi
>
```

Whiteboard 可以逐步把 `ReducerTx` 内部的 `ChangeIds`、dirty set、inverse append、overlay table 收敛到 shared primitives，但保留领域 API 名称。

### 5. overlay draft / working set 也有下沉价值

Whiteboard 的 `DraftDocument` 使用 `OverlayTable`：

```ts
base + overlay table -> materialize
```

Dataview 当前直接调用不可变 `documentApi`，但随着 `DocumentMutationContext` 引入，也会需要 `working` 缓存：

- before record/field/view 的 capture。
- indexOf / ids 的缓存。
- 本 transaction 中更新后的实体读。
- materialize next doc。

可下沉一个轻量 `OverlayMap` / `DraftTable`：

```ts
interface OverlayMap<TKey, TValue> {
  get(key: TKey): TValue | undefined
  set(key: TKey, value: TValue): void
  delete(key: TKey): void
  has(key: TKey): boolean
  changedKeys(): ReadonlySet<TKey>
  removedKeys(): ReadonlySet<TKey>
  materialize(): ReadonlyMap<TKey, TValue>
}
```

是否放入 `shared/core` 需要谨慎：如果只 Whiteboard 大量使用，可以先保留在 whiteboard；但如果 Dataview 重构后也需要事务 draft，应该下沉。

### 6. publish family 已经在 `shared/projection-runtime`，但缺少 delta 产物

Whiteboard Editor Graph 已使用：

```ts
publishFamily
publishValue
createFlags
createIds
```

Dataview Active Delta 仍有自己的：

```ts
buildKeyedCollectionDelta
createCollectionDelta
```

`publishFamily` 当前返回：

```ts
{
  value,
  ids: Ids<TKey>,
  changed,
  action
}
```

它表达“哪些 id changed”，但没有直接产出 source apply 所需的 `EntityDelta`：

```ts
{ order?: true; set?: keys; remove?: keys }
```

建议扩展 `shared/projection-runtime`，而不是放 `shared/core`：

```ts
publishEntityFamily(input): {
  value: Family<TKey, TValue>
  change: IdChangeSet<TKey>
  delta?: EntityDelta<TKey>
  action: Action
}
```

这样：

- Whiteboard Editor Graph publisher 可以少写 `GraphDelta` 手工转换。
- Dataview `projectActiveDelta` 的 fields/sections/items/summaries 可以统一走 publish delta。
- Dataview `projectDocumentDelta` 的 listed/value delta 可以复用 `entityDelta` builder。

## 建议下沉模块

### `shared/core/src/keySet.ts`

职责：`none/some/all` 集合代数。

适用：

- Dataview `CommitImpact.touched` / future `MutationTrace` scope。
- Whiteboard graph patch scope。
- Projection runtime phase scope。
- 任意 reset/all/some invalidation 表达。

不包含领域 bucket 名称。

### `shared/core/src/changeSet.ts`

职责：transaction 内 id 净变更。

提供：

- `IdChangeSet<TId>`。
- `create/reset/markAdded/markUpdated/markRemoved/hasAny/touched/clone/assign`。
- 可选 `EntityChangeSet<TKey, TPatch>`，用于带 patch/aspect 的 updated。

已替代：

- Whiteboard `ChangeIds` + `markChange` 的基础实现。
- Whiteboard Editor Graph `IdDelta` mark helpers。
- Dataview inserted/removed/patched 抵消逻辑的一部分。

### `shared/core/src/entityDelta.ts`

职责：source patch 层的统一 delta。

提供：

```ts
interface EntityDelta<TKey> {
  order?: true
  set?: readonly TKey[]
  remove?: readonly TKey[]
}
```

以及 `fromChangeSet/fromSnapshots/normalize/merge`。

替代：

- Dataview `CollectionDelta`、`KeyDelta`、`ListedDelta` 的结构与 builder。
- Whiteboard editor graph id delta 到 source apply delta 的转换。
- 各项目重复的空 delta 清理和 remove 覆盖 set 逻辑。

### `shared/core/src/mutationTrace.ts`

职责：领域无关 trace bucket builder。

建议设计为泛型 bucket，而不是固定 records/nodes：

```ts
type BucketName = string

interface MutationTraceBucket<TKey, TPatch = unknown> {
  changes: IdChangeSet<TKey>
  patches: Map<TKey, TPatch>
  touched: KeySet<TKey>
}

interface MutationTraceBuilder<TBuckets extends Record<string, unknown>> {
  bucket<TKey, TPatch>(name: string): MutationTraceBucket<TKey, TPatch>
  reset(): void
  finish(): MutationTrace<TBuckets>
}
```

领域层再包装：

```ts
trace.records.patch(recordId, ['title'])
trace.nodes.geometry(nodeId)
```

### `shared/core/src/mutationTx.ts`

职责：通用 reducer transaction 生命周期。

提供：

- 创建 runtime。
- 管理 `base/draft/trace/inverse/working`。
- commit/finalize 钩子。
- 不包含领域读写 API。

Whiteboard 可以保留 `ReducerTx` 外观，但内部使用 shared tx primitives。

Dataview 可以新建 `DocumentMutationContext`，直接基于 shared tx primitives。

### `shared/core/src/operationBuffer.ts`

职责：统一 operation 累积、inverse 累积与队列顺序。

Dataview planner 返回 `operations`，Whiteboard command compiler 使用 `emit(op)`，reducer 内部又大量 `inverse.unshift(...)`。这些都可以拆成两个无领域模型：

```ts
interface OperationBuffer<TOp> {
  emit(op: TOp): void
  emitMany(ops: readonly TOp[]): void
  isEmpty(): boolean
  finish(): readonly TOp[]
}

interface InverseBuilder<TOp> {
  prepend(op: TOp): void
  prependMany(ops: readonly TOp[]): void
  append(op: TOp): void
  finish(): readonly TOp[]
}
```

收益：

- Dataview `PlannerScope.finish` 不再手写数组返回。
- Dataview `DocumentMutationContext` 可以复用 inverse builder。
- Whiteboard `ReducerTx` 可以把 `inverse.unshift` 收敛为明确 API。

### `shared/core/src/issueCollector.ts`

职责：统一 validation issue 收集、require 校验、fail-fast/collect-all 策略。

Dataview `PlannerScope.issue/report/require` 与 Whiteboard `fail.invalid/fail.cancelled` 表达的是同一类编译期/计划期错误。建议抽象：

```ts
interface IssueCollector<TCode extends string, TSource = unknown> {
  readonly source: TSource
  add(input: {
    code: TCode
    message: string
    path?: string
    severity?: 'error' | 'warning'
    details?: unknown
  }): void
  report(...issues: readonly ValidationIssue<TCode, TSource>[]): void
  require<T>(value: T | undefined, issue: IssueInput<TCode>): T | undefined
  hasErrors(): boolean
  finish(): readonly ValidationIssue<TCode, TSource>[]
}
```

这里 `ValidationIssue` 的 shape 可以通用，`code/source/details` 由领域层类型化。

收益：

- Dataview planner 的 `createPlannerScope` 可变薄。
- Whiteboard command compiler 的 `fail.invalid/cancelled` 可以基于相同 collector。
- 后续 lock 校验、批量 action validation、schema validation 可共享 issue pipeline。

### `shared/core/src/planningContext.ts`

职责：action/command -> operations 的通用 planning transaction。

Dataview 的 action planner 与 Whiteboard 的 command compiler 都有：读文档、生成 id、校验、emit operations、返回 output。建议下沉骨架：

```ts
interface PlanningContext<TRead, TOp, TIssueCode extends string, TIds = unknown> {
  read: TRead
  ids: TIds
  ops: OperationBuffer<TOp>
  issues: IssueCollector<TIssueCode>
  emit(op: TOp): void
  require<T>(value: T | undefined, issue: IssueInput<TIssueCode>): T | undefined
  finish<TOutput>(output: TOutput): PlanningResult<TOp, TOutput, TIssueCode>
}
```

领域层扩展：

- Dataview 增加 `resolveTarget`、`reader`、`action source`。
- Whiteboard 增加 `registries`、`nodeSize`、`command output`、`fail.cancelled`。

这个模型比单独的 `PlannerScope` / `CommandCompilerTx` 更稳定，因为它只关心“计划事务”的公共骨架。

### `shared/core/src/readWorkspace.ts`

职责：统一 transaction-local 读取、require、capture、memo。

Dataview 有 `DocumentReader` 和未来 `DocumentMutationContext.working`；Whiteboard 有 `ReducerReadApi`、`snapshot.capture`、compiler `read.require`。建议抽象一层轻量工作区：

```ts
interface ReadWorkspace<TDocument> {
  readonly base: TDocument
  current(): TDocument
  memo<TKey, TValue>(namespace: string, key: TKey, read: () => TValue): TValue
  capture<TKey, TValue>(namespace: string, key: TKey, read: () => TValue): TValue
  require<T>(value: T | undefined, message?: string): T
}
```

`shared/core` 不定义 record/node 等方法，只提供 memo/capture/require 的机制。领域层再包装成 `reader.records.get`、`tx.read.node.require`。

### `shared/core/src/idFactory.ts`

职责：统一 namespaced id 生成、reserve、collision check。

Whiteboard compiler 有 `ids.node/edge/group/mindmap`，Dataview 创建 record/field/view 也需要 id。可抽象：

```ts
interface IdFactory<TKind extends string> {
  next(kind: TKind): string
  reserve(kind: TKind, id: string): void
  has(kind: TKind, id: string): boolean
}
```

领域层负责 prefix、brand type、与当前 document 的 collision check。

### `shared/core/src/historyFootprint.ts`

职责：历史 footprint 的去重容器，不下沉具体历史规则。

Whiteboard 有 `spec/history/collect`，Dataview 有 undo/redo/history。公共部分只是 key 收集、去重、finish：

```ts
interface FootprintCollector<TKey> {
  add(key: TKey): void
  addMany(keys: Iterable<TKey>): void
  has(key: TKey): boolean
  finish(): readonly TKey[]
}
```

具体 operation 影响哪些 key，仍由领域层定义。

### `shared/core/src/metrics.ts`

职责：运行统计与阶段耗时的通用计算。

Dataview 已有 running stat、stage stats、commit trace；`shared/projection-runtime` 已有 phase trace。公共部分可下沉：

```ts
interface RunningStat {
  count: number
  total: number
  avg: number
  max: number
  p95?: number
}

interface MetricsCollector<TPhaseName extends string> {
  start(phase: TPhaseName): void
  end(phase: TPhaseName, input?: { changed?: boolean; rebuilt?: boolean }): void
  record(name: string, value: number): void
  snapshot(): unknown
}
```

收益：

- Dataview `runtime/performance.ts` 可以瘦身。
- Projection runtime phase trace 可以统一统计输出。
- Whiteboard 后续 engine/editor graph trace 可直接复用。

### `shared/core/src/overlayMap.ts`（可选）

职责：base map + overlay mutation + materialize。

适用前提：Dataview 重构后也采用 draft/overlay，否则先不急着下沉。

Whiteboard 已有 `OverlayTable`，可以作为候选实现来源。

### `shared/projection-runtime` 扩展：`publishEntityFamily`

职责：发布快照时直接返回 `EntityDelta`。

建议放在 `shared/projection-runtime` 而不是 `shared/core`，因为它依赖 publish/reuse/action 语义。

### `shared/projection-runtime` 扩展：`createEntityDeltaSync`

职责：统一 `EntityDelta` 到 source/sink 的应用。

当前 `shared/projection-runtime` 已有 `createFamilySync`，Dataview runtime source 也有多套 `applyListedDelta/applyEntityDelta/applyItemDelta`。可以新增 delta-first sync：

```ts
interface EntityDeltaSyncSpec<TSnapshot, TSink, TKey, TValue> {
  delta(snapshot: TSnapshot): EntityDelta<TKey> | undefined
  list(snapshot: TSnapshot): readonly TKey[]
  read(snapshot: TSnapshot, key: TKey): TValue | undefined
  set(key: TKey, value: TValue, sink: TSink): void
  remove(key: TKey, sink: TSink): void
  order?(ids: readonly TKey[], sink: TSink): void
}
```

收益：

- Dataview document/active source patch 可以直接复用。
- Whiteboard editor graph source/sink 同步可以复用。
- `order/set/remove` 的应用顺序和缺失值处理统一。

## 不建议下沉的内容

### 1. 领域 invalidation 规则

例如：

- Dataview record title 变化会触碰 title value、field touched、view query/order/filter 等。
- Whiteboard node geometry 变化会影响 edge geometry、spatial index、scene projection。
- Mindmap node owner 变化会触发布局任务。

这些规则不应该进 `shared/core`。`shared/core` 只提供 `KeySet`、`ChangeSet`、`Plan` 的表达和合并能力。

### 2. 历史 footprint 规则

Whiteboard 有 `spec/history/collect`，Dataview 有 inverse/redo 语义。历史聚合与业务 operation 强相关，不应下沉。可以下沉的是 `InverseBuilder` 的队列行为，不是具体 inverse 规则。

### 3. 具体 Snapshot / EngineChange 结构

Dataview 的 `DocDelta/ActiveDelta` 与 Whiteboard 的 `EngineChange/GraphDelta` 面向不同消费者。长期可以复用 `EntityDelta`，但不应该强制统一顶层发布协议。

### 4. 锁校验、权限、origin 策略

Whiteboard `validateLockOperations` 属于领域策略。Dataview 如果未来有权限/协作策略，也应各自实现。

## Dataview 应如何使用 shared 设施

Dataview 的长期路径：

1. 用 `shared/core/keySet` 替换 `Set<T> | 'all'`。
2. 用 `shared/core/changeSet` 替换 inserted/removed 抵消逻辑。
3. 新建 `DocumentMutationContext`，内部基于 `shared/core/mutationTx`。
4. `reduceOperation({ document, operation, context })` 成为唯一执行入口。
5. 删除 `executeOperation.ts` 或迁移为薄 wrapper。
6. 用 `MutationTrace -> ChangeGraph -> InvalidationPlan` 替代 `CommitImpact`。
7. 用 `shared/core/entityDelta` 替代 `CollectionDelta/KeyDelta/ListedDelta` builder。
8. Active publish 尽量改用 `shared/projection-runtime/publishEntityFamily`。
9. Planner 层改用 `PlanningContext + IssueCollector + OperationBuffer`，替代手写 scope 数组累积。
10. Runtime source apply 改用 `createEntityDeltaSync`，替代手写 apply delta。
11. Performance/trace 改用 shared `MetricsCollector` 的 running stat 与 phase timing。

Dataview 仍保留：

- record/value/field/view 的 trace bucket 包装。
- field schema aspect、view query/layout/calculation 的领域 diff。
- active view plan、index derive、summary derive 的 invalidation 规则。

## Whiteboard 应如何使用 shared 设施

Whiteboard 的长期路径：

1. 已完成：用 `shared/core/changeSet` 替换 `ChangeIds` 与 `markChange` 基础实现，并统一为 `added/updated/removed`。
2. 用 `shared/core/keySet` 表达 `Invalidation` 与 `GraphPatchScope` 的 reset/all/some。
3. 保留 `ReducerTx` 领域 API，但内部逐步改用 `shared/core/mutationTx`。
4. `EngineChange.entities.*` 可以继续暴露 `IdDelta`，但底层类型来自 `IdChangeSet`。
5. 已完成：`whiteboard-editor-graph/runtime/graphPatch/delta.ts` 删除重复 mark helpers，改用 `changeSet`。
6. Graph publish 改用 `publishEntityFamily`，同时得到 changed ids 与 `EntityDelta`。
7. Compiler 层改用 `PlanningContext + IssueCollector + OperationBuffer`，保留领域 `registries/nodeSize/ids`。
8. Reducer inverse 改用 `InverseBuilder`，替代分散的 `inverse.unshift`。
9. Graph/source sync 改用 `createEntityDeltaSync`。
10. 如果 Dataview 也需要 draft overlay，再把 `OverlayTable` 提炼到 `shared/core/overlayMap`。

Whiteboard 仍保留：

- node/edge/group/mindmap/canvas 的领域 reducer API。
- lock、history footprint、mindmap reconcile。
- geometry/spatial/scene/editor UI 的 invalidation 推导。

## 推荐落地顺序

### Phase 1：纯工具下沉，已完成

新增：

- `shared/core/src/keySet.ts`
- `shared/core/src/changeSet.ts`
- `shared/core/src/entityDelta.ts`
- `shared/core/src/operationBuffer.ts`
- `shared/core/src/issueCollector.ts`

当前完成状态：

- `shared/core/changeSet` 已收敛为 canonical-only `IdChangeSet`。
- Whiteboard reducer 已直接调用 shared `changeSet.markAdded/markUpdated/markRemoved`。
- Whiteboard `ChangeSet`、engine 初始变更、`change/fromReduce.ts` 已统一切到 `added/updated/removed`。
- Whiteboard `dirty` / `invalidation` 已删除无效 `projection(s)` 层，并把实体 dirty 标记统一收敛为 `touch()`。
- Whiteboard Editor Graph `GraphPatchScope` 已收敛到 shared `keySet`，合并/判空/clone 不再重复实现。
- Whiteboard Engine / Editor Graph 的 `IdDelta` 已收敛到 shared `IdChangeSet` 形态，`graphPatch` / `spatial` / `publish` 内部不再保留同构 helper。
- Editor Graph 已删除重复 mark helpers，直接调用 shared `changeSet`。
- Dataview 后续新增代码应直接使用 `KeySet` / `EntityDelta` / canonical `IdChangeSet`，不再引入兼容命名。
- 阶段 1 不保留 compatibility wrapper。

### Phase 2：planning/compiler context 合流

新增：

- `shared/core/src/planningContext.ts`
- `shared/core/src/readWorkspace.ts`
- `shared/core/src/idFactory.ts`

然后改造：

- Dataview `mutate/planner/scope.ts`，保留 `resolveTarget` 领域能力。
- Whiteboard `write/compile/tx.ts`，保留 `registries/nodeSize` 领域能力。
- 两边统一 issue collection、operation emit、require 校验、id factory 注入。

### Phase 3：publish delta 合流

扩展 `shared/projection-runtime`：

- `publishEntityFamily`
- `publishEntityList`
- `entityDelta` 桥接输出

然后改造：

- Dataview `active/shared/delta.ts`。
- Dataview `active/publish/delta.ts`。
- Whiteboard Editor Graph publisher 的 changed ids 产出。

### Phase 4：Dataview reducer context 化

新增 Dataview `DocumentMutationContext`，基于 shared mutation primitives：

```text
reduceOperation + DocumentMutationContext
  -> MutationTrace
  -> ChangeGraph
  -> InvalidationPlan
  -> EngineDelta
```

然后删除 `executeOperation.ts` 的独立执行逻辑。

### Phase 5：source sync 与 metrics 合流

新增：

- `shared/projection-runtime/createEntityDeltaSync`
- `shared/core/src/metrics.ts`
- `shared/core/src/historyFootprint.ts`

然后改造：

- Dataview runtime source apply。
- Dataview runtime performance running stat。
- Whiteboard 后续 graph/source sync 与 trace。

### Phase 6：Whiteboard tx 内核瘦身

保持 Whiteboard 外部 API 不变，内部把这些替换成 shared primitives：

- dirty set merge/reset。
- inverse builder / operation buffer。
- 更通用的 mutation tx skeleton。

### Phase 7：评估 overlay 下沉

当 Dataview 也出现明确 draft/working set 需求后，再将 Whiteboard `OverlayTable` 抽象为 `shared/core/overlayMap`。如果 Dataview 继续保持不可变 documentApi，则 overlay 不急于下沉。

## 最终目标形态

理想的跨项目分层：

```text
shared/core
  keySet
  changeSet
  entityDelta
  operationBuffer
  issueCollector
  planningContext
  readWorkspace
  idFactory
  historyFootprint
  metrics
  mutationTrace
  mutationTx
  overlayMap?          optional

shared/projection-runtime
  plan / phase scope
  publishValue
  publishFamily
  publishEntityFamily  new
  createEntityDeltaSync new
  source sync helpers

dataview-core
  PlanningContext domain wrapper
  DocumentMutationContext
  DataviewMutationTrace wrappers
  reduceOperation domain handlers
  ChangeGraph / InvalidationPlan domain rules

dataview-engine
  project document/active delta using shared EntityDelta
  publish active state using projection-runtime

whiteboard-core
  PlanningContext domain wrapper
  ReducerTx domain facade
  node/edge/group/mindmap reducers
  domain invalidation/reconcile/history

whiteboard-engine / whiteboard-editor-graph
  EngineChange / GraphDelta domain protocol
  source/editor graph publish using shared primitives
```

核心原则：

- `shared/core` 管“变更代数”，不管业务含义。
- `shared/projection-runtime` 管“投影发布”，不管业务实体。
- Dataview / Whiteboard 管“领域规则”，不重复实现集合、delta、transaction 的基础设施。

## 结论

Dataview 和 Whiteboard 的当前实现已经在不同方向上验证了同一个抽象：

- Dataview 暴露了 `CommitImpact` 与 delta 类型分裂的问题。
- Whiteboard 暴露了 `ReducerTx`、`ChangeSet`、`Invalidation` 模式的可行性。
- Editor Graph 暴露了 patch scope、graph delta、publish family 与 source delta 之间的重复。

因此最值得整体下沉的是两组设施：

- 变更代数组：`KeySet + IdChangeSet + EntityDelta + MutationTx + publishEntityFamily`。
- 流程上下文组：`PlanningContext + IssueCollector + OperationBuffer + InverseBuilder + ReadWorkspace + SourcePatchApplier + MetricsCollector`。

它们足够通用，不包含领域规则；又能实质性减少 Dataview 与 Whiteboard 的重复代码，并为后续 `DocumentMutationContext`、command compiler、planner、graph patch runtime、runtime source sync 提供统一基础。
