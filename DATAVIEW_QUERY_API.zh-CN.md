# Dataview Query API

本文只定义 dataview query runtime 的最终 API 与实施方案。

本文不重复设计思路。设计依据见：

- [`DATAVIEW_EMPTY_FILTER_QUERY_REFACTOR_PLAN.zh-CN.md`](/Users/realrong/Rostack/DATAVIEW_EMPTY_FILTER_QUERY_REFACTOR_PLAN.zh-CN.md)

---

## 1. 最终模块

本次收敛到以下模块：

- `dataview/packages/dataview-engine/src/active/query.ts`
- `dataview/packages/dataview-engine/src/active/demand.ts`
- `dataview/packages/dataview-engine/src/active/snapshot/query/runtime.ts`
- `dataview/packages/dataview-engine/src/active/snapshot/query/derive.ts`
- `dataview/packages/dataview-engine/src/active/index/sort.ts`
- `dataview/packages/dataview-engine/src/active/index/runtime.ts`
- `dataview/packages/dataview-engine/src/contracts/internal.ts`

要求：

- 只新增一个 query 编译模块：`active/query.ts`
- 不新增 query plan store / cache 中间层
- 不新增 demand adapter 中间层
- `resolveViewDemand(...)`、`runQueryStage(...)`、`buildQueryState(...)` 继续保留原入口
- sort demand 变化不再走 full rebuild

---

## 2. 命名空间总览

最终只保留以下命名空间：

- `active/query`
- `active/demand`
- `active/snapshot/query`
- `active/index/sort`
- `active/index/runtime`

约束：

- raw `view.filter.rules` 只用于持久化配置
- effective query 只通过 `active/query` 编译产物进入执行层
- index demand 只消费 compiled query plan
- query stage 不再直接用 raw filter 数量判断快路径

---

## 3. `active/query`

文件：

- `dataview/packages/dataview-engine/src/active/query.ts`

只负责把 raw view 编译成 executable query plan。

```ts
import type {
  Field,
  FieldId,
  View
} from '@dataview/core/contracts'
import type {
  DocumentReader
} from '@dataview/engine/document/reader'

export type EffectiveFilterRule = {
  fieldId: FieldId
  field: Field | undefined
  rule: View['filter']['rules'][number]
}

export type ActiveQueryPlan = {
  search?: {
    query: string
    fieldIds: readonly FieldId[]
  }

  filters: readonly EffectiveFilterRule[]

  demand: {
    searchFieldIds: readonly FieldId[]
    groupFieldIds: readonly FieldId[]
    sortFieldIds: readonly FieldId[]
  }

  watch: {
    search: readonly FieldId[] | 'all'
    filter: readonly FieldId[]
    sort: readonly FieldId[]
  }

  executionKey: string
}

export const compileViewQuery: (
  reader: DocumentReader,
  view: View
) => ActiveQueryPlan
```

编译规则：

- `search.query` 为空时，`plan.search` 为 `undefined`
- ineffective filter 不进入 `plan.filters`
- `status/select/multiSelect/boolean` 的 effective filter 才进入 `plan.demand.groupFieldIds`
- `number/date` 的 effective filter 才进入 `plan.demand.sortFieldIds`
- `plan.watch.search` 仅在存在 effective search 时生效
- `plan.executionKey` 只编码执行层真正使用的内容：
  - effective search
  - effective filters
  - `view.filter.mode`
  - `view.sort`
  - `view.orders`

禁止：

- 不在这里生成 candidate ids
- 不在这里读取 index state
- 不在这里做 runtime cache

---

## 4. `active/demand`

文件：

- `dataview/packages/dataview-engine/src/active/demand.ts`

保留现有入口：

```ts
export const resolveViewDemand: (
  context: DocumentReadContext,
  activeViewId?: ViewId
) => IndexDemand
```

实现改为：

1. 读取 active view
2. `compileViewQuery(context.reader, view)`
3. 用 `plan.demand` 生成 query 相关 demand
4. 与 `view.group`、`view.sort`、`view.display`、`view.calc` 合并

最终规则：

- `search.fieldIds` 来自 `plan.demand.searchFieldIds`
- filter 派生的 group demand 只来自 `plan.demand.groupFieldIds`
- filter 派生的 sort demand 只来自 `plan.demand.sortFieldIds`
- persisted empty filter 不得扩大 `groups`
- persisted empty filter 不得扩大 `sortFields`

---

## 5. `active/snapshot/query`

文件：

- `dataview/packages/dataview-engine/src/active/snapshot/query/runtime.ts`
- `dataview/packages/dataview-engine/src/active/snapshot/query/derive.ts`
- `dataview/packages/dataview-engine/src/contracts/internal.ts`

### 5.1 `QueryState`

`QueryState` 新增最小 plan 快照，不挂完整 plan。

```ts
export interface QueryState {
  plan: {
    executionKey: string
    watch: {
      search: readonly FieldId[] | 'all'
      filter: readonly FieldId[]
      sort: readonly FieldId[]
    }
  }

  records: ViewRecords

  search?: {
    query: string
    sourceKey: string
    sourceRevisionKey: string
    matched: readonly RecordId[]
  }

  visibleSet?: ReadonlySet<RecordId>
  order?: ReadonlyMap<RecordId, number>
}
```

### 5.2 `runQueryStage`

保留入口：

```ts
export const runQueryStage: (input: {
  reader: DocumentReader
  activeViewId: ViewId
  previousViewId?: ViewId
  impact: ActiveImpact
  view: View
  index: IndexState
  previous?: QueryState
  previousPublished?: ViewRecords
}) => {
  action: DeriveAction
  state: QueryState
  records: ViewRecords
  deriveMs: number
  publishMs: number
  metrics: ViewStageMetrics
}
```

实现改为：

1. 先执行 `const plan = compileViewQuery(reader, view)`
2. `resolveQueryAction(...)` 只比较：
   - active view 是否切换
   - `previous.plan.executionKey` 与 `plan.executionKey`
   - touched fields 是否命中 `plan.watch`
   - record set 是否变化
3. `buildQueryState(...)` 直接消费 `plan`

### 5.3 `buildQueryState`

改造后的入口：

```ts
export const buildQueryState: (input: {
  reader: DocumentReader
  view: View
  index: IndexState
  plan: ActiveQueryPlan
  previous?: QueryState
}) => QueryState
```

执行规则：

- `!plan.search && plan.filters.length === 0` 时直接走 passthrough fast path
- filter candidate / predicate 只基于 `plan.filters`
- 不再使用 `view.filter.rules.length === 0` 判断快路径
- 返回结果必须写入 `state.plan.executionKey` 和 `state.plan.watch`

---

## 6. `active/index/sort`

文件：

- `dataview/packages/dataview-engine/src/active/index/sort.ts`

保留：

- `buildSortIndex(...)`
- `syncSortIndex(...)`

新增：

```ts
export const reconcileSortIndex: (input: {
  previous: SortIndex
  context: IndexReadContext | IndexDeriveContext
  records: RecordIndex
  fieldIds: readonly FieldId[]
}) => SortIndex

export const deriveSortIndex: (input: {
  previous: SortIndex
  context: IndexDeriveContext
  records: RecordIndex
  fieldIds: readonly FieldId[]
}) => SortIndex
```

语义：

- `reconcileSortIndex(...)` 只做两件事：
  - 删除 demand 中已不存在的 field index
  - 为 demand 中新增的 field index 做 ensure/build
- `deriveSortIndex(...)` 固定顺序为：
  - `syncSortIndex(previous, context, records)`
  - `reconcileSortIndex(...)`

要求：

- additive demand 只能补建新增字段
- removal demand 只能删除移除字段
- 已存在且仍被 demand 的字段必须复用
- `updatedAt` 这类已有 sort field 不得因新增空 filter 而重建

---

## 7. `active/index/runtime`

文件：

- `dataview/packages/dataview-engine/src/active/index/runtime.ts`

保留：

- `runIndexDemandStage(...)` 继续服务 group / calculations

改造：

- sort stage 不再走 `runIndexDemandStage(...)`
- sort stage 直接调用 `deriveSortIndex(...)`

目标行为：

- demand 不变：`sync + reconcile`
- demand 新增字段：`sync + 补建新增字段`
- demand 移除字段：`sync + 删除移除字段`
- 仅在 `createIndexState(...)` 初建时使用 `buildSortIndex(...)`

---

## 8. 实施顺序

### Phase 1

新增 `active/query.ts`，完成：

- `ActiveQueryPlan`
- `EffectiveFilterRule`
- `compileViewQuery(...)`

### Phase 2

改造 `active/demand.ts`，让 demand 全量切到 compiled plan。

完成标准：

- empty number/date filter 不再进入 `sortFields`
- empty select/status/multiSelect/boolean filter 不再进入 `groups`

### Phase 3

改造 `active/snapshot/query/runtime.ts`、`active/snapshot/query/derive.ts`、`contracts/internal.ts`。

完成标准：

- `QueryState` 持有最小 `plan` 快照
- empty persisted filter 不再破坏 passthrough fast path
- raw filter 结构变化但 execution 未变时，query stage 可以 `reuse`

### Phase 4

改造 `active/index/sort.ts`、`active/index/runtime.ts`。

完成标准：

- sort demand 变化不再 full rebuild
- additive demand 只补建缺失字段
- 50k 数据下新增空 filter 不再重建已有 `updatedAt` sort index

### Phase 5

补测试与性能回归保护。

---

## 9. 测试清单

优先落在以下文件：

- `dataview/packages/dataview-engine/test/indexDerive.test.ts`
- `dataview/packages/dataview-engine/test/viewQueryRuntime.test.ts`

测试项：

1. persisted empty number filter 不扩大 `sortFields`
2. persisted empty date filter 不扩大 `sortFields`
3. persisted empty select filter 不扩大 `groups`
4. persisted empty status filter 不扩大 `groups`
5. persisted empty multiSelect filter 不扩大 `groups`
6. persisted empty boolean filter 不扩大 `groups`
7. `search` 为空且 `plan.filters.length === 0` 时走 passthrough fast path
8. raw filter rule 数量大于 `0` 但全部 ineffective 时，query stage 仍可 `reuse`
9. sort demand 从 `['updatedAt']` 变成 `['updatedAt', 'amount']` 时，只新增 `amount`
10. sort demand 从 `['updatedAt', 'amount']` 变成 `['updatedAt']` 时，只删除 `amount`
11. 50k records + `updatedAt(date)` 排序下，新增空 number filter 不得重建 `updatedAt`

---

## 10. 交付标准

以下结果同时成立才算完成：

- empty filter 仍然持久化
- empty filter 不再触发错误的 query fast path 失效
- empty filter 不再触发错误的 group/sort demand 扩张
- sort demand 变化不再重建已有 sort field index
- API 入口数不增加
- 新增模块数仅 `1`
