# Dataview Filter 体系长期最优重构方案

## 文档目标

这份文档不再只讨论 [`FilterRulePopover.tsx`](/Users/realrong/Rostack/dataview/src/react/page/features/filter/FilterRulePopover.tsx)。

目标是直接给出 **整个 filter 体系** 的长期最优方案，并明确以下前提：

- 不兼容旧体系
- 不以渐进迁移为优先
- 可读性优先
- 中轴复杂度最低优先
- UI 只是 filter 体系的一个消费者，不再反向定义 filter 语义

一句话概括：

**Filter 的长期最优形态，不是继续修 UI，也不是继续在 `core/field` 上打补丁，而是把整个 filter system 重写成“canonical query state + filter spec + filter projection + thin UI”四层结构。**

## 当前体系的根本问题

当前 filter 体系的问题，不是某一个 bug，也不是某一个组件写得不好，而是整体边界已经错位。

### 1. filter 语义分散在三层

现在 filter 语义分别散落在：

- `core/field`
- `meta/filter`
- `FilterRulePopover`

三层都在做自己的推导：

- preset 匹配
- editor 类型选择
- summary 文案拼接
- 是否 effective
- title/status 的特殊处理

这意味着没有单一语义源。

### 2. `field kind spec` 承担了过多职责

[`dataview/src/core/field/kind/spec.ts`](/Users/realrong/Rostack/dataview/src/core/field/kind/spec.ts) 当前同时承担：

- field create/convert
- field options capability
- filter ops / presets
- group modes / sorts / defaults

这导致 filter 只是 field spec 的一部分附属信息，而不是一个独立且完整的系统。

### 3. title 不在统一 filter 体系内

title 目前通过 `core/field/index.ts` wrapper 特判来接入 filter 能力。

这意味着：

- custom field 走一套语义
- title 走另一套桥接语义

长期这是错误边界。

### 4. status filter 被建模过重

status 当前有独立的 filter value 类型：

- `StatusFilterTarget`
- `StatusFilterValue`
- `category` / `option` 混合持久化

这让 status filter 成为独立小系统，而不是整个 filter 体系中的一个普通成员。

### 5. UI 反向定义了 filter 语义

比如：

- 哪个 condition 当前选中
- 某个 rule 是否有效
- 当前应该渲染什么 editor

这些本应来自 projection，却在 UI 里被局部判断。

这会持续制造“看起来选不上”“显示和实际 rule 不一致”这类问题。

## 最终目标

长期最优方案的目标非常明确：

### 一. canonical filter state 只表达 query 语义

它不带 UI 状态，不带 draft，不带 category shortcut，不带文案，不带 editor 投影。

### 二. filter spec 成为唯一语义源

它负责定义：

- 字段支持哪些 filter preset
- preset 如何匹配当前 rule
- preset 切换如何更新 canonical rule
- 这个 rule 对应什么 editor kind
- 这个 rule 如何判断 effective
- 这个 rule 如何生成 summary text

### 三. projection 负责把 canonical query state 变成 UI 可读结果

projection 是纯派生，不持有状态，不做交互控制。

### 四. UI 退回成薄壳

UI 只做：

- 展示 projection
- 收集交互
- 把交互翻译成新的 canonical rule

## 最终架构

长期最优架构建议收成四层：

### 1. Canonical Query State

位置：

- `view.filter`

职责：

- 只表达过滤规则本身
- 不表达 UI 细节

### 2. Filter Spec

位置：

- `dataview/src/core/filter/spec.ts`
- `dataview/src/core/filter/presets.ts`
- `dataview/src/core/filter/types.ts`

职责：

- 定义 filter 语义

### 3. Filter Projection

位置：

- `dataview/src/core/filter/projection.ts`
- `dataview/src/core/filter/present.ts`

职责：

- 从 canonical state 派生 UI 需要的只读结果

### 4. UI

位置：

- `dataview/src/react/page/features/filter/*`

职责：

- 只消费 projection
- 不再自己发明 filter 语义

## Canonical State 应该长什么样

如果不考虑兼容旧体系，我建议 filter canonical state 维持简单，而不是继续增长特殊 case。

### 推荐继续保留“view.filter = mode + rules”

也就是仍然是：

```ts
interface Filter {
  mode: 'and' | 'or'
  rules: FilterRule[]
}
```

但 `FilterRule` 要重定义，明确成 **统一的 canonical query rule**。

### 推荐的 canonical `FilterRule`

```ts
interface FilterRule {
  fieldId: FieldId
  presetId: string
  value?: FilterValue
}
```

关键变化：

- 不再把 `op` 直接当成唯一 condition 身份
- 用 `presetId` 作为 canonical condition 标识
- `operator` 变成 preset 的属性，而不是 rule 的顶层字段

这样更清晰，因为在真实产品里：

- `exists_true`
- `exists_false`
- `checked`
- `unchecked`

都不是简单 `operator` 的概念，而是“一个完整 condition preset”。

如果继续只存 `op`，最后还会持续在 value 上打补丁。

### 推荐的 canonical `FilterValue`

`FilterValue` 不要再为每种 field kind 发明一个独立结构。

推荐统一成少数几种基础形态：

```ts
type FilterValue =
  | string
  | number
  | boolean
  | DateValue
  | {
      kind: 'option-set'
      optionIds: string[]
    }
```

注意：

- `status` 用 `option-set`
- `select` 也可以用 `option-set`
- `multiSelect` 也可以用 `option-set`

统一的是 filter value 形态，不是记录字段值形态。

### 为什么 `presetId` 比 `operator` 更好

因为它能显式表达这些差异：

- `eq`
- `neq`
- `contains`
- `exists_true`
- `exists_false`
- `checked`
- `unchecked`

而不需要依赖：

- `operator`
- `value`
- `hidesValue`

去间接拼出一个真正的 condition。

从可读性和中轴复杂度上看，`presetId` 更干净。

## Filter Spec 应该是什么

### 核心判断

filter spec 才是整个系统的中轴。

它不应该再附着在 `field/kind/spec.ts` 上作为一个子属性，而应该成为独立模块。

### 推荐的 `FilterPreset`

```ts
interface FilterPreset {
  id: string
  operator: FilterOperator
  valueMode: 'none' | 'fixed' | 'editable'
  fixedValue?: FilterValue
}
```

这里：

- `id` 是 canonical condition identity
- `operator` 是底层比较语义
- `valueMode` 决定 value 生命周期
- `fixedValue` 只在 `valueMode = 'fixed'` 时出现

### 推荐的 `FilterEditorKind`

```ts
type FilterEditorKind =
  | 'none'
  | 'text'
  | 'number'
  | 'date'
  | 'option-set'
```

这里故意保持很瘦。

它只回答：

- 用哪类 editor

它不回答：

- groups 长什么样
- option label 是什么
- section label 是什么

这些都留给 projection/editor 从 field schema 推导。

### 推荐的 `FilterSpec`

```ts
interface FilterSpec {
  presets: readonly FilterPreset[]
  getDefaultRule: (field: Field) => FilterRule
  getActivePreset: (field: Field | undefined, rule: FilterRule) => FilterPreset
  applyPreset: (field: Field | undefined, rule: FilterRule, presetId: string) => FilterRule
  getEditorKind: (field: Field | undefined, rule: FilterRule) => FilterEditorKind
  isEffective: (field: Field | undefined, rule: FilterRule) => boolean
  match: (field: Field | undefined, recordValue: unknown, rule: FilterRule) => boolean
  formatValueText: (field: Field | undefined, rule: FilterRule) => string
}
```

这已经足够。

最重要的是：

- `getActivePreset`
- `applyPreset`
- `getEditorKind`
- `isEffective`
- `match`

必须来自同一个地方。

## Field 和 Filter 的关系应该怎么重构

### 不再让 `field kind spec` 直接承担 filter spec

长期建议把现有：

- create/convert
- grouping
- filtering

这三类职责拆开。

也就是说，field kind 只告诉 filter system：

- 我是什么 field kind
- 我有哪些 schema 信息

而 filter system 自己维护：

- 这个 field kind 对应哪套 filter spec

### 推荐映射方式

```ts
const filterSpecsByFieldKind = {
  title: textFilterSpec,
  text: textFilterSpec,
  url: textFilterSpec,
  email: textFilterSpec,
  phone: textFilterSpec,
  number: numberFilterSpec,
  date: dateFilterSpec,
  select: optionFilterSpec,
  multiSelect: optionSetFilterSpec,
  status: groupedOptionSetFilterSpec,
  boolean: booleanFilterSpec,
  asset: presenceFilterSpec
}
```

注意这里：

- title 是正式成员
- 不再通过 wrapper 特判临时桥接

## status 的长期最优处理

### 结论

status 不需要保留当前这种独立 filter value 体系。

它本质上只是：

- 记录值是单个 option id
- filter editor 是一个“按 category 分组展示的 option set 选择器”

### canonical value

status canonical value 应该是：

```ts
{
  kind: 'option-set',
  optionIds: string[]
}
```

### category 的定位

category 只是一种 UI shortcut，不进入 canonical state。

它的行为应该是：

- 勾选 category = 把该分类下所有 optionIds 写入 value
- 取消 category = 从 value 中移除该分类下所有 optionIds
- category 的选中态 = 由该分类下 optionIds 是否全选推导

### 为什么这是最优解

因为它做到：

- status 不再单独发明一套 filter value model
- query 语义更简单
- projection 更简单
- editor 逻辑也更简单

唯一放弃的是：

- “category 作为持久化语义对象”的能力

但从 dataview 当前产品复杂度看，这个能力不值得保留。

## Projection 应该怎么定义

### 核心判断

filter 需要 projection，不需要所谓 “model”。

如果某个结果是从：

- `field`
- `rule`
- `schema`
- `filter spec`

纯推导出来的，它就是 projection。

### 推荐的 `FilterRuleProjection`

```ts
interface FilterRuleProjection {
  fieldId: FieldId
  fieldLabel: string
  activePresetId: string
  effective: boolean
  editorKind: FilterEditorKind
  summaryText: string
  bodyLayout: 'none' | 'inset' | 'flush'
  conditions: readonly {
    id: string
    label: string
    selected: boolean
  }[]
}
```

这层应该一次性给出：

- 当前 active preset
- 当前 rule 是否 effective
- 当前 editor kind
- 当前 summary text
- 当前 condition 列表
- 当前 body layout

### 这不是现有 `engine.viewProjection`

当前 `engine.viewProjection` 是主视图 projection：

- appearances
- sections
- fields
- layout

filter 这里需要的是独立的 query/filter projection。

所以长期更合理的边界是：

- 不把 filter UI projection 硬塞进现有 `viewProjection`
- 单独建立 `core/filter/projection.ts`

## UI 应该怎么收

### `FilterRulePopover`

最终只负责：

- 展示 projection
- 展示 condition menu
- 展示 editor host
- remove / open / close
- 把交互翻译成新的 canonical rule

不再负责：

- 匹配 preset
- 算 effective
- 算 active
- 选 editor kind
- 拼 summary

### `FilterValueEditor`

只负责根据 `editorKind` 分发 editor。

### `GroupedOptionEditor`

只负责：

- 从 `field` 读取 options
- 对 `status` 按 category 分组
- 处理 option/category 的 UI 勾选交互

它不负责：

- 定义 canonical value 语义
- 决定 preset
- 决定 effective

## Engine / Query API 应该怎么收

长期最优方案里，engine 和 query 层也要配合简化。

### 核心判断

长期最优情况下，engine 层不应该让 UI 继续手拼 `FilterRule`。

也就是说，UI 不应该自己负责：

- 猜默认 preset
- 手动改 `presetId`
- 手动决定切 preset 时 value 怎么迁移
- 手动拼 canonical value shape

这些都应该通过 engine API 走统一路径。

### Engine API 设计原则

命名原则只有三条：

1. 短
2. 语义单一
3. 不让 UI 组合底层细节

所以 engine 层不应该暴露一堆 patch 风格 API，而应该暴露少数稳定动作。

### 推荐的 engine 写 API

推荐保留在：

```ts
engine.view(viewId).filter
```

下面，最终形态建议是：

```ts
engine.view(viewId).filter = {
  add(fieldId): number | undefined
  set(index, rule): void
  preset(index, presetId): void
  value(index, value): void
  remove(index): void
  clear(): void
  mode(value): void
}
```

### 每个 API 的语义

#### `add(fieldId)`

语义：

- 按该 field 的 filter spec 创建默认 rule
- 追加到当前 view.filter.rules
- 返回新 rule 的 index

原因：

- UI 不应该知道默认 preset 是什么
- 这必须由 spec 决定

#### `set(index, rule)`

语义：

- 直接替换 canonical rule

用途：

- 作为最底层 escape hatch

它应该保留，但不应该成为 UI 主路径。

#### `preset(index, presetId)`

语义：

- 对第 `index` 条 rule 应用 preset 切换
- 由 spec 决定：
  - `valueMode = 'none'`
  - `valueMode = 'fixed'`
  - `valueMode = 'editable'`
- 自动生成新的 canonical rule

原因：

- 这是最常见的 condition 切换动作
- 不应该让 UI 自己拼

#### `value(index, value)`

语义：

- 设置第 `index` 条 rule 的 canonical value

原因：

- editor 只负责给出新的 canonical value
- 不负责改 preset

#### `remove(index)`

语义：

- 删除指定 rule

#### `clear()`

语义：

- 清空全部 rules

#### `mode(value)`

语义：

- 设置 filter mode
- `value` 为 `'and' | 'or'`

命名上我更倾向于直接 `mode(value)`，而不是 `mode.set(value)`。

原因：

- 这是单一动作
- 更短
- 和其他 query 动作放一起更统一

### 为什么不推荐更多 API

例如不推荐：

- `patch(index, patch)`
- `toggle(...)`
- `setPresetAndValue(...)`
- `replaceValue(...)`

原因是这些 API 都会把 spec 语义泄漏到 UI。

长期最优应该是：

- `preset(...)` 负责 condition 语义切换
- `value(...)` 负责 canonical value 更新

这两个动作已经足够覆盖主流程。

### 推荐的 engine 读 API

canonical query 读取不需要单独新开一套，只要保留：

```ts
engine.read.view.get(viewId)
```

就能拿到原始 canonical filter state。

但是 projection 读取应该有独立入口。

推荐新增：

```ts
engine.read.filter.get(viewId)
```

返回：

```ts
interface ViewFilterProjection {
  mode: 'and' | 'or'
  rules: readonly FilterRuleProjection[]
}
```

理由：

- filter UI 关心的是 rule projection 列表
- 不是 `viewProjection` 里的 appearances/sections
- 单独读口更清晰

### 为什么是 `read.filter`

我不推荐叫：

- `filterProjection`
- `filterModel`
- `filterMeta`
- `filterUi`

原因：

- `read` 语境下本来就是读模型
- `filter` 对 UI 使用者最直观
- 写侧已经是 `engine.view(viewId).filter.*`
- 读侧用 `engine.read.filter.get(viewId)` 最对称

这里虽然本质上是 projection，但不需要把 `projection` 写进 API 名字里。

### 读侧边界必须明确

这里必须明确区分两件事：

#### canonical state

```ts
engine.read.view.get(viewId)?.filter
```

#### derived read model

```ts
engine.read.filter.get(viewId)
```

也就是说：

- `read.view.get(viewId)?.filter` 是原始 query state
- `read.filter.get(viewId)` 是 filter read model / projection

两者不能返回同一种东西。

### 推荐的最终 engine 类型

如果把它写成长期接口，大致会是：

```ts
interface ViewFilterApi {
  add(fieldId: FieldId): number | undefined
  set(index: number, rule: FilterRule): void
  preset(index: number, presetId: string): void
  value(index: number, value: FilterValue | undefined): void
  remove(index: number): void
  clear(): void
  mode(value: 'and' | 'or'): void
}

interface EngineReadApi {
  view: KeyedReadStore<ViewId, View | undefined>
  filter: KeyedReadStore<ViewId, ViewFilterProjection | undefined>
}
```

### UI 应该如何使用这些 API

长期最优主路径应该变成：

#### 新增 filter

```ts
const index = engine.view(viewId).filter.add(fieldId)
```

#### 切 condition

```ts
engine.view(viewId).filter.preset(index, presetId)
```

#### 改值

```ts
engine.view(viewId).filter.value(index, nextValue)
```

#### 删 rule

```ts
engine.view(viewId).filter.remove(index)
```

#### 读取 UI projection

```ts
const projection = engine.read.filter.get(viewId)
```

这样 UI 就完全不用再自己理解 canonical rule shape 的细节。

### 创建默认 rule

不要再让 UI 通过猜测默认 op/value 创建 rule。

应该统一从 spec 出：

```ts
createDefaultFilterRule(field): FilterRule
```

### 切 preset

不要再让 UI 手动拼 rule。

应该统一从 spec 出：

```ts
applyFilterPreset(field, rule, presetId): FilterRule
```

### 更新 value

UI editor 改 value 时，也应该通过同一条 canonical update path：

```ts
setFilterRuleValue(rule, nextValue): FilterRule
```

这样可以避免每个 editor 自己拼 shape。

## 需要直接删除的旧设计

如果明确不兼容旧体系，建议直接删除这些边界。

### 1. 删除 `meta/filter.ts`

理由：

- 不该由 meta 层承担 filter 语义

meta 只适合承载纯文案资源，不适合再承担 preset/editor/summary 推导。

### 2. 删除 `core/field/index.ts` 里的 title filter wrapper 特判

理由：

- title 应该成为正式 filter kind 成员
- 不该继续靠 wrapper 重复桥接

### 3. 删除 status 的独立 filter value 体系

包括：

- `StatusFilterTarget`
- `StatusFilterValue`
- `category` 进入 canonical state 的设计

### 4. 删除 `FilterRulePopover` 里的本地 filter 语义推导

包括：

- draft parse/format 之外的 condition/editor/effective/summary 推导

更进一步说，如果 editor 自己能处理 draft，连 draft parse/format 也不该留在 popover 外壳。

### 5. 删除 `field kind spec` 对 filter 的附属式定义

长期上应该让 filter spec 独立存在，而不是继续作为 `field kind spec.filter` 的子对象。

## 推荐目录结构

长期推荐结构：

- `dataview/src/core/filter/types.ts`
- `dataview/src/core/filter/presets.ts`
- `dataview/src/core/filter/spec.ts`
- `dataview/src/core/filter/match.ts`
- `dataview/src/core/filter/projection.ts`
- `dataview/src/core/filter/present.ts`
- `dataview/src/react/page/features/filter/FilterRulePopover.tsx`
- `dataview/src/react/page/features/filter/FilterValueEditor.tsx`
- `dataview/src/react/page/features/filter/editors/TextEditor.tsx`
- `dataview/src/react/page/features/filter/editors/NumberEditor.tsx`
- `dataview/src/react/page/features/filter/editors/DateEditor.tsx`
- `dataview/src/react/page/features/filter/editors/OptionSetEditor.tsx`
- `dataview/src/react/page/features/filter/editors/GroupedOptionEditor.tsx`

## 实施原则

### 原则一：canonical state 只保存 query 语义

不保存：

- draft
- category shortcut
- label
- section UI 结构

### 原则二：preset 是 condition identity，不是 operator 的附庸

也就是说 canonical rule 的 condition identity 应该是 `presetId`，不是 `op`。

### 原则三：spec 是唯一语义源

不能再让：

- core 一套
- meta 一套
- UI 一套

### 原则四：projection 一次性给出 active/effective/editor/summary

组件不再零散判断。

### 原则五：editor 只消费 schema，不定义 query 语义

editor 可以根据 field schema 推导：

- option labels
- status groups
- grouped rendering

但不能再反过来决定 canonical rule 语义。

## 推荐实施顺序

### 第一步

定义新的 canonical `FilterRule` / `FilterValue` / `FilterPreset`。

### 第二步

把现有 `createFilterPreset(...)` 升级成新的 filter preset 定义系统，并从 `field/kind/spec.ts` 独立出来。

### 第三步

建立新的 filter spec registry，把 title 纳入统一体系。

### 第四步

重写 `match / effective / applyPreset / createDefaultRule`。

### 第五步

重写 `filter projection`，让 active/effective/editor/summary 全部从 projection 出。

### 第六步

重写 `FilterRulePopover` 和 editors，让 UI 只消费 projection。

### 第七步

删除旧体系：

- `meta/filter.ts`
- title wrapper filter bridge
- status 独立 filter value 体系
- UI 侧零散 filter 语义推导

## 最终结论

整个 filter 体系长期最优的方案不是继续修补当前 UI，而是：

1. 把 canonical filter state 重定义为简单、稳定的 query IR
2. 把 `preset` 升级成真正的 condition identity
3. 把 filter spec 从 field kind spec 中独立出来
4. 把 title/status/select/multiSelect 全部纳入同一个 filter 系统
5. 用 projection 而不是 UI 组件来给出 active/effective/editor/summary
6. 让 UI 退回成薄壳

用一句话概括：

**“长期最优的 filter 体系，应当是：canonical query state 极简，filter spec 单一，projection 纯派生，UI 只消费结果。”**
