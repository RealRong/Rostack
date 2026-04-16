# Dataview Active 内存占用优化与简化架构总方案

## 文档目标

这份文档只回答四件事：

1. `dataview/packages/dataview-engine/src/active` 当前整条 derive 链路里，哪些地方仍然在重复创建数组、Map、Set 或重复持有同一批数据。
2. 长期最优应该保留哪些状态，删除哪些中间层，才能在性能好的同时让代码更简单。
3. `ActiveImpact` 应该继续承担什么角色，哪些变化事实应该尽量收敛到 `ActiveImpact`，而不是散落在各 stage 的局部 carrier 里。
4. 如果要落地，应该按什么顺序推进，才能先降低复杂度，再获得稳定的内存和分配收益。

本文明确采用下面这组优先级：

- 第一优先级是代码和模型简单。
- 第二优先级是降低长驻内存和短期分配。
- 第三优先级才是做零散 micro-optimization。

一句话总结：

- 不是继续给现有结构打补丁。
- 而是把 `active` 读侧收敛成更少的状态层、更少的重复数据、更明确的中轴。

---

## 范围

本文覆盖 `dataview/packages/dataview-engine/src/active` 里的三类路径：

- `index`
- `snapshot`
- `shared`

尤其关注下面这些文件族：

- `active/shared/impact.ts`
- `active/index/*`
- `active/snapshot/query/*`
- `active/snapshot/sections/*`
- `active/snapshot/summary/*`
- `active/runtime.ts`

本文不覆盖写侧 action 设计，也不讨论 UI 层 API 变更。

---

## 当前中轴

今天这条路径的大致中轴是：

`CommitImpact -> ActiveImpact -> IndexState -> QueryState -> SectionState -> SummaryState -> published ViewState`

其中：

- `CommitImpact` 负责描述文档层变化。
- `ActiveImpact` 负责在 active derive 内传播一部分可复用变化事实。
- `IndexState` 负责 records/search/group/sort/calculations 等底层索引。
- `snapshot` 三个 stage 再把 index 和 view config 投影成 query、sections、summary。
- 最后再 publish 成 `ViewState`。

这条主线本身没有问题。

真正的问题是：

- 一些阶段已经有了足够的事实，却仍然在下游重新建一层状态。
- 一些结构本来只是 derive 期间的过渡产物，却被长期保存在 cache/state 中。
- 一些“为了通用而设计”的状态模型，实际上让所有 case 都承担了最重的内存成本。

所以这里的长期优化方向，不是推翻中轴，而是把中轴压薄。

---

## 最终结论

### 1. 最大的问题不是 query，而是 summary 和 sections

`query` 确实还会产生不少瞬时数组和 Set，但它更多是短生命周期分配问题。

真正占长期成本的是两条链：

- `group/query -> sections`
- `calculations -> summary`

因为这两条链都会把上游已经存在的事实，再重新组织成一层新的长驻状态。

### 2. 长期最优不是更多 helper，而是更少状态层

active 读侧最终应当只保留三类数据：

1. 底层索引状态
2. derive 期间共享的 delta 总线
3. 最终对外发布的 snapshot

也就是：

- `IndexState`
- `ActiveImpact`
- `ViewState`

除此之外的内部状态必须非常克制，只保留那些无法从上面三者直接推导、且确实能显著减少重复计算的部分。

### 3. `ActiveImpact` 仍然应该是唯一共享 delta 中轴

当前最对的设计方向，是已经在做的这件事：

- `ActiveImpact` 只创建一次。
- 在 `index` 和 `snapshot` 全链路中按引用传递。
- 凡是下游真的能复用的变化事实，都尽量落到 `ActiveImpact` 上。

但下一步不应该继续往每个 stage 发明局部变化模型，而是应该继续把这些局部模型收回到：

- `query`
- `group`
- `sections`
- `calculations`

这四个 facet 上。

### 4. 长期最优的关键词是 capability，而不是 generic

当前很多结构为了通用，持有了过多信息。

长期最优应当改成 capability-driven：

- group 按能力分层
- calculations 按 metric 能力分层
- summary 按需要的 reducer 状态分层

这样做既能降内存，也能让代码更直接。

因为代码不再围绕“一个万能状态对象”打补丁，而是围绕“这个功能到底需要什么最小状态”组织。

---

## 主要问题

## 一、summary 路径现在是最重的一层重复持有

当前 calculation/summary 路径大致是：

`records -> CalculationIndex(entries + global) -> SummaryState(bySection/byField/AggregateState) -> published summaries`

也就是说，同一份聚合信息至少被持有了三层：

1. field 级 calculation index
2. section 级 summary state
3. 最终 published calculation result

这条链路里最贵的不是 `Map` 本身，而是 `AggregateEntry` 和 `AggregateState` 的形态太重。

`AggregateEntry` 现在会按 record 保存：

- `label`
- `optionIds`
- `uniqueKey`
- `comparable`
- `number`

`AggregateState` 又会无条件保存：

- `distribution`
- `uniqueCounts`
- `numberCounts`
- `optionCounts`
- `count`
- `nonEmpty`
- `sum/min/max`

问题在于：

- `countAll` 不需要 `distribution`
- `countEmpty` 不需要 `uniqueCounts`
- `sum` 不需要 `optionCounts`
- `percentByOption` 不需要 `uniqueKey`

但当前模型让所有 metric 都为最重 case 付费。

这既增加内存，也让 summary 代码必须围绕一个“大而全的 AggregateState”工作，导致心智负担持续偏高。

### 这里的结论

summary 是第一优先级。

如果目标是“性能好，同时代码简单”，最应该优先动的不是 query 小优化，而是把 calculation/summary 的底层模型改成 capability-based。

---

## 二、sections 持有了 query 和 group 的第二份组织结果

今天 sections 这条路径的上游已经有两份很强的事实：

- query 已经知道 `visible` 和 `ordered`
- group index 已经知道 `recordBuckets`、`bucketRecords`、`order`、`buckets`

但 sections 仍然再保留一层：

- `byRecord`
- `byKey.recordIds`
- `order`

这让 sections 变成了一个“同时负责 membership、ordering、presentation”的大状态。

这层状态的问题不是完全没有价值。

它的价值在于：

- 避免每次发布 sections 都重新做完整投影
- 让 item list 和 section node 能做引用复用

但它的问题是：

- 会员关系本来已经在 group/query 中存在
- sections 又额外长期保留了一份
- 下游 summary 还依赖 `sections.byRecord`
- 这让 sections 变成整个 active snapshot 的内部耦合中心

结果是：

- 想优化 summary，要先顾虑 sections
- 想优化 sections，要先顾虑 query/group
- 想优化 query/group，又要回头兼容 sections 的内部状态形态

这不是好中轴，而是反向耦合。

### 这里的结论

长期最优应当把 sections 拆成两部分：

1. 真实需要长期保存的 section projection
2. derive 期间才需要的 membership 解析

换句话说：

- `SectionState` 不应该继续承担“全量 membership source of truth”的责任。
- membership 更应该来自 query + sectionGroup index + `ActiveImpact.sections`。

这会让 sections 更像一个 view projection，而不是一个新的索引层。

---

## 三、filter-only group demand 太重

当前 `resolveViewDemand()` 会为 filter 上的 `status/select/multiSelect/boolean` 字段额外加载 group index。

这是合理的。

因为 query filter 的确能利用 bucket 命中候选集合。

但现在的 group index 是一整套完整结构：

- `recordBuckets`
- `bucketRecords`
- `buckets`
- `order`

问题在于：

- filter candidate 实际主要读取的是 `bucketRecords`
- section group 才真正需要完整的双向 membership 和 bucket metadata

这意味着：

- “只为了 filter 命中而加载”的 group demand
- 仍然在为 section 视图那套完整模型付费

### 这里的结论

group index 应当按能力拆分，而不是只有一种 full model。

至少应该区分两类 demand：

- filter-only group capability
- section-group capability

这样能同时做到：

- 内存更低
- 模型更清楚

因为读侧代码终于能直接表达“我只要 bucket -> records”，而不是总是拿一个比需求更重的对象。

---

## 四、query 仍然有不少瞬时数组和 Set

`buildQueryState()` 里仍然存在不少这类操作：

- `Set` 去重
- `Array.from(...)`
- `filter(...)`
- `slice().sort(...)`
- 候选集合 union/intersection

这些分配确实还可以再压。

但它们有两个特点：

1. 主要是短生命周期对象
2. 对整体复杂度影响没有 summary/sections 那么大

所以 query 的优化优先级应当排在 summary 和 sections 之后。

### 这里的结论

query 后续可以做两类优化，但不应该先做：

- 候选集合改成按 record ordinal 的 mark 结构，而不是字符串 Set + 数组中转
- 尽量复用 ordered/visible 的引用关系，少做中间投影

这属于第二阶段或第三阶段优化，而不是第一阶段。

---

## 五、published `ItemList` 很重，但它是发布成本，不是中轴问题

`publishSections()` 里会把可见 section 的 item ids 再 flatten 成全局 `items.ids`。

这块很重，而且会生成大量 `section:${section}\u0000record:${recordId}` 字符串。

但从当前消费侧来看：

- table
- gallery
- kanban
- selection
- items command

都大量直接读取：

- `items.ids`
- `items.get()`
- `section.items.ids`

因此这层更多是对外 API 的发布成本。

它不属于最适合优先删掉的内部冗余。

### 这里的结论

不建议先动 `ItemList` 的 public shape。

真正该先做的是：

- 减少内部状态重复
- 让发布前的中间态更薄

等内部状态压薄后，再看 `ItemList` 是否要延迟 materialize 或进一步 canonicalize。

---

## 六、当前 branch 已经在尝试 overlay，但 overlay 不能成为长期状态模型

当前 working tree 已经在 `sections` 路径里引入了 `createMapOverlay()` 一类能力。

这类设施的价值是：

- 单次 derive 时避免整张 `Map` clone

但它的风险也很明确：

- 如果 overlay 被直接长期挂进 state/cache，它会把 previous 链一路挂住
- commit 多了之后，retained memory 和读取路径复杂度都会上升

所以 overlay 的正确定位应该是：

- derive 期间的临时视图
- 或者一次 commit 内受控使用的局部结构

而不是：

- 长期跨 commit 累加的状态表示

### 这里的结论

不要把 overlay 当成长期中轴。

长期最优仍然是：

- 局部 lazy copy
- 有界 builder
- 最终 materialized 的稳定发布对象

而不是一层又一层 overlay。

---

## 长期最优模型

## 一、只保留三类核心数据

长期最优下，active 读侧只保留三类核心对象：

### 1. 底层索引

包括：

- `RecordIndex`
- `SearchIndex`
- `SortIndex`
- `GroupIndex`
- `CalculationIndex`

它们的职责是：

- 保存真正能跨多轮 commit 复用的底层索引能力

### 2. 共享 delta 总线

即 `ActiveImpact`。

它的职责是：

- 把这次 derive 中下游真的需要复用的变化事实集中存放

它不应该：

- 成为持久 state
- 成为 public snapshot
- 承担业务层状态职责

### 3. 最终 published snapshot

即 `ViewState`。

它的职责是：

- 提供 UI 和 command 直接消费的稳定结构

它不应该：

- 承担太多 derive 专用中间态

---

## 二、`ActiveImpact` 的长期定位

`ActiveImpact` 应继续保持为 active runtime 内唯一共享的 mutable delta object。

但接下来的方向不是再给更多 stage 长局部变化模型，而是：

- query 变化进 `impact.query`
- section membership 变化进 `impact.sections`
- group membership 变化进 `impact.group`
- calculation entry 变化进 `impact.calculations`

这里的原则是：

- 可被下游复用的事实，必须落在 `ActiveImpact`
- 只服务于单个函数内部的临时循环变量，不进入 `ActiveImpact`

### 长期不建议新增的东西

- 独立的 `SummaryImpact`
- 独立的 `SectionDiff`
- 独立的 `QueryDeltaCarrier`

因为这些都会重新制造并列中轴。

---

## 三、summary 改成 capability-driven reducer 模型

这是整份方案里最重要的一项。

### 当前问题

当前 calculation/summary 的底层模型是：

- 先统一产出 `AggregateEntry`
- 再统一维护 `AggregateState`
- 最后根据 metric 从同一个大状态里读结果

这会产生两个问题：

1. 内存太重
2. 所有逻辑都被迫围绕一个大状态对象写

### 长期目标

把 calculation 改成“按 metric capability 决定字段状态”的设计。

也就是说：

- `count` 类指标只维护 count 能力
- `unique` 类指标只维护 unique 能力
- `numeric` 类指标只维护 numeric 能力
- `option distribution` 只维护 option count 能力

最终不再默认给每个字段都建全量：

- `distribution`
- `uniqueCounts`
- `numberCounts`
- `optionCounts`

### 推荐模型

不是继续做一个更大的 `AggregateState`。

而是定义一组更小的 capability reducer：

- `CountReducerState`
- `UniqueReducerState`
- `NumericReducerState`
- `OptionReducerState`
- 必要时再组合成 `FieldMetricState`

然后由 metric demand 决定字段到底需要哪些 reducer。

### 这样做的收益

- 不再为不用的 metric 保存无用字段
- `CalculationIndex` 更轻
- `SummaryState` 更轻
- publish 阶段逻辑更直接
- 代码不再到处处理“这个字段虽然有一大堆 map，但其实当前 metric 不会用”

### 关于 `ActiveImpact`

summary 不需要新长一个独立 impact facet。

长期最优是：

- 继续复用 `impact.calculations`
- 继续复用 `impact.sections`

也就是：

- 字段值变化由 `impact.calculations` 提供
- section membership 变化由 `impact.sections` 提供

summary 只消费现有 delta，不再发明自己的 delta 模型。

---

## 四、sections 改成“薄 projection”，不再长期持有完整 `byRecord`

sections 现在的内部状态过重。

长期最优是把 sections 明确成：

- 负责 section node projection
- 负责 section 内 record ordering 结果
- 不再长期承担完整 membership source of truth

### 推荐方向

`SectionState` 最终应只保留真正对发布有价值的内容：

- `order`
- `byKey`

而像 `byRecord` 这种用于 derive 期间判断 membership 的结构，应该尽量退出长期状态。

### membership 应该来自哪里

长期最优下，membership 的主要来源是：

- root 模式下来自 query visible
- group 模式下来自 section group index
- 增量变化来自 `impact.sections` / `impact.group`

也就是说：

- `byRecord` 不再是常驻状态
- 需要 record -> sections 时，尽量从当前 query/group/impact 现场解析

### 这样做的关键收益

- sections 不再成为内部耦合中心
- summary 不必依赖 `sections.byRecord`
- section sync 的职责边界更清楚

sections 终于可以回到它本来的角色：

- 投影层

而不是：

- 另一个隐藏的 membership index

---

## 五、group index 改成按 demand capability 分层

长期最优下，group index 不应该只有一种 full state。

至少应拆成两类能力：

### 1. filter capability

只服务于 query filter candidate。

它需要的核心能力通常只是：

- `bucket -> recordIds`

### 2. section capability

服务于真正的 view section/group 投影。

它需要完整结构：

- `record -> buckets`
- `bucket -> records`
- `buckets`
- `order`

### 为什么这会更简单

因为现在代码里很多复杂度，其实来自“我明明只想做 filter candidate，但必须拿一个更大的 full model”。

拆成 capability 后：

- demand 更直接
- 类型更直接
- memory 更低
- query/sections 的边界也更清楚

---

## 六、query 的优化应集中在候选集合，而不是继续增加 stage carrier

query 之后仍然可优化，但目标应非常克制。

### 不建议做的事

- 给 query 再加新的长期 state 层
- 给 query 再加新的私有 delta carrier
- 把 query 变成更难理解的多级 planner

### 建议做的事

把 query 优化限制在这两点：

1. 减少候选集合 union/intersection 的临时数组和 Set
2. 尽量复用 `ordered`、`visible`、`matched` 的引用关系

也就是说：

- query 仍然保持简单的一次 derive
- 只是把内部候选集实现换成更低分配的结构

这样能保证：

- 代码不变复杂
- 性能仍然继续上升

---

## 可复用的底层设施

如果目标是“性能好，同时让代码简单”，底层设施应该变少，而不是变多。

推荐长期保留并复用的设施只有下面这些：

### 1. `ActiveImpact` 相关 helpers

- `ensureQueryImpact`
- `ensureGroupChange`
- `ensureSectionChange`
- `ensureCalculationFieldChange`
- `applyMembershipTransition`
- `applyEntryChange`

它们应该继续作为 active derive 唯一共享 delta API。

### 2. patch builder

- `MapPatchBuilder`
- `ArrayPatchBuilder`

它们适合做：

- 局部 lazy copy
- 有界 commit 内 mutation

但不适合：

- 作为长期状态表示

### 3. ordered delta helper

- `applyOrderedIdDelta`

这类 helper 值得保留，因为它解决的是明确的通用问题：

- 在已知全局顺序下，把 remove/add 合并成稳定新序列

### 4. reducer/builder

长期最值得抽的，不是更多 snapshot helper，而是 calculation/summary 的 reducer 基础设施。

因为这一层未来会同时服务：

- field global summary
- section summary
- publish result

这才是值得复用的底层核心。

---

## 明确不建议的方向

为了保证“代码更简单”这个目标不被性能优化反向破坏，这里明确列出不建议做的方向。

### 1. 不建议继续堆并列变化模型

不建议新增：

- `SummaryImpact`
- `SectionProjectionDelta`
- `QueryCandidateDiff`

因为这些对象看起来是“更明确”，实际上会把 active pipeline 再拆成几条并列中轴。

### 2. 不建议长期持有 overlay 链

overlay 只能是短生命周期工具。

不建议把 overlay 直接放进长期 state/cache 中跨 commit 复用。

### 3. 不建议继续维护一个万能 `AggregateState`

万能状态对象会让所有 case 都为最大 case 付费。

这既不省内存，也不简单。

### 4. 不建议优先优化 `ItemList` public shape

这层很重，但它是对外发布结构。

在内部中间态没有压薄之前，先动它会把优化顺序倒过来，收益和风险都不好。

### 5. 不建议用更多“聪明缓存”代替删状态

如果一个优化方案需要引入：

- 更多 cache
- 更多 overlay
- 更多 reference graph

那它大概率没有朝“更简单”的方向前进。

长期最优应优先考虑：

- 删掉哪一层状态
- 删掉哪一份重复数据

而不是：

- 再把它缓存得更聪明一点

---

## 分阶段落地顺序

## 第一阶段：先锁定中轴，不扩散新模型

目标：

- 统一确认 `ActiveImpact` 是唯一共享 delta 总线
- 不再为 summary/sections/query 发明并列 carrier
- 明确 overlay 只允许作为短生命周期工具

这一阶段主要是架构收口，不需要大规模改行为。

## 第二阶段：优先改 calculation/summary 模型

目标：

- 把 `AggregateEntry` / `AggregateState` 从全量通用模型改成 capability-driven reducer 模型
- 先把最重的长驻内存问题解决

这是第一优先级，因为收益最大，而且能直接降低后续 summary 代码复杂度。

## 第三阶段：压薄 sections，移除长期 `byRecord`

目标：

- 让 section membership 回归 query/group/impact
- 让 sections 只做投影

这一步做完之后：

- summary 和 sections 的耦合会显著下降
- 整个 snapshot 中轴会明显变简单

## 第四阶段：拆 group demand capability

目标：

- filter-only group 不再加载 full section group state
- section group 保留完整能力

这一步既能降内存，也能让 query/group 的职责边界更清楚。

## 第五阶段：最后做 query 候选集合优化

目标：

- 压缩 query 内部的临时数组和 Set
- 不改变整体模型

这一步应当最后做。

因为前四步完成后：

- 真实瓶颈会更清楚
- query 优化可以做得更克制

---

## 成功标准

如果这份方案落地得对，最终应该看到下面几类结果同时成立。

### 1. 结构更少

active 读侧长期维护的核心内部模型数量下降，而不是上升。

### 2. delta 更集中

下游复用的变化事实基本都能从 `ActiveImpact` 读到，不再需要各 stage 发明局部 carrier。

### 3. summary 更轻

- 每个字段不再默认维护所有聚合 map
- section summary 不再重复持有一层过重的通用状态

### 4. sections 更薄

- 不再长期持有完整 `byRecord`
- 不再承担 membership source of truth

### 5. query 更克制

query 优化只集中在候选集合和引用复用，不引入新的复杂模型。

### 6. 代码更容易解释

最终应该能用一句简单的话解释每一层：

- index：底层能力缓存
- ActiveImpact：共享变化事实
- snapshot：投影与发布复用

如果最终实现无法用这三句话说清楚，那说明这轮优化仍然过度设计了。

---

## 最终建议

这轮 active 优化最值得坚持的一条原则是：

- 优先删除重复状态，而不是继续优化重复状态。

具体到优先级，就是：

1. 先改 calculation/summary 的 capability 模型。
2. 再把 sections 压回真正的 projection 层。
3. 再拆 group demand 的能力边界。
4. 最后再处理 query 的瞬时分配。

如果顺序反过来，结果通常会是：

- query 变复杂了
- sections 还在重复持有
- summary 还在占大头

这样既没有真正解决内存问题，也没有让代码更简单。

长期最优下，正确方向应该始终是：

- 更少的状态层
- 更少的重复数据
- 更明确的中轴
- 更窄的底层能力模型

而这四件事，最终都应围绕同一条主线收敛：

`IndexState + ActiveImpact + ViewState`

