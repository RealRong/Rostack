# Dataview Engine Spec Boundary Design

## 目标

这份文档回答一个核心问题:

- `field.kind`、`filter preset`、`calculation metric` 这类语义，到底应该继续写死在 engine 里，还是收敛到 spec
- 如果要 spec 化，边界应该怎么划，才能让复杂度最低，同时避免把 engine 调度逻辑反向塞进 spec

本文的结论是:

- 应该继续推进 spec 化
- 但不是把 engine 调度下放给 spec
- 最低复杂度、长期最优的做法，是按语义轴拆 owner:
  - field kind 语义归 `FieldSpec`
  - filter preset 语义归 `FilterSpec`
  - calculation metric 语义归 `CalculationMetricSpec`
  - view type 语义如果未来继续膨胀，再单独归 `ViewTypeSpec`
  - runtime 调度、增量策略、缓存结构、阈值策略仍然留在 engine

一句话总结:

- spec 负责定义语义
- engine 负责编排执行

## 现状

Dataview 已经有一部分 spec 化基础:

- field kind spec:
  - `dataview/packages/dataview-core/src/field/kind/spec.ts`
  - `dataview/packages/dataview-core/src/field/kind/index.ts`
- filter spec:
  - `dataview/packages/dataview-core/src/filter/spec.ts`
- calculation capability:
  - `dataview/packages/dataview-core/src/calculation/capability.ts`

这几块已经覆盖了不少语义:

- field create/convert
- compare/search/group entries
- filter preset、effective、match、value preview
- metric 是否对某类 field 合法

但 engine 里仍然有不少散落的 `field.kind` 判断，各层自己在补语义:

### 已散落在 engine 的 field 语义

1. plan/index demand

- `dataview/packages/dataview-engine/src/active/plan.ts`
- 这里仍然自己判断:
  - 哪些 filter 需要 bucket substrate
  - 哪些 filter 需要 sorted substrate
  - 哪些 persisted filter 即使无效也会拉起 index demand

2. index fast path

- `dataview/packages/dataview-engine/src/active/index/bucket.ts`
- `dataview/packages/dataview-engine/src/active/index/sort.ts`
- 这里自己判断:
  - 哪些 field 可走 `resolveFastBucketKeys`
  - 哪些 field 可以直接做 numeric/date sort fast path

3. query candidate acceleration

- `dataview/packages/dataview-engine/src/active/snapshot/query/derive.ts`
- 这里自己判断:
  - 哪些 filter 可以从 bucket index 直接拿候选集
  - 哪些 filter 可以从 sort index 做 range/eq 候选集

4. create default / write intent

- `dataview/packages/dataview-engine/src/active/commands/records.ts`
- 这里自己判断:
  - 某个 filter 是否能推导出 create default value

5. calculation entry / summary display

- `dataview/packages/dataview-engine/src/active/shared/calculation.ts`
- `dataview/packages/dataview-engine/src/active/snapshot/summary/compute.ts`
- 这里自己判断:
  - unique key 怎么生成
  - option ids 怎么读
  - option distribution 对哪些 field 合法

6. view projection / view behavior

- `dataview/packages/dataview-engine/src/source/project.ts`
- `dataview/packages/dataview-engine/src/mutate/planner/views.ts`
- 这里自己判断:
  - group 是否使用 option color
  - kanban 默认优先选哪些 field 做 group

7. default search field

- `dataview/packages/dataview-core/src/search/tokens.ts`
- `dataview/packages/dataview-engine/src/active/index/demand.ts`
- 这里也还是按 kind 做默认搜索字段选择

### 为什么这会持续制造复杂度

同一份语义被分散在多层后，会出现几个稳定问题:

- 同一个规则会写两遍甚至三遍
  - 例如 filter spec 知道 rule 是否 effective
  - plan 又自己决定这个 rule 是否触发 index demand
  - query derive 再自己决定这个 rule 是否可走 index candidate
- 新 field kind、新 filter preset、新 metric 加入时，engine 多处都要补分支
- perf 优化时很难判断热点是“算法问题”还是“语义归属错误”
- 很容易出现“UI 改了，但 engine 用了另一套语义判断”的漂移

这次空 date filter 触发全量 sort index，本质上就是典型例子:

- filter spec 认为 rule 无效
- plan 却仍然把它当成 sort substrate 的 demand 来源

## 设计原则

### 1. 按语义轴分 owner，不按 engine 阶段分 owner

最重要的一条:

- 不要让 `query/index/summary/source/command` 各自拥有一份 field 语义
- 应该按“这个语义天然属于谁”来收口

推荐 owner:

- field kind 语义: `FieldSpec`
- filter preset 语义: `FilterSpec`
- calculation metric 语义: `CalculationMetricSpec`
- view type 语义: `ViewTypeSpec`
- runtime orchestration: engine

### 2. declarative first，pure hook second

优先级:

- 先用声明式字段描述
- 只在确实需要值级变换时，提供纯函数 hook

应该避免的接口形态:

```ts
shouldTriggerIndex(context): boolean
applyToEngineState(runtime): void
```

这类接口的问题是:

- spec 需要理解 engine 生命周期
- 测试粒度会变差
- engine 调度逻辑会被隐藏进 callback

应该接受的接口形态:

```ts
searchDefaultEnabled: boolean
groupUsesOptionColors: boolean
sortScalarOf(value): number | string | undefined
deriveCreateDefault(rule): unknown | undefined
```

这类接口是纯语义、纯值变换，不拥有调度权。

### 3. engine 只负责三件事

- 汇总 demand
- 选择执行路径
- 维护状态和性能策略

也就是说:

- spec 不负责决定 rebuild / sync / reuse
- spec 不负责决定全量还是增量
- spec 不负责决定 Map/Set/Array/patch builder 的结构

### 4. 不要为每个 engine 子系统发明一套新 spec

最低复杂度方案，不是:

- `IndexSpec`
- `QuerySpec`
- `SummarySpec`
- `SourceSpec`
- `CommandSpec`

各来一份。

这样只会把分支从 engine 文件里移动到更多 registry 里。

最低复杂度方案是:

- 只保留少数几个真正稳定的 spec 轴
- engine 各层共享读取同一份语义

## 推荐的最终 owner 模型

### 1. FieldSpec

`FieldSpec` 负责 field kind 天生拥有的语义:

- value compare/search/group/write normalize
- search 默认参与能力
- sort/bucket 的 fast scalar 提取
- calculation entry 提取
- create default、view 偏好等 field 本身的行为

建议形态:

```ts
interface FieldSpec {
  schema: FieldSchemaSpec
  value: FieldValueSpec
  index: FieldIndexSpec
  calculation: FieldCalculationSpec
  create: FieldCreateSpec
  view: FieldViewSpec
}

interface FieldIndexSpec {
  searchDefaultEnabled: boolean
  bucket: {
    fastKeysOf?: (value: unknown) => readonly string[] | undefined
  }
  sort: {
    scalarOf?: (value: unknown) => string | number | boolean | undefined
  }
}

interface FieldCalculationSpec {
  uniqueKeyOf: (value: unknown) => string
  optionIdsOf?: (value: unknown) => readonly string[] | undefined
}

interface FieldCreateSpec {
  defaultValue?: (field: Field) => unknown | undefined
}

interface FieldViewSpec {
  groupUsesOptionColors: boolean
  kanbanGroupPriority: number
}
```

这里的关键点是:

- `FieldSpec` 不知道 engine 的阶段
- 只暴露“稳定、纯”的 field 语义

### 2. FilterSpec

`FilterSpec` 已经存在，最适合继续吸收的是 rule 级语义:

- 是否 effective
- 如何 match
- 如何投影 value
- 这个 rule 是否值得拉起 index substrate
- 这个 rule 是否能从现有 index 生成 candidate
- 这个 rule 是否能推导 create default

建议扩展为:

```ts
interface FilterSpec {
  presets: readonly FilterPreset[]
  getEditorKind(...)
  isEffective(...)
  match(...)
  projectValue(...)
  plan: FilterPlanSpec
  candidate?: FilterCandidateSpec
  create?: FilterCreateSpec
}

interface FilterPlanSpec {
  demandOf(input: {
    field: Field | undefined
    rule: FilterRule
  }): {
    bucket?: true
    sorted?: true
  }
}

interface FilterCandidateSpec {
  fromBucketIndex?(input): FilterCandidate | undefined
  fromSortIndex?(input): FilterCandidate | undefined
}

interface FilterCreateSpec {
  deriveDefaultValue?(input): {
    fieldId: FieldId
    value: unknown
  } | undefined
}
```

为什么这些应该属于 `FilterSpec`，而不是 `FieldSpec`:

- `eq`、`neq`、`contains`、`exists_true`、`exists_false` 是 preset/operator 语义，不是 field 自己的语义
- 同一个 field kind，不同 preset 对 index 和 create default 的要求可能完全不同

### 3. CalculationMetricSpec

当前 `calculation/capability.ts` 只解决“metric 是否合法”，但 metric 其实还有两类稳定语义:

- metric 需要哪些 reducer capability
- metric 如何从 reducer state 计算最终结果

建议最终 owner:

```ts
interface CalculationMetricSpec {
  capabilities: ReducerCapabilitySet
  supports: (field: Field | undefined) => boolean
  compute: (input: {
    field: Field | undefined
    state: FieldReducerState
  }) => CalculationResult
}
```

这样:

- `supportsFieldCalculationMetric` 和 `computeSummary` 都能共享同一份 metric 语义
- engine 不必再在 summary compute 里判断 option field

### 4. ViewTypeSpec

这份文档的主线是 field 语义，但从长期看，`view.type` 分支如果继续膨胀，也应该有单独 owner。

不过这不是当前最高优先级，不建议现在同时大动。

建议原则:

- field 语义先进 spec
- view type 语义以后如果继续扩展，再单独做 `ViewTypeSpec`

## 哪些地方应该 spec 化

下面按收益和必要性排序。

### A. 必须 spec 化

#### A1. plan/index demand

当前位置:

- `dataview/packages/dataview-engine/src/active/plan.ts`

问题:

- engine 自己决定 filter 对 bucket/sort substrate 的 demand
- 很容易和 `isFilterRuleEffective` 漂移

结论:

- 必须迁到 `FilterSpec.plan`

#### A2. query candidate acceleration

当前位置:

- `dataview/packages/dataview-engine/src/active/snapshot/query/derive.ts`

问题:

- 哪些 rule 可以从 bucket/sort index 生成 candidate，属于 filter 语义
- 现在 query derive 自己 hardcode，扩展 preset 会继续发散

结论:

- 应迁到 `FilterSpec.candidate`
- engine 只负责“有没有对应 index”和“如何 merge candidate”

#### A3. create default from active filters

当前位置:

- `dataview/packages/dataview-engine/src/active/commands/records.ts`

问题:

- `resolveFilterRuleDefault` 本质是“rule 对新 record 的默认赋值能力”
- 这是 filter preset 与 field kind 的联合语义

结论:

- 应迁到 `FilterSpec.create`

### B. 高价值 spec 化

#### B1. default search field

当前位置:

- `dataview/packages/dataview-core/src/search/tokens.ts`
- `dataview/packages/dataview-engine/src/active/index/demand.ts`

问题:

- 搜索默认参与能力仍然是按 kind switch 判断

结论:

- 应迁到 `FieldSpec.index.searchDefaultEnabled`

#### B2. bucket fast key / sort fast scalar

当前位置:

- `dataview/packages/dataview-engine/src/active/index/bucket.ts`
- `dataview/packages/dataview-engine/src/active/index/sort.ts`

问题:

- 哪些类型能直接映射成 bucket key、哪些类型能直接映射成 sort scalar，是 field 值语义
- engine 保留 fast path 结构没问题，但不应自己知道哪些 kind 能走 fast path

结论:

- 应迁到 `FieldSpec.index.bucket.fastKeysOf`
- 应迁到 `FieldSpec.index.sort.scalarOf`

注意:

- “是否采用 fast path”仍是 engine 决定
- spec 只提供可用的纯值投影

#### B3. calculation entry 提取

当前位置:

- `dataview/packages/dataview-engine/src/active/shared/calculation.ts`

问题:

- `uniqueValueKey`
- `readOptionIds`

这些都属于 field 值归一化语义，不该继续散在 engine。

结论:

- 应迁到 `FieldSpec.calculation`

#### B4. group UI traits

当前位置:

- `dataview/packages/dataview-engine/src/source/project.ts`
- `dataview/packages/dataview-engine/src/mutate/planner/views.ts`

问题:

- option color、kanban 默认 group 倾向，本质都是 field 在 view 里的表现偏好

结论:

- 应迁到 `FieldSpec.view`

### C. 适合后续 spec 化，但不是第一阶段必做

#### C1. option-bearing field 的 schema mutation 语义

当前位置:

- `dataview/packages/dataview-engine/src/mutate/planner/fields.ts`

问题:

- `status` 有 category/defaultOption 语义
- `select/status` 删除 option 时清空单值
- `multiSelect` 删除 option 时过滤数组

这些确实也是 field 语义，但它们牵涉:

- schema patch
- record value rewrite
- default option policy

结论:

- 适合做成 `FieldOptionSpec`
- 但建议放到第二阶段
- 第一阶段不要为了统一而统一

#### C2. record create default value

当前位置:

- `dataview/packages/dataview-engine/src/mutate/planner/records.ts`

问题:

- 现在只有 `status` 默认值

结论:

- 可以迁到 `FieldSpec.create.defaultValue`
- 但收益没有前面几项大

## 哪些地方不应该 spec 化

以下内容应该明确留在 engine:

### 1. 执行路径决策

例如:

- rebuild / sync / reuse
- 全量还是增量
- touched ratio threshold
- 是否 fallback 到 full scan

这些都依赖:

- 当前状态大小
- impact 大小
- cache 命中情况
- runtime 成本

它们不是 field 语义。

### 2. index / snapshot / publish 的数据结构

例如:

- `Map`
- `Set`
- `Array`
- patch builder
- ordered merge

这些是 runtime 实现，不应该进 spec。

### 3. delta / trace / perf 统计

例如:

- `IndexTrace`
- `ViewRuntimeDelta`
- `SourceDelta`

这些属于 engine 生命周期和调试基础设施。

### 4. section/item/layout 的发布和复用策略

例如:

- section 何时复用 previous node
- item list 何时复用 ids
- table layout 何时重用 previous sections

这不是 field 语义。

## 最低复杂度的最终结构

最低复杂度，不是做很多 registry，而是做四个 owner:

```ts
interface FieldSpecRegistry {
  get(kind: FieldKind): FieldSpec
}

interface FilterSpecRegistry {
  get(field: Field | undefined): FilterSpec
}

interface CalculationMetricRegistry {
  get(metric: CalculationMetric): CalculationMetricSpec
}

interface ViewTypeSpecRegistry {
  get(type: ViewType): ViewTypeSpec
}
```

其中第一阶段真正需要动的是前三个，`ViewTypeSpecRegistry` 可以先不落地。

### 为什么这套结构复杂度最低

因为它满足三件事:

1. owner 数量少

- 只有 field/filter/metric 三个主轴
- 不会按 engine 阶段重复建 registry

2. 责任边界天然稳定

- field kind 不会因为 engine pipeline 改动而变 owner
- filter preset 不会因为 query/index 重构而变 owner

3. engine 各层共享同一份语义

- plan
- index
- query derive
- create defaults
- summary
- source projection

都读同一份 spec，而不是各自复制规则。

## 推荐实施顺序

### Phase 1

目标:

- 收掉最容易漂移、最影响性能的分支

内容:

1. `FieldSpec.index.searchDefaultEnabled`
2. `FieldSpec.index.bucket.fastKeysOf`
3. `FieldSpec.index.sort.scalarOf`
4. `FilterSpec.plan.demandOf`
5. `FilterSpec.create.deriveDefaultValue`
6. `FieldSpec.view.groupUsesOptionColors`
7. `FieldSpec.view.kanbanGroupPriority`

替换位置:

- `active/plan.ts`
- `active/index/demand.ts`
- `active/index/bucket.ts`
- `active/index/sort.ts`
- `active/commands/records.ts`
- `source/project.ts`
- `mutate/planner/views.ts`

### Phase 2

目标:

- 收掉 query 和 calculation 里的剩余 field 语义

内容:

1. `FilterSpec.candidate`
2. `FieldSpec.calculation.uniqueKeyOf`
3. `FieldSpec.calculation.optionIdsOf`
4. `CalculationMetricSpec.compute`

替换位置:

- `active/snapshot/query/derive.ts`
- `active/shared/calculation.ts`
- `active/snapshot/summary/compute.ts`

### Phase 3

目标:

- 收掉 mutation planner 里的 option/status 特殊逻辑

内容:

1. `FieldOptionSpec.createOption`
2. `FieldOptionSpec.patchOption`
3. `FieldOptionSpec.removeOptionEffects`
4. `FieldSpec.create.defaultValue`

替换位置:

- `mutate/planner/fields.ts`
- `mutate/planner/records.ts`

## 不推荐的方案

### 方案一: 继续写死在 engine

问题:

- 语义重复
- 新类型扩展成本高
- 规则容易漂移
- perf 问题难以定位根因

### 方案二: 给 engine 每个阶段都做一套 spec

例如:

- query spec
- index spec
- summary spec
- source spec

问题:

- owner 过多
- 同一语义还是会散
- 只是把 switch 搬家，没有真正收敛

### 方案三: 给 spec 完整调度权

例如:

- `fieldSpec.shouldRebuildIndex(context)`
- `filterSpec.applyToQueryRuntime(...)`

问题:

- spec 和 engine 耦合过深
- 调试和 trace 变黑箱
- 会让 runtime 复杂度反向上升

## 最终结论

长期最优、同时复杂度最低的方案是:

- 继续推进 spec 化
- 但严格限定 spec 只拥有“稳定语义”，不拥有 runtime 调度
- 不按 engine 阶段建 spec，而按语义轴建少量 owner

推荐最终边界:

- `FieldSpec`: field kind 天生语义
- `FilterSpec`: rule / preset 语义
- `CalculationMetricSpec`: metric 语义
- `ViewTypeSpec`: 以后再视复杂度单独引入
- engine: demand 汇总、执行路径、状态结构、delta、trace、perf 策略

如果只允许做一件最关键的事，那就是:

- 先把所有“field.kind 分支决定 engine 行为”的地方，收敛成读取同一份 `FieldSpec` / `FilterSpec`

这样既不会引入新的架构层爆炸，也能把当前最容易漂移、最影响性能的逻辑先稳定下来。
