# Dataview Engine 全链路降复杂度重构设计

本文不是讨论某一个局部热点，而是给出 `dataview-engine` 下一轮长期重构的完整设计。目标只有三个：

1. 降低复杂度。
2. 降低出错概率。
3. 性能不下降。

这份设计基于当前代码和最近暴露出来的问题，尤其是 grouped + filter + section footer summary 旧值这类 bug。那类问题已经说明，当前系统的主要矛盾不是“少几个函数”或“少几个文件”，而是：

- 同一个事实被多层、用多种形式重复表达。
- 阶段之间的依赖关系不够显式。
- 发布层还在做二次语义推断。
- 展示态混进了数据态。

## 一、适用范围

这份设计覆盖下面这条主链：

1. `commit`
2. `plan`
3. `index`
4. `snapshot.query`
5. `snapshot.sections`
6. `snapshot.summary`
7. `snapshot.publish`
8. `source.apply`
9. `runtime model`
10. `react view`

当前对应的关键代码入口主要在：

- `dataview/packages/dataview-engine/src/active/runtime.ts`
- `dataview/packages/dataview-engine/src/active/snapshot/runtime.ts`
- `dataview/packages/dataview-engine/src/active/snapshot/query/runtime.ts`
- `dataview/packages/dataview-engine/src/active/snapshot/sections/sync.ts`
- `dataview/packages/dataview-engine/src/active/snapshot/sections/publish.ts`
- `dataview/packages/dataview-engine/src/active/snapshot/summary/sync.ts`
- `dataview/packages/dataview-engine/src/source/project.ts`
- `dataview/packages/dataview-engine/src/source/runtime.ts`

## 二、核心判断

### 1. 当前的问题，不是单纯阶段太多

`plan -> index -> snapshot -> source` 这 4 层本身是合理的，不应该继续硬塌缩。

它们分别对应：

- `plan`：view 配置编译边界
- `index`：昂贵索引复用边界
- `snapshot`：active view 数据语义边界
- `source`：外部订阅发布边界

真正让系统变复杂的，是下面这些结构性问题。

### 2. 当前复杂度的根源

#### 2.1 同一个事实被重复表达

最典型的是 section membership。

现在“某个 record 当前属于哪些 section、某个 section 当前有哪些 record”这个事实，同时散落在：

- `query.records.visible`
- `SectionState.keysByRecord`
- `SectionNodeState.recordIds`
- `impact.section`
- `ItemProjectionCache`
- `Section.items`
- `SummaryState.bySection`

这会导致：

- 某一层更新了，另一层没更新。
- 某一层只能通过“引用是否变化”去猜另一层是否变了。
- 下游要自己 fallback 重建事实。

最近 summary 旧值问题，本质上就是这里出了分叉。

#### 2.2 source 层不是纯发布层

`source/project.ts` 现在还在拿前后 snapshot 再做一轮推断：

- 哪些 section changed
- 哪些 item 需要 set/remove
- 哪些 summary changed

这说明 snapshot 没有产出足够硬的 canonical patch，导致 source 需要再猜一次。

这样的问题是：

- 复杂度上升。
- 容易和 snapshot 语义分叉。
- 性能上也多了一轮扫描和比较。

#### 2.3 展示态混进了数据态

`collapsed` 是最明显的例子。

从语义上讲：

- collapse 只影响展示。
- 不应该影响 query。
- 不应该影响 membership。
- 不应该影响 summary 语义值。

但当前 table items 和 section publish 仍然把它卷进了数据发布链，导致展示 bug 很容易污染数据判断。

#### 2.4 变化模型太多，翻译链太长

当前系统里同时存在：

- `CommitImpact`
- `ActiveImpact`
- `QueryDelta`
- `SectionDelta`
- `SummaryDelta`
- `SnapshotChange`
- `SourceDelta`

这些模型并不是都错，但现在的问题是：

- 不同层描述的是相同变化的不同投影。
- 下游经常不能直接消费上游变化，必须再次推断。
- 变化模型之间缺少绝对的主从关系。

### 3. 需要补的不是更多 helper，而是更硬的底层模型

如果只是继续加：

- `read.xxx`
- `resolve.xxx`
- `helper.xxx`
- `context.xxx`

只能让代码更“好调用”，不能减少事实分叉。

真正需要补的是两个底层模型：

1. `SectionMembershipState`
2. `SectionMembershipChange`

只要这两个模型稳定下来，`summary`、`publish`、`source` 和 runtime model 都会明显变简单。

## 三、重构目标

### 1. 总体目标

系统最后要满足下面几条原则：

1. 一份结构真源。
2. 一份结构变化真源。
3. 一条单向派生链。
4. 数据态和展示态解耦。
5. source 不再做二次语义推断。
6. 每层只回答自己的问题。

### 2. 非目标

这轮设计明确不追求下面这些事情：

- 不为了“少文件”去强行把多个阶段并成一个 mega stage。
- 不为了“看起来抽象”再加一层通用框架。
- 不把所有 policy 都推给 `fieldSpec`。
- 不保留为了兼容旧实现而存在的过渡层。

## 四、最终架构

### 1. 顶层层级保持 4 层

最终保留下面 4 层：

1. `plan`
2. `index`
3. `snapshot`
4. `source`

runtime model 和 React 视图仍然存在，但不属于 engine 核心语义层。

### 2. snapshot 内部改成三段数据、一段发布

snapshot 内部最终建议稳定为：

1. `query`
2. `membership`
3. `summary`
4. `publish`

含义分别是：

- `query`：只回答哪些 record 可见、顺序如何。
- `membership`：只回答 section 结构。
- `summary`：只回答每个 section 的 calculation 结果。
- `publish`：把 data state 投影为外部消费结构和 patch。

这四段不是四层新架构，而是 snapshot 内部的固定职责拆分。

### 3. 最核心的新真源：`SectionMembershipState`

所有 grouped 语义最后必须只认这一份数据。

```ts
export interface SectionMembershipState {
  order: readonly SectionKey[]
  section: ReadonlyMap<SectionKey, SectionMembership>
  record: ReadonlyMap<RecordId, readonly SectionKey[]>
}

export interface SectionMembership {
  key: SectionKey
  label: Token
  color?: string
  bucket?: SectionBucket
  records: readonly RecordId[]
}
```

这份 state 明确回答两个问题：

1. 某个 section 当前有哪些 record。
2. 某个 record 当前属于哪些 section。

之后下面这些东西都不允许再自己定义 membership：

- `Section.items`
- `View.items`
- `SummaryState`
- `SourceDelta.active.sections`
- layout model

### 4. 最核心的新变化模型：`SectionMembershipChange`

下游不再自己猜 membership changed，而是直接消费 membership stage 给出的 canonical change。

```ts
export interface SectionMembershipChange {
  rebuild?: true
  orderChanged: boolean
  record: ReadonlyMap<RecordId, SectionMembershipRecordChange>
  section: {
    touched: readonly SectionKey[]
    removed: readonly SectionKey[]
  }
}

export interface SectionMembershipRecordChange {
  before: readonly SectionKey[]
  after: readonly SectionKey[]
}
```

这里的设计要点是：

- `record` 是唯一细粒度真变化。
- `section.touched` 和 `section.removed` 是同一轮计算内的派生摘要，不是独立真源。
- `summary`、`publish`、`source` 只消费这个对象，不再各自回推。

### 5. query 仍然保持极简职责

`query` 只负责 records，不负责 section，不负责 summary。

```ts
export interface QueryState {
  matched: readonly RecordId[]
  ordered: readonly RecordId[]
  visible: readonly RecordId[]
}

export interface QueryChange {
  rebuild?: true
  added: readonly RecordId[]
  removed: readonly RecordId[]
  orderChanged: boolean
}
```

如果需要 `visibleSet`、`orderMap` 这类读优化，可以保留为 runtime cache，但不作为主要语义状态字段。

### 6. summary 只依赖 membership 和 calculation index

summary 最终只接受三类输入：

1. `SectionMembershipState`
2. `SectionMembershipChange`
3. `CalculationIndex`

```ts
export interface SummaryState {
  section: ReadonlyMap<SectionKey, SummarySection>
}

export interface SummarySection {
  field: ReadonlyMap<FieldId, FieldReducerState>
}

export interface SummaryChange {
  rebuild?: true
  changed: readonly SectionKey[]
  removed: readonly SectionKey[]
}
```

关键原则：

- summary 不拥有自己的 membership source。
- summary 不再根据“前后 section 引用变化”猜语义。
- summary 不再从其他层兜底恢复 membership 事实。

### 7. 发布层拆成 data publish 和 display publish

这是降低错误率的关键。

#### 7.1 data publish

只发布数据事实：

- sections
- items
- summaries
- fields
- view meta

#### 7.2 display publish

只发布展示事实：

- section collapsed
- table layout projection
- gallery row packing
- kanban column viewport state

长期最优形态是：

- engine 只负责 data publish。
- runtime / react 负责 display publish。

如果 `collapsed` 未来仍需要被 document 或 session 持久化，也必须在结构上和 membership 分开，不得继续混进 `SectionMembershipState`。

## 五、最终状态模型

### 1. plan 层

plan 层保留，但只做配置编译，不再向下游泄漏重复事实。

```ts
export interface ViewPlan {
  query: QueryPlan
  index: IndexDemand
  membership?: MembershipPlan
  summary: SummaryPlan
}

export interface MembershipPlan {
  fieldId: FieldId
  mode?: ViewGroup["mode"]
  sort?: ViewGroup["bucketSort"]
  interval?: ViewGroup["bucketInterval"]
  showEmpty: boolean
}

export interface SummaryPlan {
  fields: readonly FieldId[]
}
```

说明：

- `query` 只保存 query 编译结果。
- `membership` 只保存 group 结构编译结果。
- `summary.fields` 只保存 calculation field 列表。
- 不要在多个 plan/state 里重复保存同一份派生事实。

### 2. index 层

index 层继续保留 reusable indexes，但只表达索引，不表达 active view 语义。

```ts
export interface IndexState {
  records: RecordIndex
  search: SearchIndex
  bucket: BucketIndex
  sort: SortIndex
  calculation: CalculationIndex
}
```

说明：

- `bucket` 和 `sort` 只提供读取能力，不定义 section 结构。
- `calculation` 只提供 field reducer entries，不定义 summary 归属。

### 3. snapshot data 层

```ts
export interface ActiveDataState {
  query: QueryState
  membership: SectionMembershipState
  summary: SummaryState
}

export interface ActiveDataChange {
  query: QueryChange
  membership: SectionMembershipChange
  summary: SummaryChange
}
```

这是 active view 的核心语义真源。

### 4. snapshot publish 层

```ts
export interface ActivePublishState {
  meta: ActiveMetaState
  sections: SectionList
  items: ItemList
  summaries: ViewSummaries
}

export interface ActiveMetaState {
  view: View
  query: ActiveViewQuery
  fields: FieldList
  table: ActiveViewTable
  gallery: ActiveViewGallery
  kanban: ActiveViewKanban
}
```

这层只做对外消费友好的投影，不再承载底层判断。

### 5. source patch 层

最终 patch 契约建议收敛成下面的形状。

```ts
export interface EnginePatch {
  document?: DocumentPatch
  active?: ActivePatch
}

export interface DocumentPatch {
  records?: EntityPatch<RecordId, DataRecord>
  fields?: EntityPatch<FieldId, CustomField>
  views?: EntityPatch<ViewId, View>
}

export interface ActivePatch {
  view?: {
    ready?: boolean
    id?: ViewId
    type?: View["type"]
    value?: View | undefined
  }
  meta?: {
    query?: ActiveViewQuery
    table?: ActiveViewTable
    gallery?: ActiveViewGallery
    kanban?: ActiveViewKanban
  }
  fields?: {
    all?: EntityPatch<FieldId, Field>
    custom?: EntityPatch<FieldId, CustomField>
  }
  items?: EntityPatch<ItemId, ViewItem>
  sections?: {
    data?: EntityPatch<SectionKey, Section>
    summary?: EntityPatch<SectionKey, CalculationCollection | undefined>
  }
}
```

这里的重点不是字段名，而是职责：

- `active.meta` 统一收口 view 元数据，不要继续在 active 顶层平铺很多 scalar store。
- `sections.data` 和 `sections.summary` 是同一命名域下的两类 patch。
- source runtime 只负责 apply，不再重新推断 changed sections 或 changed items。

## 六、各阶段最终职责

### 1. `plan.compile`

负责：

- 编译 query plan
- 编译 index demand
- 编译 membership plan
- 编译 summary plan

不负责：

- 直接读取 index
- 决定 runtime 发布策略

### 2. `index.sync`

负责：

- 维护 reusable indexes
- 产出 field / bucket / sort / calculation 的增量索引

不负责：

- 定义 active section
- 决定 summary 归属
- 决定 item identity

### 3. `snapshot.query.sync`

负责：

- 产出 `QueryState`
- 产出 `QueryChange`

不负责：

- group
- summary
- items

### 4. `snapshot.membership.sync`

负责：

- 从 query visible + bucket index 得到 section membership
- 产出 `SectionMembershipState`
- 产出 `SectionMembershipChange`

这是整个 active snapshot 的结构真源。

### 5. `snapshot.summary.sync`

负责：

- 基于 membership 和 calculation index 更新 summary
- 产出 `SummaryState`
- 产出 `SummaryChange`

不允许再做：

- 从别的层猜 section changed
- 通过 published section 或 item list 反推 membership

### 6. `snapshot.publish.sync`

负责：

- 基于 `ActiveDataState` 构建 `ActivePublishState`
- 直接产出 `ActivePatch`

不再保留 source 层的二次 diff 逻辑。

### 7. `source.apply`

负责：

- 接收 `EnginePatch`
- 按 patch 直接 apply 到 source runtime stores

不负责：

- 比较 previous / next snapshot
- 重新生成 changedSections
- 重新生成 item remove/set

### 8. `runtime model` / React

负责：

- table body / column / section / summary 等视图模型
- 展示态组合
- display-only projection

不负责：

- 修复 engine 数据语义分叉
- 兜底覆盖 source 旧值问题

## 七、必须清理掉的重复与中间层

### 1. 删除 source 层的二次语义推断

`source/project.ts` 当前最大的复杂度来源之一，就是它还在根据前后 snapshot 推导：

- changed sections
- removed items
- section summary delta

最终应该改成：

- snapshot publish 直接产出 `ActivePatch`
- source 只 apply

### 2. 把 `SectionState` 收敛成 `SectionMembershipState`

当前 `SectionState` 里同时放了：

- section node
- keysByRecord
- visible
- collapsed

这会混淆结构和展示。

最终应该拆成：

- `SectionMembershipState`
- `SectionDisplayState`

### 3. 把 `collapsed` 从 data truth 中剥离

当前 `publishSections` 和 `buildItemList` 会受 `collapsed` 影响。

长期最优做法是：

- section data 始终完整发布
- table / gallery / kanban 再根据 display state 决定 visible items

这样：

- summary 不会被 collapse 污染
- membership 不会被 collapse 污染
- source patch 语义稳定

### 4. 统一 item identity 的定位

`ItemProjectionCache` 的职责应该被严格收敛成：

- 给 `(sectionKey, recordId)` 分配稳定 `itemId`

它不应该再承担 membership 语义。

item identity 是 identity 层，不是结构层。

### 5. 压缩变化模型

长期建议把变化模型固定成三层：

1. `CommitImpact`
2. `ActiveDataChange`
3. `EnginePatch`

其中：

- `CommitImpact`：document 级输入
- `ActiveDataChange`：snapshot 内部语义变化
- `EnginePatch`：对外发布变化

这样层级足够清楚，也足够少。

## 八、`fieldSpec` 应该负责什么，不应该负责什么

### 1. 适合 spec 化的部分

`fieldSpec` 适合回答 field 语义能力问题，例如：

- 是否支持默认 search
- 如何读取 bucket keys
- 如何读取 sort scalar
- group mode / bucket sort / interval 能力
- calculation unique key / option ids
- 是否支持某类展示特性

也就是说，`fieldSpec` 负责回答：

- “这个 field 能做什么”

### 2. 不适合 spec 化的部分

下面这些不应该下沉到 `fieldSpec`：

- 某个 stage 何时 rebuild
- 某个 stage 何时 sync
- 是否采用全量重建还是增量阈值切换
- source patch 如何组织
- query / membership / summary 的执行顺序

也就是说，engine 仍然负责：

- “这次流程该怎么跑”

### 3. 最终边界

可以总结为一句话：

- `fieldSpec` 管能力。
- engine 管流程。

## 九、性能策略

这份设计不是为了简单牺牲性能，相反，它应该让性能更稳定。

### 1. 一次计算，多处复用

`SectionMembershipChange` 计算一次后，直接供下面几层复用：

- `summary`
- `publish.sections`
- `publish.items`
- patch build

避免每层各扫一遍。

### 2. source apply 必须是 O(changed)

source runtime 不再做 previous / next snapshot diff。

它只做：

- value store set
- keyed store patch

复杂度必须跟 changed entities 成正比。

### 3. 增量阈值继续保留，但只放在 membership 层

当前 grouped sections 已经有“大量 touched 时回退全量 rebuild”的策略，这种策略是合理的。

但最终应该只放在 membership 层，因为：

- membership 是结构真源
- rebuild/sync 决策应该集中

summary 和 source 不应该再各自有自己的“大 touched 兜底”

### 4. 展示态变更不触发数据层重算

如果只是：

- collapse / expand
- table virtual layout
- gallery packing
- kanban viewport

则不应该触发：

- query.sync
- membership.sync
- summary.sync
- source active data patch

### 5. 发布层优先复用引用

最终仍然需要保留下面这些性能原则：

- query records unchanged 时复用 records 引用
- membership section unchanged 时复用 section node 引用
- summary section unchanged 时复用 section summary 引用
- publish section/item unchanged 时复用发布对象引用

但这些复用应该建立在 canonical state/change 之上，而不是靠猜。

## 十、最终模块形态

为避免 API 再次散开，建议最终模块形态固定为下面这样：

```ts
export const plan = {
  compile
}

export const index = {
  sync
}

export const query = {
  sync,
  read
}

export const membership = {
  sync,
  read
}

export const summary = {
  sync,
  read
}

export const publish = {
  sync
}

export const source = {
  apply
}
```

说明：

- `read` 只读 canonical state，不做额外语义推导。
- 不再继续散落 `deriveXxx / resolveXxx / getXxx / helperXxx`。
- 不做 mega namespace，也不做全部平铺。

## 十一、实施顺序

### 阶段 1：引入 `SectionMembershipState`

目标：

- 把当前 `SectionState` 的结构部分收敛为 `SectionMembershipState`
- 明确 `section.records` 和 `record.sectionKeys` 两套视图

完成标准：

- `summary` 不再直接读旧 `SectionState.byKey.recordIds`
- membership 作为独立模块存在

### 阶段 2：引入 `SectionMembershipChange`

目标：

- 在 membership stage 内一次性计算 canonical change
- 下游不再自己推导 touched sections

完成标准：

- `summary` 只消费 `SectionMembershipChange`
- `publish` 只消费 `SectionMembershipChange`

### 阶段 3：重写 summary sync

目标：

- 完全基于 membership change + calculation change
- 删除兜底式“再比一遍 section recordIds 引用”的逻辑

完成标准：

- grouped + filter + empty sections + collapse 组合场景不再出现旧值

### 阶段 4：把 source/project 改成 patch passthrough

目标：

- `snapshot.publish` 直接产出 `ActivePatch`
- source 只 apply

完成标准：

- 删除 source 层根据 previous/next snapshot 自行推导 changed sections 的逻辑

### 阶段 5：拆 display state

目标：

- 把 `collapsed` 和 layout-related state 从 data publish 中剥离

完成标准：

- collapse 不触发 summary/data patch 变化
- display-only bug 不再污染 engine data correctness

### 阶段 6：清理 API 和命名

目标：

- 删除旧 `SectionState` 兼容层
- 删除多余 delta 翻译层
- 收敛命名和模块边界

完成标准：

- 不保留 compatibility wrappers
- 不再有重复事实字段

## 十二、验收标准

### 1. 正确性

必须满足：

1. query 变化一定先反映到 membership。
2. membership 变化一定先反映到 summary。
3. patch 只来自 snapshot publish，不来自 source 二次推断。
4. collapse 不影响 summary 语义值。
5. 每个 section footer 的 summary 永远和当前 section records 一致。

### 2. 性能

必须满足：

1. 50k records 下，常见 filter/group 增量操作不出现明显回退。
2. source apply 不引入新的全量扫描。
3. summary 在无 membership/calculation 变化时严格 reuse。
4. display-only 变更不进入 data recompute 链。

### 3. 可维护性

必须满足：

1. 读代码时能明确知道“结构真源在哪里”。
2. 任意一个下游模块都不需要从多个状态恢复同一事实。
3. source/runtime 不再承担语义修复职责。

## 十三、回归场景

实现完成后至少覆盖下面这些场景：

1. grouped + filter 让所有 section 为空时，所有 footer summary 立即归零或为空。
2. grouped + filter 删除后，summary 与 items 同步恢复。
3. grouped + collapse 任意 section，不影响其他 section summary 正确性。
4. query order changed 但 membership 不变时，summary 不重算值，只复用 section summary。
5. calculation field changed 但 membership 不变时，只更新受影响 section summary。
6. group field changed 时，membership 全量 rebuild，summary 跟随 rebuild。
7. ineffective filter 变更不触发不必要 index rebuild。
8. display-only state 变更不触发 active data patch。

## 十四、最终结论

这轮重构最重要的，不是把阶段继续减少，而是把下面这条链彻底收紧：

`query -> membership -> summary -> publish -> source`

其中真正的关键点只有两个：

1. `SectionMembershipState` 成为唯一结构真源。
2. `SectionMembershipChange` 成为唯一结构变化真源。

只要这两个点做实：

- `summary` 会明显变简单。
- `source` 可以退化成纯 apply。
- display state 可以真正从 data state 解耦。
- 全链复杂度会下降。
- 错误面会明显缩小。
- 性能不会下降，反而会更稳。
