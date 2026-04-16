# Dataview ActiveImpact 最终 API、组件改造与落地方案

## 文档目标

本文档只回答四件事：

1. `ActiveImpact` 的最终 API 应该长什么样。
2. active pipeline 各组件应该如何围绕同一个 mutable `ActiveImpact` 改造。
3. `active/shared` 和 `shared/core` 的最终边界应该如何设计。
4. 如何一步到位落地，并删除旧实现，不留并列路线。

本文档结论以长期最优为目标：

- 不考虑兼容成本。
- 不考虑渐进迁移包袱。
- 优先保证中轴统一、API 简单、复用明确、复杂度低。

---

## 最终结论

长期最优下，active pipeline 只保留一条中轴：

`CommitImpact -> mutable ActiveImpact -> snapshot projection`

这里有四个硬约束：

- `CommitImpact` 仍然是根输入，负责描述文档层发生了什么。
- `ActiveImpact` 是 active runtime 内唯一共享的 mutable 基础设施，整个 derive 过程只创建一次，并按引用在各 stage 之间传递。
- 任何能被下游复用的变化事实，都必须落到 `ActiveImpact` 上，而不是继续长出局部 carrier、局部变化模型、局部 touched helper。
- `snapshot` 只做投影和 publish reuse，不再从 old/new state 逆向恢复变化事实。

一句话说清楚：

- `CommitImpact` 负责“文档变了什么”。
- `ActiveImpact` 负责“这次 active derive 里，下游真正需要复用什么变化事实”。
- `snapshot` 负责“把 state 投影出来并尽量复用引用”。

---

## ActiveImpact 的定位

`ActiveImpact` 必须明确成一个 mutable scratch object，而不是不可变结果对象。

它的生命周期应当是：

- 每次 active derive 开始时创建一次。
- 在 `index` 和 `snapshot` 全链路中共享同一个对象。
- derive 结束后丢弃。
- 不进入 store。
- 不进入 cache。
- 不进入 public snapshot。

这样做的意义是：

- 不重复收集 `touchedRecords` / `touchedFields` / `schemaFields`。
- group、sections、summary、calculations 不再各自发明局部变化模型。
- 下游直接消费上游已经算出的变化事实，避免第二次、第三次 diff。
- 中间层不需要维护多份并列对象，GC 压力也更可控。

这里要明确一个边界：

- 允许函数内部有短生命周期的局部变量，比如 `ids`、`builder`、循环内临时数组。
- 不允许把“可复用的变化事实”留在局部结构里再丢掉。
- 凡是下游可能复用的变化事实，一律写入 `ActiveImpact`。

---

## 最终 ActiveImpact API

## 核心原则

- API 只有一个顶层对象：`ActiveImpact`。
- 顶层 facet 只保留真正有下游消费者的四块：`query`、`group`、`sections`、`calculations`。
- `group` 和 `sections` 复用同一个通用 membership shape。
- `calculations` 复用同一个通用 entry change shape。
- `search`、`sort` 不单独拥有 facet；它们先作为 index 能力存在，只有在出现明确下游消费者时，才把复用事实挂到已有 facet 上。

## 最终类型

```ts
interface ActiveImpact {
  commit: CommitImpact
  base: ActiveImpactBase
  query?: ActiveQueryImpact
  group?: MembershipChange<BucketKey, RecordId>
  sections?: MembershipChange<SectionKey, RecordId>
  calculations?: ActiveCalculationImpact
}

interface ActiveImpactBase {
  touchedRecords: ReadonlySet<RecordId> | 'all'
  touchedFields: ReadonlySet<FieldId> | 'all'
  valueFields: ReadonlySet<FieldId> | 'all'
  schemaFields: ReadonlySet<FieldId> | 'all'
  recordSetChanged: boolean
}

interface ActiveQueryImpact {
  rebuild?: true
  visibleAdded: RecordId[]
  visibleRemoved: RecordId[]
  orderChanged?: true
}

interface MembershipChange<TKey extends string, TItem extends string> {
  rebuild?: true
  touchedKeys: Set<TKey>
  addedByKey: Map<TKey, TItem[]>
  removedByKey: Map<TKey, TItem[]>
  nextKeysByItem: Map<TItem, readonly TKey[]>
}

interface EntryChange<TId extends string, TEntry> {
  rebuild?: true
  changedIds: Set<TId>
  previousById: Map<TId, TEntry | undefined>
  nextById: Map<TId, TEntry | undefined>
}

interface ActiveCalculationImpact {
  byField: Map<FieldId, EntryChange<RecordId, AggregateEntry>>
}
```

## 设计说明

### 1. `base` 只缓存 commit-derived 基础事实

`base` 的职责非常克制，只做一件事：

- 把现在散落在各处的 `collectTouchedRecordIds`、`collectTouchedFieldIds`、`collectSchemaFieldIds`、`collectValueFieldIds`、`hasRecordSetChange` 结果，在一次 derive 的开头集中收口一次。

它不承担任何 stage-specific 语义。

### 2. `query` 只保留下游真正会消费的事实

当前下游真正需要的是：

- 哪些 visible record 新增了。
- 哪些 visible record 移除了。
- query order 是否变了。
- 是否必须整段 rebuild。

因此 `query` 不应该塞更多 stage 内部计划对象，也不应该复制整个 query state。

### 3. `group` 和 `sections` 统一成同一种 membership 基础设施

`group` 和 `sections` 的本质是一类问题：

- 某个 item 属于哪些 key。
- 哪些 key 被触达了。
- 哪些 key 新增了 item。
- 哪些 key 移除了 item。
- item 的 next keys 是什么。

所以它们不应该各自发明 group 局部变化结构、sections 局部变化结构这类并列模型，而应该直接复用 `MembershipChange`。

### 4. `calculations` 统一成 field -> entry change

summary 需要消费的不是 calculation index 整体，而是：

- 哪个 field 真正有 entry 变化。
- 哪条 record 的 entry 从什么变成什么。

所以 `calculations` 应只保留 `byField -> EntryChange<RecordId, AggregateEntry>` 这一层。

### 5. `ActiveImpact` 是 mutable，但不对外泄漏

mutable 是 runtime 内部优化手段，不是对外模型。

因此：

- 允许 stage 原地往 `Map` / `Set` / `Array` 里写。
- 不允许把它暴露到 public contracts。
- 不允许持久化到 store。
- 不允许让业务层把它当状态对象使用。

---

## 最小共享 API

为了避免组件自己发明一堆局部 carrier，`active/shared/impact.ts` 只提供最小一组共享 API：

```ts
createActiveImpact(commit: CommitImpact): ActiveImpact

ensureQueryImpact(impact: ActiveImpact): ActiveQueryImpact
ensureGroupChange(impact: ActiveImpact): MembershipChange<BucketKey, RecordId>
ensureSectionChange(impact: ActiveImpact): MembershipChange<SectionKey, RecordId>
ensureCalculationFieldChange(
  impact: ActiveImpact,
  fieldId: FieldId
): EntryChange<RecordId, AggregateEntry>

applyMembershipTransition<TKey extends string, TItem extends string>(
  change: MembershipChange<TKey, TItem>,
  itemId: TItem,
  before: readonly TKey[],
  after: readonly TKey[]
): void

applyEntryChange<TId extends string, TEntry>(
  change: EntryChange<TId, TEntry>,
  id: TId,
  previous: TEntry | undefined,
  next: TEntry | undefined,
  equal: (left: TEntry | undefined, right: TEntry | undefined) => boolean
): void
```

这组 API 已经足够：

- `createActiveImpact`
  - 创建唯一中轴对象，并把 `base` 初始化好。
- `ensure*`
  - 惰性分配对应 facet，避免每次 derive 无脑创建一堆空 `Map` / `Set`。
- `applyMembershipTransition`
  - group 和 sections 用同一套逻辑写 membership 变化。
- `applyEntryChange`
  - calculations 和其他未来 entry 型 stage 用同一套逻辑写 entry 变化。

不再提供更多 stage-specific helper。

原因很简单：

- helper 太多，本质上就是把复杂度挪位置。
- 这里只有最稳定、最通用、最值得共享的最小集合。

---

## 各组件如何修改

## 一、runtime 总线

### [active/runtime.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/runtime.ts)

职责改造：

- 在 derive 开头创建一次 `ActiveImpact`。
- 把同一个 `ActiveImpact` 同时传给 index derive 和 snapshot derive。
- `CommitImpact` 不再在 active pipeline 内被层层直接传递；真正沿链路流动的是 `ActiveImpact`。

最终形态应当是：

```ts
const impact = createActiveImpact(commitImpact)
const indexResult = deriveIndex({ ..., impact })
const viewResult = deriveViewSnapshot({ ..., impact, index: indexResult.state })
```

### [active/index/contracts.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/index/contracts.ts)

职责改造：

- `IndexDeriveContext` 里不再直接放 `CommitImpact`，改放 `ActiveImpact`。
- `FieldSyncContext` 读取 `impact.base`，不再自己重复收集 touched 信息。
- `IndexDeriveResult` 返回同一个 `impact` 引用，便于 snapshot 继续消费。

### [active/index/context.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/index/context.ts)

职责改造：

- `createIndexDeriveContext(document, impact)` 只读取 `impact.base`。
- 这里是 active pipeline 内唯一允许把 commit helper 结果收口成 `base` 的地方。
- 后续 stage 不再直接到处调用 `collectTouchedRecordIds`、`collectTouchedFieldIds` 一类 helper。

## 二、index 层

### [active/index/records.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/index/records.ts)

最终要求：

- records index 继续只负责 records state。
- 不新增 facet。

原因：

- 下游当前没有直接消费 “record index 自己的中间变化事实” 的必要。
- 需要复用的基础 touched 信息已经在 `impact.base`。

### [active/index/search.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/index/search.ts)

最终要求：

- search 保持纯 index 能力。
- 不额外定义 `search impact`。

原因：

- query stage 直接消费 search index 即可。
- 当前没有第二个下游 stage 需要 search 的中间变化事实。

### [active/index/sort.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/index/sort.ts)

最终要求：

- sort 保持纯 index 能力。
- 不额外定义 `sort impact`。

原因：

- 下游真正要复用的是 query 阶段最终产生的 visible/order 变化，而不是 sort index 自己的局部事实。

### [active/index/group/runtime.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/index/group/runtime.ts)

最终要求：

- group stage 在同步 `recordBuckets` / `bucketRecords` 的同时，直接写 `impact.group`。
- 不再在函数内部产出一个独立可复用的局部变化对象。

具体改法：

- 每条 touched record 计算出 `before buckets` / `after buckets`。
- 直接调用 `applyMembershipTransition(impact.group, recordId, before, after)`。
- `nextKeysByItem` 由 `applyMembershipTransition` 统一维护。
- 如果 schema 变化、group 配置变化、active view 切换等导致无法增量，则设置 `impact.group.rebuild = true`。

这样 sections 下游就可以直接消费：

- `impact.group.touchedKeys`
- `impact.group.addedByKey`
- `impact.group.removedByKey`
- `impact.group.nextKeysByItem`

而不需要重新比 `previous.byRecord` 和 `groupIndex.recordBuckets`。

### [active/index/calculations.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/index/calculations.ts)

最终要求：

- calculations stage 在更新 field entries 的同时，直接写 `impact.calculations.byField`。
- 不再只把变化留在局部 `entries` / `aggregate` 逻辑里。

具体改法：

- 对每个真正变化的 `recordId`，调用 `applyEntryChange(fieldChange, recordId, previousEntry, nextEntry, sameAggregateEntry)`。
- field 级 rebuild 时，只设置对应 `fieldChange.rebuild = true`。
- summary 只消费 `impact.calculations`，不再回头查 `previousIndex.calculations`。

## 三、snapshot 层

### [active/snapshot/query/runtime.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/snapshot/query/runtime.ts)

最终要求：

- query stage 继续负责 query state。
- 在 build / sync query state 之后，把下游真正关心的事实写入 `impact.query`。

应写入的东西只有：

- `visibleAdded`
- `visibleRemoved`
- `orderChanged`
- `rebuild`

不应写入的东西：

- `SearchPlan`
- `FilterPlan`
- `SortPlan`
- 任何 query 内部局部计划对象

这些都只是 query 自己的读时算法细节，不是共享中轴。

### [active/snapshot/query/derive.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/snapshot/query/derive.ts)

最终要求：

- derive 完 query state 后，顺手把 `previous.records.visible` 和 `next.records.visible` 的差异写进 `impact.query`。
- query order 如果变了，只标 `impact.query.orderChanged = true`。
- 不再把变化事实留在 stage 内部。

### [active/snapshot/sections/runtime.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/snapshot/sections/runtime.ts)

最终要求：

- sections action 决策优先看 `impact.query` 和 `impact.group`。
- 不再以 `collectTouchedRecordIds(impact.commit)` 作为自己的核心输入。

决策规则应收敛成：

- view/group 配置变了，或者 `impact.group?.rebuild`，则 `rebuild`
- query visible/order 变了，且有可消费的 `impact.query` / `impact.group`，则 `sync`
- 没有相关变化则 `reuse`

### [active/snapshot/sections/sync.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/snapshot/sections/sync.ts)

这是本轮必须重点清理的文件。

最终要求：

- 删除 `previousQuery` 驱动的 old/new 逆向恢复逻辑。
- 删除通过 `previous.byRecord` 与 `groupIndex.recordBuckets` 再做一轮 before/after diff 的逻辑。
- 直接消费 `impact.query` + `impact.group`。
- 在生成新的 section membership 时，顺手写 `impact.sections`。

具体落地：

- visible 增删来自 `impact.query.visibleAdded` / `impact.query.visibleRemoved`
- record -> section keys 来自 `impact.group.nextKeysByItem`
- section touched keys 来自 `impact.group.touchedKeys`
- 更新 `byRecord` / `byKey` 的同时，对每条真正 membership 变化的 record 调用 `applyMembershipTransition(impact.sections, recordId, before, after)`

这样 summary 下游拿到的将是已经整理好的 `impact.sections`，而不是自己再重新推导。

### [active/snapshot/summary/runtime.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/snapshot/summary/runtime.ts)

最终要求：

- summary action 决策优先看 `impact.sections` 和 `impact.calculations`。
- 不再把 `touchedRecords` / `touchedFields` 当作主要驱动。

决策规则应收敛成：

- section membership rebuild 或 calc field rebuild，则 `rebuild`
- 有 section membership 变化，或 calc entry 变化，则 `sync`
- 否则 `reuse`

### [active/snapshot/summary/sync.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/snapshot/summary/sync.ts)

这是另一个必须重点清理的文件。

最终要求：

- 删除 `collectTouchedSectionRecords`
- 删除 `isRecordInSection`
- 删除对 `previousIndex` 的依赖
- 不再从 `previousSections.byRecord` / `sections.byRecord` 自己恢复 membership 变化
- 只消费 `impact.sections` 和 `impact.calculations`

最终算法应是：

1. 先从 `impact.sections?.touchedKeys` 得到 section membership 受影响的 section。
2. 再从 `impact.calculations.byField[*].changedIds` 映射出 value 变化影响到的 section。
3. 对每个 touched section、每个 touched field：
   - 若 section rebuild 或 field rebuild，则整 section 重算该 field aggregate
   - 否则用 `EntryChange.previousById / nextById` 直接做 aggregate 增量

这样 summary 再也不需要回头看：

- `previousIndex.calculations`
- `previousSections.byRecord`
- `sections.byRecord` 的 old/new diff

### publish 相关文件

- [active/snapshot/base.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/snapshot/base.ts)
- [active/snapshot/sections/publish.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/snapshot/sections/publish.ts)
- [active/snapshot/summary/publish.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/snapshot/summary/publish.ts)

最终要求：

- publish 层基本不改职责。
- 它仍然只负责 equality、reuse、published shape 稳定。
- 不承担业务变化推导。

---

## shared 的最终设计

## 一、`active/shared` 的职责

`active/shared` 只保留三类东西：

### 1. `active/shared/impact.ts`

只放：

- `ActiveImpact`
- `ActiveImpactBase`
- `ActiveQueryImpact`
- `MembershipChange`
- `EntryChange`
- `ActiveCalculationImpact`
- `createActiveImpact`
- `ensure*`
- `applyMembershipTransition`
- `applyEntryChange`

这是 active pipeline 的唯一共享中轴文件。

### 2. `active/shared/ordered.ts`

把当前 [active/index/shared.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/index/shared.ts) 里的 ordered primitive 挪过来：

- `createOrderIndex`
- `applyOrderedIdDelta`
- `insertOrderedIdInPlace`
- `removeOrderedIdInPlace`
- `sortIdsByOrder`

这里的定位是：

- 它是 active runtime 的通用容器算法。
- 它不是 index scope helper。

### 3. `active/shared/patch.ts`

把当前 [active/index/builder.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/index/builder.ts) 挪过来：

- `createMapPatchBuilder`
- `createArrayPatchBuilder`

这样 active runtime 的共享原语边界就很清晰：

- `impact.ts`
- `ordered.ts`
- `patch.ts`

不再有 `active/index/shared.ts` 这种命名和职责都已经失真的文件。

## 二、`shared/core` 的职责

`shared/core` 只保留真正跨 package 的无领域能力。

可以继续留在 `shared/core` 的东西：

- `sameOrder`
- `sameMap`
- 其他纯 equality / collection helper

只有在出现第二个 package 级消费者后，才考虑把 ordered primitive 上提到 `shared/core`。

以下内容永远不进 `shared/core`：

- `ActiveImpact`
- `MembershipChange`
- `EntryChange`
- `ActiveCalculationImpact`
- 任何 dataview active runtime 专属 facet

原因很简单：

- 这些都不是 monorepo 级基础设施。
- 它们是 dataview active derive 的业务中轴。

---

## 需要删除的旧实现

这次重构应明确删除以下东西，不留兼容层：

- `active/index/shared.ts`
- `active/index/builder.ts`
- sections 里基于 `previous.byRecord` / `groupIndex.recordBuckets` 的二次 diff 路线
- summary 里基于 `previousSections.byRecord` / `sections.byRecord` 的二次 diff 路线
- `collectTouchedSectionRecords`
- `isRecordInSection`
- summary 对 `previousIndex` 的依赖
- active pipeline 内到处直接调用 `collectTouchedRecordIds` / `collectTouchedFieldIds` / `collectSchemaFieldIds` 的模式
- 任何新的 stage-specific 变化 helper / touched helper / 可复用局部 carrier

这里要强调：

- 不是完全禁止 helper。
- 是禁止 helper 长成第二套架构路线。
- 能被全链路复用的变化事实，只允许挂到 `ActiveImpact` 上。

---

## 最终实施方案

## Phase 1：搭建中轴

修改文件：

- [active/runtime.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/runtime.ts)
- [active/index/contracts.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/index/contracts.ts)
- [active/index/context.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/index/context.ts)
- [active/snapshot/runtime.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/snapshot/runtime.ts)

目标：

- 引入 `ActiveImpact`
- derive 全链路传同一个对象
- `base` 一次性收口 commit-derived touched 信息

## Phase 2：先让 index 写事实

修改文件：

- [active/index/group/runtime.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/index/group/runtime.ts)
- [active/index/calculations.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/index/calculations.ts)

目标：

- group 写 `impact.group`
- calculations 写 `impact.calculations`

到这一阶段为止，下游已经有能力不再自己发明 membership / entry carrier。

## Phase 3：让 query 和 sections 真正接上中轴

修改文件：

- [active/snapshot/query/runtime.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/snapshot/query/runtime.ts)
- [active/snapshot/query/derive.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/snapshot/query/derive.ts)
- [active/snapshot/sections/runtime.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/snapshot/sections/runtime.ts)
- [active/snapshot/sections/sync.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/snapshot/sections/sync.ts)

目标：

- query 写 `impact.query`
- sections 直接消费 `impact.query` + `impact.group`
- sections 再写 `impact.sections`

完成后，sections 的 old/new diff 路线可以彻底删除。

## Phase 4：让 summary 彻底脱离旧路线

修改文件：

- [active/snapshot/summary/runtime.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/snapshot/summary/runtime.ts)
- [active/snapshot/summary/sync.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/snapshot/summary/sync.ts)

目标：

- summary 只消费 `impact.sections` + `impact.calculations`
- 删除 `collectTouchedSectionRecords`
- 删除 `isRecordInSection`
- 删除 `previousIndex` 依赖

完成后，summary 不再自己恢复 section membership 和 calc entry 变化。

## Phase 5：shared 清理和旧实现删除

修改文件：

- [active/index/shared.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/index/shared.ts)
- [active/index/builder.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/index/builder.ts)
- `active/*` 相关 import 全量更新

目标：

- 拆到 `active/shared/impact.ts`
- 拆到 `active/shared/ordered.ts`
- 拆到 `active/shared/patch.ts`
- 删除旧文件

## Phase 6：benchmark 和回归校验

必须验证：

- grouped bulk write
- grouped summary bulk write
- search.set
- sort.keepOnly
- cmd+a selection 之外的 active derive 主路径场景

重点确认：

- sections sync 和 summary sync 的 derive 时间继续下降
- 大数组重复创建减少
- 局部 carrier 数量显著减少
- 没有把 mutable `ActiveImpact` 泄漏到 store / cache / public snapshot

---

## 最终判断

从长期最优看，active pipeline 不应该继续往“更多 helper、更多 stage-specific carrier、更多并列变化名词”那个方向长。

真正正确的方向是：

- 用 `CommitImpact` 表达根输入。
- 用一个 mutable `ActiveImpact` 承接整条 active derive 的共享变化事实。
- 让各 stage 最大化写入和消费这个对象。
- 让 `snapshot` 回到投影和 publish reuse 的本职。

如果只能保留一句话，那就是：

`ActiveImpact` 必须成为 active pipeline 里唯一共享、可变、可复用的变化基础设施；所有真正值得复用的变化事实都写进去，其余局部 carrier 和二次 diff 路线全部删除。
