# Dataview API Namespace Optimization Plan

## 目标

这份文档回答四个问题:

1. `dataview/packages` 全局到底有多少 `resolve/get/read/derive` 这一类 helper 风格导出
2. 这些函数是否适合统一做成 `read = {}`、`get = {}` 这种模块化
3. 除了 helper 前缀，还有哪些 API 更适合按语义分组、合并与复用
4. 如果要整体收敛，最低复杂度、长期最稳的落地方式是什么

本文不改代码，只给重构方案。

## 盘点结果

这次统计的是 `dataview/packages` 下 `.ts/.tsx` 文件中的 `export const|function` 导出，并按前缀做粗分类。

### 1. 前缀分布

- `get`: 67 个导出，分布在 23 个文件
- `resolve`: 33 个导出，分布在 23 个文件
- `read`: 26 个导出，分布在 14 个文件
- `derive`: 6 个导出，分布在 6 个文件

### 2. 主要集中目录

- `get` 主要集中在 `dataview-core/src`
- `resolve` 主要集中在 `dataview-core/src` 与 `dataview-react/src`
- `read` 主要集中在 `dataview-core/src` 与 `dataview-react/src`
- `derive` 主要集中在 `dataview-engine/src`

### 3. 前缀最密集的文件

- `dataview-core/src/field/kind/date.ts`: 13 个
- `dataview-core/src/field/index.ts`: 8 个
- `dataview-core/src/filter/spec.ts`: 8 个
- `dataview-core/src/document/fields.ts`: 7 个
- `dataview-core/src/field/kind/status.ts`: 7 个
- `dataview-core/src/document/views.ts`: 6 个
- `dataview-runtime/src/model/queryFields.ts`: 5 个

### 4. `helpers` 文件/目录现状

当前 `dataview/packages` 下没有实际命名为 `helpers` / `helper` 的目录或文件。

这说明当前问题不是“helper 文件太多”，而是:

- 大量 API 靠前缀表达职责
- 但缺少稳定的语义 namespace
- 导致 barrel 平铺越来越宽
- 同一域的 API 虽然名字相似，但没有形成统一入口

### 5. 已经存在的好例子

当前仓库里已经有几类比较成功的模块化入口:

- `group`
- `filter`
- `search`
- `sort`
- `kinds`

它们的共同特点是:

- 根节点是语义名词，不是泛化动词
- 内部聚合的是同一领域的一组操作
- 调用方读起来更像“访问一个领域能力”，而不是“记住很多平铺函数名”

这类模式应该继续扩大，而不是继续增加新的平铺 helper。

## 结论

### 1. 不建议做全局 `read = {}` / `get = {}` / `resolve = {}` 大对象

不建议把整个 repo 收成这种形态:

```ts
export const read = {
  field: ...,
  view: ...,
  record: ...,
  date: ...,
  filter: ...
}
```

原因:

- 动词不是稳定 owner，领域才是稳定 owner
- `read.field.xxx`、`read.view.xxx`、`read.date.xxx` 很快会膨胀成全局杂物箱
- `get/read/resolve` 的语义边界本来就不完全重合，硬塞到同一个顶层会继续模糊
- 这种结构会把“按语义拆分”重新退化成“按语法前缀分桶”

### 2. 建议做“名词优先”的模块化，而不是“动词优先”的模块化

更好的方向是:

- `document.fields.get`
- `document.views.activeId.resolve`
- `field.group.entries`
- `field.option.spec`
- `filter.rule.planDemand`
- `calculation.metric.supports`
- `query.fields.available.sort`

也就是:

- 顶层按领域名词分
- 第二层按子域或职责分
- 动词只放在局部，不做全局根节点

### 3. `derive` 是例外，不应被统一收成 helper namespace

`derive` 在当前仓库里数量不多，但语义很重:

- `deriveIndex`
- `deriveViewSnapshot`
- `deriveViewRuntime`
- `deriveSummaryState`

它们本质不是普通 helper，而是阶段入口、聚合计算、状态导出。

因此:

- 不建议把它们塞进 `derive = {}`
- 更适合保留为阶段入口
- 或者放进阶段模块，例如 `snapshot.derive`, `runtime.derive`, `index.derive`

换句话说:

- `read/get/resolve` 常常是值级 helper
- `derive` 更像 pipeline stage API

## 命名判定规则

后续要做统一收敛，建议先定词义边界。

### 1. `read`

只用于:

- 从已有对象/值中做纯读取
- 无外部查找
- 无复杂 fallback 选择
- 无策略判断

典型例子:

- `readDateValue`
- `readDatePrimaryString`
- `readQueryOrder`
- `readQueryVisibleSet`

### 2. `get`

只用于:

- registry / table / collection lookup
- 稳定配置或单例读取
- “给我这个域里的某个已知实体”

典型例子:

- `getFieldSpec`
- `getCalculationMetricSpec`
- `getDocumentViewById`
- `getDocumentFieldById`

补充约定:

- 函数 API 统一优先用 `get`
- `byId` 更适合保留给内部索引或缓存字段名，例如 `cache.byId`
- 只有同一组 lookup 同时存在 `byId/byName/byKey` 这类多维入口时，函数名里才保留 `byId`
- 进入 `fields/views/records` 这类 collection 之后，`id` 已经是默认 lookup 维度，函数再叫 `byId` 通常是重复表达

### 3. `resolve`

只用于:

- 有 fallback
- 有默认值
- 有选择策略
- 有派生但仍是局部值级结果

典型例子:

- `resolveActiveViewId`
- `resolveFieldGroupBucketEntries`
- `resolveAutoPanDelta`
- `resolveTableWindowSnapshot`

### 4. `derive`

只用于:

- 聚合状态构建
- 阶段级计算
- 输入通常是 `previous + input + context`

典型例子:

- `deriveIndex`
- `deriveViewSnapshot`
- `deriveSummaryState`

### 5. 不要混用

几个明显该纠正的方向:

- `getAvailableFilterFields` 更像 `resolve`，不是 `get`
- `getAvailableSorterFields` 更像 `resolve`
- `getRecordFieldValue` 更像 `read`
- `getFieldDisplayValue` 更像 `read` 或 `display`
- `getFieldSearchTokens` 更像 `search.tokens`

## 最适合先模块化的领域

### A. `document`

这是最适合一口气模块化的域。

当前问题:

- `getDocumentCustomFieldById`
- `getDocumentFieldById`
- `getDocumentFieldIds`
- `getDocumentFields`
- `getDocumentViewById`
- `getDocumentActiveViewId`
- `resolveDocumentActiveViewId`

这些都在同一个名词域里，但靠长函数名区分层级。

建议目标:

```ts
document.fields.list(document)
document.fields.ids(document)
document.fields.get(document, fieldId)
document.fields.has(document, fieldId)
document.fields.put(document, field)
document.fields.patch(document, fieldId, patch)
document.fields.remove(document, fieldId)

document.views.list(document)
document.views.ids(document)
document.views.get(document, viewId)
document.views.has(document, viewId)
document.views.activeId.resolve(document, preferredViewId)
document.views.activeId.get(document)
document.views.active.get(document)
document.views.activeId.set(document, viewId)
```

这里的收益最大:

- 命名大幅缩短
- 语义更聚合
- 与当前 `document/fields.ts`, `document/views.ts`, `document/records.ts` 文件边界高度一致

### B. `field`

`field/index.ts` 当前已经明显过宽，混了多种子域:

- identity
- value
- compare
- search
- group
- display
- draft
- behavior
- spec

建议不要继续在根层平铺:

- `getFieldGroupMeta`
- `resolveFieldGroupBucketEntries`
- `getFieldDisplayValue`
- `getFieldSearchTokens`
- `getRecordFieldValue`

建议目标:

```ts
field.id.isTitle(fieldId)
field.kind.isTitle(field)
field.kind.isCustom(field)

field.value.read(record, fieldId)
field.display.value(field, value)
field.search.tokens(field, value)
field.compare.value(field, left, right)
field.compare.sort(field, left, right, direction)

field.group.meta(field, group)
field.group.entries(field, value, group)
field.group.domain(field, group)

field.draft.parse(field, draft)
field.behavior.value(input)
field.behavior.primaryAction(input)

field.spec.get(field)
field.option.spec.get(field)
```

关键点:

- `field` 适合按子域拆
- 不适合继续靠 `getField* / resolveField* / readField*` 平铺

### C. `filter`

`filter/spec.ts` 现在已经开始承载多种 rule 语义:

- editor
- effective
- match
- project value
- plan demand
- candidate lookup
- create default

这已经不是单一 helper 文件，而是一个完整 rule 语义域。

建议目标:

```ts
filter.rule.spec(field)
filter.rule.presetIds(field)
filter.rule.editorKind(field, rule)
filter.rule.effective(field, rule)
filter.rule.match(field, value, rule)
filter.rule.project(field, rule)
filter.rule.planDemand(field, rule)
filter.rule.bucketLookup(field, rule)
filter.rule.sortLookup(field, rule)
filter.rule.defaultValue(field, rule)

filter.value.optionSet.create(optionIds)
filter.value.optionSet.read(value)
```

当前已经有 `filter = { ... }` 的 state 入口，这是好基础。下一步应该继续把 `spec` 侧也 namespace 化，而不是继续增加 `getFilterXxx`。

### D. `calculation`

这次重构后，`calculation` 已经天然分成两个子域:

- `metric`
- `reducer`

建议目标:

```ts
calculation.metric.get(metric)
calculation.metric.supports(field, metric)
calculation.metric.forField(field)
calculation.metric.compute(field, metric, state)

calculation.reducer.empty(capabilities)
calculation.reducer.entry.create(input)
calculation.reducer.entry.same(left, right)
calculation.reducer.state.build(input)
calculation.reducer.state.builder(input)
calculation.reducer.demand.normalize(demands)
```

这里不一定要求做三层深嵌套，但至少不应继续平铺 `getFieldCalculationMetrics / createCalculationDemand / buildFieldReducerState / createFieldReducerBuilder`。

### E. `queryFields`

`dataview-runtime/src/model/queryFields.ts` 是非常典型的“已成组但未 namespace 化”文件:

- `getFilterFieldId`
- `getSorterFieldId`
- `getAvailableFilterFields`
- `getAvailableSorterFields`
- `getAvailableSorterFieldsForIndex`
- `findSorterField`

建议目标:

```ts
query.fields.filterId(rule)
query.fields.sorterId(sorter)
query.fields.available.filter(fields, rules)
query.fields.available.sort(fields, sorters)
query.fields.available.sortAt(fields, sorters, index)
query.fields.find.sorter(fields, sorter)
```

这类文件应该优先收，因为:

- 域单一
- 函数同构
- 命名重复度高

### F. `date`

`field/kind/date.ts` 是仓库里最明显的单文件 API 过宽例子之一。

当前把这些都平铺在一起:

- config
- parse
- normalize
- compare
- group
- display
- search
- default policy
- value read

建议目标:

```ts
date.config.default()
date.config.get(field)

date.value.read(value)
date.value.kind(value)
date.value.primaryString(value)
date.value.primaryParts(value)
date.value.timestamp(value)

date.group.key(value)
date.group.start(value, mode)
date.group.value(field, start, currentValue)

date.search.tokens(field, value)
date.default.valueKind(field)
date.default.timezone(field)
date.timezone.available()
date.timezone.label(timeZone)
```

这个域非常适合做 namespace，因为:

- 所有函数都围绕 `date`
- 前缀差异主要是历史命名，不是语义 owner 差异

## 哪些不适合模块化

### 1. pipeline stage 入口

例如:

- `deriveIndex`
- `deriveViewSnapshot`
- `deriveViewRuntime`
- `compileViewPlan`

这些函数不应该被当成 helper 统一塞进 namespace；它们是主流程入口。

### 2. 小文件里只有 1 到 3 个函数的局部工具

尤其是 react 侧很多 feature 文件:

- 单文件只有一个 `resolveXxx`
- 或一个 `readXxxSummary`

如果强行 namespace 化，只会增加调用层级，不会降低复杂度。

### 3. 跨域聚合的“万能工具箱”

例如:

- `helpers.ts`
- `read.ts`
- `utils.ts` 顶层大桶

这些都不应该新增。

## 现存 API 哪些最值得简化

### 1. 去掉重复域名

如果已经进入某个域模块，就不要继续把域名写在函数名里。

例如:

- `getDocumentFieldById` -> `document.fields.get`
- `getDocumentFieldIds` -> `document.fields.ids`
- `getDocumentViews` -> `document.views.list`
- `getFilterPlanDemand` -> `filter.rule.planDemand`
- `getFilterEditorKind` -> `filter.rule.editorKind`
- `getFieldGroupMeta` -> `field.group.meta`

### 2. 把“可用列表”从 `get` 改成 `available/resolve`

例如:

- `getAvailableFilterFields`
- `getAvailableSorterFields`
- `getAvailableSorterFieldsForIndex`

这些不是简单读取，更像“基于当前上下文推导可选项”，应该改成:

- `query.fields.available.filter`
- `query.fields.available.sort`
- `query.fields.available.sortAt`

### 3. 把值读取和 lookup 分开

例如:

- `getRecordFieldValue` 实际是 read
- `getFieldDisplayValue` 实际是 display
- `getFieldSearchTokens` 实际是 search

这类 API 的问题不只是名字长，而是 owner 不清楚。

### 4. 把同一实体的 `ids/get/has/list/put/remove` 合并成一个 collection API

这类模式在 document 层特别明显。

建议统一形态:

```ts
entity.ids(...)
entity.get(...)
entity.has(...)
entity.list(...)
entity.put(...)
entity.patch(...)
entity.remove(...)
```

这里的 `byId` 可以继续作为内部存储字段存在，例如:

```ts
state.byId
cache.byId
records.byId
```

也就是:

- 对外函数名收敛到 `get`
- 对内索引结构保留 `byId`

## 推荐的总设计原则

### 1. 名词优先，动词次之

优先:

- `document.views.get`
- `field.group.entries`
- `filter.rule.match`

不优先:

- `get.view.get`
- `read.field.group.entries`

### 2. 先按领域拆，再按职责拆

正确顺序:

- `field.group`
- `field.option`
- `field.spec`

而不是:

- `read.field`
- `resolve.field`
- `get.field`

### 3. 只在“同域函数足够多”时再引入 namespace

建议阈值:

- 同文件或同域连续 4 个以上同构函数
- 调用方已经需要靠命名猜语义
- 文件本身已经出现明显的前缀堆叠

### 4. 不要过度嵌套

建议控制在 2 到 3 层。

优先:

- `document.views.get`
- `field.group.entries`
- `filter.rule.match`

谨慎:

- `read.document.views.get`
- `core.document.views.read.get`

## 推荐实施顺序

### Phase 1

先统一命名规则，不改大结构:

- 明确 `read/get/resolve/derive` 的使用边界
- 停止新增新的泛化 helper 前缀平铺 API
- 停止新增 `helpers/utils` 大桶

### Phase 2

先收最稳定、最集中、收益最大的域:

1. `document`
2. `field`
3. `filter`
4. `calculation`

原因:

- 这几块函数最多
- 语义最稳定
- core 是全链路上游，最值得先收

### Phase 3

再收中层桥接域:

1. `query.fields`
2. `date`
3. `status`
4. `option`

### Phase 4

最后处理 engine / react 中的局部命名清理:

- 只收真正形成组的域
- 不做全局 `read/get/resolve` 大对象
- pipeline 入口保持阶段语义

## 最终建议

一句话结论:

- 应该模块化
- 但不应该做全局 `read = {}` 这种按动词分桶
- 最优方案是按领域名词做 namespace，再在模块内部按语义分层

最值得优先收的目标:

- `document.*`
- `field.*`
- `filter.*`
- `calculation.*`
- `query.fields.*`
- `date.*`

最应该避免的方向:

- 新增 `helpers.ts`
- 新增全局 `read/get/resolve` 聚合对象
- 把 pipeline stage 入口也当 helper 塞进去

如果下一步要真正动代码，我建议从 `document` 和 `field` 开始，因为这两块:

- 前缀重复最严重
- API 最平铺
- 收完后会直接降低全仓调用面复杂度
