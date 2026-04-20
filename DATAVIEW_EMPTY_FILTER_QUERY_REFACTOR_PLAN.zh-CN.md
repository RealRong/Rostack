# Dataview Empty Filter Query Refactor Plan

## 1. 结论摘要

本次问题的根本原因不是 `buildSortIndex()` 本身慢，而是 dataview 当前把两种不同语义混在了一起：

1. 用户配置语义
`view.filter.rules` 是用户显式配置的 query projection。这里允许存在 ineffective rule。比如用户新建了一个 number filter，但还没填值，这条空规则仍然应该持久化，不能被系统擅自删除。

2. 执行语义
query execution、index demand、query fast path、candidate acceleration 只应该关心 effective constraint。ineffective persisted rule 不应扩大索引需求，不应破坏快路径，不应触发重型重建。

当前实现的问题在于：

- raw `view.filter.rules` 被直接用于 demand derivation
- raw `view.filter.rules.length` 被用于 query fast path 判断
- demand 一变化，sort index 直接 full rebuild

因此，新增一个空 number/date filter 时，虽然这条规则对执行层仍然是 ineffective，但系统仍然把它当成需要 sort acceleration 的真实约束，并在 sort demand 变化时重建已有 sort field index，比如已有的 `updatedAt(date)`。

长期最优方案不是禁止空 filter 持久化，而是彻底分离：

- `Raw Query Projection`
- `Executable Query Plan`

## 2. 设计目标

### 2.1 必须保留的产品语义

以下语义必须被明确保留：

1. 用户新增空 filter 后，这条规则应持久化到 `view.filter.rules`
2. 用户什么都不填也不能自动删掉这条规则
3. 下次打开 view/query bar 时，空规则仍然能看到
4. “先提交，再编辑”可以保留，不需要强行改成纯草稿态

### 2.2 必须纠正的执行语义

以下行为必须被纠正：

1. ineffective persisted filter 不应扩大 sort/group/search/calculation demand
2. ineffective persisted filter 不应破坏 query fast path
3. raw filter 结构变化不应直接导致重型索引重建
4. additive demand 变化不应 full rebuild 现有 sort index
5. query runtime 应区分：
   - filter structure change
   - filter effective change
   - filter execution-plan change

### 2.3 长期目标

长期目标是建立三层清晰边界：

1. Raw Query Projection
持久化用户配置，允许 ineffective rule。

2. Compiled Query Plan
由 raw query 编译得到，描述 effective rules、candidate acceleration、fast path 条件和 index demand。

3. Runtime Execution / Indexing
只消费 compiled plan，不直接读取 raw `view.filter.rules` 做执行决策。

## 3. 当前错误链路

### 3.1 UI 层的行为本身不是错

`dataview/packages/dataview-react/src/page/features/viewQuery/ViewQueryBar.tsx`

当前行为：

- 选择字段
- `filters.add(fieldId)`
- `page.query.open({ kind: 'filter', index })`

这个“先提交，再编辑”的产品语义是可以接受的，因为用户的确已经显式创建了一条 filter。

错误不在这里。

### 3.2 错误在于 raw filter 被直接当作执行输入

`dataview/packages/dataview-engine/src/active/demand.ts`

当前 `resolveViewDemand()` 直接遍历 `view.filter.rules`：

- `status/select/multiSelect/boolean` 进入 `filterGroupFields`
- `number/date` 进入 `filterSortFields`

问题是：

- 这里不区分 effective / ineffective
- 不区分“存在一条 persisted rule”和“存在一个可执行约束”
- 不区分“这个 preset 是否真的需要 acceleration”

因此，空 number/date filter 也会扩大 `sortFields` demand。

### 3.3 query fast path 被 raw rule 数量破坏

`dataview/packages/dataview-engine/src/active/snapshot/query/derive.ts`

当前快路径依赖：

- search 为空
- `view.filter.rules.length === 0`

这意味着：

- 空 filter persisted 后，哪怕 ineffective，`rules.length` 也不再是 `0`
- 系统失去“无有效约束”快路径

正确语义应当是：

- 只要没有 effective filter / effective search，就仍属于快路径

### 3.4 sort demand 一变就 full rebuild

`dataview/packages/dataview-engine/src/active/index/runtime.ts`
`dataview/packages/dataview-engine/src/active/index/sort.ts`

当前 `runIndexDemandStage()` 策略是：

- demand 相同：`sync + ensure`
- demand 不同：`build`

对 sort index 的结果是：

- 原 demand 只有 `updatedAt`
- 新增空 number filter 后，demand 变成 `updatedAt + amount`
- 因为 `sameDemand` 失败，直接走 `buildSortIndex(...)`
- `buildSortIndex(...)` 又是从空 `Map()` 开始重建全部 sort fields

这会连已有的 `updatedAt` 也一起重排。

### 3.5 query runtime 没有区分“结构变了”和“执行计划变了”

当前 view query impact 基本以 raw projection 变化为准：

- `sameFilter(previousView.filter, nextView.filter)` 不同，记为 `filter` query aspect

这会导致：

- persisted empty rule 结构变化
- effective plan 实际未变
- 但 runtime 仍然至少走一次较重的 query/index 响应

从架构上讲，这里缺少 compiled plan diff。

## 4. 正确的长期语义模型

### 4.1 Raw Query Projection

定义：

- 来自 `view.search`
- 来自 `view.filter.rules`
- 来自 `view.sort`
- 来自 `view.group`

职责：

- 持久化用户配置
- 表达用户意图
- 允许 ineffective / incomplete / transitional rule 存在

约束：

- 不直接决定索引需求
- 不直接决定快路径
- 不直接决定 candidate acceleration

### 4.2 Executable Query Plan

定义：

由 raw query projection 编译出的执行计划，建议新增：

- `compileViewQueryPlan(view, reader)`

输出建议至少包含：

- `effectiveSearch`
- `effectiveFilterRules`
- `effectiveSortRules`
- `filterAccelerationPlans`
- `requiresGroupFieldIds`
- `requiresSortFieldIds`
- `requiresSearchFieldIds`
- `hasEffectiveFilter`
- `hasEffectiveSearch`
- `hasAnyConstraint`

职责：

- 判断哪些规则 effective
- 判断哪些 effective rule 可走 acceleration
- 判断哪些 rule 只能走 predicate
- 提供 query fast path 判定
- 提供 index demand 的唯一来源

### 4.3 Runtime Execution / Indexing

职责：

- 只消费 compiled plan
- 根据 compiled plan 触发最小必要工作

禁止行为：

- 不得直接扫描 raw `view.filter.rules` 推导 demand
- 不得用 raw `view.filter.rules.length` 判断快路径
- 不得因 additive demand 变化重建已有 sort index

## 5. 总体重构方向

### 5.1 保留 persisted empty filter

这点不改。

也就是说，以下逻辑保持：

- 用户新增 filter
- 规则立即写入 `view.filter.rules`
- 就算值为空，也作为持久化配置保存

方案不再引入“empty draft 自动丢弃”的语义。

### 5.2 新增 Query Compilation 层

这是本次长期重构的核心。

建议新增模块：

- `dataview/packages/dataview-engine/src/active/query/plan.ts`

建议导出：

- `compileViewQueryPlan()`
- `sameQueryPlanExecutionShape()`
- `sameQueryPlanDemand()`

其中应显式区分：

1. projection change
用户配置变了

2. execution change
effective rules 或 candidate acceleration 变了

3. demand change
索引所需字段集合变了

这样 runtime 才能对 persisted empty filter 做出轻量响应。

### 5.3 重写 Demand Derivation

`resolveViewDemand()` 必须改成基于 compiled plan，而不是 raw filter rules。

新的规则：

1. `number/date` filter 只有在 effective 且可以走 sorted candidate acceleration 时，才进入 `sortFields`
2. `status/select/multiSelect/boolean` 只有在 effective 且可走 group bucket acceleration 时，才进入 `groups`
3. ineffective persisted filter 一律不得扩大 demand
4. persisted empty filter 只影响 page/query UI，不影响 execution demand

这一步是解决你当前问题的第一关键点。

### 5.4 重写 Query Fast Path

`buildQueryState()` 当前的快路径判定需要改为基于 compiled plan：

- `!plan.hasEffectiveSearch`
- `!plan.hasEffectiveFilter`

或者：

- `!plan.hasAnyConstraint`

这会修正 persisted empty filter 破坏快路径的问题。

### 5.5 重写 Sort Demand Transition

sort stage 不能继续使用“sameDemand 才 ensure，否则 build”的粗暴逻辑。

建议专门为 sort index 引入 transition API：

- `transitionSortIndexDemand(previous, context, records, previousDemand, nextDemand)`

目标行为：

- `same`: `syncSortIndex`
- `additive`: `syncSortIndex + ensureSortIndex(nextDemand)`
- `subtractive`: `syncSortIndex + drop removed fields`
- `mixed`: `sync + ensure + drop`
- `incompatible`: 只在必要时 rebuild 某些字段，而非全量 rebuild

最关键约束：

从 `['updatedAt']` 到 `['updatedAt', 'amount']` 时：

- 只 build `amount`
- `updatedAt` 复用已有 sort field index

### 5.6 引入 Query Plan Diff，而不是只靠 View Query Aspect

当前 commit impact 基于 raw projection diff，无法区分：

- 结构变化
- effective 变化
- demand 变化

建议保留原有 commit impact 作为“projection changed”信号，但在 active runtime 内新增 plan diff：

- `projectionChanged`
- `executionChanged`
- `demandChanged`

active runtime 应按如下方式响应：

1. projection changed, execution unchanged, demand unchanged
只刷新 UI model，query execution 尽量 `reuse`

2. execution changed, demand unchanged
只重跑 query derive，不动索引 demand

3. demand additive
增量 ensure 新需求

4. demand subtractive
增量 drop 被移除字段

5. demand incompatible
局部 rebuild

## 6. UI 与 Page Runtime 的重构边界

### 6.1 不需要把 persisted empty filter 改成 draft-only

这次不建议引入“filter draft 不提交 view”的大重构作为前置条件。

原因：

- 它和用户预期冲突
- 不是这次性能问题的根源
- 成本很高，会牵动 page session、toolbar、popover 路由语义

### 6.2 仍建议逐步引入 stable id

虽然不需要 draft-only，但 query bar 长期仍然应该从 index 路由过渡到 stable id。

建议保留这个方向：

- committed filter 拥有 stable UI id
- `QueryBarEntry` 从 `index` 转为 `filterId`

原因：

- index 在删除/插入后不稳定
- 对 popover/focus/动画/并发编辑都不友好

但这属于次级改造，不是解决当前 50k 卡顿的第一优先级。

## 7. 模块级改造建议

### 7.1 dataview-core

需要新增或调整：

1. 明确 `FilterRule` 作为 raw persisted rule 的语义
2. 保持 `sameFilter()` 继续表达 projection equality
3. 不在 core 层把 ineffective rule 当作异常或待清理对象

建议新增注释或 contracts 说明：

- persisted ineffective rule 是合法状态
- effective semantics 由 execution/compiler 层负责

### 7.2 dataview-engine

这是主战场。

必须新增：

- `compileViewQueryPlan()`
- `resolveDemandFromQueryPlan()`
- `transitionSortIndexDemand()`
- 如有必要，`transitionGroupIndexDemand()`

必须改造：

- `active/demand.ts`
- `active/snapshot/query/derive.ts`
- `active/index/runtime.ts`

建议新增内部类型：

- `CompiledQueryPlan`
- `CompiledFilterRule`
- `CandidateAccelerationPlan`
- `DemandDiff`

### 7.3 dataview-runtime

runtime/page model 不必引入 draft-only 方案，但建议：

1. page query model 同时暴露 raw filter rows 和 effective state
2. query bar 可直接显示 ineffective persisted rule
3. page model 不再假设“存在 filter row == 存在有效约束”

可以新增：

- `PageQueryRow`
- `effective: boolean`
- `persisted: boolean`

### 7.4 dataview-react

UI 层不需要阻止先提交再编辑。

但建议补充：

1. 清晰区分 ineffective row 和 active row 的视觉状态
2. 减少 persisted empty filter 打开时的额外无效重渲染
3. 若未来切 stable id，逐步消除 `index` 依赖

## 8. 推荐实施顺序

### Phase 1: 修 execution 语义，不动产品语义

目标：

- persisted empty filter 仍然保留
- 但不再触发错误的 demand 扩张和 sort rebuild

改动范围：

1. 引入 `compileViewQueryPlan()`
2. `resolveViewDemand()` 基于 effective compiled plan
3. `buildQueryState()` 快路径基于 `hasAnyConstraint`
4. sort stage 改为 incremental demand transition

预期收益：

- 50k + `updatedAt` 排序 + 空 number filter 不再重建 `updatedAt` sort index
- persisted empty filter 仍能保留在 UI 中

这是第一优先级，必须先做。

### Phase 2: 引入 Query Plan Diff

目标：

- 区分 projection change 与 execution change

改动范围：

1. active runtime 内新增 compiled plan diff
2. 对无 execution change 的场景走轻量路径

预期收益：

- persisted empty filter 新增/修改时，runtime 响应进一步变轻

### Phase 3: UI 与 route 稳定化

目标：

- 让 query bar / filter popover 的状态模型更稳

改动范围：

1. `QueryBarEntry` 迁移到 stable id
2. page query rows 暴露 raw/effective 双语义

预期收益：

- 降低后续 query UI 重构成本
- 减少 index route 带来的隐性复杂度

## 9. 必须修正的错误行为

以下行为在长期方案中必须被禁止：

1. 按 raw `view.filter.rules` 直接推导 sort/group demand
2. 用 raw `view.filter.rules.length` 判定 query fast path
3. additive sort demand 触发全量 `buildSortIndex()`
4. 因 persisted ineffective rule 导致已有 sort field index 重建
5. 将 persisted ineffective rule 等同于 executable constraint

## 10. 兼容性策略

### 10.1 对已有 persisted ineffective rules 的兼容

保持兼容，不做自动清理。

规则：

- 允许读取
- 允许展示
- 允许继续编辑
- 但 execution/demand 必须把它们视为 ineffective

### 10.2 对 API 的兼容

保留现有 committed API：

- `engine.active.filters.add`
- `engine.active.filters.setPreset`
- `engine.active.filters.setValue`
- `engine.active.filters.remove`

这些 API 继续表示：

- 修改 persisted raw query projection

不建议为了这次问题强行改成 draft API。

## 11. 测试计划

### 11.1 语义测试

必须新增：

1. 新增空 filter 后，`view.filter.rules` 会持久化该规则
2. persisted empty filter 重新打开时仍可见
3. ineffective rule 不等于 active constraint

### 11.2 demand 测试

必须新增：

1. persisted empty number filter 不进入 `sortFields`
2. persisted empty date filter 不进入 `sortFields`
3. persisted empty status/select/multiSelect/boolean filter 不进入 `groups`
4. effective number/date filter 才进入 `sortFields`
5. effective option/status/multiSelect/boolean filter 才进入 `groups`

### 11.3 query fast path 测试

必须新增：

1. persisted empty filter 存在时，若无 effective constraint，仍走快路径
2. persisted ineffective rule 不改变 `visible === ordered` 的无约束行为

### 11.4 sort transition 测试

必须新增：

1. sort demand 从 `['updatedAt']` 扩容到 `['updatedAt', 'amount']` 时不重建 `updatedAt`
2. additive demand 只 build 新字段
3. subtractive demand 只 drop 被移除字段
4. unchanged demand 只 sync，不 build

### 11.5 perf benchmark

必须新增 50k 基准：

场景：

- 50k records
- 现有 `updatedAt(date)` sort
- 新增一个 persisted empty number filter

验收目标：

1. 不触发 `updatedAt` 的 full `buildSortIndex`
2. 不出现 `normalizeDateValue` / `toComparableTimestamp` 对 50k 的全量回放
3. 用户侧操作无明显卡顿

## 12. 观测与 Trace 改造

建议补充以下 trace 维度：

1. raw projection changed
2. compiled execution plan changed
3. demand changed
4. sort demand diff:
   - added fields
   - removed fields
   - rebuilt fields
5. query fast path 命中原因

建议至少输出：

- `reason: 'projection-only' | 'execution-changed' | 'demand-additive' | 'demand-subtractive' | 'full-rebuild'`
- `addedFieldIds`
- `removedFieldIds`
- `reusedFieldIds`
- `rebuiltFieldIds`

这样 future regression 能直接看出：

- 是 raw projection 变化引起的
- 还是 effective plan 真的变化了
- 还是 demand transition 策略退化了

## 13. 风险点

### 13.1 不能只修 sort rebuild

如果只在 `transitionSortIndexDemand()` 做增量优化，但不修 demand derivation 和 fast path：

- persisted empty filter 仍然会错误进入 demand 体系
- query runtime 仍然会做不必要工作

所以必须至少同时修：

- compiled effective plan
- demand derivation
- fast path 判定
- sort incremental transition

### 13.2 不要把“持久化 empty filter”误判为 bug

这是产品语义，不应在重构中被消除。

### 13.3 compiled plan 不能只服务 query derive

如果 demand derivation、page model、create record 等仍各自重复解释 raw rules，语义漂移会再次出现。

必须让 compiled plan 成为统一真相源。

## 14. 最终验收标准

以下条件全部满足，才算完成长期重构目标：

1. 新增空 filter 后，规则仍会持久化到 `view.filter.rules`
2. persisted empty filter 重新打开后仍存在
3. persisted empty filter 不进入 executable query plan 的 effective constraints
4. persisted empty number/date filter 不扩大 `sortFields`
5. persisted empty option/status/multiSelect/boolean filter 不扩大 `groups`
6. persisted empty filter 不破坏 query fast path
7. 从 `['updatedAt']` 到 `['updatedAt', 'amount']` 的 demand 扩容不重建 `updatedAt`
8. 50k 数据场景下新增空 filter 不出现明显卡顿
9. runtime 能区分 projection change、execution change、demand change

## 15. 一句话总结

本问题的长期正确解法不是“禁止空 filter 持久化”，而是：

允许 persisted ineffective rule 存在，但把它从执行层彻底隔离出去。

具体就是：

- raw query projection 允许无效规则存在
- executable query plan 只包含 effective constraints
- demand 只从 compiled effective plan 推导
- sort index 对 additive demand 只做增量 ensure，不做 full rebuild

只有这样，才能同时满足：

- 正确的产品语义
- 正确的执行语义
- 正确的长期性能行为
