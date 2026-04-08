# Dataview FilterRulePopover 长期最优简化重构方案

## 结论先行

上一版“runtime + adapter + view model + controller”那种设计，确实过度了。

对 dataview 当前这块 filter UI 来说，长期最优但又足够简单的方案应该是：

- `core` 里只有一套统一的 filter spec
- filter 侧有一套独立的 query/filter projection
- UI 层只保留：
  - `FilterRulePopover`
  - `FilterValueEditor`
  - 少量必要的专用 editor，比如 `GroupedOptionEditor`

也就是说：

**不再让 `core/field`、`meta/filter`、`FilterRulePopover` 三处分别推导 filter 语义，而是把 preset、editor、summary、effective 全收进“filter spec + filter projection”这一条单一链路。**

这就够了，不需要再上更重的架构。

## 当前问题到底是什么

现在的问题不是单纯“组件太长”，而是：

- preset 匹配逻辑分裂
- value editor 选择逻辑分裂
- summary/chip 文案逻辑分裂
- title 和 custom field 走了两套 filter 语义

最终导致：

- status 不能稳定切到 `is not`
- title 不能稳定切到 `is / is not`
- 其他字段也存在同类风险

真正的核心问题只有一个：

**filter rule 缺少单一语义源。**

## 简化后的长期目标

长期目标不是“把 filter 做成一个平台”，而是把它从现在的分裂状态收成一个简单但完整的中轴。

这个中轴只需要回答 5 个问题：

1. 这个字段支持哪些 preset/operator
2. 当前 rule 对应哪个 preset
3. 切换 preset 时 rule 应该怎么变
4. 这个 rule 该用什么 editor
5. 这个 rule 的展示文案和有效性是什么

只要这 5 个问题出自同一个地方，`FilterRulePopover` 就会稳定很多。

## 最简长期设计

### 一. core 只有一套 filter spec

建议新增一个更明确的 filter spec 模块，比如：

- `dataview/src/core/filter/spec.ts`
- `dataview/src/core/filter/types.ts`

核心结构可以很简单：

```ts
interface FilterPreset {
  id: string
  operator: FilterOperator
  valueMode: 'none' | 'fixed' | 'editable'
  fixedValue?: unknown
}

type FilterEditorKind =
  | 'none'
  | 'text'
  | 'number'
  | 'date'
  | 'option-set'

interface FilterSpec {
  presets: readonly FilterPreset[]
  getActivePreset: (field: Field | undefined, rule: FilterRule) => FilterPreset
  applyPreset: (field: Field | undefined, rule: FilterRule, presetId: string) => FilterRule
  getEditorKind: (field: Field | undefined, rule: FilterRule) => FilterEditorKind
  formatRuleText: (field: Field | undefined, rule: FilterRule) => string
  isEffective: (field: Field | undefined, rule: FilterRule) => boolean
}
```

这里最关键的是：

- `getActivePreset`
- `applyPreset`
- `getEditorKind`

这三个必须来自同一个 spec。

其中：

- `FilterPreset.valueMode` 显式描述 preset 对 value 的处理方式
- `FilterEditorKind` 只描述 editor 类型，不提前承载完整 UI 数据

这层不要直接放：

- groups
- option labels
- section labels
- 预展开的 editor props

这些都应该由 editor 根据 `field schema` 自己推导。

### 二. title 不再走 wrapper 特判

现在 title 的 filter 逻辑散落在 `core/field/index.ts` 的 wrapper 特判里。

长期最优做法不是继续保留这套桥接，而是直接把 title 当成一个正式 filter kind 处理。

最简单的实现不是新增一个超复杂 `titleRuntime`，而是：

- 在 filter spec 内部显式规定：
  - `title -> text filter spec`

也就是：

- title 的 filter 行为就是 text
- 但这条规则在单一 filter spec 里声明
- 不再靠多个 wrapper API 重复特判

### 三. status 保留特殊 value，但不再特殊散落

status 不需要保留当前这种独立 filter value 模型。

长期最优做法是把 status 视为：

- 单值 option 字段
- 但 filter editor 是一个“分组的 option set 选择器”

也就是说：

- canonical filter value 只保存显式 `optionIds`
- `category` 不再进入持久化 filter model
- 勾选 category 只是 UI 批量操作：
  - 勾 category = 选中该 category 下全部 option ids
  - 取消 category = 移除该 category 下全部 option ids
- category 的选中态由“该组 option 是否全选”推导，而不是单独存储

换句话说：

- status 不再特殊建模
- 它只是 `option-set` editor 的一个分组版本
- 特殊性只体现在 editor 渲染时按 category 分组，而不体现在 canonical value 结构

## Projection 边界

这里最重要的边界修正是：

- filter 需要 projection
- 但不应该先被理解成一个 React model

如果某个结果是从下面这些输入纯推导出来的：

- `field`
- `rule`
- `field schema`
- `filter spec`

那么它本质上就是 projection，而不是 model。

所以更合理的概念应该是：

- `FilterRuleProjection`
- 而不是 `FilterRuleModel`

### 这也不是现有 `engine.viewProjection`

当前引擎里的 [`viewProjection`](/Users/realrong/Rostack/dataview/src/engine/types.ts#L67) 更偏：

- appearances
- sections
- fields
- layout/read projection

它服务的是主视图渲染，不是 query/filter inspector UI。

所以这里不建议把 filter UI 语义硬塞进现有 `engine.viewProjection`。

长期更合理的边界是：

- `view.filter.rules` 是 canonical query state
- `filter rule projection` 是从 canonical query state 派生出来的只读结果
- `FilterRulePopover` 只消费 projection

## Filter Projection

推荐增加一个纯 projection 函数：

```ts
resolveFilterRuleProjection(field, rule): FilterRuleProjection
```

例如：

```ts
interface FilterRuleProjection {
  fieldId: string
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

这里：

- `activePresetId` 由 projection 给出
- `effective` 也由 projection 给出
- `FilterRulePopover` 不再自己计算 active/effective/editor/presentation

## React 层的最简用法

React 层不需要复杂 model。

最理想的情况是组件直接消费纯 projection：

```ts
const projection = resolveFilterRuleProjection(field, rule)
```

如果后面因为 memo、store selector、i18n 注入确实需要 React 包装，也应该只是一个很薄的：

```ts
const projection = useFilterRuleProjection(field, rule)
```

但要明确：

- hook 只是 projection 的 React 包装
- 不是一个有独立语义的 model
- 更不是 controller

可以输出类似：

```ts
interface FilterRuleProjection {
  fieldLabel: string
  activePresetId: string
  effective: boolean
  conditions: readonly {
    id: string
    label: string
    selected: boolean
  }[]
  editorKind: FilterEditorKind
  summaryText: string
  bodyLayout: 'none' | 'inset' | 'flush'
}
```

这就够了。

## UI 层应该怎么收

### 1. `FilterRulePopover` 变薄

[`FilterRulePopover.tsx`](/Users/realrong/Rostack/dataview/src/react/page/features/filter/FilterRulePopover.tsx) 最终应该只负责：

- 渲染 header
- 渲染 condition dropdown
- 渲染 remove button
- 调用 `FilterValueEditor`
- 消费 `FilterRuleProjection`

它不应该继续负责：

- preset 匹配
- effective 计算
- active preset 识别
- value editor 选择
- summary 文案推导
- body layout 推导

它可以负责的只剩：

- 布局
- open/close
- remove
- 把用户交互翻译成新的 `rule`

### 2. 新增 `FilterValueEditor`

value editor 分发统一交给一个 host：

- `none`
- `text`
- `number`
- `date`
- `option-set`

大多数 editor 都可以很轻。

`option-set` editor 自己根据 `field.kind` 决定：

- 是否平铺渲染
- 是否按 status category 分组
- option label 如何读取

### 3. `StatusFilterPicker` 收编为 grouped option editor

当前 [`StatusFilterPicker.tsx`](/Users/realrong/Rostack/dataview/src/react/page/features/filter/StatusFilterPicker.tsx) 的定位太像“独立 filter 系统的特例”。

长期最优做法是把它改造成：

- `FilterValueEditor` 的一个分支
- 一个普通 `GroupedOptionEditor`

它只处理“按 category 分组的 option set 选择 UI”，不再承载独立 status filter value 语义。

## 需要直接删除的旧设计

如果不考虑兼容，我建议直接删除这些旧边界：

### 1. 删掉 `meta/filter.ts`

[`dataview/src/meta/filter.ts`](/Users/realrong/Rostack/dataview/src/meta/filter.ts) 现在承担了：

- condition 文案
- 当前 rule 展示
- editor kind 推导
- chip summary 拼接

它实际上已经侵入了 filter 语义层。

长期最优方案下，这些都应该回到统一 filter spec。

UI 层只应该消费结果，不该靠 meta 再推导一遍语义。

特别是：

- editor kind 不该从 meta 再推导
- option/status 的 groups 和 labels 也不该在 meta 中预展开

### 2. 删掉 `FilterRulePopover` 内部的 draft 解析逻辑

当前本地函数：

- `readFilterDraft`
- `applyFilterDraft`

不应该继续留在 popover 容器内。

更合理的是：

- editor 自己处理 draft
- 或者 spec 提供 parse/format

但无论哪种，都不该属于 popover 外壳。

### 3. 删掉 title filter 的 wrapper 特判复制逻辑

当前 title filter 在 `core/field/index.ts` 里复制了不少 filter 行为。

长期看这是错误边界。

要么 title 是 filter system 的一等成员，要么它不是。

不能继续靠 wrapper 做半套桥接。

## 推荐文件结构

长期最简推荐结构：

- `dataview/src/core/filter/types.ts`
- `dataview/src/core/filter/spec.ts`
- `dataview/src/core/filter/present.ts`
- `dataview/src/core/filter/projection.ts`
- `dataview/src/react/page/features/filter/useFilterRuleProjection.ts`
- `dataview/src/react/page/features/filter/FilterRulePopover.tsx`
- `dataview/src/react/page/features/filter/FilterValueEditor.tsx`
- `dataview/src/react/page/features/filter/editors/GroupedOptionEditor.tsx`

其中：

- `core/filter/spec.ts` 负责 filter 语义
- `core/filter/present.ts` 负责文案和展示文本的纯投影
- `core/filter/projection.ts` 负责生成 `FilterRuleProjection`
- `useFilterRuleProjection.ts` 只是 React 包装，不引入额外业务语义

这已经足够干净，不需要再引入更重的层次。

## 具体原则

### 原则一：preset 匹配只能有一套语义

不能再出现：

- custom field 一套
- title 一套
- UI 再理解一套

### 原则二：editor 选择只能有一个来源

不能再出现：

- `meta.filter.present()` 决定 editor kind
- `FilterRulePopover` 再自己按 field kind 处理 option/status/category

正确边界应该是：

- spec 只给 `editorKind`
- editor 自己从 `field` 读取 options / status categories

### 原则三：summary 文案不能脱离 preset/editor 独立推导

因为 summary 的正确性依赖：

- 当前 preset 是谁
- 当前 value 的展示形式是什么

所以它必须跟 spec 一起产出。

### 原则四：preset 对 value 的处理必须显式建模

不能再靠隐式约定去猜：

- 这个 preset 是否需要 value
- 这个 preset 是否使用固定值
- 切 preset 时当前 value 是否应该保留

更稳定的方式是显式使用：

- `valueMode = 'none'`
- `valueMode = 'fixed'`
- `valueMode = 'editable'`

这样 preset 切换行为才是确定的。

### 原则五：active/effective 都属于 projection，不属于组件局部状态

不能再让组件自己零散判断：

- 当前 condition 是谁
- 当前 rule 是否有效
- 当前 bodyLayout 应该是什么

这些都应该从同一个 projection 一次性给出。

## 为什么这版比上一版更合理

因为这版只做了真正必要的收敛：

- 一个统一 filter spec
- 一个轻量 React model
- 一个薄 popover

没有额外引入：

- runtime framework
- adapter framework
- controller framework
- 过重的 view model 层

换句话说：

- 解决的是 filter 语义分裂问题
- 不是顺手造一套通用架构

## 推荐实施顺序

### 第一步

先把 preset 匹配、preset 应用、editor 选择收进统一 `core/filter/spec.ts`。

这是当前所有 bug 的中轴。

### 第二步

删除 `meta/filter.ts`，把 summary/condition/editor/effective 信息改成从 projection 直接出。

### 第三步

把 `FilterRulePopover` 改成只消费 `resolveFilterRuleProjection(...)` 或 `useFilterRuleProjection(...)`。

### 第四步

把 `StatusFilterPicker` 改造成 `GroupedOptionEditor`，收编进 `FilterValueEditor`。

### 第五步

删除 title filter 的 wrapper 特判复制逻辑。

## 最终结论

长期最优、但不过度设计的路线是：

- 不继续给 `FilterRulePopover` 打补丁
- 不再让 `meta/filter` 承担 filter 语义
- 不搞过重的 runtime/adapter/controller 体系
- 只做一个统一 filter spec，配一个单独的 filter projection

用一句话概括：

**“把 filter 的 preset 收进 spec，把 active/effective/editor/summary 收进 projection；让 `FilterRulePopover` 退回成薄 UI。”**
