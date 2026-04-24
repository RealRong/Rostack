# Dataview Impact / Delta 长期最优重构方案

本文研究以下文件的 impact 与 delta 产出逻辑：

- `dataview/packages/dataview-core/src/operation/executeOperation.ts`
- `dataview/packages/dataview-core/src/operation/reducer.ts`
- `dataview/packages/dataview-engine/src/core/delta.ts`
- `dataview/packages/dataview-engine/src/active/publish/delta.ts`

目标是类型定义与实现写法的长期最优，不考虑重构成本，不要求兼容当前 API。

## 当前链路

当前链路分两条相近但割裂的路径：

1. `reduceOperation` 只负责把 `DocumentOperation` 规约成新的 `DataDoc`，没有 inverse、impact、trace。
2. `executeOperation` 重新实现一套 operation 分发，在应用 operation 的同时直接 mutate 一个 `CommitImpact` 并构造 inverse。
3. `applyOperations` 在所有 operation 执行后调用 `impact.finalize` 清理空集合、派生 `recordSetChanged`。
4. engine 层分别把 `CommitImpact` 与新旧快照投影成：
   - `DocDelta`：`projectDocumentDelta`。
   - `ActiveDelta`：`projectActiveDelta`，其中 `sections/items/summaries` 的局部 delta 来自 publish 阶段。

也就是说：

```text
operations + before doc
  -> executeOperation -> after doc + inverse + CommitImpact
  -> index/view derive
  -> DocDelta + ActiveDelta
  -> runtime source apply
```

这个方向是合理的：operation 层不应该直接知道所有订阅者，delta 层也不应该重新理解每个 operation 的语义。但当前存在两个根本问题：

- `reduceOperation` 与 `executeOperation` 是两套 operation 执行入口，长期会产生语义漂移。
- `CommitImpact` 和 `Delta` 类型还不够“代数化”，导致实现里有较多可变对象、防御性清理、隐式约定与重复分支。

长期目标应是：**删除 `executeOperation.ts` 这条特殊执行路径，让 `reduceOperation + DocumentMutationContext` 成为唯一 operation 执行入口**。

## 主要问题

### 1. `CommitImpact` 同时承担事件、查询 hint、累加器三种角色

当前类型大致是：

```ts
interface CommitImpact {
  reset?: true
  records?: {
    inserted?: Set<RecordId>
    removed?: Set<RecordId>
    patched?: Map<RecordId, Set<RecordPatchAspect>>
    touched?: Set<RecordId> | 'all'
    recordSetChanged?: boolean
  }
  values?: { touched?: Map<RecordId, Set<FieldId>> | 'all' }
  fields?: { ... }
  views?: { ... }
  activeView?: { before?: ViewId; after?: ViewId }
  external?: { ... }
}
```

它同时表达：

- 事实事件：record 插入、删除、字段移除、activeView 从 A 到 B。
- 下游 hint：哪些 record/field/view 需要刷新。
- 中间累加器：`Set`、`Map`、`recordSetChanged`、空集合清理。

这些概念混在一起后，很多代码必须手工维持派生关系：

- 修改 record title 时要同时触碰 `records.patched`、`records.touched`、`values.touched`、`fields.touched`。
- 新插入后又删除，要删掉 inserted、patched、touched/value touched。
- field remove 要同时写 `fields.removed`、`fields.schema`、`fields.schemaTouched`，还要在 doc delta 阶段额外扫描 value remove。
- `recordSetChanged` 不是原始事实，而是 finalize 后的派生字段。

长期来看，`CommitImpact` 应拆成两个明确层次：

- `MutationTrace`：只记录不可约的领域事实。
- `InvalidationPlan`：从 trace + before/after doc 归一化得到的查询/发布 invalidation hint。

### 2. `all` 与 `Set` 的并集语义没有类型封装

当前多个字段使用 `Set<T> | 'all'`。这会造成每个写入点都要写：

```ts
if (impact.values?.touched !== 'all') { ... }
```

问题不是 `'all'` 本身，而是它没有被抽象成一等类型。长期应引入统一集合代数：

```ts
type KeySet<K> =
  | { kind: 'none' }
  | { kind: 'some'; keys: ReadonlySet<K> }
  | { kind: 'all' }
```

并提供唯一入口：

```ts
keySet.add(set, key)
keySet.addMany(set, keys)
keySet.union(left, right)
keySet.subtract(left, keys)
keySet.materialize(set, allKeys)
keySet.isEmpty(set)
```

这样业务逻辑不再分散处理 `'all'`，也不需要到处 cast `as Set<T>`。

### 3. `inserted/removed/touched/update/remove` 没有统一“净变更”模型

当前 operation 层使用 set 删除来抵消净效果：

- record remove 遇到本 commit 内刚插入的 record，就删除 `records.inserted` 并清理相关 impact。
- field put 遇到本 commit 内刚 removed 的 field，就删除 `fields.removed` 并 mark all。
- view put/remove 也有类似分支。

这些抵消规则正确但分散。长期更优模型是每类 entity 都使用统一 `EntityChangeSet`：

```ts
type EntityChangeSet<K, Patch> = {
  created: Map<K, { afterIndex?: number }>
  deleted: Map<K, { beforeIndex?: number }>
  updated: Map<K, Patch>
  touched: KeySet<K>
}
```

然后通过一个通用归一化函数根据 before/after presence 决定净效果：

```text
absent -> present  = create
present -> absent  = delete
present -> present = update if patch not empty or identity changed
absent -> absent   = none
```

这样不再在每个 `executeXxx` 分支里手工“撤销 inserted/removed”。

### 4. aspect 类型是字符串集合，缺少领域结构

当前 aspect 定义：

```ts
type ViewQueryAspect = 'search' | 'filter' | 'sort' | 'group' | 'order'
type ViewLayoutAspect = 'name' | 'type' | 'display' | 'options'
type FieldSchemaAspect = 'name' | 'kind' | 'options' | 'config' | 'meta' | 'all'
type RecordPatchAspect = 'title' | 'type' | 'meta'
```

问题：

- `FieldSchemaAspect` 有 `'all'`，其他 aspect 没有，语义不一致。
- `CommitImpactViewChange` 把 query/layout/calculation 分成三个可选字段，但它们都在表达 view 变化。
- aspect 既用于“发生了什么”，又用于“需要 invalidation 哪些阶段”。这两者不总是一一对应。

建议改成结构化 diff：

```ts
type FieldChange =
  | { kind: 'created' }
  | { kind: 'deleted' }
  | { kind: 'updated'; schema: KeySet<FieldSchemaSlot> }

type ViewChange =
  | { kind: 'created' }
  | { kind: 'deleted' }
  | {
      kind: 'updated'
      query: KeySet<ViewQuerySlot>
      layout: KeySet<ViewLayoutSlot>
      calculations: KeySet<FieldId>
    }
```

其中 `all` 是 `KeySet` 能力，不是业务 aspect 字符串。下游如果要判断“是否影响 query”，直接看 `viewChange.query`，而不是检查字符串集合。

### 5. `DocDelta` 与 `ActiveDelta` 类型形态相似但重复

当前有三种很接近的 delta：

```ts
interface CollectionDelta<Key> { list?: true; update?: Key[]; remove?: Key[] }
interface KeyDelta<Key> { update?: Key[]; remove?: Key[] }
interface ListedDelta<Key> { ids?: true; update?: Key[]; remove?: Key[] }
```

三者本质都是“列表身份是否变化 + key-value table 的 set/remove”。差别只是 `list` 与 `ids` 命名不同，以及是否允许 list 变化。

长期应统一成一个类型：

```ts
type EntityDelta<K> = {
  order?: true
  set?: readonly K[]
  remove?: readonly K[]
}
```

命名建议：

- 用 `order` 取代 `ids/list`，表达“有序 id 列表变了”。
- 用 `set` 取代 `update`，因为新增和更新对 source apply 都是 set 当前快照值。
- 用 `remove` 保持删除语义。

那么 `DocDelta` 可变为：

```ts
interface DocumentDelta {
  reset?: true
  meta?: true
  records?: EntityDelta<RecordId>
  values?: EntityDelta<ValueRef>
  fields?: EntityDelta<FieldId>
  schemaFields?: EntityDelta<CustomFieldId>
  views?: EntityDelta<ViewId>
}
```

`ActiveDelta` 也复用同一个 `EntityDelta`：

```ts
interface ActiveViewDelta {
  reset?: true
  base?: KeySet<'view' | 'query' | 'table' | 'gallery' | 'kanban'>
  records?: KeySet<'matched' | 'ordered' | 'visible'>
  fields?: EntityDelta<FieldId>
  sections?: EntityDelta<SectionId>
  items?: EntityDelta<ItemId>
  summaries?: EntityDelta<SectionId>
}
```

这样 source apply 可复用一个通用 `applyEntityDelta`，不用维护 doc/active 两套近似结构。

### 6. Delta 构造依赖引用相等，语义不稳定

`projectActiveDelta` 通过 `previous.query !== next.query`、`previous.table !== next.table` 判断是否变化；`buildKeyedCollectionDelta` 也用 `previousGet(key) === nextGet(key)`。

这依赖 publish 阶段正确复用对象引用。优点是快，缺点是类型层完全看不出这个契约：如果未来某个 publish 函数没有复用引用，会产生过大的 delta；如果错误复用引用，会漏 delta。

长期建议显式引入发布节点版本或 hash：

```ts
type Published<T> = {
  value: T
  version: number
}
```

或在 collection 上保留：

```ts
type PublishedCollection<K, V> = {
  ids: readonly K[]
  get(key: K): V | undefined
  versionOf(key: K): number | undefined
  orderVersion: number
}
```

delta 比较版本而不是对象引用。引用复用仍可作为优化，但不再是正确性前提。

### 7. `buildValueDelta` 需要扫描旧文档，说明 impact 表达不完整

`buildValueDelta` 在以下情况下扫描旧文档：

- `values.touched === 'all'` 时扫描全部 value ref。
- record remove 时扫描被删除 record 的全部 values。
- field remove 时扫描所有 record，找出被删 field 的 value。

这在小数据下没问题，但长期最优应让 trace 记录删除事实，或者让 normalization 阶段一次性构建删除 key 集合，而不是在 delta 投影时按领域类型重复扫描。

建议 `MutationTrace` 显式记录：

```ts
type ValueTrace = {
  written: Map<RecordId, Set<FieldId>>
  removedByRecord: Set<RecordId>
  removedByField: Set<FieldId>
  touchedAll?: true
}
```

再在 `normalizeTrace` 中 materialize 成 `ValueChangeSet`。这样 expensive scan 有唯一入口，可被缓存、度量、替换为索引。

### 8. `reduceOperation` 与 `executeOperation` 双入口导致长期语义漂移

当前 `reducer.ts` 中的 `reduceOperation(document, operation)` 是最小状态规约器，只调用 `documentApi`：

```ts
reduceOperation(document, operation): DataDoc
```

而 `executeOperation.ts` 为了 inverse 与 impact，重新实现了几乎同一套 operation switch，并在每个分支里额外读取 before/after 状态、维护 `CommitImpact`。这会带来几个长期问题：

- operation 的状态变更语义有两个实现，新增 operation 时容易漏改其中一个。
- `executeOperation` 必须在外层猜测 `documentApi` 内部到底改了哪些结构。
- inverse、trace、dirty/invalidation 都依附在执行器外侧，无法复用底层更精确的信息。
- 优化只能在 `executeOperation` 里做局部补丁，无法沉到 `documentApi` 或 reducer 基础设施。

长期最优应把 `reduceOperation` 升级为唯一执行入口，并增加 `DocumentMutationContext` 参数。`executeOperation.ts` 不再作为独立执行器存在，最多在迁移期保留为兼容 wrapper：

```ts
export const executeOperation = (document, operation, impact) => {
  const context = createLegacyDocumentMutationContext({ impact })
  const result = reduceOperation({ document, operation, context })
  return {
    document: result.document,
    inverse: context.inverse.finish()
  }
}
```

最终状态应删除这个 wrapper，让所有 mutation 都走：

```ts
reduceOperation({ document, operation, context })
```

## 推荐目标架构

长期最优架构建议拆成五个阶段：

```text
1. reduce operations
   input: before doc + operations
   output: after doc + DocumentMutationContext(trace + inverse + working)

2. normalize mutation trace
   input: before doc + after doc + MutationTrace
   output: ChangeGraph

3. derive invalidation plan
   input: ChangeGraph + active plan demand
   output: IndexInvalidation + ViewInvalidation + SourceInvalidation

4. derive/publish snapshots
   input: invalidation + previous snapshots
   output: next snapshots + PublishedChangeGraph

5. project source deltas
   input: previous snapshots + next snapshots + PublishedChangeGraph
   output: EngineDelta
```

核心思想：

- operation 层只有一个入口：`reduceOperation + DocumentMutationContext`。
- reducer 只记录“事实”，不直接记录所有下游要刷什么。
- normalization 层统一处理 create/delete/update 抵消。
- invalidation 层把领域事实转换成查询/索引/视图需要的 hint。
- delta 层只面向 source apply，语义固定为 `order/set/remove/reset`。

## 类型重构建议

### 基础代数类型

```ts
type KeySet<K> =
  | { kind: 'none' }
  | { kind: 'some'; keys: ReadonlySet<K> }
  | { kind: 'all' }

type EntityDelta<K> = {
  order?: true
  set?: readonly K[]
  remove?: readonly K[]
}

type EntityChange<K, Patch> =
  | { kind: 'created'; key: K }
  | { kind: 'deleted'; key: K }
  | { kind: 'updated'; key: K; patch: Patch }

type EntityChangeSet<K, Patch> = ReadonlyMap<K, EntityChange<K, Patch>>
```

### MutationTrace

```ts
interface MutationTrace {
  reset?: true
  records: {
    inserted: Set<RecordId>
    removed: Set<RecordId>
    patched: Map<RecordId, KeySet<RecordSlot>>
  }
  values: {
    written: Map<RecordId, KeySet<FieldId>>
    removedByRecord: Set<RecordId>
    removedByField: Set<FieldId>
    all?: true
  }
  fields: {
    put: Set<CustomFieldId>
    removed: Set<CustomFieldId>
    patched: Map<CustomFieldId, KeySet<FieldSchemaSlot>>
  }
  views: {
    put: Set<ViewId>
    removed: Set<ViewId>
    patched: Map<ViewId, ViewPatch>
  }
  activeView?: { first?: ViewId; last?: ViewId }
  external?: { versionBumped?: true; source?: string }
}
```

注意 `put/remove/patch` 仍是执行期事实，不在这里判断最终是 create、delete 还是 update。

### DocumentMutationContext

`DocumentMutationContext` 是 `reduceOperation` 的长期核心参数。它不是简单的 `dirty` 容器，而是一次 document mutation transaction 的执行上下文：

```ts
interface DocumentMutationContext {
  trace: MutationTraceBuilder
  inverse: InverseOperationBuilder
  working: DocumentWorkingSet
  scope?: OperationScope
}
```

建议职责如下：

```ts
interface MutationTraceBuilder {
  reset(): void
  meta(): void
  records: {
    insert(recordId: RecordId): void
    remove(recordId: RecordId): void
    patch(recordId: RecordId, slots: readonly RecordSlot[]): void
  }
  values: {
    write(recordId: RecordId, fieldId: FieldId): void
    removeByRecord(recordId: RecordId): void
    removeByField(fieldId: FieldId): void
    all(): void
  }
  fields: {
    put(fieldId: CustomFieldId): void
    remove(fieldId: CustomFieldId): void
    patch(fieldId: CustomFieldId, slots: readonly FieldSchemaSlot[]): void
  }
  views: {
    put(viewId: ViewId): void
    remove(viewId: ViewId): void
    patch(viewId: ViewId, patch: ViewPatch): void
  }
  activeView(before: ViewId | undefined, after: ViewId | undefined): void
  external(source?: string): void
}

interface InverseOperationBuilder {
  prepend(operation: DocumentOperation): void
  append(operation: DocumentOperation): void
  finish(): readonly DocumentOperation[]
}

interface DocumentWorkingSet {
  before: DataDoc
  getRecord(recordId: RecordId): DataRecord | undefined
  getRecordIndex(recordId: RecordId): number
  getField(fieldId: CustomFieldId): CustomField | undefined
  getView(viewId: ViewId): View | undefined
  activeViewId(): ViewId | undefined
}

type OperationScope =
  | { kind: 'document' }
  | { kind: 'records'; ids?: KeySet<RecordId> }
  | { kind: 'values'; records?: KeySet<RecordId>; fields?: KeySet<FieldId> }
  | { kind: 'schema'; fields?: KeySet<CustomFieldId> }
  | { kind: 'views'; ids?: KeySet<ViewId> }
```

其中：

- `trace` 记录 mutation fact，是后续 `ChangeGraph` 的输入。
- `inverse` 在 reducer 读取 before 状态时顺便构造 undo，替代 `executeOperation.ts` 的 inverse 分支。
- `working` 提供 transaction 级缓存，避免重复 `get/indexOf/ids`，也允许底层 `documentApi` 复用读取结果。
- `scope` 是可选优化 hint，用于限制底层扫描范围；它不能决定正确性，只能影响性能。

`dirty` 不应作为一等主模型。真正的一等模型是 `trace`；dirty/invalidation 应从 `ChangeGraph` 或 `InvalidationPlan` 派生。

### reduceOperation 目标接口

`reduceOperation` 应从二元函数升级为对象式接口：

```ts
type ReduceOperationInput = {
  document: DataDoc
  operation: DocumentOperation
  context: DocumentMutationContext
}

type ReduceOperationResult = {
  document: DataDoc
  changed: boolean
}

declare const reduceOperation: (input: ReduceOperationInput) => ReduceOperationResult
```

`reduceOperations` 则负责创建和贯穿同一个 transaction context：

```ts
const context = createDocumentMutationContext({ before: document })
let nextDocument = document

for (const operation of operations) {
  const result = reduceOperation({
    document: nextDocument,
    operation,
    context
  })
  nextDocument = result.document
}

const trace = context.trace.finish()
const inverse = context.inverse.finish()
```

这样 `applyOperations` 的核心产物从旧的 `CommitImpact` 变为：

```ts
{
  document: nextDocument,
  trace,
  undo: inverse,
  redo: operations
}
```

### ChangeGraph

```ts
interface ChangeGraph {
  reset?: true
  meta?: true
  records: EntityChangeSet<RecordId, KeySet<RecordSlot>>
  values: EntityChangeSet<ValueRef, true>
  fields: EntityChangeSet<FieldId, KeySet<FieldSchemaSlot>>
  schemaFields: EntityChangeSet<CustomFieldId, KeySet<FieldSchemaSlot>>
  views: EntityChangeSet<ViewId, ViewPatch>
  activeView?: { before?: ViewId; after?: ViewId }
  external?: { versionBumped?: true; source?: string }
}
```

`ChangeGraph` 是后续所有 derive、publish、delta 的唯一事实来源。

### Delta

```ts
interface DocumentDelta {
  reset?: true
  meta?: true
  records?: EntityDelta<RecordId>
  values?: EntityDelta<ValueRef>
  fields?: EntityDelta<FieldId>
  schemaFields?: EntityDelta<CustomFieldId>
  views?: EntityDelta<ViewId>
}

interface ActiveDelta {
  reset?: true
  base?: KeySet<'view' | 'query' | 'table' | 'gallery' | 'kanban'>
  records?: KeySet<'matched' | 'ordered' | 'visible'>
  fields?: EntityDelta<FieldId>
  sections?: EntityDelta<SectionId>
  items?: EntityDelta<ItemId>
  summaries?: EntityDelta<SectionId>
}
```

`Delta` 只给 source apply 使用，不再携带 aspect。aspect 应留在 `ChangeGraph` 或 `InvalidationPlan`。

## 写法重构建议

### 1. 用 `DocumentMutationContext` 取代 `executeOperation.ts`

当前 `executeOperation.ts` 中有大量 `ensureXxx`、`markXxx`、`deleteXxx`，本质是在 reducer 外侧补做 trace/inverse。长期应把这些逻辑沉到 `reduceOperation` 的上下文里：

```ts
const result = reduceOperation({
  document,
  operation,
  context
})
```

每个 operation 分支只做三件事：

1. 通过 `context.working` 读取 before 状态。
2. 调用 `documentApi` 得到 next document。
3. 如果 changed，则写 `context.trace` 和 `context.inverse`。

示意：

```ts
case 'document.record.patch': {
  const before = context.working.getRecord(operation.recordId)
  if (!before) return unchanged(document)

  const nextDocument = documentApi.records.patch(document, operation.recordId, operation.patch)
  if (nextDocument === document) return unchanged(document)

  const after = documentApi.records.get(nextDocument, operation.recordId)
  context.trace.records.patch(
    operation.recordId,
    recordSlots.diff(before, after)
  )
  context.inverse.prepend({
    type: 'document.record.patch',
    recordId: operation.recordId,
    patch: recordPatch.inverse(before, operation.patch)
  })
  return changed(nextDocument)
}
```

`executeOperation.ts` 因此不再需要存在；`applyOperations` 直接调用 `reduceOperations` 并从 context 取 trace/inverse。

### 2. 用 builder 封装 mutation，不直接改裸对象

`DocumentMutationContext.trace` 内部使用 builder 封装所有集合代数和合并规则：

```ts
context.trace.records.insert(recordId)
context.trace.records.remove(recordId)
context.trace.records.patch(recordId, ['title'])
context.trace.values.write(recordId, fieldId)
context.trace.fields.put(fieldId)
context.trace.views.patch(viewId, patch)
context.trace.activeView(before, after)
```

builder 内部只维护 trace 数据结构，不做下游 invalidation 推理。

### 3. operation reducer 返回 changed，不返回局部 impact

每个 reducer 分支不再返回 `inverse` 或 `impact`，而是把副产物写入 `DocumentMutationContext`，自身只返回是否发生状态变化：

```ts
type ReduceOperationResult = {
  document: DataDoc
  changed: boolean
}
```

这样 reducer 仍然是唯一状态变更入口，同时 context 承载 transaction 副产物。

### 4. 统一 delta builder

当前有 `buildListedDelta`、`createCollectionDelta`、`buildKeyedCollectionDelta` 三套近似构造。应统一：

```ts
entityDelta.fromChangeSet({
  previousIds,
  nextIds,
  changes,
  includeOrder: true
})

entityDelta.fromSnapshots({
  previous,
  next,
  keyVersion
})
```

所有空 delta 过滤、remove 覆盖 set、order 比较都由同一个 builder 处理。

### 5. 禁止在业务代码里手写条件 spread

当前大量：

```ts
return a || b ? {
  ...(a ? { a } : {}),
  ...(b ? { b } : {})
} : undefined
```

建议提供小工具：

```ts
compactObject({ a, b })
emptyAsUndefined(delta)
```

或者让 builder 负责返回 `undefined`。这会显著降低 delta 投影代码的噪音。

### 6. 明确 reset 的优先级

`reset` 应该是 delta 与 invalidation 的顶层吸收元：

```text
reset + any = reset
```

当前部分地方在 reset 下仍构造 touched all。长期应规定：

- `MutationTrace.reset` 可以附带 activeView before/after 等审计信息。
- `InvalidationPlan.reset` 表示所有 derive 重新计算。
- `DocumentDelta.reset` / `ActiveDelta.reset` 不再携带局部 delta。

## 建议迁移步骤

不考虑兼容时，可以直接大重构；但为了降低风险，推荐按以下顺序落地：

1. 新增 `KeySet`、`EntityDelta`、`EntityChangeSet` 基础类型与测试。
2. 新增 `DocumentMutationContext`、`MutationTraceBuilder`、`InverseOperationBuilder`、`DocumentWorkingSet`。
3. 将 `reduceOperation` 改为 `reduceOperation({ document, operation, context })`，让它写 trace/inverse。
4. 将 `applyOperations` 改为调用新 `reduceOperations`，从 context 取 `trace/undo`。
5. 删除或迁移 `executeOperation.ts`，迁移期最多保留为调用新 reducer 的薄 wrapper。
6. 新增 `ChangeGraph` normalization，用 before/after doc 验证所有 create/delete/update 净效果。
7. 让 index/view derive 改读 `ChangeGraph` 或 `InvalidationPlan`，停止读旧 `CommitImpact`。
8. 用统一 `EntityDelta` 替换 `ListedDelta`、`CollectionDelta`、`KeyDelta`。
9. 改造 source apply，只接受 `order/set/remove/reset` 语义。
10. 删除旧 `CommitImpact`、`impact.finalize`、`buildListedDelta`、`createCollectionDelta` 等重复层。

## 结论

当前实现的问题主要不是局部 bug，而是模型边界不够清晰：`reduceOperation` 与 `executeOperation` 双入口会造成 operation 语义漂移；`CommitImpact` 同时是可变累加器、领域事实与下游刷新 hint；`Delta` 类型又把相同语义拆成多套接口。长期最优方向是以 `DocumentMutationContext` 统一 operation 执行入口，并引入清晰的中间层：

```text
reduceOperation + DocumentMutationContext -> MutationTrace -> ChangeGraph -> InvalidationPlan -> PublishedChangeGraph -> EngineDelta
```

类型上应统一 `KeySet` 与 `EntityDelta`；写法上应把所有 `Set | 'all'`、insert/remove 抵消、空 delta 清理、条件 spread 全部收敛到基础库和 builder。这样可以让 reducer 只关心文档事实，让 derive/publish 只关心 invalidation，让 source delta 只关心 `order/set/remove`，整体更可验证、更容易扩展，也更接近长期最优。
