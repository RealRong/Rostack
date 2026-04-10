# Dataview Projection 零历史包袱长期架构

## 1. 文档目的

本文不在现有 projection 设计上做修补。

本文假设：

- 可以完全不在乎历史遗留
- 可以删除不合理的中间层
- 可以重定义 projection runtime 的内部模型
- 不保留兼容路径
- 不保留第二套实现

本文只回答一个问题：

- 如果从零开始，Dataview 的 projection 应该长什么样，才能同时做到更简单、更快、更合理


## 2. 最终结论

如果完全从零开始，我认为当前 projection 架构可以显著简化。

长期最优不是：

- 继续细化 `planner`
- 继续增加 `stage`
- 继续增加 `reconcile`
- 继续围绕 `Row` 做各种局部优化

长期最优应该是：

- 删除 `Row` 驱动的 projection 主路径
- 删除通用 stage pipeline
- 删除大量“只是 active view 配置镜像”的伪 projection
- 只保留一个 `active projection runtime`
- 让 runtime 吃结构化 delta，直接维护少量核心状态

一句话概括：

```txt
Document + ActiveViewSpec + Indexes
  -> ActiveProjectionRuntime
  -> Published read model
```

而不是现在这种：

```txt
planner
  -> view/search/filter/sort/group/records/sections/appearances/fields/calculations
  -> helper cache
  -> publish
```


## 3. 当前架构为什么不够好

## 3.1 有很多“不是 projection 的 projection”

当前 `project` 里有不少 store，本质只是 active view 配置镜像：

- `project.view`
- `project.search`
- `project.filter`
- `project.sort`
- `project.group`
- `project.fields`

这些信息本质上来自：

- `document.activeViewId`
- active view 的 query / layout / display 配置
- 当前 schema

它们不是高价值的“计算结果”。

它们只是：

- 把 document 里的配置重新包装了一遍

如果一个东西：

- 不重
- 不复杂
- 不需要增量维护
- 不具备独立状态机价值

那么它不应该成为 projection runtime 的核心 store。


## 3.2 `Row` 是错误的 projection 中间形态

projection 真正关心的是：

- 哪些 record 在结果里
- 顺序是什么
- 可见性是什么
- 属于哪些 section
- 每个 section 的 aggregate 是什么

这些都可以用：

- `RecordId[]`
- `Set<RecordId>`
- `Map<RecordId, ...>`
- `Map<SectionKey, ...>`

表达。

`Row[]` 的问题是：

1. 体积更大
2. 更容易被重复 materialize
3. 让“集合关系问题”退化成“对象数组问题”
4. 让 query、section、calculation 层之间产生无意义的数据搬运

所以从零开始，`Row` 不应进入 projection 主路径。


## 3.3 通用 stage pipeline 抽象收益低

当前 pipeline 形态大致是：

- planner 决定某 stage `reuse/reconcile/recompute/rebuild`
- stage 再去读取 runtime helper
- helper 再隐式触发上游计算

这套模型的问题是：

- 看起来模块化
- 实际依赖关系被隐藏

最终结果：

- stage trace 容易误导
- helper cache 的成本会落到调用它的 stage 上
- runtime 真正需要的不是“这个 stage 跑不跑”
- 而是“这次到底哪些 record / section / membership 变了”

所以长期正确抽象不是 `StageAction`，而是 `ProjectionDelta`。


## 3.4 当前执行链过长

当前 projection 计算实际上是：

```txt
active view
  -> recordState
    -> derivedRecords
    -> orderedRecords
    -> visibleRecords
  -> sectionProjection
  -> sections
  -> appearances
  -> calculations
```

这里的问题不是层数多本身，而是：

- 中间层有很多只是为了喂下游而存在
- 不是每一层都值得成为独立 canonical state

长期应该压缩链路。


## 4. 从零开始后的目标

长期 projection runtime 应只负责三件核心事：

1. 维护 active view query 结果
2. 维护 section membership
3. 维护 section calculations

除此之外：

- 其他都应该是薄 adapter
- 或者是可丢弃的派生缓存


## 5. 从零开始后的最简模型

## 5.1 顶层结构

我认为长期最简结构应该是：

```ts
interface ActiveProjectionRuntime {
  sync(input: {
    document: DataDoc
    activeViewId?: ViewId
    index: IndexState
    delta: ProjectionDelta
  }): PublishedProjection
}
```

内部只有一个 canonical state：

```ts
interface ProjectionState {
  query: QueryState
  sections: SectionState
  calculations: SectionCalculationState
  navigation?: NavigationCache
}
```

这里没有：

- stage list
- stage cache
- `recordState`
- `sectionProjection`
- `AppearanceList` 作为 canonical source


## 5.2 QueryState

```ts
interface QueryState {
  derivedIds: readonly RecordId[]
  orderedIds: readonly RecordId[]
  visibleIds: readonly RecordId[]
  visibleSet: ReadonlySet<RecordId>
  orderIndex: ReadonlyMap<RecordId, number>
}
```

这是 projection 的第一层，也是最核心的一层。

职责只有一个：

- 表达 active view query 之后的最终 record 集关系

这里不应该有 `Row[]`。


## 5.3 SectionState

```ts
interface SectionState {
  order: readonly SectionKey[]
  byKey: ReadonlyMap<SectionKey, SectionNode>
  sectionByRecord: ReadonlyMap<RecordId, readonly SectionKey[]>
}

interface SectionNode {
  key: SectionKey
  title: string
  color?: string
  bucket?: SectionBucket
  recordIds: readonly RecordId[]
  visible: boolean
  collapsed: boolean
}
```

这里的关键变化是：

- section 的 source of truth 是 `recordIds`
- 不是 appearance ids

长期 section 层只处理：

- membership
- section order
- section visibility
- collapsed state


## 5.4 SectionCalculationState

```ts
interface SectionCalculationState {
  bySection: ReadonlyMap<SectionKey, SectionCalculationNode>
}

interface SectionCalculationNode {
  byField: ReadonlyMap<FieldId, AggregateState>
}
```

这层只做一件事：

- 维护 section 上的增量 aggregate

长期它不应该通过“section ids -> entries -> build aggregate”临时重算。

它应该是 accumulator runtime。


## 5.5 NavigationCache 只是缓存，不是主状态

如果 UI 需要：

- `prev/next`
- `range`
- `indexOf`
- `idsIn(section)`

那么可以有一个导航缓存：

```ts
interface NavigationCache {
  visibleAppearanceIds: readonly AppearanceId[]
  appearanceById: ReadonlyMap<AppearanceId, Appearance>
  visibleIndex: ReadonlyMap<AppearanceId, number>
  idsBySection: ReadonlyMap<SectionKey, readonly AppearanceId[]>
}
```

但它不是 canonical state。

它只是：

- 从 `SectionState` 派生出来的运行时缓存

这意味着：

- `appearances` 可以存在
- 但它不应该再是 projection 核心模型


## 6. 哪些层应该删掉

如果从零设计，我会明确删除这些“中间层”。

## 6.1 删除 `Row` projection 中间态

删除：

- `derivedRecords`
- `orderedRecords`
- `visibleRecords`

替换成：

- `derivedIds`
- `orderedIds`
- `visibleIds`


## 6.2 删除 `recordState` 作为独立 helper 层

当前 `recordState` 的问题是：

- 它既像 helper
- 又像 stage 依赖
- 又承担 query 主计算

长期应该直接折叠进 `QueryState runtime`。


## 6.3 删除 `sectionProjection` 作为独立中间层

当前 `sectionProjection` 的价值主要是：

- 先生成 `ProjectionSection`
- 再喂给 `sections`
- 再喂给 `appearances`

从零看，这是一层不必要中间态。

长期应该直接维护 `SectionState`。


## 6.4 删除通用 `Stage` 抽象

删除：

- `Stage`
- `StageRead`
- `StageNext`
- `runStages`
- `reuse/reconcile/recompute/rebuild` 这套通用 stage 协议

替换成：

- 单个 projection runtime state machine
- 结构化 delta 驱动


## 6.5 删除“只是 active view 配置镜像”的 project store

长期不应把这些作为 projection runtime 核心状态：

- `view`
- `search`
- `filter`
- `sort`
- `group`
- `fields`

这些应该变成：

- active view selector
- 或薄 publish adapter

因为它们不是高价值 runtime state。


## 7. 新的 delta 设计

从零设计时，projection 必须吃的是“结构化事实 delta”，不是 `StageAction`。

建议最简语义：

```ts
interface ProjectionDelta {
  query?: {
    added?: readonly RecordId[]
    removed?: readonly RecordId[]
    orderChanged?: readonly RecordId[]
    visibilityChanged?: readonly RecordId[]
  }
  sections?: {
    moved?: readonly {
      recordId: RecordId
      before?: readonly SectionKey[]
      after?: readonly SectionKey[]
    }[]
    touched?: readonly SectionKey[]
  }
  calculations?: {
    touchedRecords?: readonly RecordId[] | 'all'
    touchedFields?: readonly FieldId[]
  }
  layout?: {
    collapsedChanged?: readonly SectionKey[]
    hiddenChanged?: readonly SectionKey[]
  }
}
```

这份 delta 的重点不在类型细节，而在于语义转变：

- runtime 不再反推发生了什么
- runtime 直接消费已经解释好的变化事实


## 8. 新的执行链

长期应该只有一条短链：

```txt
document/index sync
  -> resolve active view spec
  -> build ProjectionDelta
  -> apply query delta
  -> apply section delta
  -> apply calculation delta
  -> rebuild optional navigation cache
  -> publish
```

这里没有：

- 多个 stage 的隐式依赖
- helper cache 触发上游重算
- “看起来 reconcile，实际上全量 materialize”


## 9. 各层的长期算法

## 9.1 QueryState

长期目标：

- 只更新 touched record
- 不再整表重算

算法上：

1. 对 touched record 重新计算：
   - search match
   - filter match
   - sort key
   - manual order effect
2. 在 `derivedIds / orderedIds / visibleIds` 中做局部删除 / 插入 / 保留
3. 同步维护 `visibleSet` 和 `orderIndex`

长期 query state 应该是：

- ids 层面的增量编辑器
- 不是 row array 重建器


## 9.2 SectionState

长期目标：

- 单条 record membership 变化时只做局部迁移

算法上：

1. 读取 touched record 的旧 section membership
2. 读取新 membership
3. 若 membership 不变：
   - 只更新 section 内顺序
4. 若 membership 变化：
   - 从旧 section 删除
   - 插入新 section
5. 若 section 空了或从空变非空：
   - 更新 section `visible`
   - 必要时调整 section order

这样 grouped record update 的代价与 touched records 成正比，而不是与 visible set 总大小成正比。


## 9.3 SectionCalculationState

长期目标：

- calculation 直接吃 section membership delta 和 value delta

算法上，每个 touched field / touched record 只做三类原子操作：

- `add(entry)`
- `remove(entry)`
- `replace(before, after)`

这要求 aggregate runtime 支持可逆、可替换的增量操作。

一旦这层成立：

- calc 不需要再从 section ids 临时重扫 entries
- 也不需要依赖额外 bucket aggregate 中间层


## 9.4 NavigationCache

长期目标：

- 只在 UI 需要时维护
- 只做局部更新

算法上：

- section membership 变时，更新对应 section 的 appearance slice
- collapsed 改变时，局部 splice `visibleAppearanceIds`
- 局部修复 `visibleIndex`

所以：

- appearance 是缓存
- 不是 source of truth


## 10. 对外 API 怎么处理

从零设计时，对外 API 可以保持稳定，但内部语义应收缩。

我建议保留对外读模型能力：

- `project.records`
- `project.sections`
- `project.calculations`

可选保留：

- `project.appearances`

但这些都应该是：

- published snapshot
- 或 selector 结果

不应该再倒推内部 runtime 架构。

而这些建议降级为 selector，不再是独立 runtime store：

- `project.view`
- `project.search`
- `project.filter`
- `project.sort`
- `project.group`
- `project.fields`


## 11. 为什么这套从零架构更简单

## 11.1 状态更少

当前核心运行里实际混着：

- query state
- section projection
- sections
- appearances
- calculations
- 各类镜像 projection

从零方案里，核心只保留：

- `QueryState`
- `SectionState`
- `SectionCalculationState`
- `NavigationCache?`


## 11.2 数据流更短

从零方案里，不再有：

- `Row[] -> ProjectionSection -> Section -> AppearanceList`

而是：

- `RecordId[] -> SectionState -> NavigationCache?`


## 11.3 依赖更显式

从零方案里，依赖关系清晰：

```txt
query -> sections -> calculations
               -> navigation
```

不再存在：

- 某 stage 调 helper
- helper 再隐式算另一层


## 11.4 性能模型更稳定

从零方案里，长期性能更接近：

- 与 touched records 成正比
- 与 touched sections 成正比

而不是现在这样：

- planner 是增量的
- 但 runtime 实现经常退化成全量 materialize


## 12. 为什么这套从零架构性能会更好

最主要的原因有四个：

1. 不再 materialize 三份 `Row[]`
2. 不再从 visible rows 全扫重建 sections
3. 不再全量 flatten appearance 导航索引
4. 不再通过 section ids 临时重算 calculations

所以长期能同时降低：

- CPU
- 分配量
- GC 压力
- trace 噪声


## 13. 真正应该先做什么

如果以后真的按这份文档落地，第一步应该不是“优化 sections”，而是：

- 直接删除 `Row` projection 主路径

这是整个从零架构的起点。

因为只要 `Row[]` 仍然是 query 输出：

- section 还会吃全量 row materialize
- appearance 还会继续 flatten
- calc 还会继续晚一层计算

所以真正的第一步是：

```txt
recordState -> QueryState
Row[]       -> RecordId[] + Set + Index
```


## 14. 最终建议

如果完全不在乎历史包袱，我建议把 projection 定义为：

- 一个单 active-view runtime
- 三个 canonical states
  - query
  - sections
  - section calculations
- 一个可选 navigation cache
- 一套结构化 `ProjectionDelta`

明确删除：

- `Row` 驱动主路径
- `recordState` 中间层
- `sectionProjection` 中间层
- 通用 `Stage` pipeline
- 大量仅是 active view 配置镜像的 project store

最终形态应该是：

```txt
Document + ActiveViewSpec + Indexes
  -> ActiveProjectionRuntime
    - QueryState
    - SectionState
    - SectionCalculationState
    - NavigationCache?
  -> Published read model
```

这才是我认为长期最优的 Dataview projection 架构：

- 模型更少
- 路径更短
- 性能更稳
- 语义更清楚
- 没有历史抽象包袱


## 15. 最终 API 设计

这一节只给最终版，不讨论过渡 API。

设计原则：

- 名字尽量短
- 结构尽量平
- 类型尽量少
- 不引入 stage / planner / controller / manager 一类中间抽象


## 15.1 最终核心命名

推荐最终命名：

- runtime
  - `projection`
- state
  - `ProjectionState`
  - `QueryState`
  - `SectionState`
  - `CalcState`
  - `NavState`
- sync 输入
  - `ProjectionInput`
  - `ProjectionDelta`
- sync 输出
  - `ProjectionSnapshot`

推荐最终对外字段名：

- `records`
- `sections`
- `calc`
- `nav`

建议删除或降级成 selector 的名字：

- `view`
- `search`
- `filter`
- `sort`
- `group`
- `fields`
- `appearances`

其中：

- `calc` 比 `calculations` 更短
- `nav` 比 `appearances` 更准确


## 15.2 最终 runtime API

最终 runtime 我建议只保留两个方法：

```ts
interface ProjectionRuntime {
  state(): ProjectionState
  sync(input: ProjectionInput): ProjectionSnapshot
}
```

不要再暴露：

- `clear`
- `runStages`
- `plan`
- `syncDocument`

原因：

- projection 不是 document runtime
- projection 只做一件事：基于输入同步投影状态


## 15.3 最终 sync 输入

```ts
interface ProjectionInput {
  doc: DataDoc
  viewId?: ViewId
  index: IndexState
  delta: ProjectionDelta
}
```

这里刻意选择：

- `doc`
- `viewId`
- `index`
- `delta`

这四个名字已经够清楚，不需要：

- `document`
- `activeViewId`
- `context`
- `next`


## 15.4 最终内部状态

```ts
interface ProjectionState {
  query: QueryState
  sections: SectionState
  calc: CalcState
  nav?: NavState
}
```

这是最终 canonical state。

这里不应该再有：

- `recordState`
- `sectionProjection`
- `appearanceList`
- `projectState` 里一堆 query 镜像字段


## 15.5 最终 QueryState

```ts
interface QueryState {
  derived: readonly RecordId[]
  ordered: readonly RecordId[]
  visible: readonly RecordId[]
  visibleSet: ReadonlySet<RecordId>
  order: ReadonlyMap<RecordId, number>
}
```

说明：

- `derived` 是 query/sort 后顺序
- `ordered` 是再应用 manual order 后顺序
- `visible` 是 filter/search 后最终可见顺序
- `visibleSet` 用于 O(1) 判断
- `order` 用于 O(1) 读位置

这里不要再出现 `Row[]`。


## 15.6 最终 SectionState

```ts
interface SectionState {
  order: readonly SectionKey[]
  byKey: ReadonlyMap<SectionKey, SectionNode>
  byRecord: ReadonlyMap<RecordId, readonly SectionKey[]>
}

interface SectionNode {
  key: SectionKey
  title: string
  color?: string
  bucket?: SectionBucket
  ids: readonly RecordId[]
  visible: boolean
  collapsed: boolean
}
```

说明：

- `ids` 是 section 的 source of truth
- `byRecord` 是反向 membership 索引
- `order` 是 section 顺序

这里不需要额外的 `ProjectionSection` 类型。


## 15.7 最终 CalcState

```ts
interface CalcState {
  bySection: ReadonlyMap<SectionKey, ReadonlyMap<FieldId, AggregateState>>
}
```

如果后续需要挂更多内部信息，也尽量收在 section 这一层，不再额外展开大树。

例如：

```ts
interface CalcState {
  bySection: ReadonlyMap<SectionKey, SectionCalcNode>
}

interface SectionCalcNode {
  byField: ReadonlyMap<FieldId, AggregateState>
}
```

但默认建议先用更短的第一版。


## 15.8 最终 NavState

```ts
interface NavState {
  ids: readonly AppearanceId[]
  byId: ReadonlyMap<AppearanceId, Appearance>
  index: ReadonlyMap<AppearanceId, number>
  idsBySection: ReadonlyMap<SectionKey, readonly AppearanceId[]>
}
```

说明：

- `nav` 只是缓存
- 不是 canonical state
- UI 不需要时可以完全不建


## 15.9 最终 delta API

`ProjectionDelta` 不要过度设计，保持简单脏集语义就够了。

推荐最终版本：

```ts
interface ProjectionDelta {
  records?: {
    add?: readonly RecordId[]
    remove?: readonly RecordId[]
    update?: readonly RecordId[] | 'all'
  }
  query?: {
    order?: readonly RecordId[] | 'all'
    visible?: readonly RecordId[] | 'all'
  }
  sections?: {
    move?: readonly SectionMove[] | 'all'
    update?: readonly SectionKey[] | 'all'
  }
  calc?: {
    field?: readonly FieldId[] | 'all'
    record?: readonly RecordId[] | 'all'
  }
  layout?: {
    section?: readonly SectionKey[] | 'all'
  }
}

interface SectionMove {
  id: RecordId
  from?: readonly SectionKey[]
  to?: readonly SectionKey[]
}
```

设计原则：

- `records` 只管 record 集变化
- `query` 只管 query 输出脏集
- `sections` 只管 membership / section node 脏集
- `calc` 只管 calculation 脏集
- `layout` 只管 collapsed/hidden/showEmpty 这类布局脏集

不要先做：

- 通用 patch opcode
- 分布式 patch 网络
- 递归 patch tree

这些都会把实现重新带复杂。


## 15.10 最终 publish API

```ts
interface ProjectionSnapshot {
  records: RecordsSnapshot
  sections: SectionsSnapshot
  calc: CalcSnapshot
  nav?: NavSnapshot
}

interface RecordsSnapshot {
  derived: readonly RecordId[]
  ordered: readonly RecordId[]
  visible: readonly RecordId[]
}

interface SectionsSnapshot {
  order: readonly SectionKey[]
  byKey: ReadonlyMap<SectionKey, SectionSnapshot>
}

interface SectionSnapshot {
  key: SectionKey
  title: string
  color?: string
  bucket?: SectionBucket
  ids: readonly RecordId[]
  visible: boolean
  collapsed: boolean
}

interface CalcSnapshot {
  bySection: ReadonlyMap<SectionKey, ReadonlyMap<FieldId, CalculationResult>>
}

interface NavSnapshot {
  ids: readonly AppearanceId[]
  index: ReadonlyMap<AppearanceId, number>
  idsBySection: ReadonlyMap<SectionKey, readonly AppearanceId[]>
}
```

注意：

- `sections` 直接发布 `RecordId[]`
- `calc` 直接发布最终结果
- `nav` 只发布导航能力

不再发布：

- row arrays
- 中间 projection
- 中间 helper 结果


## 16. 分阶段实施方案

这里的阶段只是落地顺序。

每一阶段完成后，旧路径应直接删除，不留兼容。


## Phase 1: `recordState -> query`

目标：

- 删掉 `Row[]` 主路径

实施内容：

1. 把 `recordState` 改成 `query`
2. 删除：
   - `derivedRecords`
   - `orderedRecords`
   - `visibleRecords`
3. 只保留：
   - `derived`
   - `ordered`
   - `visible`
   - `visibleSet`
   - `order`
4. 所有下游改读 `RecordId[]`

完成标准：

- projection 主路径里不再出现 `Row[]`


## Phase 2: 删除 `sectionProjection`

目标：

- 让 `sections` 直接成为 canonical state

实施内容：

1. 删除 `sectionProjection`
2. 删除 `ProjectionSection`
3. `sections` 直接维护：
   - `order`
   - `byKey`
   - `byRecord`

完成标准：

- 不再有 “projection -> sections” 二段结构


## Phase 3: `sections` 增量化

目标：

- section membership 只做局部迁移

实施内容：

1. 单条 record group 变化时：
   - 从旧 section 删
   - 向新 section 插
2. 单条 record order 变化时：
   - 只调整受影响 section 内顺序
3. section 空 / 非空切换时：
   - 只更新对应 section node

完成标准：

- grouped update 不再重扫全量 visible set


## Phase 4: `calc` 增量化

目标：

- section calculations 变成 accumulator runtime

实施内容：

1. `calc` 改成内部状态而不是现算
2. aggregate 增加三类操作：
   - `add`
   - `remove`
   - `replace`
3. membership 迁移直接更新旧 section / 新 section
4. 同 section 值变化直接 `replace`

完成标准：

- `calc` 不再通过 section ids 临时重扫 entries


## Phase 5: `appearances -> nav`

目标：

- 把 appearance 从事实层降级成缓存层

实施内容：

1. 内部名称统一成 `nav`
2. `nav` 从 `sections` 派生
3. UI 不需要时可以不建
4. collapsed/membership 变化时只做局部更新

完成标准：

- navigation 不再是 canonical state


## Phase 6: 删除 stage pipeline

目标：

- 删掉 `planner + stages + helper cache`

实施内容：

1. 删除：
   - `planner`
   - `Stage`
   - `StageRead`
   - `StageNext`
   - `runStages`
2. 改成单个：
   - `projection.sync(input)`
3. 内部固定执行顺序：
   - sync query
   - sync sections
   - sync calc
   - refresh nav

完成标准：

- projection runtime 只剩一个状态机


## Phase 7: 精简 publish 与对外 API

目标：

- 删除伪 projection store

实施内容：

1. 内部只 publish：
   - `records`
   - `sections`
   - `calc`
   - `nav`
2. `view/search/filter/sort/group/fields` 改成 selector 或薄 adapter

完成标准：

- projection 只负责真正的 projection


## 17. 实施时必须避免的事

为了避免过度设计，实施时有几条硬规则。

1. 不要先设计通用 patch 网络。
   简单脏集 delta 就够了。

2. 不要先设计多 view cache。
   projection 只服务 active view。

3. 不要先设计可插拔 stage。
   顺序直接写死。

4. 不要先做复杂事件总线。
   一个 `sync(input)` 就够了。

5. 不要为了保留历史语义继续保留中间层。
   没有运行时价值就删。


## 18. 最终收敛

如果目标是：

- 复杂度最低
- 性能最好
- 架构最合理

那么最终应收敛到这套最小面：

```ts
type ProjectionState = {
  query: QueryState
  sections: SectionState
  calc: CalcState
  nav?: NavState
}

type ProjectionRuntime = {
  state(): ProjectionState
  sync(input: ProjectionInput): ProjectionSnapshot
}
```

再多一层，基本就是历史包袱或过度设计。
