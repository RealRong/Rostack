# Dataview Active 最终架构重构蓝图

## 文档定位

这份文档是 `dataview/packages/dataview-engine/src/active` 的最终版重构蓝图。

目标不是继续做局部修补，也不是继续给现有结构叠更多 helper、cache 或 carrier。

目标是一次性回答下面这些长期问题：

1. active 读侧最终应该保留哪些核心状态，删除哪些重复状态。
2. `ActiveImpact` 的最终职责边界是什么，哪些变化事实必须收敛到它上面。
3. `index`、`snapshot`、`publish` 三层最终应该如何分工，哪些地方只是投影，哪些地方才应该长期持有。
4. `summary`、`sections`、`group`、`query` 四条主要路径最终应该怎么重构，才能同时做到：
   - 结构简单
   - 可复用
   - 中轴清晰
   - 分配更低
   - 长驻内存更低
5. 如果一步到位做完，最终应该删掉哪些旧实现和旧概念，不留兼容。

本文默认：

- 不考虑兼容成本。
- 不考虑渐进过渡 API。
- 优先长期最优，而不是局部最省事。

---

## 一句话结论

active 读侧最终不该继续围绕 `QueryState -> SectionState -> SummaryState` 这些“半索引、半投影”的中间层反复打补丁。

最终应该收敛成下面这条主线：

`CommitImpact -> ActiveImpact -> IndexState -> ViewCache -> ViewState`

其中：

- `IndexState` 是唯一长期底层能力缓存。
- `ActiveImpact` 是唯一共享 mutable delta 总线。
- `ViewCache` 是最小必要的内部 stage cache。
- `ViewState` 是唯一对外发布结果。

也就是说：

- 不能把内部 cache 完全删掉。
- 但必须把内部 cache 压薄成“只存复用所必需的东西”。
- 任何再像索引一样长期持有第二份 membership、aggregate、candidate 结果的结构，都应该被移除。

---

## 设计原则

### 1. 中轴必须唯一

active runtime 内只允许存在一条共享变化事实中轴：

- `ActiveImpact`

不允许再引入并列 carrier，例如：

- `SummaryImpact`
- `SectionProjectionDelta`
- `QueryCandidateDiff`
- `StageLocalMutableCarrier`

这些对象看起来更“明确”，实际上只会把 active pipeline 再拆成多条并列路线。

### 2. 长期状态必须少

长期跨 commit 保留的状态，只允许存在于：

- `IndexState`
- `ViewCache`

不允许把“为了这次 derive 方便”而创建的结构长期挂进 cache。

### 3. overlay 只能短命

overlay、patch view、临时 projection 这类东西，只能用在一次 derive 的局部过程里。

它们不能成为跨 commit 的最终状态表示。

否则就会出现：

- previous 链被一路挂住
- retained memory 上升
- 读取路径复杂度上升
- debug 难度上升

### 4. capability 优先于 generic

真正的长期优化，不是把一个“大而全”的状态对象缓存得更聪明。

而是让底层 contract 直接表达：

- 这个功能真正需要什么能力
- 因此只构建什么状态

也就是：

- group 按 capability 拆
- calculations 按 capability 拆
- summary 按 reducer capability 拆

### 5. projection 只做 projection

`sections`、`summary` 这类 snapshot stage，最终都应明确成投影层。

投影层的职责是：

- 从 index + impact + 当前 view config 得到对外结果
- 尽量复用引用

投影层不应该悄悄变成第二套索引层。

---

## 最终中轴

### 1. `CommitImpact`

职责：

- 描述 document 层发生了什么变化

它不负责：

- active derive 内的二次变化传播
- stage 间共享增量事实

### 2. `ActiveImpact`

职责：

- 作为 active derive 内唯一共享 mutable delta 总线
- 承载能被下游复用的变化事实

最终 facet 维持四个，不再扩展并列路线：

- `impact.query`
- `impact.group`
- `impact.sections`
- `impact.calculations`

它不应该：

- 成为长期 state
- 成为 public snapshot
- 替代 domain state

### 3. `IndexState`

职责：

- 保存能跨多轮 commit 复用的底层能力

最终应保留：

- `RecordIndex`
- `SearchIndex`
- `SortIndex`
- `GroupIndex`
- `CalculationIndex`

但其中两块 contract 必须重做：

- `GroupIndex`
- `CalculationIndex`

### 4. `ViewCache`

职责：

- 保留最小必要的内部 stage cache
- 支撑 stage reuse、publish reuse、引用稳定性

它不是问题本身。

真正的问题是：

- 当前某些 stage cache 持有了过重的数据形态
- 某些 cache 承担了隐藏索引职责

最终要做的是压薄 `ViewCache`，而不是否认它的存在。

### 5. `ViewState`

职责：

- 对 UI、command、selection、table/gallery/kanban 提供稳定可消费的发布结果

它不应承担：

- derive 专用中间态
- 内部 membership 反查能力

---

## 最终保留的内部状态

## 1. QueryState

最终保留，但保持极薄。

最终只保留：

- `records`
- 少量 lazy 读缓存
  - `visibleSet`
  - `order`

最终不做的事：

- 不给 query 再加新的长期 state 层
- 不给 query 再加新的私有 delta carrier
- 不把 query 变成多级 planner + 多级 cache 图

也就是说：

- query 仍然是一次 derive
- 只是内部候选集合实现更低分配

## 2. SectionState

最终继续保留，但必须压薄。

最终只保留：

- `order`
- `byKey`

最终删除：

- 长期 `byRecord`

原因很明确：

- `byRecord` 让 sections 从 projection 层变成隐藏 membership index
- `summary` 反过来依赖它，导致 snapshot 内部强耦合

需要 `record -> sections` 时，不再读 `SectionState.byRecord`，而是改为走共享领域 API。

## 3. SummaryState

最终继续保留，但它不再基于今天这个“万能 `AggregateState`”来组织。

最终 `SummaryState` 只是：

- section 级 reducer state 或已归约的 metric state

它不再复制一份“大而全的 aggregate 容器”。

---

## `ActiveImpact` 的最终 API 设计

最终 `ActiveImpact` 仍然沿用现在这组 facet，不增加并列概念。

```ts
interface ActiveImpact {
  commit: CommitImpact
  base: ActiveImpactBase
  query?: ActiveQueryImpact
  group?: MembershipChange<BucketKey, RecordId>
  sections?: MembershipChange<SectionKey, RecordId>
  calculations?: ActiveCalculationImpact
}
```

### 1. `impact.query`

职责：

- 描述 query 结果成员和顺序变化

最终保留：

- `rebuild`
- `visibleAdded`
- `visibleRemoved`
- `orderChanged`

这已经足够。

不再新增：

- `matchedDelta`
- `orderedDelta`
- `candidateDiff`

### 2. `impact.group`

职责：

- 描述 section-group 对应的 membership 变化

最终只服务于：

- sections
- 任何需要从 record 变更推导 section membership 的下游

它不应该再被 filter-only group 路径污染。

### 3. `impact.sections`

职责：

- 描述 section membership 变化事实

最终下游：

- sections publish/sync
- summary touched section 解析

它不应该变成：

- 独立的 section state store

### 4. `impact.calculations`

职责：

- 描述 calculation entry 的变化

最终下游：

- summary
- 任何基于 field aggregate entry 做增量归约的派生逻辑

它不需要被拆成独立 `SummaryImpact`。

---

## 共享领域 API

长期最优下，需要新增的不是更多 stage helper，而是极少数真正的共享领域 API。

这些 API 必须放在：

- `active/shared`
- 或 `active/index/*` 这类中轴位置

而不是散落在 stage 私有 helper 中。

## 1. section membership 解析 API

这是删除 `SectionState.byRecord` 的前提。

推荐最终 API：

```ts
interface SectionMembershipResolver {
  keysOf(recordId: RecordId): readonly SectionKey[]
  has(recordId: RecordId, sectionKey: SectionKey): boolean
}
```

对应构造器：

```ts
function createSectionMembershipResolver(input: {
  query: QueryState
  view: View
  sectionGroup?: SectionGroupIndex
  impact: ActiveImpact
}): SectionMembershipResolver
```

语义：

- root 模式下，从 `query.visible` 直接解析
- grouped 模式下，从 `SectionGroupIndex` + `impact.group` / `impact.sections` 解析

这样做的意义是：

- `summary` 不再依赖 `SectionState.byRecord`
- `sections` 不再承担 membership source of truth
- 任何别的 stage 需要 record -> sections，也走同一个共享中轴 API

## 2. ordered delta API

这一类已经是健康的，应该保留。

例如：

- `applyOrderedIdDelta`

但它的职责必须保持很窄：

- 只解决“已知全局顺序下如何合并 add/remove”

不能继续往里面堆领域逻辑。

## 3. reducer capability API

这是 future-proof 的核心基础设施。

最终应该抽成可复用 reducer contract，而不是继续围绕现有 `AggregateState` 叠 patch。

推荐结构：

```ts
interface ReducerCapabilitySet {
  count?: true
  numeric?: true
  unique?: true
  option?: true
  comparable?: true
}

interface FieldReducerState {
  count?: CountReducerState
  numeric?: NumericReducerState
  unique?: UniqueReducerState
  option?: OptionReducerState
}
```

其意义不是“抽更多类”。

其意义是：

- 让 calculation index、section summary、publish 都复用同一套最小能力 contract

---

## 最重的一块：Calculation / Summary 最终怎么改

这是整条 active 读侧里，最值得先动的一层。

## 当前根问题

当前问题不是“summary sync 不够聪明”，而是底层 contract 本身过重：

- 每个字段默认构建全量 `AggregateEntry`
- 每个字段默认构建全量 `AggregateState`
- section summary 再把这套大状态复制成 section 级结果

这让所有 metric 都为最大 case 付费。

## 最终目标

把 calculation/summary 从“字段 -> 全量通用 aggregate”改成“字段 -> capability-driven reducer state”。

### 最终 demand contract

现在只有：

```ts
calculationFields: readonly FieldId[]
```

最终应改成：

```ts
interface CalculationDemand {
  fieldId: FieldId
  capabilities: ReducerCapabilitySet
}
```

也就是说：

- demand 不再只说“这个字段需要 summary”
- 而是明确说“这个字段到底需要哪些 reducer 能力”

### 最终 IndexState contract

`CalculationIndex` 最终不再长成：

- `entries + global AggregateState`

而是：

```ts
interface FieldCalculationIndex {
  fieldId: FieldId
  entryStore: FieldEntryStore
  global: FieldReducerState
}
```

其中：

- `FieldEntryStore` 只保存 capability 真正需要的 entry fragment
- `global` 只保存 capability 真正需要的 reducer state

### entry 最终也要 capability 化

不是所有 field 都需要：

- `label`
- `number`
- `uniqueKey`
- `optionIds`
- `comparable`

最终应按 capability 拆成最小 entry fragment。

例如：

```ts
interface EntryFragments {
  empty?: boolean
  number?: number
  uniqueKey?: string
  optionIds?: readonly string[]
  comparable?: number | string
}
```

并由 demand 决定实际 materialize 哪些片段。

### SummaryState 最终职责

`SummaryState` 最终不是再保存一份通用 aggregate 大状态。

它只负责：

- section 级 reducer state
- 或 section 级最终 metric state

更具体地说：

- 如果 reducer 可增量合并，就存 reducer state
- 如果 publish 更关心稳定结果，就存 metric state

但不再默认复制今天这套通用 aggregate 容器。

### Summary 增量最终怎么跑

最终增量来源只有两个：

- `impact.calculations`
- `impact.sections`

流程是：

1. 先根据 `impact.sections.touchedKeys` 得到 membership touched sections
2. 再根据 `impact.calculations.byField[fieldId].changedIds` 和共享 `SectionMembershipResolver` 得到 value touched sections
3. 对 touched section + touched field 的 reducer state 做增量 apply
4. 未触达 section 完整复用 previous 引用

这条路线上不需要新增任何 `SummaryImpact`。

## 为什么这是第一优先级

因为它同时解决三件事：

- 最大的长驻内存问题
- 最大的结构泛化问题
- 后续 summary 代码长期难读的问题

---

## 第二块：Group 最终怎么改

## 当前根问题

今天 group 只有一种 full model。

无论是：

- filter 候选命中
- 还是 section group 投影

最终都读同一个完整结构。

这导致：

- filter-only 路径也为完整双向 membership、bucket metadata、order 付费

## 最终目标

把 group 拆成 capability-driven index。

### 最终两类 capability

#### 1. FilterBucketIndex

只服务于 query filter candidate。

它只需要：

- `bucketRecords`

建议最终结构：

```ts
interface FilterBucketIndex {
  fieldId: FieldId
  bucketRecords: ReadonlyMap<BucketKey, readonly RecordId[]>
}
```

#### 2. SectionGroupIndex

只服务于真正的 section projection。

它需要：

- `recordBuckets`
- `bucketRecords`
- `buckets`
- `order`

建议最终结构：

```ts
interface SectionGroupIndex {
  fieldId: FieldId
  recordBuckets: ReadonlyMap<RecordId, readonly BucketKey[]>
  bucketRecords: ReadonlyMap<BucketKey, readonly RecordId[]>
  buckets: ReadonlyMap<BucketKey, Bucket>
  order: readonly BucketKey[]
}
```

### 最终 demand contract

现在的：

- `groups`
- `sectionGroup`

方向是对的，但表达力还不够。

最终建议显式写能力：

```ts
interface GroupDemand {
  fieldId: FieldId
  capability: 'filter' | 'section'
  mode?: ViewGroup['mode']
  bucketSort?: ViewGroup['bucketSort']
  bucketInterval?: ViewGroup['bucketInterval']
}
```

这样 query、sections、planner、trace 都能直接表达：

- 这次我到底需要哪种 group capability

### 增量影响

最终：

- `impact.group` 只对应 `section` capability 的 membership 变化
- `filter` capability 不再写入 `impact.group`

这样可以避免：

- filter-only group 路径把下游 section membership 路线搞脏

---

## 第三块：Sections 最终怎么改

## 当前根问题

现在 `sections` 实际承担了三种职责：

1. membership 反查
2. section projection
3. section 内 record ordering 结果

这导致它变成 snapshot 内部耦合中心。

## 最终职责

最终 `sections` 只负责：

1. section node projection
2. section 内 `recordIds` 的引用复用与排序结果

最终不再负责：

1. 长期 membership source of truth
2. record -> sections 的长期反查

## 最终状态

```ts
interface SectionState {
  order: readonly SectionKey[]
  byKey: ReadonlyMap<SectionKey, SectionNodeState>
}
```

### `SectionNodeState` 继续保留

这是合理的，因为 publish 需要它。

最终可以继续保留：

- `key`
- `title`
- `color`
- `bucket`
- `collapsed`
- `recordIds`
- `visible`

### `byRecord` 最终删除

删除后，不允许在其他 stage 再偷偷重建一份长期 reverse map。

如果某个阶段需要 record -> sections：

- 必须走共享 `SectionMembershipResolver`

## Sections sync 最终怎么跑

### root 模式

root 本质上永远只是：

- `recordIds = query.visible`

因此：

- 不要为 root 维护第二份 membership 状态
- root 一律按 visible 投影

### grouped 模式

grouped sections 的 membership source 最终来自：

- `SectionGroupIndex`
- `impact.group`
- `impact.sections`

`sections.sync` 只做两件事：

1. 维护 section node 的 `recordIds`
2. 维护 section projection 的引用复用

如果是 pure reorder：

- 直接按 `query.order` 重投影 section recordIds

如果是 membership change：

- 基于 `impact.sections` 做局部 patch

但最终 materialize 成稳定 section nodes，而不是长期 overlay 链。

---

## 第四块：Query 最终怎么改

## 当前根问题

query 的主要问题不是 state 过多。

query 的主要问题是：

- 候选集合 union/intersection 里有不少 `Set/Array` 临时分配

它更多是短生命周期分配问题，而不是架构性长驻状态问题。

## 最终目标

query 保持简单，不继续加 state，不继续加 carrier。

只做两类优化：

### 1. 候选集合改成低分配结构

推荐方向：

- 按 record ordinal 的 mark array
- 或 bitset
- 或复用的 scratch arena

而不是：

- 多轮 `Set<string>`
- `Array.from`
- `filter`
- `intersection` 中转数组

### 2. 最大化复用 `matched / ordered / visible`

最终原则：

- 如果只是排序变化，就尽量只让 `ordered` 和 `visible` 发生必要变化
- 如果 membership 没变，就不要再建 diff carrier
- 如果 published 引用没变，就直接复用 previous published

## query 最终不做什么

- 不新增新的 query state 层
- 不新增新的 query delta carrier
- 不把 query 变成复杂 planner 图

---

## Publish 层最终怎么定位

publish 是发布成本，不是中轴本身。

### `ItemList` 现在很重，但不该先动 public shape

原因很简单：

- table
- gallery
- kanban
- selection
- command

都在直接消费：

- `items.ids`
- `items.get()`
- `section.items.ids`

所以 `ItemList` 的 public shape 不是当前第一优先级。

### 最终优化顺序

先做：

- calculation capability 化
- group capability 化
- sections 压薄

然后再看：

- `ItemList` 是否需要 lazy materialize
- item id 是否需要更强 canonicalization

也就是说：

- 先把发布前的内部中间态压薄
- 再考虑 public publish 成本

---

## `ItemId` 最终怎么改

这是 publish 和交互层里最值得单独重构的一块。

它不是当前 active 主 derive 链路里的第一热点。

但在：

- `query`
- `sections`
- `summary`

这些主热点逐步压下去之后，`ItemId` 的设计会越来越明显地成为 publish、selection、drag、DOM 和 virtual list 的共同负担。

## 当前问题

今天这套 `ItemId` 本质上是：

- 把 `(sectionKey, recordId)` 编码进一条可解析字符串

也就是类似：

- `section:${section}\u0000record:${recordId}`

这套设计的问题不是只有“字符串拼接慢”。

真正的问题是四件事叠加在一起：

1. 大量生成
2. 大量持有
3. 大量传递
4. 某些路径还要反复解析

这会带来下面这些长期问题：

- `section.items.ids` 会持有一批长字符串
- `items.ids` 又会再持有一批相同字符串引用
- `items.get(id)`、`indexOf(id)`、`has(id)` 之类路径需要依赖 parse
- DOM dataset、selection、marquee、drag、virtual list 都在传播同一套字符串 id

也就是说，这不是一个局部实现细节，而是整条交互层 identity 的基础设计。

## 正确认知：`ItemId` 不是 `RecordId`

最终重构时必须保留一个关键语义：

- `ItemId` 表示 view item identity
- 不是 document record identity

原因是：

- 一个 `recordId` 只标识数据记录
- 一个 `ItemId` 标识的是“这条记录在当前 section 下的可视 item”

因此最终不能把 `ItemId` 直接退化成：

- `RecordId`

这会从语义上把两层概念混掉。

## 最终目标

`ItemId` 必须从“带业务语义的可解析字符串”改成“opaque handle”。

推荐最终形态：

```ts
type ItemId = number
```

也就是说：

- `ItemId` 只是轻量标识符
- 它本身不再携带 `sectionKey` / `recordId` 语义
- 任何需要还原 item 信息的地方，都统一走 item identity table

### 为什么推荐 `number`

因为这是当前语境里最轻的 primitive handle：

- React key 可直接使用
- `Map` / `Set` / selection / drag / registry 都适合
- `items.ids`、`section.items.ids` 的数组占用更低
- DOM dataset 虽然最终还是字符串化，但运行时标识更轻

如果由于外部约束短期不能直接改成 `number`，次优方案也应该是：

- opaque short token string

而不是继续保留“可解析语义字符串”。

换句话说：

- 即使短期保留 `string`
- 也应该让它变成 opaque token
- 而不是继续从字符串里 parse `sectionKey` / `recordId`

## 最终共享中轴：Item Identity Table

`ItemId` 改成 opaque handle 后，必须新增一层统一的 item identity table。

推荐最终结构：

```ts
type ItemId = number

interface ViewItemEntry {
  id: ItemId
  sectionKey: SectionKey
  recordId: RecordId
}

interface ItemIdentityTable {
  get(id: ItemId): ViewItemEntry | undefined
  idOf(sectionKey: SectionKey, recordId: RecordId): ItemId | undefined
}
```

语义是：

- `ItemId` 只负责 identity
- `ItemIdentityTable` 负责 `ItemId <-> (sectionKey, recordId)` 的双向映射

这样做以后：

- `items.get(id)` 直接查表
- `section.items.ids` 只存 handle
- `items.ids` 也只存 handle
- 任何 section/record 信息都通过查表拿

而不是从 id 字符串切片推导。

## 这张表应该放在哪里

长期最优下，这张表不应该散落在：

- table runtime
- gallery runtime
- selection runtime

也不应该靠各视图自己建。

它应该属于 publish 层共享的 item identity 基础设施。

推荐最终归属：

- 由 `ViewCache` 内部持有可复用 identity cache
- 由 `ViewState.items` / `section.items` 暴露只读访问结果

也就是说：

- identity 是 active publish 的共享基础设施
- 不是某个视图组件的本地实现

## 最终 public API 设计

`ItemList` 的 public shape 不一定需要大改。

推荐最终结果是：

```ts
type ItemId = number

interface ItemList {
  ids: readonly ItemId[]
  count: number
  get(id: ItemId): ViewItem | undefined
  has(id: ItemId): boolean
  indexOf(id: ItemId): number | undefined
  at(index: number): ItemId | undefined
  prev(id: ItemId): ItemId | undefined
  next(id: ItemId): ItemId | undefined
  range(anchor: ItemId, focus: ItemId): readonly ItemId[]
}
```

也就是说：

- public 能力不一定要变
- 但其底层 backing 必须从“parse string”改成“lookup table”

## section item 和 global item 的最终关系

最终应继续保留：

- `section.items.ids`
- `items.ids`

因为这两层消费面很多，不适合现在先删 shape。

但它们的 backing identity 必须共享。

最终关系应当是：

1. 先构建或复用统一 `ItemIdentityTable`
2. `section.items.ids` 只引用这张表上的 `ItemId`
3. `items.ids` 再 flatten 为一组 `ItemId`
4. `items.get(id)` 与 `section.items.get(id)` 都走同一 identity table

也就是说：

- section item list 和 global item list 不再各自“理解 id”
- 它们只共同引用同一张 identity 表

## 最终 build / publish 方式

最终 publish 不再走：

- `createItemId`
- `parseItemId`

而是走：

1. 遍历 section projection
2. 对每个 `(sectionKey, recordId)` 进行 intern
3. 复用 previous snapshot 中还能稳定复用的 `ItemId`
4. 得到统一 `ItemIdentityTable`
5. 再生成 `section.items.ids` 和 `items.ids`

这里的关键不是“生成一批新 number”。

关键是：

- 尽可能在 snapshot 间复用 stable item handle

这样 selection、drag、DOM registry、virtual list 的引用稳定性才不会退化。

## 为什么不建议继续用可解析字符串

因为可解析字符串把三件事情硬塞到一个值里：

1. identity
2. 业务语义
3. 反查协议

这会导致：

- 每个消费方都默认可以 parse 它
- item identity contract 被字符串格式绑死
- publish 层无法自由更换更轻的底层表示

长期最优下，正确分层应该是：

- `ItemId` 只负责 identity
- `ItemIdentityTable` 负责反查
- 业务逻辑只通过 table 读取 `sectionKey` / `recordId`

## 为什么不建议直接用对象引用

例如这种：

```ts
{ sectionKey, recordId }
```

看起来更“语义化”，但长期并不优。

原因是：

- React key 仍然更适合 primitive
- `Map` / `Set` / selection / registry 更适合 primitive key
- DOM dataset 仍然需要可序列化值
- 如果要让对象稳定复用，最终还是要做 interning

也就是说：

- 最后还是会回到“opaque primitive handle + side table”

所以直接走到最终形态更简单。

## 为什么不建议直接用 `RecordId`

这点必须明确。

`RecordId` 只能回答：

- 这是哪条记录

它不能完整回答：

- 这是当前 view 里哪一个 visual item

因此最终不能把 item identity 和 record identity 合并。

## 对交互层的影响

这次改动一旦做，就不会只影响 engine publish。

它会直接影响：

- selection
- marquee
- drag
- table row id
- gallery card id
- kanban card id
- DOM registry
- virtual layout

但这是合理的。

因为这些模块本来就都把 `ItemId` 当成共同 identity 使用。

长期最优下，它们应该共享一个更轻、更稳定、更不依赖字符串格式的 id，而不是各自继续消费一套语义字符串。

## 优先级

这件事值得做，但不应该排在：

- calculation capability 化
- group capability 化
- sections 退出长期 membership source

之前。

原因是：

- `ItemId` 属于 publish / 交互层 identity 重构
- 影响面很广
- 值得一次性做对
- 但不是当前 active 主 derive 的第一瓶颈

因此最终顺序应当是：

1. 先做 calculation / summary contract 重构
2. 再做 group capability 拆分
3. 再做 sections 压薄
4. 最后做 `ItemId` opaque handle 化和 identity table 重构

## 最终结论

`section:${section}\u0000record:${recordId}` 这种 id 设计不是“完全不可接受”，但从长期最优看，它确实是 publish 和交互层的性能与复杂度问题点。

最终正确方向不是：

- 改成更短一点的字符串
- 再继续微调 parse

而是：

- 让 `ItemId` 彻底变成 opaque handle
- 推荐直接改成 `number`
- 再用统一 `ItemIdentityTable` 提供反查能力

这才是更轻、更稳、更适合当基础设施长期复用的方案。

---

## 明确需要删除的旧实现与旧方向

最终落地后，下面这些东西都应删除，不留兼容。

### 1. 长期 `SectionState.byRecord`

这是必须删的。

### 2. 通用全量 `AggregateState`

必须删除“所有 metric 共用一份最大态”的 contract。

### 3. 通用全量 `AggregateEntry`

必须删除“所有字段默认持有所有 entry fragment”的 contract。

### 4. filter-only 复用 full `GroupFieldIndex`

必须删除。

### 5. 新增并列 impact/delta 概念

不允许新增：

- `SummaryImpact`
- `SectionDiff`
- `QueryCandidateDiff`
- `CommitDerivedDelta`

### 6. 长期挂进 cache 的 overlay state

overlay 只允许在单次 derive 里出现。

不能成为：

- `SectionState`
- `SummaryState`
- `GroupIndex`
- `CalculationIndex`

的最终长期表示。

### 7. 语义字符串 `ItemId`

必须删除：

- 把 `sectionKey` / `recordId` 编码进 `ItemId` 字符串格式

### 8. `parseItemId`

必须删除任何依赖 id 字符串切片来恢复 item 语义的实现。

---

## 最终落地顺序

## 第一阶段：锁定中轴，停止扩散

目标：

- `ActiveImpact` 保持唯一共享 delta 总线
- 不再新增并列 carrier
- overlay 只允许局部短命使用

完成标准：

- active runtime 内所有共享变化事实都能从 `ActiveImpact` 解释

## 第二阶段：重做 calculation demand 和 reducer contract

这是第一优先级。

目标：

- `calculationFields` 升级成 capability-driven demand
- `AggregateEntry / AggregateState` 退出统一 contract
- `CalculationIndex` 改成 capability-driven reducer index
- `SummaryState` 改成 section reducer state 或 metric state

完成标准：

- 字段只为当前 metric 真正需要的 reducer 能力付费

## 第三阶段：拆 group capability

目标：

- filter capability 和 section capability 分离
- `impact.group` 只对应 section capability

完成标准：

- filter-only 路径不再构建完整 section group state

## 第四阶段：sections 退成薄 projection

目标：

- 删除长期 `SectionState.byRecord`
- 新增共享 `SectionMembershipResolver`
- summary 不再依赖 section cache 的 reverse map

完成标准：

- sections 只负责 projection
- membership 反查来自共享领域 API

## 第五阶段：最后优化 query candidate engine

目标：

- 压缩候选集合临时分配
- 继续强化引用复用

完成标准：

- query 仍然简单
- 但短生命周期分配进一步下降

## 第六阶段：重做 `ItemId` identity 基础设施

目标：

- 把 `ItemId` 从语义字符串改成 opaque handle
- 引入统一 `ItemIdentityTable`
- 让 `ItemList` / `section.items` 改成共享 identity table backing

完成标准：

- 不再依赖 `parseItemId`
- selection / drag / DOM / virtual list 共享更轻的 item identity

---

## 成功标准

如果这份蓝图实现得对，最终应该同时满足下面几类结果。

### 1. 结构更少

长期内部模型数量下降，而不是上升。

### 2. 中轴更清楚

最终可以用三句话解释整条线：

- index：底层能力缓存
- `ActiveImpact`：共享变化事实
- snapshot：投影与发布复用

### 3. summary 更轻

- 字段不再默认维护所有 aggregate map
- section summary 不再复制通用 aggregate 大状态

### 4. sections 更薄

- 不再长期持有 `byRecord`
- 不再承担 membership source of truth

### 5. group 更准

- filter 只拿 filter capability
- section 只拿 section capability

### 6. query 更克制

- 不加新模型
- 只优化候选集合与引用复用

### 7. publish 仍稳定

- UI 不需要为内部重构承担额外复杂度

---

## 最终建议

这轮 active 重构的关键，不是继续“优化 snapshot”。

真正的长期最优是：

1. 先把 `CalculationIndex` 从通用 aggregate 模型改成 capability-driven reducer 模型。
2. 再把 `GroupIndex` 从单一 full model 改成 capability-driven group model。
3. 再让 `sections` 退出 membership source 的角色，退回纯 projection。
4. 最后才处理 query 的瞬时分配和 publish 的发布成本。

如果顺序反过来，就会很容易出现下面这种失败形态：

- query 变复杂了
- sections 还在重复持有
- summary 还在为最大 case 付费
- group 还在给 filter-only 路径分配完整模型

这既不会真正变简单，也不会真正达到长期最优。

最终的正确方向应该始终围绕同一条主线收敛：

`IndexState + ActiveImpact + ViewCache + ViewState`

其中：

- `ViewCache` 只保留最小必要内部 cache
- `sections` 只做 projection
- `summary` 只做 capability reducer state
- `group` 和 `calculations` 才是底层能力模型的真正中心
