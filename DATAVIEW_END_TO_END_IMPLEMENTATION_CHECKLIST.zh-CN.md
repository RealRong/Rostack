# Dataview 端到端重构实施 Checklist

这份文档是实施文档，不再重复性能分析。

目标只有一个：

> 让一次 view 变更只做一次必要工作，并让 delta 从 `commit` 一路传到 `source` 和 `layout`，中间不再重新扫描整张 snapshot。

约束也只有一个：

> 不做兼容，不保留旧路径，不接受“双轨实现”。

本文聚焦非渲染链路，范围覆盖：

`commit -> plan -> index -> snapshot -> publish -> source -> layout`

---

## 1. 最终目标

最终系统要满足 6 条硬约束。

1. `plan` 稳定。
   `filter` 的值从空变有效，不得改变 index 需要维护的 bucket/calc/search substrate。
2. `index` 只维护稳定真源。
   `record -> bucketKeys`、`bucketKey -> recordIds`、`field -> calcEntries` 只能有一份真源。
3. `snapshot` 只消费上游 delta。
   `query`、`section`、`summary` 之间不再靠“读完整状态再推导”衔接。
4. `publish` 独立成层。
   `snapshot` 负责业务状态，`publish` 负责 UI 读模型和下游 delta，二者彻底拆开。
5. `source` 只应用 delta。
   不再接受“当前整张 view snapshot”，也不再全量生成 active patch。
6. `layout` 只做结构增量同步。
   不再以 `CurrentView` 为输入，每次全量 `buildDescriptors`。

---

## 2. 设计原则

### 2.1 三类真源

最终只允许保留三类 membership 真源。

1. `query.records`
   唯一的 visible/order 真源。
2. `index.bucket.byField[*].keysByRecord`
   唯一的 bucket membership 真源。
3. `section.keysByRecord`
   唯一的 section membership 真源。

任何下游层都不能再自己反推这些关系。

### 2.2 每层都必须同时定义 state 与 delta

每个 stage 都必须输出：

1. `state`
2. `delta`
3. `trace`

没有 `delta` 的 stage，一定会在下游触发重新扫描。

### 2.3 允许 rebuild 的边界必须前置写死

允许 rebuild 的场景：

1. active view 切换
2. group field / group mode / group interval 改变
3. filter rule 的 field 或 operator 结构改变
4. sort field 集合改变
5. calc field 集合改变
6. view type 或关键 publish shape 改变

不允许触发 index rebuild 的场景：

1. filter value 改变
2. search query 改变
3. sort direction 改变
4. section 折叠状态改变
5. table wrap / line 等展示选项改变

### 2.4 不再以“完整当前态”作为跨层接口

下游输入必须是“上一层产出的变更”，而不是：

1. 当前整个 `ViewState`
2. 当前整个 `ActivePatch`
3. 当前整个 `CurrentView`

---

## 3. 最终链路

最终主流程固定为：

```ts
commit
  -> plan.compileView
  -> plan.diffView
  -> index.sync
  -> snapshot.query.run
  -> snapshot.section.run
  -> snapshot.summary.run
  -> publish.view.diff
  -> publish.source.diff
  -> publish.layout.table.diff
  -> source.apply
  -> layout.table.sync
```

每层的职责固定如下。

1. `plan`
   编译 view 结构，给出稳定的 index 需求和当前执行条件。
2. `index`
   维护 stable substrate，只计算 record 层面的基础索引与 membership。
3. `snapshot`
   基于 `query -> section -> summary` 顺序生成业务态及其 delta。
4. `publish`
   把 snapshot delta 翻译成 UI 可消费的 view/source/layout delta。
5. `source`
   把 source delta 应用到 store，不做推导。
6. `layout`
   把 table layout change 应用到 block model，不做全量建模。

---

## 4. 变更类型矩阵

| 变更类型 | plan | index | snapshot | publish | layout |
| --- | --- | --- | --- | --- | --- |
| filter value 改变 | 只改 `query.execution` | 只做 `sync` | `query/section/summary sync` | 增量 diff | 增量 sync |
| search query 改变 | 只改 `query.execution` | 不改 stable state | `query sync` | 增量 diff | 增量 sync |
| sort direction 改变 | 只改 `query.execution` | 不 rebuild sort field | `query sync` | 增量 diff | 增量 sync |
| filter field / operator 改变 | 改 `query.definition` 与 `index.bucket` | 只 rebuild 受影响 field | `query/section/summary` 按需 rebuild | 增量 diff | 结构 sync |
| group field / mode / interval 改变 | 改 `section` 与 `index.bucket` | rebuild group bucket field | `section/summary rebuild` | 增量 diff | rebuild |
| sort field 集合改变 | 改 `query.definition` 与 `index.sort` | rebuild 受影响 sort field | `query sync` | 增量 diff | 增量 sync |
| calc field 集合改变 | 改 `index.calc` | rebuild 受影响 calc field | `summary rebuild/sync` | 增量 diff | 不变 |
| active view 切换 | 全部重编译 | rebuild | rebuild | rebuild | rebuild |

这张表是实现边界，不是建议。

任何实现如果突破了这张表，说明边界又混了。

---

## 5. 最终 API 定义

API 采用“interface 内按职责分组”，不使用 TS `namespace`，也不做全平铺。

### 5.1 顶层 Runtime API

```ts
export interface DataviewRuntimeApi {
  commit: {
    run(input: RuntimeCommitInput): RuntimeCommitResult
  }
  plan: {
    compileView(input: PlanCompileInput): ViewPlan | undefined
    diffView(input: PlanDiffInput): ViewPlanChange
  }
  index: {
    sync(input: IndexSyncInput): IndexSyncResult
    bucket: {
      read(input: BucketReadInput): BucketFieldState | undefined
    }
  }
  snapshot: {
    query: {
      run(input: QueryRunInput): QueryRunResult
    }
    section: {
      run(input: SectionRunInput): SectionRunResult
    }
    summary: {
      run(input: SummaryRunInput): SummaryRunResult
    }
  }
  publish: {
    view: {
      diff(input: ViewPublishDiffInput): ViewPublishResult
    }
    source: {
      diff(input: SourcePublishDiffInput): SourcePublishResult
    }
    layout: {
      table: {
        diff(input: TableLayoutPublishDiffInput): TableLayoutPublishResult
      }
    }
  }
  source: {
    apply(input: SourceApplyInput): SourceApplyResult
  }
  layout: {
    table: {
      sync(input: TableLayoutSyncInput): TableLayoutSyncResult
    }
  }
  trace: {
    startCommit(input: TraceCommitInput): RuntimeTraceSession
    finishCommit(input: TraceCommitFinishInput): RuntimeCommitTrace
  }
}

export interface RuntimeCommitInput {
  document: DataDoc
  documentChange: DocumentChange
  previous: DataviewRuntimeState
}

export interface RuntimeCommitResult {
  state: DataviewRuntimeState
  delta: RuntimeCommitDelta
  trace: RuntimeCommitTrace
}

export interface DataviewRuntimeState {
  plan?: ViewPlan
  index: IndexState
  snapshot?: ViewSnapshotState
  publish?: ViewPublishState
  source: SourceRuntimeState
  layout: {
    table?: TableLayoutState
  }
}

export interface RuntimeCommitDelta {
  plan: ViewPlanChange
  index: IndexDelta
  snapshot?: ViewSnapshotDelta
  publish?: ViewPublishDelta
  source?: SourceDelta
  layout?: {
    table?: TableLayoutDelta
  }
}

export interface DocumentChange {
  records: {
    changedIds: readonly RecordId[]
    removedIds: readonly RecordId[]
  }
  fields: {
    changedIds: readonly FieldId[]
    removedIds: readonly FieldId[]
  }
  views: {
    changedIds: readonly ViewId[]
    removedIds: readonly ViewId[]
  }
  activeViewChanged: boolean
}
```

### 5.2 Plan API

```ts
export interface PlanCompileInput {
  reader: DocumentReader
  activeViewId?: ViewId
}

export interface PlanDiffInput {
  previous?: ViewPlan
  next?: ViewPlan
}

export interface ViewPlan {
  view: {
    id: ViewId
    type: ViewType
    grouped: boolean
  }
  query: {
    definition: {
      searchFieldIds: readonly FieldId[]
      filterRules: readonly FilterRulePlan[]
      filterMode: View['filter']['mode']
      sortRules: readonly Sorter[]
      orders: View['orders']
    }
    execution: {
      searchQuery?: string
      effectiveFilters: readonly EffectiveFilterPlan[]
      executionKey: string
    }
  }
  index: {
    search: {
      fieldIds: readonly FieldId[]
    }
    bucket: {
      fields: readonly BucketFieldPlan[]
    }
    sort: {
      fieldIds: readonly FieldId[]
    }
    calc: {
      fields: readonly CalcFieldPlan[]
    }
    display: {
      fieldIds: readonly FieldId[]
    }
  }
  section?: {
    fieldId: FieldId
    mode?: ViewGroup['mode']
    bucketSort?: ViewGroup['bucketSort']
    bucketInterval?: ViewGroup['bucketInterval']
    showEmpty: boolean
  }
  publish: {
    query: {
      includeFieldMeta: boolean
    }
    table: {
      includeRowIndex: boolean
      includeCalc: boolean
    }
    gallery: {
      includeGroupColor: boolean
    }
    kanban: {
      includeGroupColor: boolean
      includeCardsPerColumn: boolean
    }
  }
}

export interface FilterRulePlan {
  fieldId: FieldId
  rule: FilterRule
  field?: Field
}

export interface EffectiveFilterPlan {
  fieldId: FieldId
  rule: FilterRule
  field?: Field
}

export interface BucketFieldPlan {
  fieldId: FieldId
  mode?: ViewGroup['mode']
  bucketInterval?: ViewGroup['bucketInterval']
}

export interface CalcFieldPlan {
  fieldId: FieldId
  metric: CalculationMetric
}

export interface ViewPlanChange {
  changed: boolean
  query: {
    definitionChanged: boolean
    executionChanged: boolean
  }
  index: {
    rebuildAll: boolean
    bucketFieldIds: readonly FieldId[]
    sortFieldIds: readonly FieldId[]
    calcFieldIds: readonly FieldId[]
    searchFieldIdsChanged: boolean
  }
  snapshot: {
    rebuildQuery: boolean
    rebuildSection: boolean
    rebuildSummary: boolean
  }
  publish: {
    rebuildView: boolean
    rebuildSource: boolean
    rebuildTableLayout: boolean
  }
}
```

`ViewPlan` 的关键约束：

1. `query.execution` 只表达当前有效条件。
2. `index.bucket.fields` 由 view shape 决定，不由 filter value 是否有效决定。
3. `index.calc.fields` 由 view calc shape 决定，不由当前 touched sections 决定。

### 5.3 Index API

```ts
export interface IndexSyncInput {
  document: DataDoc
  documentChange: DocumentChange
  previous: IndexState
  previousPlan?: ViewPlan
  nextPlan?: ViewPlan
  planChange: ViewPlanChange
}

export interface IndexSyncResult {
  state: IndexState
  delta: IndexDelta
  trace: IndexTrace
}

export interface IndexState {
  records: {
    ids: readonly RecordId[]
    valuesByField: ReadonlyMap<FieldId, FieldValueState>
  }
  search: {
    fieldIds: readonly FieldId[]
    entriesByField: ReadonlyMap<FieldId, SearchFieldState>
  }
  bucket: {
    byField: ReadonlyMap<FieldId, BucketFieldState>
  }
  sort: {
    byField: ReadonlyMap<FieldId, SortFieldState>
  }
  calc: {
    byField: ReadonlyMap<FieldId, CalcFieldState>
  }
}

export interface FieldValueState {
  fieldId: FieldId
  byRecord: ReadonlyMap<RecordId, unknown>
}

export interface SearchFieldState {
  fieldId: FieldId
  textByRecord: ReadonlyMap<RecordId, string>
}

export interface BucketFieldState {
  fieldId: FieldId
  mode?: ViewGroup['mode']
  bucketInterval?: ViewGroup['bucketInterval']
  keysByRecord: ReadonlyMap<RecordId, readonly string[]>
  recordsByKey: ReadonlyMap<string, readonly RecordId[]>
}

export interface SortFieldState {
  fieldId: FieldId
  valuesByRecord: ReadonlyMap<RecordId, unknown>
}

export interface CalcFieldState {
  fieldId: FieldId
  metric: CalculationMetric
  entriesByRecord: ReadonlyMap<RecordId, CalculationEntry>
  capabilities: ReducerCapabilitySet
}

export interface IndexDelta {
  records: {
    changedRecordIds: readonly RecordId[]
    removedRecordIds: readonly RecordId[]
  }
  search: {
    changedFieldIds: readonly FieldId[]
    rebuildFieldIds: readonly FieldId[]
  }
  bucket: {
    changedFieldIds: readonly FieldId[]
    rebuildFieldIds: readonly FieldId[]
    changedRecordIds: readonly RecordId[]
    keysByRecord: ReadonlyMap<RecordId, BucketMembershipDelta>
  }
  sort: {
    changedFieldIds: readonly FieldId[]
    rebuildFieldIds: readonly FieldId[]
  }
  calc: {
    changedFieldIds: readonly FieldId[]
    rebuildFieldIds: readonly FieldId[]
    changedRecordIdsByField: ReadonlyMap<FieldId, readonly RecordId[]>
  }
}

export interface BucketMembershipDelta {
  before: readonly string[]
  after: readonly string[]
}

export interface BucketReadInput {
  state: IndexState
  fieldId: FieldId
}
```

`index.sync` 的关键约束：

1. 不允许再按“整个 bucket demand 是否相等”决定 `sync` 或 `build`。
2. 必须改成“按 field 粒度 sync / rebuild”。
3. `filter value` 改变时，`bucket.rebuildFieldIds` 必须为空。

### 5.4 Snapshot API

```ts
export interface ViewSnapshotState {
  query: QueryState
  section: SectionState
  summary: SummaryState
}

export interface ViewSnapshotDelta {
  query: QueryDelta
  section: SectionDelta
  summary: SummaryDelta
}

export interface QueryRunInput {
  reader: DocumentReader
  plan: ViewPlan
  planChange: ViewPlanChange
  previous?: QueryState
  index: IndexState
  indexDelta: IndexDelta
}

export interface QueryRunResult {
  state: QueryState
  delta: QueryDelta
  trace: QueryTrace
}

export interface QueryState {
  records: {
    visibleIds: readonly RecordId[]
    visibleSet: ReadonlySet<RecordId>
    orderIndexByRecord: ReadonlyMap<RecordId, number>
  }
}

export interface QueryDelta {
  rebuild: boolean
  visibleAdded: readonly RecordId[]
  visibleRemoved: readonly RecordId[]
  movedRecordIds: readonly RecordId[]
  orderChanged: boolean
}

export interface SectionRunInput {
  plan: ViewPlan
  planChange: ViewPlanChange
  previous?: SectionState
  query: QueryState
  queryDelta: QueryDelta
  index: IndexState
  indexDelta: IndexDelta
}

export interface SectionRunResult {
  state: SectionState
  delta: SectionDelta
  trace: SectionTrace
}

export interface SectionState {
  order: readonly SectionKey[]
  byKey: ReadonlyMap<SectionKey, SectionNode>
  keysByRecord: ReadonlyMap<RecordId, readonly SectionKey[]>
}

export interface SectionNode {
  key: SectionKey
  label: string
  visible: boolean
  collapsed: boolean
  recordIds: readonly RecordId[]
}

export interface SectionDelta {
  rebuild: boolean
  orderChanged: boolean
  addedKeys: readonly SectionKey[]
  removedKeys: readonly SectionKey[]
  changedKeys: readonly SectionKey[]
  keysByRecord: ReadonlyMap<RecordId, SectionMembershipDelta>
  recordIdsByKey: ReadonlyMap<SectionKey, readonly RecordId[]>
}

export interface SectionMembershipDelta {
  before: readonly SectionKey[]
  after: readonly SectionKey[]
}

export interface SummaryRunInput {
  plan: ViewPlan
  planChange: ViewPlanChange
  previous?: SummaryState
  section: SectionState
  sectionDelta: SectionDelta
  index: IndexState
  indexDelta: IndexDelta
}

export interface SummaryRunResult {
  state: SummaryState
  delta: SummaryDelta
  trace: SummaryTrace
}

export interface SummaryState {
  bySection: ReadonlyMap<SectionKey, SummaryFieldState>
}

export interface SummaryFieldState {
  byField: ReadonlyMap<FieldId, FieldReducerState>
}

export interface SummaryDelta {
  rebuild: boolean
  changedSectionKeys: readonly SectionKey[]
  removedSectionKeys: readonly SectionKey[]
  changedFieldIdsBySection: ReadonlyMap<SectionKey, readonly FieldId[]>
}
```

`snapshot` 的关键约束：

1. `section` 只能消费 `queryDelta + index.bucket delta`。
2. `summary` 只能消费 `sectionDelta + index.calc delta`。
3. 不允许再给 `summary` 一个 `keysOf(recordId)` 回调，让它自己反查 membership。

### 5.5 Publish API

```ts
export interface ViewPublishDiffInput {
  plan: ViewPlan
  previous?: ViewPublishState
  snapshot: ViewSnapshotState
  snapshotDelta: ViewSnapshotDelta
  reader: DocumentReader
}

export interface ViewPublishResult {
  state: ViewPublishState
  delta: ViewPublishDelta
  trace: PublishTrace
}

export interface ViewPublishState {
  view: {
    ready: boolean
    id?: ViewId
    type?: ViewType
    value?: View
  }
  query: ActiveViewQuery
  items: {
    ids: readonly ItemId[]
    byId: ReadonlyMap<ItemId, ViewItem>
    indexById: ReadonlyMap<ItemId, number>
  }
  sections: {
    keys: readonly SectionKey[]
    byKey: ReadonlyMap<SectionKey, Section>
    itemIdsByKey: ReadonlyMap<SectionKey, readonly ItemId[]>
    summaryByKey: ReadonlyMap<SectionKey, CalculationCollection | undefined>
  }
  fields: {
    all: readonly Field[]
    custom: readonly CustomField[]
  }
  table: {
    wrap: boolean
    showVerticalLines: boolean
    calcByField: ReadonlyMap<FieldId, CalculationMetric | undefined>
  }
  gallery: {
    wrap: boolean
    size: CardSize
    layout: CardLayout
    canReorder: boolean
    groupUsesOptionColors: boolean
  }
  kanban: {
    wrap: boolean
    size: CardSize
    layout: CardLayout
    canReorder: boolean
    groupUsesOptionColors: boolean
    fillColumnColor: boolean
    cardsPerColumn: KanbanCardsPerColumn
  }
}

export interface ViewPublishDelta {
  rebuild: boolean
  view?: ViewPublishState['view']
  query?: Partial<ViewPublishState['query']>
  items?: {
    idsChanged: boolean
    ids?: readonly ItemId[]
    set?: ReadonlyMap<ItemId, ViewItem>
    remove?: readonly ItemId[]
    indexById?: ReadonlyMap<ItemId, number>
  }
  sections?: {
    keysChanged: boolean
    keys?: readonly SectionKey[]
    set?: ReadonlyMap<SectionKey, Section>
    remove?: readonly SectionKey[]
    itemIdsByKey?: ReadonlyMap<SectionKey, readonly ItemId[]>
    summaryByKey?: ReadonlyMap<SectionKey, CalculationCollection | undefined>
  }
  fields?: {
    allChanged: boolean
    customChanged: boolean
    all?: readonly Field[]
    custom?: readonly CustomField[]
  }
  table?: Partial<ViewPublishState['table']>
  gallery?: Partial<ViewPublishState['gallery']>
  kanban?: Partial<ViewPublishState['kanban']>
}

export interface SourcePublishDiffInput {
  previous?: ViewPublishState
  next: ViewPublishState
  delta: ViewPublishDelta
  documentChange: DocumentChange
}

export interface SourcePublishResult {
  delta: SourceDelta
  trace: PublishTrace
}

export interface TableLayoutPublishDiffInput {
  previous?: ViewPublishState
  next: ViewPublishState
  delta: ViewPublishDelta
}

export interface TableLayoutPublishResult {
  delta: TableLayoutChange
  trace: PublishTrace
}
```

`publish` 的关键约束：

1. `snapshot` 不再直接对外发布 `ViewState`。
2. `publish.view.diff` 负责把业务态翻译成 UI 读模型。
3. `publish.source.diff` 和 `publish.layout.table.diff` 负责把 UI 读模型继续翻译成下游专用 delta。

### 5.6 Source API

```ts
export interface SourceRuntimeState {
  document: DocumentSource
  active: ActiveSource
}

export interface SourceDelta {
  document?: {
    records?: EntityPatch<RecordId, DataRecord>
    fields?: EntityPatch<FieldId, CustomField>
    views?: EntityPatch<ViewId, View>
  }
  active?: {
    view?: ViewPublishState['view']
    query?: Partial<ViewPublishState['query']>
    items?: {
      ids?: readonly ItemId[]
      values?: EntityPatch<ItemId, ViewItem>
      index?: EntityPatch<ItemId, number>
    }
    sections?: {
      keys?: readonly SectionKey[]
      values?: EntityPatch<SectionKey, Section>
      itemIds?: EntityPatch<SectionKey, readonly ItemId[]>
      summary?: EntityPatch<SectionKey, CalculationCollection | undefined>
    }
    fields?: {
      all?: EntityPatch<FieldId, Field>
      custom?: EntityPatch<FieldId, CustomField>
      allIds?: readonly FieldId[]
      customIds?: readonly FieldId[]
    }
    table?: Partial<ViewPublishState['table']>
    gallery?: Partial<ViewPublishState['gallery']>
    kanban?: Partial<ViewPublishState['kanban']>
  }
}

export interface EntityPatch<TKey, TValue> {
  set?: ReadonlyMap<TKey, TValue | undefined>
  remove?: readonly TKey[]
}

export interface SourceApplyInput {
  runtime: SourceRuntimeState
  delta: SourceDelta
}

export interface SourceApplyResult {
  changed: boolean
  trace: SourceTrace
}
```

`source.apply` 的关键约束：

1. 不允许读取 `snapshot`。
2. 不允许生成完整 `createActivePatch(snapshot)`。
3. 只允许应用 `SourceDelta`。

### 5.7 Layout API

```ts
export interface TableLayoutChange {
  rebuild: boolean
  grouped: boolean
  sectionOrder?: readonly SectionKey[]
  changedSectionKeys: readonly SectionKey[]
  removedSectionKeys: readonly SectionKey[]
  rowIdsBySection: ReadonlyMap<SectionKey, readonly ItemId[]>
}

export interface TableLayoutSyncInput {
  previous?: TableLayoutState
  change: TableLayoutChange
  metrics: {
    rowHeight: number
    headerHeight: number
  }
  measuredHeights?: ReadonlyMap<string, number>
}

export interface TableLayoutSyncResult {
  state: TableLayoutState
  delta: TableLayoutDelta
  trace: LayoutTrace
}

export interface TableLayoutState {
  grouped: boolean
  blockIds: readonly string[]
  blocksById: ReadonlyMap<string, TableLayoutBlock>
  rowBlockIdByItemId: ReadonlyMap<ItemId, string>
  sectionBlockIdsByKey: ReadonlyMap<SectionKey, readonly string[]>
  measuredHeights: ReadonlyMap<string, number>
  totalHeight: number
  revision: number
}

export interface TableLayoutBlock {
  id: string
  kind: 'column-header' | 'section-header' | 'row' | 'column-footer' | 'create-record'
  sectionKey: SectionKey
  itemId?: ItemId
  top: number
  height: number
}

export interface TableLayoutDelta {
  rebuild: boolean
  changedBlockIds: readonly string[]
  removedBlockIds: readonly string[]
  movedBlockIds: readonly string[]
  totalHeightChanged: boolean
}
```

`layout.table.sync` 的关键约束：

1. 不允许接受 `CurrentView`。
2. 不允许再调用 `fromCurrentView()` 全量建模。
3. block 列表必须持久化，按 section 和 row 局部更新。

### 5.8 Trace API

```ts
export interface RuntimeCommitTrace {
  totalMs: number
  stages: {
    plan: StageTrace
    index: IndexTrace
    query: QueryTrace
    section: SectionTrace
    summary: SummaryTrace
    publishView: PublishTrace
    publishSource: PublishTrace
    publishTableLayout: PublishTrace
    sourceApply: SourceTrace
    tableLayout: LayoutTrace
  }
}

export interface StageTrace {
  changed: boolean
  rebuild: boolean
  inputCount?: number
  outputCount?: number
  durationMs: number
}

export interface IndexTrace extends StageTrace {
  records: StageTrace
  search: StageTrace
  bucket: StageTrace
  sort: StageTrace
  calc: StageTrace
}

export type QueryTrace = StageTrace
export type SectionTrace = StageTrace
export type SummaryTrace = StageTrace
export type PublishTrace = StageTrace
export type SourceTrace = StageTrace
export type LayoutTrace = StageTrace

export interface TraceCommitInput {
  activeViewId?: ViewId
}

export interface RuntimeTraceSession {}

export interface TraceCommitFinishInput {
  session: RuntimeTraceSession
  trace: RuntimeCommitTrace
}
```

---

## 6. 推荐目录落点

建议按职责收敛目录，避免继续把“计划、索引、快照、发布”混在一起。

```txt
dataview/packages/dataview-engine/src/runtime/
  commit.ts
  plan/
    compile.ts
    diff.ts
    contracts.ts
  index/
    sync.ts
    bucket.ts
    search.ts
    sort.ts
    calc.ts
    contracts.ts
  snapshot/
    query/
    section/
    summary/
    contracts.ts
  publish/
    view.ts
    source.ts
    layout.ts
    contracts.ts
  source/
    apply.ts
    contracts.ts
  trace/
    runtime.ts
    contracts.ts

dataview/packages/dataview-react/src/views/table/virtual/
  runtime.ts
  layoutSync.ts
  layoutState.ts
  layoutBlocks.ts
```

如果继续沿用当前“一个 runtime 文件里又推导又发布又 patch”的组织方式，后面还会继续绕回全量化。

---

## 7. 必须删除的旧实现

以下实现不允许保留兼容路径。

1. `active/plan.ts` 中基于 effective filter 是否有效来决定 `bucket demand` 是否存在的逻辑。
2. `active/index/runtime.ts` 中按“整个 demand 是否相等”决定 bucket/calc `sync` 或 `build` 的粗粒度路径。
3. `active/snapshot/runtime.ts` 中“快照生成后直接承担 publish 角色”的耦合。
4. `source/runtime.ts` 中 `createActivePatch(document, snapshot)` 的整张 snapshot 发布路径。
5. `source/runtime.ts` 中 view 变更时整张 active source patch 重建的实现。
6. `dataview-react/src/views/table/virtual/runtime.ts` 中以 `CurrentView` 触发 `TableLayoutModel.fromCurrentView(...)` 的主路径。
7. `dataview-react/src/views/table/virtual/layoutModel.ts` 中 `buildDescriptors(...)` 作为常规增量更新路径的角色。

旧实现如果保留，只会造成：

1. trace 看起来有新链路
2. 真实耗时仍然偷偷走老链路
3. 后续继续双倍维护

---

## 8. 分阶段实施 Checklist

## Phase 0：冻结基线与验收口径

- [ ] 固定 benchmark 场景：`50k table + select is option1`。
- [ ] 固定 trace 输出：至少覆盖 `plan/index/query/section/summary/publish/source/layout`。
- [ ] 在 benchmark 中区分“非渲染耗时”和“渲染耗时”，本轮只验收非渲染。
- [ ] 固定回归场景：空值 -> 有效值、有效值 -> 另一值、清空值、切 group field、切 sort direction。

验收标准：

- [ ] 新旧链路可以用同一份 benchmark 对比。
- [ ] trace 字段命名已经和最终阶段名一致。

## Phase 1：重写 Plan，先把需求稳定下来

- [ ] 重写 `compileViewPlan`，拆成 `query.definition` 与 `query.execution`。
- [ ] `index.bucket.fields` 改为由 view shape 决定。
- [ ] group field 永远进入 `index.bucket.fields`。
- [ ] filter 中出现过的 bucket 型 field 永远进入 `index.bucket.fields`，不看当前 value 是否有效。
- [ ] `index.calc.fields` 只由 `view.calc` shape 决定。
- [ ] 增加 `diffViewPlan`，输出 `ViewPlanChange`。
- [ ] 删除“filter 有值才申请 bucket demand”的旧逻辑。

验收标准：

- [ ] `select` filter 从空值变成 `option1` 时，`plan.index.bucket.fields` 完全不变。
- [ ] `search query` 改变时，`plan.index.*` 完全不变。

## Phase 2：重写 Index，改成按 field 增量同步

- [ ] 重写 `index.sync` 主流程，不再用“整个 demand 相等”控制 `sync/build`。
- [ ] bucket 改成按 `fieldId` 粒度同步。
- [ ] sort 改成按 `fieldId` 粒度同步。
- [ ] calc 改成按 `fieldId` 粒度同步。
- [ ] 每个 field 产出独立 `rebuild` 或 `sync` 结果。
- [ ] `bucket delta` 产出 `changedRecordIds + keysByRecord`。
- [ ] `calc delta` 产出 `changedRecordIdsByField`。
- [ ] 删除 filter value 导致 bucket stage 整体 rebuild 的路径。

验收标准：

- [ ] `select` filter 值改变时，`index.bucket.rebuildFieldIds` 为空。
- [ ] 只改一个 calc field 时，不允许全量 rebuild 其他 calc field。

## Phase 3：重写 Snapshot，改成纯 delta 链

- [ ] `query.run` 只消费 `query.execution + index stable state`。
- [ ] `query.run` 输出明确的 `visibleAdded/visibleRemoved/movedRecordIds`。
- [ ] `section.run` 只消费 `queryDelta + index.bucket delta + group bucket state`。
- [ ] `section.run` 输出 `keysByRecord` 变化和 `recordIdsByKey` 变化。
- [ ] `summary.run` 只消费 `sectionDelta + index.calc delta`。
- [ ] `summary.run` 不再接受 `keysOf(recordId)` 这类回调。
- [ ] 删除 `snapshot` 中任何“直接拼 UI state”的逻辑。

验收标准：

- [ ] section 不再为了读 section membership 自己重新解析 bucket keys。
- [ ] summary 不再为了找 touched sections 反查完整 map。
- [ ] filter value 改变时，summary 只处理受影响 sections。

## Phase 4：新增 Publish 层，切断 snapshot 与 source/layout 的全量耦合

- [ ] 新增 `publish.view.diff`。
- [ ] 新增 `publish.source.diff`。
- [ ] 新增 `publish.layout.table.diff`。
- [ ] `snapshot` 只保留业务态，不再直接发布 UI 读模型。
- [ ] `publish.view.diff` 负责生成 `ViewPublishState + ViewPublishDelta`。
- [ ] `publish.source.diff` 负责翻译为 `SourceDelta`。
- [ ] `publish.layout.table.diff` 负责翻译为 `TableLayoutChange`。

验收标准：

- [ ] `source` 和 `layout` 不再依赖完整 `snapshot`。
- [ ] 只有 `publish` 负责把业务态翻译成 UI 读模型。

## Phase 5：重写 Source Runtime，只做 delta apply

- [ ] 把 `source/runtime.ts` 改成 `apply(document delta + active delta)`。
- [ ] document source 改为基于 `DocumentChange` 发布，不再每次 `createDocumentPatch(document)`。
- [ ] active source 改为基于 `SourceDelta` 发布。
- [ ] 删除 `createActivePatch(document, snapshot)`。
- [ ] 删除 view 变更时整张 active patch 重建路径。

验收标准：

- [ ] filter value 改变时，`items.values.set` 只包含变动 item。
- [ ] filter value 改变时，`sections.summary.set` 只包含变动 section。
- [ ] source apply 本身不再出现“按全量 ids 重新 set 一遍”的路径。

## Phase 6：重写 Table Layout，只做结构增量同步

- [ ] 删除 `TableLayoutModel.fromCurrentView(...)` 作为主路径。
- [ ] 删除 `buildDescriptors(...)` 作为常规更新路径。
- [ ] 新建持久化 `TableLayoutState`。
- [ ] `layout.table.sync` 只接受 `TableLayoutChange`。
- [ ] flat table 中仅 row 变化时，只更新 row blocks。
- [ ] grouped table 中 section order 不变时，只更新受影响 section 的 blocks。
- [ ] 高度树按 block 增量更新，不再整棵重建。

验收标准：

- [ ] filter value 改变但 group shape 不变时，不发生整张 layout rebuild。
- [ ] 同一个 section 内局部 row 变化时，只更新该 section 的 block 集合。

## Phase 7：收敛 Public / Internal Contracts，删除旧形态

- [ ] 统一 `contracts/public.ts` 与 `contracts/internal.ts` 到新阶段模型。
- [ ] 删除把 `snapshot` 直接当作 public read model 的旧定义。
- [ ] 删除围绕旧 `ActivePatch` 设计的整张 patch 结构。
- [ ] 删除旧 trace 命名和旧 stage 定义。
- [ ] 删除所有遗留 adapter、兼容转换、双写路径。

验收标准：

- [ ] 代码库中不存在“新老链路同时保留”的路径。
- [ ] `rg "createActivePatch|fromCurrentView|buildDescriptors"` 只剩允许存在的新定义或完全为空。

## Phase 8：压测、回归、清理

- [ ] 跑 `50k` benchmark，对比旧链路与新链路。
- [ ] 跑 filter/search/sort/group/calc 组合回归。
- [ ] 验证 trace 与实际阶段耗时对得上。
- [ ] 删除死代码、旧测试夹具、旧 perf 名称。
- [ ] 给每个 stage 补最小但关键的 delta 单元测试。

验收标准：

- [ ] 非渲染总耗时稳定进入目标预算。
- [ ] 没有因为删除兼容而丢失功能语义。

---

## 9. 建议验收预算

这是目标预算，不是当前事实。

以 `50k table + select is option1` 为基线，建议把非渲染链路收敛到：

| 阶段 | 目标耗时 |
| --- | --- |
| `plan` | `<= 1ms` |
| `index` | `<= 10ms` |
| `snapshot.query` | `<= 5ms` |
| `snapshot.section` | `<= 5ms` |
| `snapshot.summary` | `<= 5ms` |
| `publish + source` | `<= 6ms` |
| `layout` | `<= 5ms` |
| 非渲染总计 | `<= 30ms` |

如果最终只能把局部热点压低，但总链路还明显高于这个预算，说明系统仍然保留了全量投影或重复计算。

---

## 10. 最终落地判断标准

重构完成后，应当能用下面 6 句话判断系统是否真的收敛。

1. filter value 改变时，`plan.index` 不变。
2. bucket/calc/search 都按 field 粒度 sync，而不是按整组 demand build。
3. `query -> section -> summary` 是纯 delta 链。
4. `source` 不知道 `snapshot` 长什么样。
5. `layout` 不知道 `CurrentView` 长什么样。
6. trace 里已经看不到“局部 sync，但下游全量重建”这种反直觉行为。

只要有一条做不到，就还没有真正完成这次重构。
