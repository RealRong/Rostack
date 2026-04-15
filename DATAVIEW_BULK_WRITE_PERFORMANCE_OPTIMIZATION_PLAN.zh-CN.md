# Dataview Write Pipeline 长期最优重构方案

## 文档目的

这份文档的目标，已经不再是“继续优化 bulk write 某几个热点”。

它现在是 Dataview 整条写入线的长期最优重构方案，目标非常明确：

- 把写入路径从局部性能修补，升级为一条长期稳定、结构简单、复用统一的基础能力
- 不再只盯 `table fill`、`paste`、`bulk edit` 这些症状，而是直接收敛底层写入架构
- 不考虑兼容层，不为了保留旧抽象而继续背历史包袱
- 优先追求长期最优，而不是短期最小改动

这份文档回答的是四个问题：

1. 整条写入线最终应该长什么样
2. 哪些层应该保留，哪些层应该删除
3. 哪些写入需要 rich impact 写入，哪些只需要 lightweight impact 写入
4. 怎么一步到位把现有实现迁移到最终结构

一句话总结：

Dataview 的长期最优写入线，应该是：

`Action -> DocumentOperation -> executeOperation -> finalizeCommitImpact -> derive`

其中：

- planner 只做校验和 lowering，不再预执行文档
- 每个 operation 在执行时直接产出 inverse，并直接写入 `CommitImpact`
- commit 末尾只做一次 `finalizeCommitImpact()`，得到 `impact`
- 如确实需要对外返回一次提交概览，再从 `impact` 投影出可选的 `CommitSummary`
- index / snapshot 只消费一次已经 materialize 好的 `impact`
- 不再允许任何热路径模块基于 before / after document 重新 diff 一遍

---

## 最终结论

### 1. 整条写入线需要重构，而且要重构的是执行中轴，不是 UI 层

当前 bulk 卡顿、undo/redo 额外成本、grouped/summary 大范围同步开销，本质都不是 React 交互层的问题，而是写入执行和提交聚合层重复做了太多工作。

真正需要重构的是：

- planner
- operation execution
- inverse 生成
- impact / summary 聚合
- active runtime 对 touched 信息的消费方式

### 2. 不是所有写入都需要同样的“record-centric 大 payload”

需要区分两类事情：

- 每个 operation 都应该直接产出 inverse
- 只有 record/value 热路径上的 operation，才需要更 rich 的 impact 写入

也就是说：

- `document.record.fields.writeMany`、`document.record.patch`、`document.record.insert/remove`
  - 必须在执行时直接写入足够 rich 的 impact 事实
  - 因为它们直接驱动 records index、search、sort、group、summary 等热路径
- `document.field.*`、`document.view.*`、`document.activeView.set`
  - 也必须直接产出 inverse
  - 但不需要强行产出“changedRecordIds / changedFieldIds / titleChangedIds”这种 record-centric payload
  - 它们只需要写入自己的 schema / view / activeView 语义事实

### 3. `CommitDelta` 不应该继续存在为一级对象

长期最优不应该同时保留：

- 一个详细的 `CommitDelta`
- 一个内部的 `CommitImpact`

只要两者并存，最终就一定会重新长出两条路线：

- 一部分模块继续吃 `delta`
- 一部分模块吃 `impact`
- 然后有人再从 `delta` 反推 touched records / touched fields

正确做法是：

- `CommitImpact` 成为唯一内部提交事实模型
- `deriveIndex`、`deriveViewRuntime`、内部调度、性能 trace 全部只读 `CommitImpact`
- 如果 public API 还需要返回“本次提交发生了什么”，最多只保留一个很薄的 `CommitSummary`
- `CommitSummary` 只能是 `summarizeCommitImpact(impact)` 的投影视图，绝不能反向参与任何内部派生

### 4. 长期最优不是继续 patch 某个局部，而是删掉重复层

最终必须删掉的不是某几个对象分配，而是这些“重复发现变化”的层：

- planner 里的 `reduceOperations()` 预执行
- `PlannedWriteBatch.deltaDraft`
- `buildInverseOperations(before, operation)` 这种执行外的 inverse pass
- `createDeltaCollector().collect(before, after, operation)` 这种 diff 风格 collector
- `buildSemanticDraft(before, after, operations)` 这种 planner 前置 draft
- `CommitDelta` 及其相关 contract / collector / runtime 输入
- active runtime 从第二套对象重新 materialize touched sets 的逻辑
- `contracts/commands.ts` 这一层重复的命名和类型

一句话总结：

长期最优不是“让现在这条链更快一点”，而是把整条链改成不再重复工作。

---

## 当前架构为什么不适合继续修补

当前写入链路大致是：

`Action[] -> planActions() -> reduceOperations() shadow apply -> deltaDraft -> applyOperations() -> inverse builder -> delta collector -> deriveIndex / deriveViewRuntime`

这里有五个结构性问题。

### 1. planner 预执行把同一批写入跑了两遍

当前 `planActions()` 为了得到 `deltaDraft` 和顺序语义，会：

- lower action
- 在 planner 阶段用 `reduceOperations()` 把 operation 执行一遍
- 再在 commit 阶段真正执行第二遍

这对大 bulk write 非常浪费，而且不是局部常数项问题，而是整段热路径重复执行。

### 2. inverse 是在执行外重建的

当前 `buildInverseOperations(before, operation)` 的模式意味着：

- operation 先被描述出来
- 再基于执行前文档补做 inverse

这在结构上就已经错位了。因为真正知道“哪些东西真的变了”的最佳时机，就是 execute 的那一遍循环本身。

### 3. collector / semantics 是 after-the-fact diff

当前 collector / semantics 的模式本质上是：

- operation 执行完
- 再拿 before / after 文档重新发现变化

对于 record/value 热路径，这是完全不应该存在的重复计算。

### 4. touched records / fields 被多个模块反复构建

active index、sections、summary、search、sort 都要知道：

- 哪些 record 真变了
- 哪些 field 真变了
- 是否影响 title
- 是否影响 schema

但当前很多地方是从第二套提交对象重新组装 `Set`，这会带来重复遍历和额外 GC。

### 5. `Command` 层是冗余层

现在同时存在：

- `Action`
- `Command`
- `BaseOperation`

其中真正有必要保留的是：

- `Action`：表达用户意图
- `DocumentOperation`：表达 canonical document mutation

`Command` 这一层没有稳定提供额外价值，只是在命名和类型上制造了一层额外转换和理解成本。

---

## 最终设计原则

### 1. 层数越少越好，但保留真正有价值的两层语义

最终只保留两层写入抽象：

- `Action`
  - 面向 UI / public API 的用户意图
  - 例如 `field.convert`、`field.duplicate`、`view.create`
- `DocumentOperation`
  - 面向 document reducer / history / commit 的 canonical mutation
  - 例如 `document.field.put`、`document.record.fields.writeMany`

删除 `Command` 层。

### 2. 每个 operation 执行时直接产出 inverse，并直接写入 `CommitImpact`

最终不能再有：

- 先 reduce
- 再 inverse
- 再收集中间提交对象
- 再 diff

最终必须是：

```ts
document + operation + impact -> executeOperation -> { document, inverse }
```

### 3. 不再保留 `OperationEffect` 这一层正式概念

长期最优更简单的做法不是继续设计 effect type，而是直接取消这层中间概念。

正确做法是：

- `executeOperation()` 在执行时直接更新 `CommitImpact`
- `CommitImpact` 内部按 `records / fields / views / activeView / external` 分 namespace
- record/value operation 直接写更 rich 的 `records` namespace
- schema/view operation 只写自己需要的 namespace
- commit 末尾只做一次 `finalizeCommitImpact(impact)`

### 4. 内部只有一条路线：`CommitImpact`

最终必须明确：

- `CommitImpact` 是唯一内部提交事实模型
- derive、调度、trace、增量/重建决策全部只读 `CommitImpact`
- 如果 public API 确实需要一个提交结果对象，最多返回 `CommitSummary`
- `CommitSummary` 只是 `CommitImpact` 的薄投影，不能再演化成第二套详细变化对象

### 5. touched set 只 materialize 一次

真正的 touched record / field / title / schema 集合，只允许在 commit aggregation 阶段构建一次。

之后：

- active index 直接消费
- sections 直接消费
- summary 直接消费
- 不再从第二套提交对象重新推导

### 6. 大范围 bulk 场景必须允许 rebuild

不能迷信 incremental。

最终规则应该是：

- 小 touched 走 incremental
- 大 touched 走 rebuild
- 是否 rebuild 由统一阈值和 view demand 决定

---

## 最终 API 设计

这里分两层写：

- 对外 public write API
- 对内 canonical write API

### 一、public write API

public API 继续保留 namespace 结构，但只保留真正有意义的命名空间，不再额外引入中间命名。

```ts
interface WriteApi {
  records: {
    insert(input: RowCreateInput | readonly RowCreateInput[], target?: RowInsertTarget): void
    patch(target: RecordTarget, patch: RecordPatch): void
    remove(recordIds: readonly RecordId[]): void
    fields: {
      set(recordId: RecordId, fieldId: FieldId, value: unknown): void
      clear(recordId: RecordId, fieldId: FieldId): void
      writeMany(input: RecordFieldWriteManyInput): void
    }
  }
  fields: {
    create(input: FieldCreateInput): void
    patch(fieldId: CustomFieldId, patch: FieldPatch): void
    replace(fieldId: CustomFieldId, field: CustomField): void
    convert(fieldId: CustomFieldId, input: FieldConvertInput): void
    duplicate(fieldId: CustomFieldId): void
    options: {
      create(fieldId: CustomFieldId, input?: FieldOptionCreateInput): void
      reorder(fieldId: CustomFieldId, optionIds: readonly string[]): void
      update(fieldId: CustomFieldId, optionId: string, patch: FieldOptionPatch): void
      remove(fieldId: CustomFieldId, optionId: string): void
    }
    remove(fieldId: CustomFieldId): void
  }
  views: {
    create(input: ViewCreateInput): void
    patch(viewId: ViewId, patch: ViewPatch): void
    open(viewId?: ViewId): void
    remove(viewId: ViewId): void
  }
  external: {
    bumpVersion(source: string): void
  }
}
```

public API 的目标不是“完全等于内部 operation”，而是：

- 对外表达意图足够简单
- 对内 lowering 到很少的 canonical operation

### 二、canonical operation API

`BaseOperation` 建议直接改名为 `DocumentOperation`，避免继续使用语义过弱的命名。

最终 canonical operation 保持精简，只承载 document mutation 本身：

```ts
type DocumentOperation =
  | {
      type: 'document.record.insert'
      records: readonly DataRecord[]
      target?: RowInsertTarget
    }
  | {
      type: 'document.record.patch'
      recordId: RecordId
      patch: Partial<Omit<DataRecord, 'id' | 'values'>>
    }
  | {
      type: 'document.record.remove'
      recordIds: readonly RecordId[]
    }
  | {
      type: 'document.record.fields.writeMany'
      recordIds: readonly RecordId[]
      set?: Partial<Record<FieldId, unknown>>
      clear?: readonly FieldId[]
    }
  | {
      type: 'document.record.fields.restoreMany'
      entries: readonly DocumentRecordFieldRestoreEntry[]
    }
  | {
      type: 'document.field.put'
      field: CustomField
    }
  | {
      type: 'document.field.patch'
      fieldId: CustomFieldId
      patch: Partial<Omit<CustomField, 'id'>>
    }
  | {
      type: 'document.field.remove'
      fieldId: CustomFieldId
    }
  | {
      type: 'document.view.put'
      view: View
    }
  | {
      type: 'document.view.remove'
      viewId: ViewId
    }
  | {
      type: 'document.activeView.set'
      viewId?: ViewId
    }
  | {
      type: 'external.version.bump'
      source: string
    }
```

约束：

- `document.record.fields.restoreMany` 只作为 history / undo inverse operation 存在，不暴露给 public API
- `field.convert`、`field.duplicate`、`view.create` 这些都只是 public action，不进入 canonical operation 层
- canonical operation 的数量要稳定，不为单个 UI feature 继续扩张

### 三、planner 输出

最终 `PlannedWriteBatch` 应该收敛成：

```ts
interface PlannedWriteBatch {
  operations: readonly DocumentOperation[]
  issues: readonly ValidationIssue[]
  canApply: boolean
}
```

必须删除：

- `deltaDraft`

planner 的职责只有：

- 校验
- 生成 ids
- intent lowering
- 维护 action 顺序语义所需的最小 `PlannerState`

planner 不再负责：

- reducer 预执行
- inverse
- semantics draft
- delta draft

### 四、执行层 API

最终执行层的最小中轴应该是：

```ts
interface ExecuteOperationResult {
  document: DataDoc
  inverse: readonly DocumentOperation[]
}

declare function executeOperation(
  document: DataDoc,
  operation: DocumentOperation,
  impact: CommitImpact
): ExecuteOperationResult
```

`executeOperation()` 是整条新写入线的核心。

### 五、CommitImpact API

内部正式概念只保留一个：`CommitImpact`。

它在 commit 生命周期里有两个阶段：

- build phase
  - `executeOperation()` 原地写入
- finalized phase
  - `finalizeCommitImpact()` 原地收尾后，只读消费

这两个阶段不是两个类型，也不应该演化成两个命名对象。

建议最终形态：

```ts
interface CommitImpact {
  records?: {
    inserted?: Set<RecordId>
    removed?: Set<RecordId>
    patched?: Map<RecordId, Set<RecordPatchAspect>>
    touched?: Set<RecordId> | 'all'
    titleChanged?: Set<RecordId>
    valueChangedFields?: Set<FieldId> | 'all'
    recordSetChanged?: boolean
  }

  fields?: {
    schema?: Map<FieldId, {
      aspects: Set<FieldSchemaAspect>
      affectsRecords?: boolean | 'all'
    }>
  }

  views?: {
    changed?: Map<ViewId, {
      queryAspects?: Set<ViewQueryAspect>
      layoutAspects?: Set<ViewLayoutAspect>
      calculationFields?: Set<FieldId> | 'all'
      removed?: true
    }>
  }

  activeView?: {
    before?: ViewId
    after?: ViewId
  }

  external?: {
    versionBumped?: boolean
    source?: string
  }
}

declare function createCommitImpact(): CommitImpact

declare function finalizeCommitImpact(
  impact: CommitImpact
): void

declare function summarizeCommitImpact(
  impact: CommitImpact
): CommitSummary
```

不再需要：

- `OperationEffect`
- `aggregateCommitEffects()`
- `createDeltaCollector()`
- `collector.collect(before, after, operation)`
- `collector.build()`

约束：

- `CommitImpact` 只保留一个对象和一个概念
- `executeOperation()` 只能追加/合并事实，不能回头重新 diff 文档
- `finalizeCommitImpact()` 只做原地收尾，不返回第二个结果对象
- finalized 之后，derive 只读消费同一个 `CommitImpact`
- `inverse` 继续单独返回，不进入 impact

### 六、applyOperations 最终返回值

```ts
interface ApplyOperationsResult {
  document: DataDoc
  undo: readonly DocumentOperation[]
  redo: readonly DocumentOperation[]
  impact: CommitImpact
}
```

最终实现形态应该接近：

```ts
export const applyOperations = (
  document: DataDoc,
  operations: readonly DocumentOperation[]
): ApplyOperationsResult => {
  let nextDocument = document
  const undo: DocumentOperation[] = []
  const impact = createCommitImpact()

  for (const operation of operations) {
    const executed = executeOperation(nextDocument, operation, impact)
    nextDocument = executed.document
    if (executed.inverse.length) {
      undo.unshift(...executed.inverse)
    }
  }

  finalizeCommitImpact(impact)
  return {
    document: nextDocument,
    undo,
    redo: [...operations],
    impact
  }
}
```

---

## 哪些写入需要 rich impact 写入，哪些只需要 lightweight impact 写入

这个问题必须明确，否则 `CommitImpact` 很容易重新长成新的大杂烩。

| 写入族 | 是否必须直接产出 inverse | impact 填充强度 | 必须写哪些 namespace / 字段 |
| --- | --- | --- | --- |
| `document.record.fields.writeMany` | 是 | rich | `records.touched`、`records.titleChanged`、`records.valueChangedFields` |
| `document.record.patch` | 是 | rich | `records.patched`、必要时补 `records.touched` / `records.titleChanged` |
| `document.record.insert` | 是 | rich | `records.inserted`、`records.recordSetChanged` |
| `document.record.remove` | 是 | rich | `records.removed`、`records.recordSetChanged` |
| `document.field.put/patch/remove` | 是 | lightweight | `fields.schema` |
| `document.view.put/remove` | 是 | lightweight | `views.changed` |
| `document.activeView.set` | 是 | lightweight | `activeView.before/after` |
| `external.version.bump` | 是，允许 `[]` | minimal | `external.versionBumped` / `external.source` 或空写入 |

这里最重要的约束是：

- 每个 operation 都要直接产出 inverse
- 但不是每个 operation 都要把所有 namespace 都填满
- record/value 热路径会把 `records` namespace 写得更丰富
- schema/view 热路径只写对 `CommitImpact` 真正有用的 namespace

这能同时满足：

- 性能最优
- 结构简单
- 中轴统一
- 不强行把所有 operation 塞进同一种 payload

---

## 最终写入线

最终整条链路应该长这样：

```ts
Action[]
  -> planActions(document, actions, plannerState)
  -> DocumentOperation[]
  -> applyOperations(document, operations)
  -> executeOperation() x N
  -> finalizeCommitImpact(impact)
  -> { document, undo, redo, impact }
  -> deriveIndex({ document, impact, demand })
  -> deriveViewRuntime({ doc, index, impact })
  -> summarizeCommitImpact(impact) // optional
  -> CommitSummary
```

职责边界如下。

### 1. planner

负责：

- action validation
- action lowering
- 生成 implicit ids
- 维护 action 顺序语义所需最小 shadow state

不负责：

- 真正改 document
- inverse
- impact
- semantics
- touched sets

### 2. executeOperation

负责：

- 真实 document mutation
- 直接生成 inverse
- 直接写入 `CommitImpact`

不负责：

- public summary shape
- active runtime 调度

### 3. finalizeCommitImpact

负责：

- 对同一个 `CommitImpact` 对象做原地收尾
- 只做归一化、空集合裁剪、`'all'` 折叠、只读化约束
- 必要时为 `CommitSummary` 投影准备稳定输入

不负责：

- 再去读 before / after document 做 diff

### 4. deriveIndex / deriveViewRuntime

负责：

- 只基于 `impact` 做派生

不负责：

- 自己重新发现 touched records / fields

---

## CommitImpact 最终设计

`CommitImpact` 不再只是 touched set 容器，而是唯一内部提交事实模型。

它是整条写入线里唯一内部提交事实对象，在 execute 阶段被原地构建，在 finalize 之后被只读消费。它必须同时满足两件事：

- 足够结构化，能直接表达 record / field / view / activeView / external 的变化事实
- 足够适合热路径，能直接支撑 records index、search、sort、group、sections、summary 的判定和调度

建议最终结构：

```ts
interface CommitImpact {
  records?: {
    inserted?: Set<RecordId>
    removed?: Set<RecordId>
    patched?: Map<RecordId, Set<RecordPatchAspect>>
    touched?: Set<RecordId> | 'all'
    titleChanged?: Set<RecordId>
    valueChangedFields?: Set<FieldId> | 'all'
    recordSetChanged?: boolean
  }

  fields?: {
    schema?: Map<FieldId, {
      aspects: Set<FieldSchemaAspect>
      affectsRecords?: boolean | 'all'
    }>
  }

  views?: {
    changed?: Map<ViewId, {
      queryAspects?: Set<ViewQueryAspect>
      layoutAspects?: Set<ViewLayoutAspect>
      calculationFields?: Set<FieldId> | 'all'
      removed?: true
    }>
  }

  activeView?: {
    before?: ViewId
    after?: ViewId
  }

  external?: {
    versionBumped?: boolean
    source?: string
  }
}
```

说明：

- `records` namespace 是最热路径的核心
  - `touched`、`titleChanged`、`valueChangedFields` 直接服务 index / sections / summary
  - `inserted`、`removed`、`recordSetChanged` 直接服务结构变化
  - `patched` 以 `Map<RecordId, Set<RecordPatchAspect>>` 保留 record.patch 的 aspect 级事实
- `fields.schema`
  - 以 `Map<FieldId, ...>` 直接承载 field schema 变化，不再需要平行的 delta item
- `views.changed`
  - 以 `Map<ViewId, ...>` 直接承载 query / layout / calculations 变化，不再需要平行的 view delta
- `activeView`
  - 直接承载 active view 切换
- `external`
  - 只保留外部版本 bump 等极薄信息

为什么要把 impact 升级成这一个对象：

- 这样内部只有一条提交事实路线
- 不再需要再维护一份详细 `CommitDelta`
- derive、trace、调度全都只读同一份数据
- 不容易再长出“从另一份对象反推 touched set”的历史回潮

## CommitSummary 最终定位

`CommitSummary` 不是第二套变化模型，只是 `CommitImpact` 的可选投影。

建议最终结构保持非常薄：

```ts
interface CommitSummary {
  records: boolean
  fields: boolean
  views: boolean
  activeView: boolean
  external: boolean
  created?: {
    records?: readonly RecordId[]
    fields?: readonly FieldId[]
    views?: readonly ViewId[]
  }
}
```

约束：

- `CommitSummary` 只在 public API、trace、调试确实需要时生成
- 内部派生完全不允许读取 `CommitSummary`
- 如果没有外部消费场景，`CommitSummary` 可以彻底省略

---

## history / inverse 的最终原则

### 1. inverse 必须在 execute 同一遍生成

不能再有单独的 `buildInverseOperations()` pass。

最终应该是：

- `document.record.fields.writeMany`
  - 在遍历 record 时直接生成 `DocumentRecordFieldRestoreEntry[]`
  - 如果没有真实变化，则不生成 inverse entry
- `document.record.patch`
  - 直接根据 before record 生成 inverse patch
- `document.record.insert`
  - inverse 直接是 `document.record.remove`
- `document.record.remove`
  - inverse 直接是 `document.record.insert(recordsSnapshot)`
- `document.field.put/patch/remove`
  - 直接根据 before field 生成 inverse
- `document.view.put/remove`
  - 直接根据 before view 生成 inverse
- `document.activeView.set`
  - inverse 直接是把 activeView 改回去

### 2. `document.record.fields.restoreMany` 继续保留

这不是兼容层，而是最简单的 inverse canonical form。

对 bulk value/title 写入来说，最简单的 undo 仍然是：

- 一次 writeMany
- 生成一次 restoreMany

这层不应该删除。

### 3. packed snapshot 不是第一阶段

如果最终完成 execute/impact 收口之后，undo/redo 仍然有明显内存压力，再进入 packed snapshot 压缩。

优先级顺序应该是：

1. 去掉双执行
2. 去掉重复 diff
3. 去掉重复 touched set materialization
4. 最后再压缩 inverse 内存

---

## 哪些需要改，哪些需要删

下面直接按“保留 / 重写 / 删除”列清楚。

### 一、保留但要重写语义的层

#### `dataview/packages/dataview-engine/src/mutate/planner/index.ts`

保留 `planActions()`，但必须重写实现：

- 删除 planner 内的 `reduceOperations()`
- 删除 `deltaDraft`
- 只保留 validation + lowering + minimal planner state

#### `dataview/packages/dataview-core/src/operation/applyOperations.ts`

保留 `applyOperations()` 名字可以，内部必须彻底改写：

- 不再 import inverse builder
- 不再 import delta collector / summary collector
- 改成 `execute -> finalizeImpact`

#### `dataview/packages/dataview-engine/src/mutate/commit/runtime.ts`

保留 commit runtime，但签名必须升级：

- 把 `impact` 传给 `deriveIndex`
- 把 `impact` 传给 `deriveViewRuntime`
- 不再依赖 planner draft 填补语义

### 二、建议重命名或重组的层

#### `dataview/packages/dataview-core/src/contracts/operations.ts`

建议：

- `BaseOperation` 改名为 `DocumentOperation`
- 保留现有 canonical op family
- 明确 `restoreMany` 是 internal history op

#### `dataview/packages/dataview-core/src/commit/semantics.ts`

当前文件承担了两件事：

- aspect 计算 helper
- planner / collector 的 diff 语义构建

建议拆开：

- 保留 aspect helper
- 删除 `buildSemanticDraft()`
- 删除基于 before/after 的 record/value 热路径 diff

如果重构时文件职责已经完全变化，建议直接改名，例如：

- `commit/aspects.ts`

#### `dataview/packages/dataview-core/src/commit/collector.ts`

建议直接删掉 collector 模式，替换为：

- `commit/impact.ts`
- `commit/summary.ts` 或内联 `summarizeCommitImpact()`

执行期直接写同一个 `CommitImpact` 对象，commit 末尾 `finalizeCommitImpact(impact)`

### 三、必须删除的旧实现

#### 类型和中间层

- `dataview/packages/dataview-core/src/contracts/commands.ts`
- `dataview/packages/dataview-core/src/contracts/delta.ts`
- `contracts/index.ts` 中对 `Command` 相关类型的导出
- `contracts/index.ts` 中对 `CommitDelta` 相关类型的导出
- 所有仅为 `Command` 服务的命名和转换

#### planner 相关

- `PlannedWriteBatch.deltaDraft`
- `buildSemanticDraft()` 在 planner 中的调用
- planner 里的 `reduceOperations()` shadow apply

#### inverse / diff 相关

- `buildInverseOperations(before, operation)` 这条独立 pass
- `createDeltaCollector()`
- `DeltaCollector.collect(before, after, operation)`
- `DeltaCollector.build()`
- `collectRecordFieldWriteChanges()` 这种 after-the-fact record/value diff 逻辑

#### active runtime 相关

- 从第二套提交对象重新构建 touched record / touched field sets 的辅助逻辑
- 任何 `delta.entities + delta.semantics -> impact` 的反推逻辑

### 四、需要新增的中轴文件

建议新增：

- `dataview/packages/dataview-core/src/operation/execute.ts`
- `dataview/packages/dataview-core/src/commit/impact.ts` 或等价 helper
- `dataview/packages/dataview-core/src/commit/summary.ts` 或等价 helper
- `dataview/packages/dataview-engine/src/contracts/internal/commitImpact.ts`

是否拆更多文件，取决于实现体量，但不要重新长出新的层。

---

## 逐模块落地方案

### Phase 0：先做命名和层级收口

目标：

- 先把不必要的类型层删掉
- 给后续重构腾空间

改动：

- 删除 `contracts/commands.ts`
- `BaseOperation -> DocumentOperation`
- `contracts/index.ts` 清理相关导出
- 全仓同步 import

验收：

- 仓内只剩 `Action` 和 `DocumentOperation` 两层写入语义

### Phase 1：重写 planner

目标：

- planner 不再预执行文档

改动文件：

- `dataview/packages/dataview-engine/src/mutate/planner/index.ts`
- `dataview/packages/dataview-engine/src/mutate/planner/records.ts`
- `dataview/packages/dataview-engine/src/mutate/planner/fields.ts`
- `dataview/packages/dataview-engine/src/mutate/planner/views.ts`
- `dataview/packages/dataview-engine/src/mutate/planner/shared.ts`

实施要点：

- 删掉 `deltaDraft`
- 删掉 `reduceOperations()`
- 引入最小 `PlannerState`
- 顺序语义只在 planner state 上维护，不触发真正 reducer

`PlannerState` 应该只保存真正需要的东西：

- known record ids / shells
- known field ids / schema shell
- known view ids / activeViewId
- create/duplicate/convert 等 lowering 所需的临时状态

它不应该保存：

- inverse
- impact
- touched sets
- full derived runtime

验收：

- planner 文件里不再 import `reduceOperations`
- planner 文件里不再 import `buildSemanticDraft`

### Phase 2：把 operation 执行改成 execute 模式

目标：

- 每个 operation 在执行时直接产出 inverse，并直接写入 `CommitImpact`

改动文件：

- 新增 `dataview/packages/dataview-core/src/operation/execute.ts`
- 新增 `dataview/packages/dataview-core/src/commit/impact.ts` 或等价 helper
- 修改 `dataview/packages/dataview-core/src/document/records.ts`
- 视需要修改 `dataview/packages/dataview-core/src/document/views.ts`
- 视需要修改 field/document 写入 helper

实施要点：

- `document.record.fields.writeMany`
  - 同一遍循环里完成写入、真实变化判断、restore entries 生成、impact 更新
- `document.record.patch`
  - 同一遍生成 inverse patch 和 impact patch aspects
- `document.record.insert/remove`
  - 直接生成 inverse 和结构 impact 写入
- field/view/activeView 操作
  - 直接基于 before state 计算 impact aspects 和 inverse

验收：

- `applyOperations()` 只依赖 `executeOperation()`
- 热路径不再存在“先执行，再重新发现变化”

### Phase 3：删掉 collector，改成 impact finalize

目标：

- `CommitImpact` 成为唯一提交收集对象

改动文件：

- 删除 `dataview/packages/dataview-core/src/commit/collector.ts`
- 删除或替换 `dataview/packages/dataview-core/src/contracts/delta.ts`
- 重写或拆分 `dataview/packages/dataview-core/src/commit/semantics.ts`
- 新增 `dataview/packages/dataview-core/src/commit/impact.ts`
- 新增 `dataview/packages/dataview-core/src/commit/summary.ts`
- 修改 `dataview/packages/dataview-core/src/operation/applyOperations.ts`

实施要点：

- `createCommitImpact()` 在 commit 开始时创建唯一 impact 对象
- `executeOperation()` 在执行期直接更新这个 impact
- `finalizeCommitImpact()` 在 commit 结束时原地收尾
- 如 public API 确实需要变更概览，再由 `summarizeCommitImpact()` 投影：
  - `CommitSummary`
- `CommitImpact` 是唯一内部提交事实模型
- `CommitSummary` 是可选投影，不参与 derive

验收：

- core 层不再有 collector object pattern
- core 层不再有 record/value after-the-fact diff helper
- core 层不再产出详细 `CommitDelta`

### Phase 4：让 engine 热路径改吃 impact

目标：

- touched sets 只构建一次

改动文件：

- `dataview/packages/dataview-engine/src/mutate/commit/runtime.ts`
- `dataview/packages/dataview-engine/src/active/index/runtime.ts`
- `dataview/packages/dataview-engine/src/active/index/shared.ts`
- `dataview/packages/dataview-engine/src/active/index/records.ts`
- `dataview/packages/dataview-engine/src/active/index/search.ts`
- `dataview/packages/dataview-engine/src/active/index/group/runtime.ts`
- `dataview/packages/dataview-engine/src/active/runtime.ts`
- `dataview/packages/dataview-engine/src/active/snapshot/summary/runtime.ts`

实施要点：

- 需要 touched record / field 的地方，一律改读 `impact`
- 需要 query/layout/calc/activeView 语义的地方，也直接读 `impact.views / impact.activeView`
- 不再允许任何模块从第二套对象反推出 impact

验收：

- active runtime 里没有 `CommitDelta -> Set<RecordId>` 或等价重建逻辑

### Phase 5：sections / summary 增加 bulk-aware rebuild 策略

目标：

- 大范围 bulk 时不再卡在伪 incremental

改动文件：

- `dataview/packages/dataview-engine/src/active/snapshot/sections/sync.ts`
- `dataview/packages/dataview-engine/src/active/snapshot/summary/sync.ts`

实施要点：

- 引入统一阈值：
  - `MAX_SECTION_INCREMENTAL_RECORDS`
  - `MAX_SUMMARY_INCREMENTAL_RECORDS`
- 策略固定为：
  - `impact.records?.touched === 'all'` -> rebuild
  - touched 数超过阈值 -> rebuild
  - 与 group/calc demand 无交集 -> reuse
  - 否则 incremental

验收：

- grouped / summary 大范围 fill、paste、bulk edit 都能稳定走 rebuild fallback

### Phase 6：最后再决定是否压缩 inverse snapshot

目标：

- 只在前五阶段做完后，再决定是否需要 packed history

改动文件：

- `dataview/packages/dataview-core/src/operation/history/*`

实施要点：

- 如果 bench 显示 CPU 已明显下降，但 undo/redo 仍有大对象和 GC 抖动
- 再设计 packed restore entries

这一步不是前置条件。

---

## grouped / summary 的最终策略

这部分必须在架构文档里单独写清楚，因为它是 bulk 场景剩余卡顿的重要来源。

### 1. sections 不再无条件 incremental

最终逻辑：

- 无 group demand -> 跳过
- `impact.records?.touched === 'all'` -> rebuild
- touched record 数过大 -> rebuild
- touched field 与 group field 无交集 -> reuse
- 否则 incremental

### 2. summary 不再无条件 incremental

最终逻辑：

- 无 calc demand -> 跳过
- `impact.records?.touched === 'all'` -> rebuild
- touched record 数过大 -> rebuild
- `impact.records?.valueChangedFields` 与 calc fields 无交集 -> reuse
- 否则 incremental

### 3. rebuild 阈值由 bench 决定，不拍脑袋

阈值不应该先写死成经验值。

必须基于 bench 场景来定：

- flat table
- grouped table
- grouped + summary
- 1k / 10k / 50k records
- 单字段 / 多字段 bulk

---

## Bench 与验收标准

### 一、必须覆盖的场景

至少需要：

1. flat table，单字段 bulk write，1k / 10k / 50k records
2. flat table，多字段 bulk write
3. grouped table，改 group field
4. grouped table + summary，改 calc field
5. field.remove 影响大表
6. view.patch 改 query / layout / calc
7. bulk write 后 undo
8. bulk write 后 redo
9. mixed action batch，验证 planner 顺序语义

### 二、必须观测的指标

1. planner 耗时
2. apply / execute 耗时
3. impact finalize 耗时
4. summary 投影耗时（如果存在）
5. index stages 耗时
6. view / snapshot stages 耗时
7. undo snapshot 体积
8. GC / 内存峰值

### 三、最终验收标准

必须同时满足：

1. planner 中不再有文档预执行
2. 所有 operation 在 execute 时直接产出 inverse
3. record/value 热路径不再依赖 before / after diff 发现变化
4. touched records / fields 在 commit 热路径只 materialize 一次
5. grouped / summary 对大 touched 有 rebuild 策略
6. `records.fields.writeMany` 继续作为唯一公开 bulk 写接口
7. 内部写入线最终只保留 `Action -> DocumentOperation -> execute -> finalizeImpact -> derive`
8. 不再存在详细 `CommitDelta`；如需对外概览，只存在 `CommitSummary`

---

## 风险与约束

### 1. planner 顺序语义不能退化

删除 planner 预执行之后，必须保证：

- 同一批 actions 的 lowering 仍然能看到前序 action 产生的 planner-visible 状态
- 但这套状态不能再次长成第二套 document reducer

### 2. `CommitImpact` 不能变成新的大杂烩

`CommitImpact` 的构建期边界必须严格：

- 只描述执行时已经知道的事实
- 不承载额外 cache
- 不承载外部展示逻辑

### 3. impact 必须保持 internal only

不要把 `CommitImpact` 暴露成 public contract。

否则很快又会反向绑死内部实现。

### 4. 不要为了过渡保留双轨实现

既然目标是长期最优，而且不考虑兼容层，就不应该保留：

- old collector path
- old planner deltaDraft path
- old delta-to-impact reconstruction path
- old detailed `CommitDelta` contract path

重构完成后必须清理干净。

---

## 文档与旧方案的关系

这份文档现在是唯一的总方案文档。

它替代的是“只从 bulk write / fill 性能出发看问题”的思路。

因此后续文档收口建议如下：

- `DATAVIEW_BULK_WRITE_PERFORMANCE_OPTIMIZATION_PLAN.zh-CN.md`
  - 保留当前文件名即可，但内容已经升级为整条写入线重构方案
- `DATAVIEW_TABLE_FILL_BULK_COMMIT_PLAN.zh-CN.md`
  - 在整条写入线完成后，建议删除或缩成历史附录
  - 不应继续作为另一份并行的目标文档

最终只保留一份总方案，避免两套文档长期并存。

---

## 最终建议

如果目标是长期最优，而不是继续做局部性能 patch，那么最合理的推进顺序是：

1. 先删 `Command` 和 planner 预执行
2. 再把 execute / inverse / impact 收到同一遍
3. 再删 collector，改成 finalize impact
4. 再让 active runtime 全面改吃 impact
5. 再给 sections / summary 加 bulk-aware rebuild
6. 最后才看 history packing

这样做的收益是：

- 中轴清晰
- 层数少
- 热路径只做一次真正的工作
- fill / paste / bulk edit / AI 批改值天然复用同一条写入线
- 后续继续做性能优化时，不会再被历史中间层牵着走

最终要达到的不是“某个 bulk 场景快一点”，而是：

- Dataview 拥有一条长期稳定、简单、低复杂度、可复用的写入基础设施
