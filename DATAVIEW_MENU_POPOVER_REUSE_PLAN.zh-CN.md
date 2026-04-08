# Dataview Menu / Popover 复用方案

## 背景

本次检查范围：

- `ui/src/menu`
- `ui/src/popover.tsx`
- `dataview` 中所有相关调用点

目标不是立即改代码，而是判断下面三件事是否成立：

1. 现有 `Popover` / `Menu` API 是否存在明显手工重复
2. 重复更适合在 `ui` 层统一，还是在 `dataview` 业务层统一
3. 是否值得新增 `Menu.Popover`

## 现状结论

### 1. `Menu` 层职责目前是清晰的

`ui/src/menu` 现在已经有比较明确的分层：

- `Menu`
  - 负责 menu list、自身 selection、submenu 路径控制、键盘导航
- `Menu.Dropdown`
  - 负责“由 trigger 打开的菜单”
  - 本质上是 `Popover + Menu.Base`
- `Menu.Reorder`
  - 负责“可拖拽排序的列表 + 可选侧向 panel / dropdown 内容”

这套分层在 dataview 中已经覆盖了几类典型场景：

- 普通下拉菜单
  - 例如视图 tab 菜单、排序方向、过滤条件
- 列表中的 submenu / panel
  - 例如字段 schema 配置、option 编辑
- 可拖拽列表中的行级展开 panel
  - 例如 status option 编辑

也就是说，`Menu` 现在并没有明显缺一个“menu 语义的 popover 壳”。

### 2. 真正重复较多的是“面板式 Popover”，不是“菜单”

在 dataview 中，直接使用 `Popover` 的调用分成两类：

#### A. 明确是 panel / picker 的浮层

这些内容并不是 menu item 列表，而是更像“选择面板”或“业务面板”：

- `FieldPicker`
  - `dataview/src/react/page/Toolbar.tsx`
  - `dataview/src/react/page/features/viewQuery/ViewQueryBar.tsx`
  - `dataview/src/react/page/features/sort/SortPopover.tsx`
  - `dataview/src/react/page/features/sort/SortRuleRow.tsx`
- 大块业务 panel
  - `dataview/src/react/page/features/createView/CreateViewPopover.tsx`
  - `dataview/src/react/page/features/viewSettings/ViewSettingsPopover.tsx`
  - `dataview/src/react/page/features/filter/FilterRulePopover.tsx`
- 单独的 option 编辑 panel
  - `dataview/src/react/field/options/OptionEditorPopover.tsx`

它们的高频重复主要是这些默认值：

- `mode="blocking"`
- `backdrop="transparent"`
- `initialFocus={-1}`
- `padding="none"` 或 `padding="panel"`
- `max-h-[72vh]` / `max-h-[80vh]`
- 包一层固定的 panel 容器

#### B. 明确是 menu 的场景

这些已经优先使用了 `Menu.Dropdown` 或 `Menu` submenu：

- `dataview/src/react/page/Toolbar.tsx`
- `dataview/src/react/page/features/filter/FilterRulePopover.tsx`
- `dataview/src/react/page/features/sort/SortRuleRow.tsx`
- `dataview/src/react/views/table/components/column/ColumnHeader.tsx`
- `dataview/src/react/field/schema/editor/FieldOptionsSection.tsx`
- `dataview/src/react/field/schema/editor/FieldStatusOptionsSection.tsx`

这部分已经不算重复热点。

## 为什么不建议新增 `Menu.Popover`

### 1. 名字和职责会混淆

如果 `Menu.Popover` 只是：

- 带默认值的 `Popover`
- 或者“trigger + content”的简化壳

那么它本质并不是“Menu”，而是“Panel Popover”。

把它放进 `Menu` 命名空间，会让 API 语义变模糊：

- `Menu.Dropdown` 是菜单
- `Menu.Reorder` 是菜单/可重排列表
- `Menu.Popover` 却可能只是任意 panel 容器

这会让 `Menu` 从“菜单系统”扩展成“任何浮层容器”，边界开始变差。

### 2. 现有 `Menu` 已经能表达 menu 语义

目前需要 menu 语义的地方已经可以用：

- `Menu.Dropdown`
- `Menu` submenu
- `Menu.Reorder`

新增 `Menu.Popover` 不会明显降低 menu 场景的复杂度，因为重复主要不在那里。

### 3. 容易产生错误抽象

如果为了减少样板而把所有弹层都往 `Menu.Popover` 上收，后面很容易出现：

- 有些内容根本不是菜单
- 有些内容需要 panel padding，有些需要 none
- 有些要 blocking，有些不用
- 有些是 picker，有些是 editor panel

最后得到一个看似统一、实则参数很多的壳，反而把简单问题转成抽象复杂度。

## 更合理的复用方向

### 方向一：先做 dataview 侧 `FieldPickerPopover`

这是最值得优先处理的重复点。

当前重复最集中的模式是：

1. 外层 `Popover`
2. `Popover.Trigger`
3. `Popover.Content initialFocus={-1} size="xl" padding="none"`
4. 内容固定是 `FieldPicker`
5. 选择后关闭或切换 route

适合收敛的地方包括：

- toolbar add filter
- toolbar add sort
- query bar add filter
- query bar add sort
- sort popover 内 add sort
- sort rule row 的 field picker

这个抽象的特点：

- 收的是“业务内容形态”
- 不是收一个过于通用的 UI 外壳
- 能一次减少最多重复
- 风险低，因为语义统一且调用点非常像

建议形态：

- 放在 `dataview` 内，而不是 `ui`
- 接受 `trigger`
- 接受 `fields`
- 接受 `selectedFieldId`
- 接受 `emptyMessage`
- 接受 `onSelect`
- 少量覆盖定位参数，如 `placement`

不建议一开始做成完全通用的 picker framework。

### 方向二：再评估 dataview 侧 panel popover 壳

如果第一步完成后，仍然发现下面几类外壳高度相似：

- `CreateViewPopover`
- `ViewSettingsPopover`
- `FilterRulePopover`
- `OptionEditorPopover`

再考虑做一个更轻的 dataview 侧 panel 壳，例如：

- `DataviewPanelPopover`
- `QueryPanelPopover`

它应该只收这些稳定默认值：

- blocking / backdrop 默认策略
- `initialFocus`
- 常见 surface padding
- 内容容器 className

这个壳不应该知道 menu 语义，也不应该被命名为 `Menu.*`。

## `ui` 层是否要调整

当前阶段建议：

- 不新增 `Menu.Popover`
- 不急着改 `Popover` 主 API
- 保持 `Menu` 和 `Popover` 的职责分离

可以接受的微调方向只有两类：

### A. 给 `Popover` 增加更清晰的语义壳

如果未来跨模块都出现同一种 panel 用法，`ui` 层更合适的名字会是：

- `Popover.Panel`
- `Popover.Picker`

而不是 `Menu.Popover`。

### B. 给业务层沉淀默认 props 常量

如果暂时不想引入组件，也可以先沉淀常量，例如：

- dataview query panel 默认 popover props
- field picker 默认 content props

这是最低风险的第一步。

## 推荐实施顺序

### Phase 1. 只做文档确认的第一轮收敛

目标：

- 确认所有 `FieldPicker` 弹层是否接受统一交互模型
- 确认关闭行为是否一致

重点确认项：

- 选中后是关闭、跳转还是保持打开
- `placement` 是否真的只需要少数几个变体
- 是否都需要 `initialFocus={-1}`

### Phase 2. 提取 `FieldPickerPopover`

只覆盖最重复的几处：

- `Toolbar`
- `ViewQueryBar`
- `SortPopover`
- `SortRuleRow`

要求：

- 不改变现有交互
- 不修改 `ui` 公共 API
- 不碰 `Menu` 系统

### Phase 3. 评估 panel 壳是否还有必要

如果提取 `FieldPickerPopover` 后，剩余 `Popover` 调用仍存在大量外壳重复，再考虑下一层抽象。

如果剩余调用差异已经比较大，就停止继续抽象。

## 不建议做的事

- 不建议现在就新增 `Menu.Popover`
- 不建议把 panel picker 强行改写成 menu item 结构
- 不建议为了“统一”而把 `Popover` 和 `Menu` 混成一个系统
- 不建议一开始就做一个覆盖全部弹层的超级抽象

## 最终判断

本次检查后的建议是：

1. 保持 `ui/src/menu` 现有设计不动
2. 继续把 `Menu` 视为“菜单系统”，不要扩成“通用浮层系统”
3. 抽象重点放在 dataview 业务层
4. 第一优先级是 `FieldPickerPopover`
5. `Menu.Popover` 当前不值得做

这条路线能减少重复，但不会破坏现有语义边界，也更容易逐步验证收益。
