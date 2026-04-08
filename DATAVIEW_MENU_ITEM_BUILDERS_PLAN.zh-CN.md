# Dataview Menu Item Builder 收敛方案

## 目标

在 `dataview/src/react/page/features` 和 `dataview/src/react/field` 下，继续减少手写 `MenuItem` / `MenuReorderItem` / 局部 JSX 拼装。

这次不再新增一套新的列表组件，也不把页面层逻辑塞进 `ui/menu`。目标是建立一层 **dataview 自己的 item builder**，专门把业务对象翻译成 `Menu` 可消费的数据。

核心原则：

- `ui/menu` 只负责通用交互模型和视觉结构。
- dataview 负责把 `Field`、`Option`、`StatusCategory`、`Choice` 这些业务模型转换成 `MenuItem`。
- 尽量复用 builder，不继续在页面里手写重复 `leading / label / suffix / accessory / checked / onSelect`。
- 不做“万能 builder”，保持几个薄而稳定的 builder。

## 不做什么

- 不再抽一层新的 `PickerList`。
- 不把 `QueryChip`、卡片选择器、非列表型 UI 强行并进 `Menu` builder。
- 不把整个页面封装成 builder，只抽“item object”这一层。
- 不做过度泛化的 `createDataviewMenuBuilderFactory` 一类抽象。

## 推荐分层

### 1. Label / View Model Builder

只负责把业务对象转换成可显示的内容，不直接返回 `MenuItem`。

适合这一层的内容：

- field 的 `leading + label + suffix`
- option 的 `FieldOptionTag`
- status option 的 `FieldOptionTag(variant='status')`
- option color dot
- submenu suffix label

这一层应该是纯数据到展示片段的映射，不承担交互副作用。

### 2. Menu Item Builder

在 label/view-model 的基础上，返回 `MenuItem` / `MenuReorderItem`。

这一层负责：

- `kind`
- `checked`
- `disabled`
- `accessory`
- `closeOnSelect`
- `onSelect`
- `handleAriaLabel`

这一层不负责搜索、过滤、分页、popover 打开关闭，也不负责页面路由。

### 3. Screen-Level Assembly

页面层继续自己决定：

- 用 `Menu` 还是 `Menu.Reorder`
- 要不要搜索框
- 要不要 footer
- 要不要 section / divider
- submenu 的打开策略
- 打开后是 route、dropdown 还是 panel

页面层只组合 builder 结果，不再重复写每一行的结构。

## 第一批 builder 候选

### A. Field Item Builder

优先级最高。

重复来源：

- `dataview/src/react/page/features/viewQuery/FieldPicker.tsx`
- `dataview/src/react/page/features/viewSettings/panels/GroupFieldPickerPanel.tsx`
- `dataview/src/react/page/features/viewSettings/panels/ViewFieldsPanel.tsx`

共同结构：

- `leading = field kind icon`
- `label = field.name`
- `suffix / checked / accessory / onSelect` 按场景变化

建议输出：

- `buildFieldRowContent(field)`
- `buildFieldToggleItem(field, input)`
- `buildFieldActionItem(field, input)`
- `buildFieldReorderItem(field, input)`

其中 `input` 只包含少量覆盖项：

- `checked`
- `suffix`
- `accessory`
- `disabled`
- `onSelect`
- `handleAriaLabel`

### B. Choice Submenu Builder

优先级高。

重复来源：

- `dataview/src/react/field/schema/editor/FieldFormatSection.tsx`
- `dataview/src/react/field/value/editor/pickers/date/DateValueEditor.tsx`
- `dataview/src/react/page/features/viewSettings/panels/GroupingPanel.tsx`
- `dataview/src/react/page/features/sort/SortRuleRow.tsx`

这些地方都在做同一种事：

- row 本身显示 `label + suffix`
- 点击后打开一组 toggle choice
- 当前值用 `checked` 表示

建议抽成共享 builder：

- `buildChoiceToggleItems(options, currentValue, onSelect)`
- `buildChoiceSubmenuItem(input)`

`buildChoiceSubmenuItem` 负责：

- `kind: 'submenu'`
- `label`
- `suffix`
- `items`
- `size`
- `presentation`
- `placement`

`FieldFormatSection` 里现有的 `buildChoiceSubmenuItem` 可以直接作为基础版本上移，而不是重写。

### C. Option Item Builder

优先级高。

重复来源：

- `dataview/src/react/field/value/editor/pickers/option/useOptionPickerController.tsx`
- `dataview/src/react/field/value/editor/pickers/status/StatusValueEditor.tsx`
- `dataview/src/react/field/schema/editor/FieldOptionsSection.tsx`
- `dataview/src/react/field/schema/editor/FieldStatusOptionsSection.tsx`

共同结构：

- option label 统一是 `FieldOptionTag`
- status option 只是 `variant='status'`
- editable item 都会带 `OptionEditorPopover` / `OptionEditorPanel`
- selected / editing / open 的 className 规则一致

建议拆成：

- `buildOptionLabel(option, input)`
- `buildEditableOptionItem(option, input)`
- `buildEditableOptionReorderItem(option, input)`
- `buildCreateOptionItem(query, onSelect)`

`input` 里只放差异：

- `variant`
- `editing`
- `open`
- `fieldId`
- `onOpenChange`
- `onDeleted`
- `onSelect`
- `closeOnSelect`
- `handleAriaLabel`

### D. Option Color Item Builder

优先级中高。

重复来源当前主要在：

- `dataview/src/react/field/options/OptionEditorPanel.tsx`

虽然目前只在一个地方，但它的结构非常标准，后面只要任何地方需要“选择 option color”，都应该走同一套 item builder。

建议抽成：

- `buildOptionColorItems(input)`

负责：

- section label
- color dot
- active trailing
- `closeOnSelect: false`
- 更新 color 的 `onSelect`

### E. Navigation Item Builder

优先级中。

重复来源：

- `dataview/src/react/page/features/viewSettings/panels/RootPanel.tsx`
- 未来其他 route-based settings panel

建议只做薄封装：

- `buildNavigationItem(input)`

负责：

- leading icon
- label
- suffix
- trailing chevron
- `onSelect`

这类 builder 收益不如 field/option 大，但能减少一类稳定重复。

## 第二批 builder 候选

### F. Field Visibility Builder

重复来源集中在：

- `dataview/src/react/page/features/viewSettings/panels/ViewFieldsPanel.tsx`

这里不建议一开始就做一个“万能 visibility builder”。

更合适的方式：

- 基于 `buildFieldActionItem`
- 再做三个很薄的 wrapper

例如：

- `buildVisibleFieldItem`
- `buildVisibleFieldReorderItem`
- `buildHiddenFieldItem`

原因：

- visible / hidden / reorder 三者 accessory 不同
- 搜索态和非搜索态行为不同
- 不值得把这些差异压成一个大 builder

### G. Status Category / Section Builder

重复点存在于：

- `dataview/src/react/page/features/filter/StatusFilterPicker.tsx`
- `dataview/src/react/field/value/editor/pickers/status/StatusValueEditor.tsx`
- `dataview/src/react/field/schema/editor/FieldStatusOptionsSection.tsx`

但不建议先做“整段 status section builder”。

更适合先抽：

- `buildStatusCategoryLabel`
- `buildStatusCategoryToggleItems`
- `buildStatusOptionItem`

原因：

- filter、schema、value editor 三者共享的是 label/view model，不是完整行为模型
- 直接抽 section 容易把三种语义绑死

## 暂时不抽的内容

### Query Trigger

- `dataview/src/react/page/features/query/QueryChip.tsx`

这是 trigger，不是 item，不应进入 item builder 体系。

### Card / Grid Selector

- `dataview/src/react/page/features/createView/ViewTypeCard.tsx`
- `dataview/src/react/page/features/viewSettings/panels/LayoutPanel.tsx`

这是卡片选择，不是 row list，不适合用 menu item builder。

### Composite Editor Row

- `dataview/src/react/page/features/sort/SortRuleRow.tsx`

它是复合编辑行，不是单一 row item。可以复用它内部的 choice builder，但不建议把整行做成 builder。

## 推荐目录

建议不要继续把 builder 分散到页面文件里。

可选目录：

- `dataview/src/react/menu-builders/`

或者更贴近业务：

- `dataview/src/react/field/menu/`
- `dataview/src/react/page/menu/`

如果目标是尽量收敛，我更倾向于单独目录：

- `dataview/src/react/menu-builders/`

建议按 builder 类型拆文件：

- `field.tsx`
- `choice.ts`
- `option.tsx`
- `navigation.tsx`
- `status.tsx`

## 推荐命名

保持非常直接，不要花哨：

- `buildFieldActionItem`
- `buildFieldToggleItem`
- `buildFieldReorderItem`
- `buildChoiceSubmenuItem`
- `buildChoiceToggleItems`
- `buildOptionLabel`
- `buildEditableOptionItem`
- `buildEditableOptionReorderItem`
- `buildOptionColorItems`
- `buildNavigationItem`

如果某类 builder 返回的不是 item，而是纯内容，名称里避免出现 `Item`。

## 实施顺序

### 第一阶段

- 抽 `field` builder
- 抽 `choice` builder

这两块收益最大、风险最低。

### 第二阶段

- 抽 `option` builder
- 抽 `option color` builder

这一步能继续减少 option/status 编辑体系里的重复 JSX。

### 第三阶段

- 抽 `navigation` builder
- 视情况补 `field visibility` wrapper

### 最后再看

- `status` 相关是否还需要更高层 builder

只有在前几阶段完成后，仍然存在明显重复，再考虑抽更高层。

## 判断标准

只有满足下面至少 3 条时，才值得做 builder：

- 至少出现在 2 个以上页面或 hook
- 结构稳定，不是一次性页面逻辑
- 差异点少，能够通过少量参数覆盖
- 抽完后页面会明显更短、更清楚
- 不会把页面级副作用塞进共享层

不满足这些条件，就继续留在调用方。

## 结论

当前最值得做的不是继续抽组件，而是正式建立 dataview 的 **Menu Item Builder 层**。

最优先的 3 类 builder：

1. `field item builder`
2. `choice submenu builder`
3. `option item builder`

这样可以把当前分散在 `features` 和 `field` 下的大量重复 `MenuItem` 拼装收敛起来，同时保持 `ui/menu` 的职责边界清晰，不把业务逻辑继续下沉到底层 UI。
