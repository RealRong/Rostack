# Active Derive 重构设计

目标：针对当前 active runtime 里 `group / sections / summary` 的重复计算问题，做一次底层模型重构。

这份文档只回答 3 件事：

1. 要不要从底层重构。
2. 重构的核心模型应该是什么。
3. 最终 API 应该长什么样，且 API 必须按职责分组，不平铺。

## 结论

需要从底层重构，但不需要再加一层更泛的 `reader` 或 `context`。

当前瓶颈不是“读 document 的入口不统一”，而是“同一个派生事实没有唯一真源”：

- bucket membership 在 `filter` 和 `section` 两套链路里各算一遍。
- section state 只有 `section -> records`，没有常驻 `record -> sections`，导致 sync 时反建。
- summary 没有直接消费 section delta，而是在自己的循环里再次推导 membership。

所以重构方向应该是：

1. 保留现有 document reader / derive context 体系。
2. 新增共享的派生模型层。
3. 把 membership 和 delta 变成一等公民。
4. 让下游 stage 直接消费上游 delta，不再反推。

一句话概括：

> 这次要重构的是 derived model，不是 read context。

## 设计目标

### 1. 一个事实只有一个真源

以下事实只能有一份主数据：

- `record -> bucketKeys`
- `bucketKey -> recordIds`
- `record -> sectionKeys`
- `sectionKey -> recordIds`

不能再允许 query、section、summary 各自把它们推一遍。

### 2. membership 和 meta 分离

当前 `section group index` 同时包含：

- membership
- bucket descriptors
- bucket order

这会导致 bucket sort 之类的纯展示配置也把底层 membership 绑进去。

重构后要拆成：

- membership：只描述属于哪个 key
- meta：只描述 key 的展示信息和顺序

### 3. delta 直接向下传

当前 `summary` 不直接吃 `section` 的结果，而是又去 `resolver.has(...)`。

重构后要做到：

- `bucket` 产出 `BucketChange`
- `section` 产出 `SectionChange`
- `summary` 直接消费 `SectionChange + CalcChange`

### 4. API 短、清晰、按职责分组

要求：

- 不再出现大量 `resolveXxxSomethingDemandFromYyy` 这种名字。
- 统一用短动词：`compile / build / sync / run / read / keyOf / diff`。
- API 通过接口字段分组，例如 `engine.plan.* / engine.index.bucket.* / engine.view.section.*`。

## 旧模型的问题

### 1. `group` 这个名字把两层概念混在了一起

当前 `group` 同时承担：

- filter 的 bucket candidate index
- section 的 group index
- bucket metadata / order

但实际上这三者不是一个层级：

- filter 需要的是 bucket membership
- section 需要的是 membership + section meta
- summary 需要的是 section delta

所以继续沿用 `group` 这个总名，只会让状态边界越来越糊。

### 2. `capability: 'filter' | 'section'` 是错误的复用单位

当前按 capability 区分：

- `FilterBucketIndex`
- `SectionGroupIndex`

这会直接导向两套平行实现。

正确的复用单位应该是：

- membership spec

也就是“这个 field 在什么 bucket 规则下把 record 映射到 key”。

### 3. section 缺失反向索引

当前 `SectionState` 只有：

- `order`
- `byKey`

缺：

- `keysByRecord`

这会直接导致：

- 小 diff 时按 section 扫 `includes(recordId)`
- 大 diff 时临时反建整张 map

### 4. summary 依赖 resolver，而不是依赖 delta

当前 summary sync 的输入里最关键的是：

- `resolver`
- `impact`

但它真正需要的不是“重新判断 membership”，而是：

- 哪些 record 从哪个 section 移走了
- 哪些 record 加到了哪个 section
- 哪些 record 在 section 内 value 变了

所以它应该直接吃 delta。

## 新模型

新模型分 5 层：

1. `plan`：编译 view，产出稳定 plan 和 index demand。
2. `index`：维护 records/search/bucket/sort/calc 五类索引。
3. `query`：根据 plan 和 index 产出 matched / ordered / visible。
4. `section`：根据 query + bucket membership 产出 section state 和 section delta。
5. `summary`：根据 section delta + calc delta 增量维护 summaries。

其中最关键的是新增两类基础模型：

- `BucketMembership`
- `SectionState.keysByRecord`

## 核心概念

### 1. `BucketSpec`

`BucketSpec` 表示“如何把 record 映射到 bucket key”。

它只包含会影响 membership 的配置，不包含纯展示配置。

```ts
export interface BucketSpec {
  fieldId: FieldId
  mode?: ViewGroup['mode']
  interval?: ViewGroup['bucketInterval']
}
```

注意：

- `bucketSort` 不应该进入 `BucketSpec`
- 因为 `bucketSort` 只影响 section order，不影响某条 record 属于哪个 bucket

这点非常重要。它会让“排序变了”不再触发底层 membership 重建。

### 2. `BucketMembership`

这是 bucket 层唯一的真源。

```ts
export interface BucketMembership {
  keysByRecord: ReadonlyMap<RecordId, readonly BucketKey[]>
  recordsByKey: ReadonlyMap<BucketKey, readonly RecordId[]>
}
```

用途：

- query filter 直接用 `recordsByKey`
- section stage 直接用 `keysByRecord / recordsByKey`

### 3. `BucketChange`

这是 bucket sync 的增量输出。

```ts
export interface BucketChange {
  touchedKeys: ReadonlySet<BucketKey>
  add: ReadonlyMap<BucketKey, readonly RecordId[]>
  del: ReadonlyMap<BucketKey, readonly RecordId[]>
  nextKeysByRecord: ReadonlyMap<RecordId, readonly BucketKey[]>
}
```

### 4. `SectionConfig`

`section` 是 view 层概念，不应该塞回 index。

```ts
export interface SectionConfig {
  fieldId: FieldId
  mode?: ViewGroup['mode']
  sort?: ViewGroup['bucketSort']
  interval?: ViewGroup['bucketInterval']
  showEmpty: boolean
}
```

这里故意把 `bucketSort` 内部缩成 `sort`，减少命名噪音。

### 5. `SectionState`

重构后的 section state 需要同时保留双向关系。

```ts
export interface SectionNode {
  key: SectionKey
  label: Token
  color?: string
  bucket?: SectionBucket
  collapsed: boolean
  visible: boolean
  recordIds: readonly RecordId[]
}

export interface SectionState {
  order: readonly SectionKey[]
  byKey: ReadonlyMap<SectionKey, SectionNode>
  keysByRecord: ReadonlyMap<RecordId, readonly SectionKey[]>
}
```

这里的 `keysByRecord` 是本次重构的关键字段。

### 6. `SectionChange`

section sync 不只返回 state，还必须返回 delta。

```ts
export interface SectionChange {
  touched: ReadonlySet<SectionKey>
  add: ReadonlyMap<SectionKey, readonly RecordId[]>
  del: ReadonlyMap<SectionKey, readonly RecordId[]>
  nextKeysByRecord: ReadonlyMap<RecordId, readonly SectionKey[]>
  orderChanged?: true
}
```

### 7. `CalcChange`

当前 `EntryChange` 思路可以保留，但命名统一成 `CalcChange`。

```ts
export interface CalcEntry {
  empty?: boolean
  uniqueKey?: string
  number?: number
  optionIds?: readonly string[]
}

export interface CalcChange {
  changed: ReadonlySet<RecordId>
  prev: ReadonlyMap<RecordId, CalcEntry | undefined>
  next: ReadonlyMap<RecordId, CalcEntry | undefined>
  rebuild?: true
}
```

## 运行时状态重构

### 新的 `IndexState`

`index` 只保留“可跨 stage 复用”的索引，不再把 section meta 混进去。

```ts
export interface IndexState {
  records: RecordsState
  search: SearchState
  bucket: BucketStore
  sort: SortState
  calc: CalcStore
}
```

### 新的 `ViewCache`

内部 cache 改成按 stage 对齐：

```ts
export interface ViewCache {
  query: QueryState
  section: SectionState
  summary: SummaryState
  items: ItemProjectionCache
}
```

注意这里把 `sections` 改成单数 `section`，因为它是一个 stage state。

## 命名规则

重构后统一遵守下面的命名规则：

### 状态

- `State`：当前完整状态
- `Store`：索引集合或按 key 管理的状态容器
- `Node`：单个 section 或 bucket 的展示节点

### 增量

- `Change`：某层的增量结果
- `Diff`：纯函数对比结果

### 动作

- `compile`：从 view config 编译 plan
- `build`：从零构建状态
- `sync`：基于 touched records 做增量更新
- `run`：stage 主入口
- `read`：从 store/state 读取派生结果
- `keyOf`：生成稳定 key

## 最终 API 设计

下面给出最终 API。这里不使用 TypeScript `namespace` 关键字。职责分层通过接口字段表达；实现上仍然按目录和模块拆分，并由 `index.ts` 做 re-export。

```ts
interface EngineApi {
  plan: PlanApi
  index: IndexApi
  view: ViewApi
  runtime: RuntimeApi
}
```

---

### `plan`

职责：

- 编译 view
- 生成 query plan
- 生成 index demand

```ts
interface ViewPlan {
  query: QueryPlan
  demand: IndexDemand
  section?: SectionConfig
  calcFields: readonly FieldId[]
}

interface PlanApi {
  compile(
    reader: DocumentReader,
    view: ViewConfig
  ): ViewPlan
}
```

说明：

- `plan.compile(...)` 取代现在分散在 `compileViewQuery` 和 `resolveViewDemand` 两处的逻辑。
- `query plan` 和 `index demand` 同时产出，保证只有一份 view 编译结果。

---

### `index`

职责：

- 统一派生 records/search/bucket/sort/calc
- 返回 stage 可复用索引和各自 delta

```ts
interface IndexDemand {
  fields: readonly FieldId[]
  search: readonly FieldId[]
  bucket: readonly BucketSpec[]
  sort: readonly FieldId[]
  calc: readonly CalcSpec[]
}

interface IndexDelta {
  bucket: ReadonlyMap<string, BucketChange>
  calc: ReadonlyMap<FieldId, CalcChange>
}

interface IndexResult {
  state: IndexState
  delta: IndexDelta
  trace?: IndexTrace
}

interface IndexApi {
  create(
    doc: DataDoc,
    demand: IndexDemand
  ): IndexResult

  derive(
    prev: IndexState,
    input: {
      doc: DataDoc
      base: BaseChange
      demand: IndexDemand
    }
  ): IndexResult

  bucket: BucketApi
  calc: CalcApi
}
```

说明：

- `index.derive(...)` 直接返回 `delta`
- 不再让下游从 `impact` 里二次猜测 bucket/calc 变了什么

---

### `bucket`

职责：

- 维护 record/bucket membership
- 为 filter 和 section 提供统一真源

```ts
interface BucketState extends BucketMembership {
  spec: BucketSpec
}

interface BucketStore {
  bySpec: ReadonlyMap<string, BucketState>
  rev: number
}

interface BucketApi {
  keyOf(spec: BucketSpec): string

  build(
    input: {
      reader: DocumentReader
      records: RecordsState
      spec: BucketSpec
    }
  ): BucketState

  sync(
    prev: BucketState,
    input: {
      reader: DocumentReader
      records: RecordsState
      touched: ReadonlySet<RecordId>
    }
  ): { state: BucketState; change?: BucketChange }

  read(
    store: BucketStore,
    spec: BucketSpec
  ): BucketState | undefined
}
```

说明：

- `BucketState` 不再区分 `filter` / `section`
- section 专属的 meta 不放在这里

---

### `section`

职责：

- 根据 query + bucket membership 维护 section state
- 产出 section delta

```ts
interface SectionResult {
  state: SectionState
  change?: SectionChange
  items: ItemProjectionCache
}

interface SectionApi {
  build(
    input: {
      cfg?: SectionConfig
      query: QueryState
      bucket?: BucketState
      prev?: SectionState
    }
  ): SectionState

  sync(
    prev: SectionState,
    input: {
      cfg?: SectionConfig
      query: QueryState
      bucket?: BucketState
      bucketChange?: BucketChange
      queryChange?: QueryChange
    }
  ): { state: SectionState; change?: SectionChange }

  readKeys(
    state: SectionState,
    recordId: RecordId
  ): readonly SectionKey[]

  has(
    state: SectionState,
    recordId: RecordId,
    key: SectionKey
  ): boolean
}
```

说明：

- `SectionState.keysByRecord` 让 `readKeys`/`has` 变成 O(1) map read
- `section.sync(...)` 的输入不再是模糊的 `impact`，而是明确的 `bucketChange` 和 `queryChange`

---

### `calc`

职责：

- 维护 field-level calculation entries 和 global reducers

```ts
interface CalcNeed {
  count?: true
  unique?: true
  numeric?: true
  option?: true
}

interface CalcSpec {
  fieldId: FieldId
  need: CalcNeed
}

interface CalcFieldState {
  fieldId: FieldId
  need: CalcNeed
  entries: ReadonlyMap<RecordId, CalcEntry>
  global: FieldReducerState
}

interface CalcStore {
  byField: ReadonlyMap<FieldId, CalcFieldState>
  rev: number
}

interface CalcApi {
  build(
    input: {
      reader: DocumentReader
      records: RecordsState
      spec: CalcSpec
    }
  ): CalcFieldState

  sync(
    prev: CalcFieldState,
    input: {
      reader: DocumentReader
      records: RecordsState
      touched: ReadonlySet<RecordId>
    }
  ): { state: CalcFieldState; change?: CalcChange }

  read(
    store: CalcStore,
    fieldId: FieldId
  ): CalcFieldState | undefined
}
```

说明：

- `capabilities` 改名为 `need`
- 语义更直接：这个 field summary 需要哪些 reducer 能力

---

### `query`

职责：

- 根据 `plan.query` 和 `index` 产出 records state
- 给下游提供 query delta

```ts
interface QueryPlan {
  search?: {
    query: string
    fields: readonly FieldId[]
  }
  filters: readonly EffectiveFilterRule[]
  watch: {
    search: readonly FieldId[] | 'all'
    filter: readonly FieldId[]
    sort: readonly FieldId[]
  }
  key: string
}

interface QueryState {
  plan: QueryPlan
  records: ViewRecords
  visibleSet?: ReadonlySet<RecordId>
  order?: ReadonlyMap<RecordId, number>
}

interface QueryChange {
  add: readonly RecordId[]
  del: readonly RecordId[]
  orderChanged?: true
  rebuild?: true
}

interface QueryResult {
  state: QueryState
  change?: QueryChange
  records: ViewRecords
}

interface QueryApi {
  run(
    prev: QueryState | undefined,
    input: {
      plan: QueryPlan
      view: ViewConfig
      reader: DocumentReader
      index: IndexState
      base: BaseChange
      prevRecords?: ViewRecords
    }
  ): QueryResult
}
```

说明：

- `QueryState.plan` 里不再重复包一层 `executionKey`
- 直接叫 `key`

---

### `summary`

职责：

- 根据 `SectionChange` 和 `CalcChange` 增量维护 summaries

```ts
interface SummaryState {
  bySection: ReadonlyMap<SectionKey, ReadonlyMap<FieldId, FieldReducerState>>
}

interface SummaryResult {
  state: SummaryState
  published: ReadonlyMap<SectionKey, CalculationCollection>
}

interface SummaryApi {
  build(
    input: {
      section: SectionState
      calc: CalcStore
      fields: readonly FieldId[]
    }
  ): SummaryState

  sync(
    prev: SummaryState,
    input: {
      section: SectionState
      sectionChange?: SectionChange
      calc: CalcStore
      calcChange: ReadonlyMap<FieldId, CalcChange>
      fields: readonly FieldId[]
    }
  ): SummaryState
}
```

说明：

- `summary.sync(...)` 不再接收 `resolver`
- 所有 membership 判断都应从 `SectionState.keysByRecord` 或 `SectionChange` 来

---

### `view`

职责：

- 编排 `query -> section -> summary`
- 发布 snapshot

```ts
interface ViewResult {
  cache: ViewCache
  snapshot?: ViewState
  trace?: ViewTrace
}

interface ViewApi {
  create(
    input: {
      doc: DataDoc
      reader: DocumentReader
      plan: ViewPlan
      index: IndexState
    }
  ): ViewResult

  derive(
    prev: {
      cache: ViewCache
      snapshot?: ViewState
    },
    input: {
      doc: DataDoc
      reader: DocumentReader
      view: ViewConfig
      plan: ViewPlan
      index: IndexResult
      base: BaseChange
      capturePerf: boolean
    }
  ): ViewResult

  query: QueryApi
  section: SectionApi
  summary: SummaryApi
}
```

说明：

- `view.derive(...)` 只吃结构化输入
- 下游 stage 不再自己从 `impact` 里找自己关心的那部分

---

### `runtime`

职责：

- 负责 orchestration，不负责再做额外推导

```ts
interface RuntimeApi {
  create(
    input: {
      doc: DataDoc
      historyCap: number
      capturePerf: boolean
    }
  ): EngineRuntimeState

  commit(
    input: {
      prev: EngineRuntimeState
      doc: DataDoc
      base: BaseChange
      capturePerf: boolean
    }
  ): EngineRuntimeState
}
```

## 推荐的目录结构

```txt
active/
  plan/
    index.ts
  index/
    runtime.ts
    records.ts
    search.ts
    sort.ts
    bucket.ts
    calc.ts
  query/
    runtime.ts
  section/
    runtime.ts
    publish.ts
  summary/
    runtime.ts
    publish.ts
  delta/
    base.ts
  view/
    runtime.ts
```

建议：

- 去掉现在 `active/index/group/*`
- 新增 `active/index/bucket.ts`
- `section` 成为明确的 stage，而不是“group index 的一部分”

## 新的主流程

```ts
const p = api.plan.compile(reader, view)

const ix = api.index.derive(prev.index, {
  doc,
  base,
  demand: p.demand
})

const q = api.view.query.run(prev.cache.query, {
  plan: p.query,
  view,
  reader,
  index: ix.state,
  base,
  prevRecords: prev.snapshot?.records
})

const sectionBucket = p.section
  ? api.index.bucket.read(ix.state.bucket, {
      fieldId: p.section.fieldId,
      mode: p.section.mode,
      interval: p.section.interval
    })
  : undefined

const sectionDelta = p.section
  ? ix.delta.bucket.get(api.index.bucket.keyOf({
      fieldId: p.section.fieldId,
      mode: p.section.mode,
      interval: p.section.interval
    }))
  : undefined

const s = api.view.section.sync(prev.cache.section, {
  cfg: p.section,
  query: q.state,
  bucket: sectionBucket,
  bucketChange: sectionDelta,
  queryChange: q.change
})

const m = api.view.summary.sync(prev.cache.summary, {
  section: s.state,
  sectionChange: s.change,
  calc: ix.state.calc,
  calcChange: ix.delta.calc,
  fields: p.calcFields
})
```

这条链的重点是：

- `section` 不再从旧 state 反推 membership
- `summary` 不再从 resolver 重算 section membership

## 迁移策略

### 第一阶段：先抽共享 bucket membership

目标：

- 去掉 `FilterBucketIndex` / `SectionGroupIndex` 两套平行 membership 逻辑

动作：

1. 新增 `BucketSpec / BucketState / BucketStore`
2. `resolveViewDemand` 迁移到 `plan.compile`
3. query filter candidate 改用 `api.index.bucket.read(...)`

### 第二阶段：section state 加 `keysByRecord`

目标：

- 去掉 `createSectionMembershipResolverFromState(...).ensureByRecord()`

动作：

1. `api.view.section.build` 产出 `keysByRecord`
2. `api.view.section.sync` 直接维护 `keysByRecord`
3. 所有 `resolver` 调用先收缩到 `api.view.section.readKeys / api.view.section.has`

### 第三阶段：summary 改吃 delta

目标：

- 去掉 `summary.sync` 里的大部分 membership 反查

动作：

1. `api.view.section.sync` 返回 `SectionChange`
2. `api.view.summary.sync` 直接消费 `SectionChange + CalcChange`
3. 删除对旧 `resolver` 的依赖

### 第四阶段：移除旧 group 能力层

目标：

- 从命名和代码结构上彻底去掉“group 同时表示 bucket index 和 section state”的混合概念

动作：

1. 删除 `GroupCapability`
2. 删除 `FilterBucketIndex`
3. 删除 `SectionGroupIndex`
4. 统一改成 `bucket` + `section`

## 这个设计为什么比“再加一层 context”更对

如果只是再加一个更底层的 `reader/context`，会发生 3 件事：

1. 调用参数可能更整洁。
2. 重复计算仍然存在。
3. 复杂度会被藏起来，而不是被消掉。

这次真正需要的是：

- 统一派生结果
- 统一增量结构
- 统一 stage 边界

所以正确方向不是“把读取统一”，而是“把已派生事实统一”。

## 最终裁决

需要重构，而且应该是底层模型重构。

重构后的最小核心变化只有 3 个：

1. `group` 拆成 `bucket` 和 `section`
2. `SectionState` 常驻 `keysByRecord`
3. `summary.sync` 直接消费 `SectionChange + CalcChange`

只要这 3 件事做对，重复计算会显著下降，API 也会比现在更短、更稳、更清晰。
