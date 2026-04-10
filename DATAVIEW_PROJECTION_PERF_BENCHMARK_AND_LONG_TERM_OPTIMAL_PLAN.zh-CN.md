# Dataview Projection 性能实测与长期最优方案

## 1. 文档目的

本文基于 2026-04-10 的最新 benchmark 结果，回答三个问题：

1. 当前系统慢在哪里
2. 哪些是 projection 问题，哪些不是
3. 如果完全按长期最优去做，projection 和相关 index 应该怎么重构

本文明确采用以下前提：

- 不保留兼容过渡
- 不保留第二套实现
- 不围绕历史 `Row` / stage pipeline 做补丁式优化
- 以长期最简单、最合理、最好测、最好优化的架构为目标


## 2. 本次 benchmark 结论

## 2.1 initial create

单独测 `createEngine(document)` 的首建成本，平均值如下：

- `medium = 10k`：约 `31.2ms`
- `large = 50k`：约 `174.8ms`

结论：

- initial create 不是当前最大的结构性问题
- 首建已经在合理区间
- 真正的问题在增量路径，尤其是 grouped projection / search / undo redo


## 2.2 增量 benchmark 总结

关键场景实测如下。

### 10k

- `record.value.points.single`：`8.98ms`
- `record.value.status.grouped`：`13.91ms`
- `record.value.points.grouped.calc`：`9.50ms`
- `view.query.search.set`：`750.62ms`
- `view.query.filter.set`：`8.55ms`
- `view.query.sort.only`：`15.40ms`
- `view.query.group.set`：`14.84ms`
- `history.undo.grouped.value`：`1044.06ms`
- `history.redo.grouped.value`：`1043.59ms`

### 50k

- `record.value.points.single`：`50.30ms`
- `record.value.status.grouped`：`94.37ms`
- `record.value.points.grouped.calc`：`49.95ms`
- `view.query.search.set`：`33597.53ms`
- `view.query.filter.set`：`37.63ms`
- `view.query.sort.only`：`78.15ms`
- `view.query.group.set`：`74.51ms`
- `history.undo.grouped.value`：`27168.42ms`
- `history.redo.grouped.value`：`27439.04ms`


## 2.3 结论拆分

### A. grouped status update 仍然主要是 projection 瓶颈

`record.value.status.grouped`

- `10k`：总计 `13.91ms`，其中 `project 8.73ms`
- `50k`：总计 `94.37ms`，其中 `project 64.45ms`

其中最重的不是 `calc`，而是：

- `sections`
- `nav`

这说明当前 grouped membership 变动时：

- section membership 维护仍然偏重
- appearance flatten / navigation cache 仍然偏重


### B. grouped calc update 已经局部化，但仍不够理想

`record.value.points.grouped.calc`

- `10k`：总计 `9.50ms`，其中 `project 3.61ms`
- `50k`：总计 `49.95ms`，其中 `project 18.31ms`

这比 grouped status update 好很多，说明：

- `sections reuse`
- `nav reuse`
- `calc sync`

这条路径已经比旧架构合理得多。

但 `50k` 下仍然不算轻，说明：

- 现在的 calc sync 虽然不是全量重建
- 但仍然没有做到“直接吃 membership delta / value delta”


### C. search.set 的瓶颈不在 projection，而在 index/search

`view.query.search.set`

- `10k`：`750.62ms`，其中 `index 747.57ms`
- `50k`：`33597.53ms`，其中 `index 33583.19ms`

projection 自身非常轻：

- `10k project 2.70ms`
- `50k project 12.81ms`

结论非常明确：

- 这不是 projection 问题
- 这是 search index 设计问题


### D. group.set / sort.only 仍然主要由 projection 重建主导

`view.query.group.set`

- `10k`：`14.84ms`，其中 `project 12.27ms`
- `50k`：`74.51ms`，其中 `project 58.42ms`

`view.query.sort.only`

- `10k`：`15.40ms`，其中 `project 14.02ms`
- `50k`：`78.15ms`，其中 `project 69.85ms`

说明：

- 一旦 query 形态变化，需要重排或重分组
- projection 的 rebuild 路径仍然比较重


### E. undo / redo grouped value 存在明显异常

`history.undo.grouped.value`

- `10k`：`1044.06ms`
- `50k`：`27168.42ms`

`history.redo.grouped.value`

- `10k`：`1043.59ms`
- `50k`：`27439.04ms`

这里最重的不是 `sections` 或 `nav`，而是 `calc`：

- `10k undo`: `calc 1025.27ms`
- `10k redo`: `calc 1031.69ms`
- `50k undo`: `calc 26978.30ms`
- `50k redo`: `calc 27634.07ms`

这已经不是“有点慢”，而是明显的算法级错误。


## 3. 这次 benchmark 暴露出的真实问题

## 3.1 当前最大 projection bug：calc 在某些 sync 路径里退化成平方级

从 trace 看，undo / redo grouped value 的 `plan` 是：

- `sections: sync`
- `calc: sync`
- `nav: sync`

但真实耗时里，`calc` 远大于 `sections` 和 `nav`，并且远大于正常 grouped calc update。

这类现象通常说明：

- 外层计划是增量的
- 内层实际算法不是增量的

当前最可疑的根因是：

- section-local rebuild 仍然基于“遍历 section ids”
- 然后对每条 record 逐次 `applyAggregateEntry`
- 而 `applyAggregateEntry` 每次都从全量 `entries` 重建 aggregate state

这会把：

- `O(sectionSize)`

错误地放大成：

- `O(sectionSize^2)`

这正好能解释为什么 grouped undo / redo 会爆炸。


## 3.2 当前 grouped projection 的主要成本在 membership 和 nav materialization

对于 `record.value.status.grouped` 和 `view.query.group.set`，重心明显落在：

- `sections`
- `nav`

这说明当前系统的问题不是：

- 计算 aggregate 太慢

而是：

- section membership 维护仍然不够“事件化”
- visible appearances 扁平化仍然偏全量


## 3.3 当前 query rebuild 路径仍然把“query 变化”和“layout materialization”耦合在一起

`sort.only` 和 `group.set` 都显示出：

- query / layout 一旦变化
- sections / nav 重建成本立刻放大

说明现在的 rebuild 路径虽然已经比历史版本简单，但仍然没有把以下两层彻底分开：

- record membership / order 的 canonical state
- 面向 UI 的 flatten / publish


## 3.4 当前 search index 设计已经成为独立问题

`search.set` 的耗时几乎全部在 index/search。

这意味着：

- projection 再怎么优化，也解决不了 `search.set`
- search 需要独立的一套长期最优方案

也就是说，后续工作必须分两条线：

- projection line
- search/index line


## 4. 长期最优总目标

长期最优目标不是“继续给 stage 增加更多 sync 分支”，而是：

- 让变化先变成结构化 delta
- runtime 只维护少量 canonical state
- 每层只处理自己真正负责的状态迁移
- publish 层只做薄适配

最终模型应该是：

```txt
Document snapshot
+ Active view spec
+ Index snapshots
+ ChangeSet
  -> Query
  -> Sections
  -> Calc
  -> Nav
  -> Publish
```

这里的关键不是 stage 数量，而是：

- 每层 canonical state 是什么
- delta 粒度是什么
- 每层吃什么输入


## 5. projection 长期最优架构

## 5.1 顶层 canonical state

长期只保留这一份 projection canonical state：

```ts
interface ProjectionState {
  query: QueryState
  sections: SectionsState
  calc: CalcState
  nav: NavState
}
```

这里没有：

- `Row[]`
- 通用 stage cache
- `recordState`
- `sectionProjection`
- `appearances` 作为独立 canonical source


## 5.2 QueryState

```ts
interface QueryState {
  derived: readonly RecordId[]
  ordered: readonly RecordId[]
  visible: readonly RecordId[]
  visibleSet: ReadonlySet<RecordId>
  order: ReadonlyMap<RecordId, number>
}
```

职责：

- 表达 active view query 的最终记录集合关系

原则：

- 只处理 id，不处理 row
- 只表达 membership / order / visibility


## 5.3 SectionsState

```ts
interface SectionsState {
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

职责：

- 维护 section membership
- 维护 section order
- 维护 section metadata

原则：

- section node 里的 `ids` 是 `RecordId[]`
- 不直接存 appearance id
- 不直接为 UI flatten


## 5.4 CalcState

```ts
interface CalcState {
  bySection: ReadonlyMap<SectionKey, ReadonlyMap<FieldId, AggregateState>>
}
```

职责：

- 维护 section x field 的 aggregate state

原则：

- `CalcState` 直接建立在 `sections.byRecord` 与 field aggregate entry 上
- 不允许“循环调用全量 rebuild builder”
- 必须支持按 record / field / section 的局部迁移


## 5.5 NavState

```ts
interface NavState {
  ids: readonly AppearanceId[]
  idsBySection: ReadonlyMap<SectionKey, readonly AppearanceId[]>
  byId: ReadonlyMap<AppearanceId, Appearance>
  index: ReadonlyMap<AppearanceId, number>
  sectionById: ReadonlyMap<AppearanceId, SectionKey>
}
```

职责：

- 面向 UI 的可见 appearance 扁平导航

原则：

- `NavState` 不是 source of truth
- 它只是 `SectionsState` 的导航缓存
- 允许彻底重建，但长期目标应支持 section-local patch


## 6. 长期最优 delta 设计

projection 是否能长期快，核心不在于“有没有 sync”，而在于：

- sync 到底吃到什么粒度的 delta

长期正确输入不是宽泛的 stage action，而是结构化 `ProjectionDelta`。


## 6.1 顶层 delta

```ts
interface ProjectionDelta {
  query: QueryDelta
  sections: SectionsDelta
  calc: CalcDelta
  nav: NavDelta
}
```


## 6.2 QueryDelta

```ts
interface QueryDelta {
  kind: 'reuse' | 'patch' | 'rebuild'
  added?: ReadonlySet<RecordId>
  removed?: ReadonlySet<RecordId>
  visibilityChanged?: ReadonlySet<RecordId>
  orderChanged?: ReadonlySet<RecordId>
}
```

语义：

- `patch` 表示 query 结果集没有完全推倒，只在已有结果上增量迁移
- `rebuild` 表示 query 逻辑本身变了，局部 patch 不再值得维护


## 6.3 SectionsDelta

```ts
interface SectionMove {
  recordId: RecordId
  from: readonly SectionKey[]
  to: readonly SectionKey[]
}

interface SectionsDelta {
  kind: 'reuse' | 'patch' | 'rebuild'
  moves?: readonly SectionMove[]
  touchedSections?: ReadonlySet<SectionKey>
  orderChanged?: boolean
}
```

语义：

- 重点不是“某条 record 被改了”
- 而是“它在哪些 section 之间迁移了”

这才是 sections / nav / calc 真正应该吃的输入。


## 6.4 CalcDelta

```ts
interface CalcRecordChange {
  recordId: RecordId
  fieldId: FieldId
  prev?: AggregateEntry
  next?: AggregateEntry
  from: readonly SectionKey[]
  to: readonly SectionKey[]
}

interface CalcDelta {
  kind: 'reuse' | 'patch' | 'rebuild'
  changes?: readonly CalcRecordChange[]
  touchedFields?: ReadonlySet<FieldId>
  touchedSections?: ReadonlySet<SectionKey>
}
```

语义：

- calc 不该只知道“field 变了”
- 它应该直接知道：
  - 哪条 record
  - 哪个 field
  - entry 从什么变成什么
  - 从哪些 section 离开
  - 进入哪些 section

只有这样，calc 才能做到严格局部更新。


## 6.5 NavDelta

```ts
interface NavDelta {
  kind: 'reuse' | 'patch' | 'rebuild'
  touchedSections?: ReadonlySet<SectionKey>
  collapseChanged?: ReadonlySet<SectionKey>
}
```

语义：

- nav 不需要自己重新推导业务逻辑
- 它只需要知道：
  - 哪些 section 的 id 列表变了
  - 哪些 section 的 collapsed 变了


## 7. calc 的长期最优做法

这是当前最需要从根上修的点。


## 7.1 禁止在增量路径中循环调用“从 entries 全量重建 aggregate”

长期规则应该非常简单：

- `buildAggregateState(entries)` 只允许用于 cold build
- 不允许在 hot path 里被 record-by-record 循环调用

也就是说：

- boot / rebuild 可以用 builder
- patch path 不能用 builder


## 7.2 AggregateState 必须支持可逆 patch

长期 `AggregateState` 需要有明确的 patch API：

```ts
interface AggregatePatch {
  recordId: RecordId
  prev?: AggregateEntry
  next?: AggregateEntry
}

function patchAggregate(
  state: AggregateState,
  patch: AggregatePatch
): AggregateState
```

语义：

- `prev -> next`
- 可以是 add
- 可以是 remove
- 可以是 replace

这样 undo / redo 就不会触发平方级重建。


## 7.3 section-local calc 更新要直接吃 section move

长期 grouped calc update 不该做：

```txt
找到 section
拿 section.ids
遍历 section.ids
重新构建 aggregate
```

正确做法应该是：

```txt
对每个 CalcRecordChange:
  从 from sections 里移除 prev entry
  向 to sections 里加入 next entry
```

也就是：

- calc 的输入是 `record x field x section-move`
- 不是“重新扫 section”


## 7.4 让 undo / redo 走同一条 patch 路径

长期 undo / redo 不应有任何特殊 projection 逻辑。

正确模型是：

- commit
- undo
- redo

都生成同一种 `CalcRecordChange[]`

然后：

- 全部走同一条 calc patch path

这样：

- 性能一致
- 正确性一致
- 可测试性最好


## 8. sections 与 nav 的长期最优做法

## 8.1 sections 必须以“record move”作为核心事件

当前 grouped status update 慢，根因不是 section 结构复杂，而是：

- 我们仍然在“重新看整批 visible ids”

长期应改为：

- `record moved from A to B`
- `record inserted into A`
- `record removed from B`

sections runtime 只处理这些事件。


## 8.2 section order 与 membership order 分离

长期要明确区分：

- section bucket 自身顺序
- record 在 section 内的顺序

这两个顺序变化来源不同：

- 前者受 group domain / bucket sort 影响
- 后者受 query order 影响

分开后才能做到：

- bucket order 变化时不必重做 record move
- record order 变化时不必重做 bucket descriptor


## 8.3 nav 应该只 patch touched sections

长期 `NavState` 不该每次都重新 flatten 全部 visible appearances。

正确做法是：

- 每个 section 自己维护 `appearanceIds`
- `NavState` 只对 touched sections 做 splice / patch
- 全局 visible ids 通过 section-local patch 维护

也就是说：

- nav 不是“重新生成整张表”
- nav 是“对扁平列表做分段 patch”


## 8.4 collapsed 改动必须成为 nav 的独立输入

`collapsed` 的变化不应触发：

- section membership rebuild
- calc rebuild

它只应该触发：

- nav visible ids patch

这也是长期 delta 需要把 `collapseChanged` 单独抽出来的原因。


## 9. search/index 的长期最优做法

`search.set` 已经证明：

- 这是独立问题
- 必须单独处理


## 9.1 search query 改动不应该触发 group/sort/calc index sync

从语义上说，`search query` 改的是：

- 查询条件

不是：

- records
- group field semantics
- sort field semantics
- calculation field semantics

长期正确做法应该是：

- query search 输入变化，只变 `QueryState`
- index 层只提供已建好的 searchable postings / tokens
- 不因为 query 变化而去同步 group / sort / calculations index


## 9.2 search index 需要从“全量 postings 扫描”转向“按 token 直达”

长期 search index 应该接近：

```ts
interface SearchIndex {
  all?: ReadonlyMap<Token, readonly RecordId[]>
  fields: ReadonlyMap<FieldId, ReadonlyMap<Token, readonly RecordId[]>>
}
```

search.set 时应该做的是：

- tokenize query
- 直接交集 / 并集 postings
- 最后与当前 query source ids 做交汇

而不是：

- 围绕所有 record 或所有 field postings 做大范围扫描


## 9.3 search 不应成为 query rebuild 的结构性阻塞点

长期如果 `search.set` 还是秒级甚至十秒级：

- projection 再快也没有意义

因此 search/index 需要单独立项，不应继续和 projection 混在一起看。


## 10. publish 层的长期原则

## 10.1 publish 不是 canonical state

publish 层只做三件事：

- 把 canonical state 转成对外只读模型
- 做稳定引用复用
- 把薄配置 projection 暴露给 React

它不应承担：

- 业务计算
- 中间 cache
- stage orchestration


## 10.2 publish 只允许薄适配

例如：

- `view/filter/search/sort/group/fields`

这些都只是 document / schema / active view 的薄投影。

长期不能再把它们当成 projection 性能优化的核心对象。


## 11. 最终 API 设计

命名目标：

- 简短
- 明确
- 不过度设计


## 11.1 runtime

```ts
interface ProjectionRuntime {
  sync(input: {
    doc: DataDoc
    viewId?: ViewId
    index: IndexState
    change: ProjectionChange
  }): {
    state: ProjectionState
    out: ProjectionOut
    trace?: ProjectionTrace
  }
}
```


## 11.2 change

```ts
interface ProjectionChange {
  query: QueryDelta
  sections: SectionsDelta
  calc: CalcDelta
  nav: NavDelta
}
```


## 11.3 out

```ts
interface ProjectionOut {
  view?: ActiveView
  filter?: ViewFilterProjection
  search?: ViewSearchProjection
  sort?: ViewSortProjection
  group?: ViewGroupProjection
  fields?: FieldList
  records?: RecordSet
  sections?: readonly Section[]
  appearances?: AppearanceList
  calculations?: ReadonlyMap<SectionKey, CalculationCollection>
}
```


## 11.4 aggregate patch

```ts
function patchAggregate(
  state: AggregateState,
  patch: {
    recordId: RecordId
    prev?: AggregateEntry
    next?: AggregateEntry
  }
): AggregateState
```


## 12. 分阶段实施方案

## Phase 1：修正当前 calc 热路径错误

目标：

- 先消灭 undo / redo grouped value 的平方级问题

动作：

- 给 aggregate 增加真正的 patch API
- 禁止增量路径循环调用全量 builder
- 让 grouped calc sync 在 section-local rebuild 时不再逐条全量重建

完成标准：

- `history.undo.grouped.value`
- `history.redo.grouped.value`

回到与普通 grouped update 同量级，而不是秒级 / 十秒级。


## Phase 2：把 sections 变成 record-move runtime

目标：

- 让 grouped status update 不再依赖“重扫 visible ids”

动作：

- 显式产出 `SectionMove[]`
- sections runtime 直接应用 move
- 区分 section order 与 record order

完成标准：

- `record.value.status.grouped`

主要成本从“全局重算”变成“局部 section patch”。


## Phase 3：把 nav 变成 section-local patch cache

目标：

- 让 nav 不再按整张 visible appearance 列表重建

动作：

- 每个 section 自己维护 appearance ids
- 全局 visible ids 用 splice patch 维护
- `collapseChanged` 只影响 nav

完成标准：

- grouped status update / group.set / collapse toggle

都不再由 nav flatten 主导。


## Phase 4：把 query change 与 publish 脱钩

目标：

- query rebuild 时，真正重的是 query 自己，不是 publish materialization

动作：

- 进一步压缩 publish 逻辑
- 确保 `records/sections/appearances/calculations` 以 canonical state 为输入直接生成
- 保证未变化节点稳定复用


## Phase 5：单独重构 search index

目标：

- 让 `view.query.search.set` 脱离秒级 / 十秒级

动作：

- search query 变化不再触发 group/sort/calc index sync
- postings 结构改成 token 直达
- query 只消费 postings，不驱动无关 index 同步

完成标准：

- `search.set` 的大头不再在 index/search 全量扫描上


## 13. 优先级结论

如果按收益排序，下一步应该是：

1. 先修 `calc patch`，因为 undo / redo 已经是算法错误级别
2. 再修 `sections + nav`，因为 grouped update 主要卡在这里
3. 再单独开 `search/index` 重构，因为它已经是独立瓶颈


## 14. 最终结论

这次 benchmark 给出的最重要结论不是“projection 整体都慢”，而是：

- 有一类 projection bug：`calc sync` 某些路径退化成平方级
- 有一类 projection 瓶颈：`sections + nav` 仍然偏全量 materialize
- 还有一类完全不是 projection 的问题：`search.set` 基本全卡在 index/search

所以长期最优方案也必须分三层理解：

- projection runtime 要变成真正的 delta runtime
- calc 要从 builder 模式改成 patch 模式
- search/index 要独立重构，不能再混进 projection 讨论

一句话概括最终方向：

```txt
Query 负责结果集
Sections 负责 membership
Calc 负责 aggregate patch
Nav 负责可见导航 patch
Publish 只做薄适配
Search 单独优化
```

