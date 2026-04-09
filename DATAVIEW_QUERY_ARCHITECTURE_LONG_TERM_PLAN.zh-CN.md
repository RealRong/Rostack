# Dataview Query / Field 长期最优架构方案

## 1. 目标

本文只讨论长期最优架构，不考虑当前实现、兼容层、迁移成本。

目标只有三个：

1. 复杂度最低
2. 可读性最高
3. 职责边界最稳定

这里的“查询”包含：

- filter
- sort
- group
- search

这里的“字段”指：

- field schema
- field value semantics
- field option/status/date 等类型能力

核心判断：

- `field` 不是查询系统
- `filter / sort / group / search` 不是字段本体
- `query` 不是规则中心，而应该只是组合中心


## 2. 顶层结论

长期最优目录不应该是：

- `core/field/filter`
- `core/field/sort`
- `core/field/group`
- `core/field/search`

因为这会把 `field` 变成超大中轴，最终所有 view/query 逻辑都会再次回流到字段层。

长期最优目录应该是：

```txt
dataview/src/core/
  field/
  filter/
  sort/
  group/
  search/
  query/
```

含义如下：

- `field`：字段本体语义
- `filter`：过滤规则系统
- `sort`：排序规则系统
- `group`：分组规则系统
- `search`：搜索规则系统
- `query`：把上面四者组合成 view query，并负责统一执行

其中：

- `filter / sort / group / search` 都可以依赖 `field`
- `field` 不能反向依赖 `filter / sort / group / search`
- `query` 可以依赖这四个模块
- 这四个模块彼此尽量不要相互依赖


## 3. 最核心的设计原则

### 3.1 一切按“语义中心”分层

不要按“实现上看起来相似”分层，要按“这个概念到底属于谁”分层。

例如：

- “字段值怎么 display/parse/compare”属于 `field`
- “某种 filter condition 是否有效”属于 `filter`
- “某个字段支不支持按 category 分组”属于 `field`
- “当前 view 选择按哪个字段 grouping，以及 bucket 是否折叠”属于 `group`


### 3.2 field 只回答“字段是什么”

`field` 应该只回答下面这些问题：

- 这个字段是什么 kind
- 这个字段的值怎么读
- 这个字段的值怎么 parse
- 这个字段的值怎么 display
- 这个字段的值怎么 compare
- 这个字段能否产生 search tokens
- 这个字段能否分组，按什么 mode 分组

`field` 不应该回答下面这些问题：

- 当前 filter condition 有哪些 preset
- 当前 view 的 filter 是否 effective
- 当前 sorter 怎么执行
- 当前 group state 如何投影成 sections
- 当前 search query 如何解析成查询计划


### 3.3 query 只做组合，不做规则中心

`query` 是组合器，不是语义中心。

它不应该再维护大量 if/else 规则，而应该只做：

- normalize whole view query
- 调用 `filter/sort/group/search` 各自的模块
- 统一执行整条查询链

也就是说：

- `filter` 决定 filter 自己怎么工作
- `sort` 决定 sort 自己怎么工作
- `group` 决定 group 自己怎么工作
- `search` 决定 search 自己怎么工作
- `query` 只决定组合顺序和总流程


### 3.4 projection 和 raw state 分开

长期最优里，每个 query 子系统都应该有两层：

- raw state
- derived projection

raw state 用于持久化和 command 写入。  
projection 用于 UI 读取和执行时派生。

不要让 UI 根据 raw state 再次推导：

- label
- active
- effective
- editor kind
- display summary
- capability

这些都应该由各自模块产出 projection。


## 4. 各模块的长期职责

## 4.1 `core/field`

### 职责

`field` 只保留字段本体能力：

- schema
- value semantics
- behavior
- group facet

建议子结构：

```txt
core/field/
  schema/
  value/
  behavior/
  group/
  options/
  index.ts
```

### 应该放在 `field` 的内容

- field schema spec
- create / convert / normalize
- option helpers
- status option/category/default helpers
- parse value
- display value
- compare value
- search tokens
- quick toggle / primary action
- group facet metadata
  - 支持哪些 group mode
  - bucket domain 如何生成
  - 某个 value 如何映射成 bucket entries

### 不应该放在 `field` 的内容

- filter preset
- filter matching
- sorter rule
- search query state
- group state
- group projection
- query bar 文案

### `field` 最理想的对外 API

```ts
field.schema.get(fieldId)
field.schema.create(input)
field.schema.convert(field, kind)

field.parse(field, draft)
field.display(field, value)
field.compare(field, left, right)
field.search(field, value)

field.behavior(field, input)

field.group.get(field)
field.group.entries(field, value, mode)
field.group.domain(field, mode)
```

这里最重要的是：

- `group` 仍然属于 `field`
- 但 `group state` 不属于 `field`


## 4.2 `core/filter`

### 职责

`filter` 是独立查询子系统。

它负责：

- filter state schema
- preset spec
- value normalization
- effective 判定
- record match
- projection
- editor kind
- summary text

### 建议子结构

```txt
core/filter/
  types.ts
  spec.ts
  normalize.ts
  match.ts
  projection.ts
  summary.ts
  index.ts
```

### 长期最优状态模型

```ts
type Filter = {
  mode: 'and' | 'or'
  rules: FilterRule[]
}

type FilterRule = {
  fieldId: FieldId
  presetId: FilterPresetId
  value?: FilterValue
}
```

关键点：

- condition identity 用 `presetId`
- 不用 `op + fixedValue + hidesValue` 的旧拼装思路
- UI 需要的信息通过 projection 提供，不通过 meta 二次推导

### 长期最优 API

```ts
filter.spec.get(field)
filter.rule.create(field)
filter.rule.normalize(field, rule)
filter.rule.setPreset(field, rule, presetId)
filter.rule.setValue(field, rule, value)
filter.rule.isEffective(field, rule)
filter.rule.match(field, recordValue, rule)

filter.projection.rule(field, rule)
filter.projection.view(document, viewId)
```

### 关键原则

- `filter` 依赖 `field.compare / field.display / field.search`，但不依赖 UI
- `status` 不再有专属 filter state
- `status` 在 filter 里只是 `option-set`
- category 只是 UI bulk action，不是持久化语义


## 4.3 `core/sort`

### 职责

`sort` 比 `filter` 轻很多，不需要过度设计。

它负责：

- sorter state
- normalize
- compare plan
- projection

### 建议子结构

```txt
core/sort/
  types.ts
  normalize.ts
  compare.ts
  projection.ts
  index.ts
```

### 长期最优状态模型

```ts
type Sorter = {
  fieldId: FieldId
  direction: 'asc' | 'desc'
}
```

如果未来没有更复杂排序模式，就不要做成和 `filter` 一样重。

### 长期最优 API

```ts
sort.rule.normalize(sorter)
sort.rule.compare(field, left, right, sorter)
sort.projection.view(document, viewId)
```

### 原则

- 排序本身不应该回到 `field`
- `field` 只提供 compare
- `sort` 只负责怎么组织 compare


## 4.4 `core/group`

### 职责

`group` 是最值得继续独立的子系统，因为它最容易跨层混乱。

`group` 负责：

- group state
- state normalize
- bucket state
- section projection
- section visibility / collapse
- grouping execution

### 建议子结构

```txt
core/group/
  types.ts
  normalize.ts
  state.ts
  projection.ts
  section.ts
  index.ts
```

### 长期最优状态模型

```ts
type Group = {
  fieldId: FieldId
  mode?: string
  bucketSort?: BucketSort
  bucketInterval?: number
  showEmpty?: boolean
  buckets?: Record<string, BucketState>
}
```

### `group` 和 `field` 的正确边界

`field.group` 负责：

- 这个字段支持哪些 grouping modes
- 每个 mode 下怎么把 value 变成 bucket entry
- bucket domain 怎么生成

`group` 负责：

- 当前 view 选择哪种 grouping
- 当前 bucket 是否 hidden / collapsed
- section 最终怎么排
- 给 UI 什么投影

这是长期最重要的一条边界。

### 长期最优 API

```ts
group.state.normalize(field, group)
group.state.toggleBucket(group, key)
group.state.hideBucket(group, key)

group.projection.view(document, viewId)
group.section.build(records, field, group)
```


## 4.5 `core/search`

### 职责

如果 search 未来只是轻量 contains 查询，那它可以保持轻模块。

它负责：

- search state
- normalize
- execute
- projection summary

### 建议子结构

```txt
core/search/
  types.ts
  normalize.ts
  execute.ts
  summary.ts
  index.ts
```

### 长期最优状态模型

```ts
type Search = {
  query: string
  fields?: FieldId[]
}
```

### API

```ts
search.state.normalize(search)
search.execute.record(record, document, search)
search.summary.get(search, fields)
```

### 原则

- `field` 只提供 `search`
- `search` 决定 query 如何命中 record
- 不要把 search query state 放回字段层


## 4.6 `core/query`

### 职责

`query` 只做 orchestrator。

它负责：

- whole view query normalize
- 执行顺序组织
- 对外暴露统一 query helpers

### 建议子结构

```txt
core/query/
  types.ts
  normalize.ts
  execute.ts
  equality.ts
  index.ts
```

### `query` 不应该再做什么

- 不应该维护 filter preset 规则
- 不应该维护 group capability 规则
- 不应该维护 sort compare 规则
- 不应该维护 search token 规则

### 理想执行顺序

一般情况下：

1. filter
2. search
3. sort
4. group / section projection

这条顺序由 `query.execute` 组织，但每步规则属于各自模块。


## 5. Engine 层长期最优 API

Engine 层应该尽量短、直、稳定。

## 5.1 Read API

```ts
engine.read.document.get()
engine.read.view.get(viewId)

engine.read.filter.get(viewId)
engine.read.sort.get(viewId)
engine.read.group.get(viewId)
engine.read.search.get(viewId)

engine.read.viewProjection.get(viewId)
```

说明：

- `read.filter.get(viewId)` 返回 filter projection
- `read.sort.get(viewId)` 返回 sort projection
- `read.group.get(viewId)` 返回 group projection
- `read.search.get(viewId)` 返回 search projection
- `read.view.get(viewId)` 返回 raw persisted state
- `read.viewProjection.get(viewId)` 返回整页最终 projection


## 5.2 Write API

### Filter

```ts
engine.view(viewId).filter.add(fieldId)
engine.view(viewId).filter.set(index, rule)
engine.view(viewId).filter.preset(index, presetId)
engine.view(viewId).filter.value(index, value)
engine.view(viewId).filter.mode(value)
engine.view(viewId).filter.remove(index)
engine.view(viewId).filter.clear()
```

### Sort

```ts
engine.view(viewId).sort.add(fieldId, direction?)
engine.view(viewId).sort.set(fieldId, direction)
engine.view(viewId).sort.replace(index, sorter)
engine.view(viewId).sort.move(from, to)
engine.view(viewId).sort.remove(index)
engine.view(viewId).sort.clear()
```

### Group

```ts
engine.view(viewId).group.set(fieldId)
engine.view(viewId).group.clear()
engine.view(viewId).group.mode(value)
engine.view(viewId).group.sort(value)
engine.view(viewId).group.interval(value)
engine.view(viewId).group.showEmpty(value)
engine.view(viewId).group.hide(key)
engine.view(viewId).group.show(key)
engine.view(viewId).group.collapse(key)
engine.view(viewId).group.expand(key)
```

### Search

```ts
engine.view(viewId).search.query(value)
engine.view(viewId).search.fields(fieldIds?)
engine.view(viewId).search.clear()
```


## 5.3 最终 API 命名原则

长期最优里，API 名称应尽量短、稳定、可直读。

原则如下：

- 默认优先单个清晰名词，不做无意义前缀
- 字段本体能力直接挂在 `field`
- query 子系统能力直接挂在各自模块
- projection/read API 用 `get`
- write API 用动词

推荐命名风格：

```ts
field.parse(field, draft)
field.display(field, value)
field.compare(field, left, right)
field.search(field, value)
field.behavior(field, input)
field.group.get(field)
field.group.domain(field, mode)
field.group.entries(field, value, mode)

filter.get(viewId)
filter.rule(field)
filter.normalize(field, rule)
filter.preset(field, rule, presetId)
filter.value(field, rule, value)
filter.effective(field, rule)
filter.match(field, recordValue, rule)
filter.project(document, viewId)

sort.normalize(sorter)
sort.compare(field, left, right, sorter)
sort.project(document, viewId)

group.normalize(field, group)
group.project(document, viewId)
group.sections(records, field, group)

search.normalize(search)
search.match(record, document, search)
search.summary(search, fields)

query.normalize(viewQuery)
query.run(document, viewId)
```

几个刻意的取舍：

- 用 `field.search`，不用 `field.searchTokens`
- 用 `field.group`，不用 `field.groupFacet`
- 用 `filter.project`，不用 `filter.projection.view`
- 用 `sort.project / group.project`，统一 projection 心智
- 用 `query.run`，不用 `query.executeViewQuery` 这类长名

如果某个 API 未来需要拆细，再通过子对象扩展，而不是一开始就拉长命名。


## 5.4 最终 Engine Read / Write API

推荐最终统一为：

```ts
engine.read.document.get()
engine.read.view.get(viewId)

engine.read.filter.get(viewId)
engine.read.sort.get(viewId)
engine.read.group.get(viewId)
engine.read.search.get(viewId)
engine.read.query.get(viewId)
engine.read.viewProjection.get(viewId)
```

说明：

- `read.view.get(viewId)` 返回 raw view state
- `read.filter/sort/group/search.get(viewId)` 返回子系统 projection
- `read.query.get(viewId)` 返回完整 query projection
- `read.viewProjection.get(viewId)` 返回整个 view 的最终 UI projection

推荐最终写 API：

```ts
engine.view(viewId).filter.add(fieldId)
engine.view(viewId).filter.set(index, rule)
engine.view(viewId).filter.preset(index, presetId)
engine.view(viewId).filter.value(index, value)
engine.view(viewId).filter.mode(mode)
engine.view(viewId).filter.remove(index)
engine.view(viewId).filter.clear()

engine.view(viewId).sort.add(fieldId, direction?)
engine.view(viewId).sort.set(fieldId, direction)
engine.view(viewId).sort.replace(index, sorter)
engine.view(viewId).sort.move(from, to)
engine.view(viewId).sort.remove(index)
engine.view(viewId).sort.clear()

engine.view(viewId).group.set(fieldId)
engine.view(viewId).group.clear()
engine.view(viewId).group.mode(mode)
engine.view(viewId).group.sort(sort)
engine.view(viewId).group.interval(interval)
engine.view(viewId).group.empty(showEmpty)
engine.view(viewId).group.hide(key)
engine.view(viewId).group.show(key)
engine.view(viewId).group.collapse(key)
engine.view(viewId).group.expand(key)

engine.view(viewId).search.query(query)
engine.view(viewId).search.fields(fieldIds?)
engine.view(viewId).search.clear()
```

其中：

- `group.empty(value)` 比 `group.showEmpty(value)` 更短，也更对称
- `filter.mode(mode)` 保持最短
- `search.query(query)` 虽然重复词，但可读性最高


## 5.5 最终目录建议

长期最优里，`field` 的子目录也应该压成短名：

```txt
dataview/src/core/
  field/
    schema/
    value/
    behavior/
    group/
    options/
    index.ts

  filter/
    types.ts
    spec.ts
    normalize.ts
    match.ts
    project.ts
    summary.ts
    index.ts

  sort/
    types.ts
    normalize.ts
    compare.ts
    project.ts
    index.ts

  group/
    types.ts
    normalize.ts
    state.ts
    project.ts
    section.ts
    index.ts

  search/
    types.ts
    normalize.ts
    match.ts
    summary.ts
    index.ts

  query/
    types.ts
    normalize.ts
    run.ts
    equality.ts
    index.ts
```

## 6. UI 层长期最优原则

UI 要尽量薄。

UI 不应该再从 raw state 自己推导：

- active
- effective
- editor kind
- summary
- body layout
- condition text

UI 应该直接消费 projection：

- `filter projection`
- `sort projection`
- `group projection`
- `search projection`

UI 的职责应该只有：

- 渲染
- 交互
- 调 command API


## 7. 哪些东西绝对不要再做

### 7.1 不要把 query 规则再塞回 `field`

不要再出现：

- `field kind` 里存 filter presets
- `field` 导出整套 filter helper
- `field` 负责 query UI projection


### 7.2 不要让 UI 再次推导 effective/active

这会导致：

- 逻辑重复
- projection 和 UI 分叉
- 同一个概念有多个真相


### 7.3 不要让 `status` 拥有专属 filter 持久化模型

长期最优里：

- `status` 的 filter value 和 `multiSelect` 同类
- category 只是 UI 快捷操作
- persisted value 只存 canonical option set


### 7.4 不要把 `query` 做成大杂烩

`query` 一旦重新开始承载：

- filter spec
- group spec
- search spec
- sort spec

那会再次变成新的中轴怪物。


## 8. 分阶段实施方案

目标不是“先把局部做漂亮”，而是最终把整个系统做完。

这里的“完成”定义为：

- `field` 回到字段本体
- `filter / sort / group / search` 都独立成清晰子系统
- `query` 只做组合
- engine read/write API 全部统一
- UI 全部切到 projection
- 旧 API 和兼容层全部删除

建议实施分 8 个阶段。

### Phase 1: 固化 `field` 边界

目标：

- 明确 `field` 只保留 schema/value/behavior/group
- 彻底禁止 query 规则回流到 `field`

完成标准：

- `field` 中没有 filter preset / sort rule / search state / group state
- `field.group` 只包含字段分桶能力，不包含 view grouping state

### Phase 2: 完成 `filter`

目标：

- `filter` 成为完整独立子系统

完成标准：

- raw state、normalize、match、effective、summary、project 全在 `core/filter`
- status canonical value 统一为 option-set
- UI 只消费 `engine.read.filter.get(viewId)`

### Phase 3: 独立 `sort`

目标：

- `sort` 从 `query` 和 view service 杂糅中抽出来

完成标准：

- sorter normalize/compare/project 全在 `core/sort`
- `field` 只保留 compare
- UI 只消费 `engine.read.sort.get(viewId)`

### Phase 4: 独立 `group`

目标：

- 把 grouping 的 view state、section build、bucket presentation 从字段语义中拆出去

完成标准：

- `field.group` 只负责 domain/entries/capability
- `core/group` 负责 normalize/state/project/sections
- UI 只消费 `engine.read.group.get(viewId)`

### Phase 5: 独立 `search`

目标：

- 把 search 从 query helper 和 view 读取逻辑里单独抽出来

完成标准：

- search state/normalize/match/summary 在 `core/search`
- `field` 只提供 `field.search`
- UI 只消费 `engine.read.search.get(viewId)`

### Phase 6: 收口 `query`

目标：

- `query` 从规则中心变成组合器

完成标准：

- `query` 只保留 normalize / run / equality
- 规则都回到 filter/sort/group/search 各自模块
- `engine.read.query.get(viewId)` 可直接返回完整 query projection

### Phase 7: 统一 Engine API

目标：

- 让 engine API 与模块边界完全对齐

完成标准：

- `engine.read.filter/sort/group/search/query.get(viewId)` 全部存在
- `engine.view(viewId).filter/sort/group/search.*` 写 API 全统一
- 不再存在旧命名、重叠命名、别名命名

### Phase 8: UI 全量收口与删旧

目标：

- UI 彻底依赖 projection，删掉所有二次推导和历史 helper

完成标准：

- QueryBar / Settings / Popover / Summary 都只读 projection
- 不再有 `meta.filter` 这类 query 规则中介层
- 不再有旧 helper export
- 不再有兼容分支


## 9. 实施顺序建议

如果目标是“把所有东西做完”，推荐顺序是：

1. `filter`
2. `group`
3. `sort`
4. `search`
5. `query`
6. `engine`
7. `ui`
8. 删旧

原因：

- `filter` 已经是最复杂、最容易反复回流的部分，应先定型
- `group` 的跨层耦合最重，应该尽早切清
- `sort` 简单，适合在 `group` 之后快速独立
- `search` 复杂度最低，放后面风险最小
- `query` 应该最后收口成 orchestrator
- engine 和 UI 必须在各子系统边界稳定后统一


## 10. 完成态定义

最终完成态应满足下面这些条件：

### 10.1 模块边界

- `field` 不依赖 `filter / sort / group / search`
- `filter / sort / group / search` 可以依赖 `field`
- `query` 只依赖它们，不定义它们的内部规则

### 10.2 状态与 projection

- raw state 只保留最小 canonical form
- projection 负责 UI 需要的一切派生信息
- UI 不再从 raw state 做规则推导

### 10.3 Engine

- read/write API 与模块边界完全同构
- 命名短、直、稳定

### 10.4 删除旧系统

- 没有兼容层
- 没有旧 helper re-export
- 没有重复 spec
- 没有“临时桥接层”


## 11. 结论

长期最优里：

- `filter` 不应该放到 `core/field` 下面
- `field` 应继续瘦身，只保留字段本体语义
- `group` 最值得继续独立拆清
- `sort` 应独立，但保持轻量
- `search` 先保持轻模块，必要时再增强
- `query` 只做组合，不做规则中心

最重要的一句是：

**字段层提供能力，查询层组织能力，projection 层提供结果，UI 层只消费结果。**

这条边界如果长期保持稳定，Dataview 的中轴复杂度会明显下降，而且后续无论继续重写 filter、group 还是 search，都不会再把 `field` 或 `query` 重新堆成巨石模块。
