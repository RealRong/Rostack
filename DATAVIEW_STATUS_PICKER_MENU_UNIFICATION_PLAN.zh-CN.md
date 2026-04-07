# Dataview Status Picker / Menu 统一方案

## 背景

当前 `dataview/src/react/field/value/editor/pickers/status/StatusValueEditor.tsx` 与
`dataview/src/react/field/value/editor/pickers/option/OptionPickerEditor.tsx`
在下半部分列表与右侧操作入口上存在明显分叉：

- `OptionPickerEditor` 使用标准列表行模型：
  - 行级 hover / highlighted 背景
  - 键盘导航与滚动对齐
  - 右侧 `MoreHorizontal` 操作入口
  - 可复用的 option 编辑 popover
- `StatusValueEditor` 当前更接近分组下的 tag/chip 选择器：
  - 视觉上不像标准 picker 列表
  - 右侧缺少统一的 more 入口
  - 行交互、键盘导航、编辑能力没有对齐到 option picker

这导致 status picker 的样式、交互和可维护性都落后于 option picker。

## 目标

将 status picker 下半部分统一到与 option picker 相同的“列表行 + more 操作”范式，同时保留 status 自身的分组语义。

目标包括：

- 统一列表行视觉与交互
- 统一键盘导航与 hover/highlight 反馈
- 给 status option 增加右侧 more 入口
- 将 more 内的命令能力尽量收敛到 `ui/src/menu.tsx`
- 保留 rename 为独立的编辑型 popover，不塞进 menu 本体
- 让 `ui/src/menu.tsx` 补齐通用能力，减少 ad hoc custom 渲染

## 非目标

本次不做以下事情：

- 不把 `StatusValueEditor` 整体合并进 `OptionPickerEditor`
- 不取消 status 的 category 分组
- 不让 `menu` 变成“菜单 + 表单面板”的混合容器
- 不把 rename input 直接放进 `Menu` 的 item 列表中
- 不把 schema editor 中的大块字段管理能力搬进 value editor

## 核心判断

### 1. Status 不应直接复用 `OptionPickerEditor` 整个组件

原因：

- `OptionPickerEditor` 的主体是平铺 option 列表
- `StatusValueEditor` 的主体必须保留 `todo / in_progress / complete` 分组
- status 的 option 编辑还包含 category move，这不是普通 option 的能力

因此合适的复用边界不是“整组件复用”，而是：

- 共享列表行渲染模型
- 共享 picker 列表导航能力
- 共享 more 触发方式
- 尽量共享 option 编辑能力中的通用部分

### 2. `usePickerList` 仍然保留，不属于应被裁掉的层

虽然 status 下半部分会向 option picker 的列表行模型收敛，但主列表本身仍然需要一套独立于 `Menu` 的导航模型。

`usePickerList` 负责的是 picker 主列表，而不是 more 菜单：

- 上下键移动主列表高亮项
- `Home` / `End` 跳转
- 当前高亮项自动滚动到可见区
- 鼠标 hover 与键盘高亮共享同一状态
- `Enter` 选中当前高亮项

`Menu` 只能解决 more 打开后的内部导航，不能替代 picker 主体列表导航。

因此本次收敛明确保留：

- `usePickerList`

不建议尝试移除。

### 3. `ui/src/menu.tsx` 适合承载命令型内容，不适合直接承载 rename input

`ui/src/menu.tsx` 当前非常适合：

- action
- toggle
- submenu
- divider
- custom

并且已经具备：

- roving focus
- 上下键导航
- submenu 展开
- list surface / panel surface

但 rename input 是编辑型表单内容，不是命令型 menu item。直接放入 menu 会引入：

- 菜单焦点系统与 input 焦点系统冲突
- 键盘导航职责不清
- menu 抽象边界被污染

所以 rename 仍然应放在独立的 popover / panel 中。

## 最终交互模型

### Status Picker 主体

`StatusValueEditor` 保留 section 结构：

- To do
- In progress
- Complete

但 section 内的每一个 option，不再使用现在的 chip/button 渲染，而是改为与 option picker 一致的“列表行”模型：

- 左侧：status category 对应图标
- 中间：`FieldOptionTag`
- 右侧：`MoreHorizontal` 按钮
- 行背景：hover / highlighted 统一
- 键盘：上下移动高亮，Enter 选中

### More 触发模型

每个 status option 行右侧提供：

- `trailing={<Popover trigger={<MoreHorizontal ... />} />}`

即：

- 右侧按钮负责打开 option 操作 popover
- popover 内部可以组合“rename panel”与“命令 menu”

rename 不进入 `Menu` 本体，而是留在 more popover 内部的编辑区域中。

### More Popover 内容结构

建议结构为：

1. 顶部 rename 区
2. 下方 menu 区

具体内容：

- rename input
- 颜色相关操作
- Move To 分组
- Delete

其中下方命令区尽量由 `Menu` 表达，rename 区仍然是 panel 内容。

## 对 `ui/src/menu.tsx` 的调整建议

### 1. 增加 `label` item

新增一个一等 item 类型：

- `kind: 'label'`

用途：

- 菜单内区块标题
- 非交互
- 不参与键盘导航
- 样式统一

命名不使用 `sectionTitle`，统一叫 `label`。

原因：

- 更短
- 与 menu 的“结构性说明文本”语义更贴近
- 不会暗示更复杂的嵌套 section API

推荐样式职责：

- 统一左右 padding
- 统一字体大小、字重、前后间距
- 统一 muted 文本颜色

### 2. 给 menu item 暴露 `trailing`

当前 `Button` 已有 `leading / suffix / trailing` 能力，但 `MenuItem` 类型没有完整暴露。

建议：

- `MenuActionItem` 增加 `trailing?: ReactNode`
- `MenuSubmenuItem` 增加 `trailing?: ReactNode`
- `MenuToggleItem` 保持已有 indicator 机制，但可考虑增加独立的附加右侧槽位，例如 `trailingContent`

目的：

- 支持右侧状态图标
- 支持颜色点、检查状态、辅助说明
- 让 menu 自己能承担更多通用 UI，而不必回退到 `custom`

### 3. 用 `label` 替换现有适合替换的 `custom`

当前如果有纯标题/说明型 `custom`，应逐步迁移成 `label`，减少样式散落。

迁移原则：

- 纯静态标题文本 -> `label`
- 需要复杂自定义布局/交互内容 -> 仍保留 `custom`

不要滥用 `custom` 去写本该是标准 menu 结构的内容。

## Option 编辑能力的收敛策略

### 1. 不保留独立的 `StatusOptionEditorPopover`

当前判断是：

- 普通 option 的编辑能力：rename + color + delete
- status option 的编辑能力：rename + color + move category + delete

二者并不是两套平级编辑器，而是：

- status = 普通 option 编辑能力 + 一个额外区块

因此不建议继续维护：

- `StatusOptionEditorPopover`

应明确收敛为：

- 一个通用 `OptionEditorPopover`
- 一个通用 `OptionEditorPanel`
- status 通过额外 section 注入 `Move To category`

### 2. `OptionEditorPanel` 应作为唯一编辑主体

后续目标是让 rename / color / delete 这三块只存在一份实现。

也就是：

- 普通 option 直接使用默认 `OptionEditorPanel`
- status option 在同一 panel 基础上追加额外内容

建议的扩展方式保持轻量，不引入第二套壳：

- `extraContent`
- `extraSections`
- `beforeDelete`

三者任选其一，避免过度设计。

目标不是做一个高度抽象的 schema engine，而是明确“只有一份 option 编辑面板主体”。

### 3. Status 专属能力仅保留为一个附加区块

status 仍然特有的内容，收敛后只保留两类：

- 外层 section 分组
- editor 内的 `Move To category` 区块

除此之外，不再保留独立的：

- status option popover 壳
- status option rename 逻辑
- status option color 逻辑
- status option delete 逻辑

这些都应该回归到通用 option editor。

## Status More Popover 的结构建议

### 方案 A：外层 Popover + 内部自定义布局 + `Menu`

推荐优先采用。

结构：

- 外层 `Popover`
- 第一块：rename input 区域
- 分隔线
- 第二块：`Menu`

Menu 中可包含：

- `label`: 颜色
- 颜色子菜单或颜色 action/toggle 列表
- `divider`
- `label`: Move To
- 各 category action/toggle
- `divider`
- destructive delete action

优点：

- rename 与 menu 职责清晰
- menu 仍保持纯命令系统
- 结构可读性强
- 易于复用到 status schema editor / value editor
- 可直接作为通用 `OptionEditorPanel` 的 status 扩展模式

### 方案 B：完全自定义 panel，不直接使用 `Menu`

不建议优先选。

缺点：

- 会继续维持第二套“伪菜单”样式
- 行 hover、focus、keyboard 逻辑会再次重复
- 和已有 `ui/src/menu.tsx` 的能力建设方向冲突

## Status 列表行的复用建议

### 最佳复用边界

建议抽出一个共享列表行组件，例如：

- `PickerOptionRow`
- 或 `PickerListRow`

职责：

- 行 hover / highlighted 背景
- 左右布局
- 可选拖拽位
- 中间 label/tag 内容
- 右侧 trailing action
- 行点击选中
- row ref / id 接入 `usePickerList`

Option picker 与 status picker 都使用这层行壳。

### 不建议复用的部分

- option picker 的“平铺列表整体结构”
- status 的“section 外壳”
- status 的 category 分组标题

也就是：

- 外层结构各自保留
- section 内行模型统一

## 保持收敛的明确约束

为避免这次改造再次长成多套平行实现，后续实现必须遵守以下约束：

### 1. 不新增第二套 status 专用编辑壳

不新增：

- `StatusOptionEditorPopover`
- `StatusOptionEditorPanel`

如果 status 需要特殊能力，只能作为通用 option editor 的扩展区块接入。

### 2. 不移除 `usePickerList`

主列表导航继续统一依赖：

- `usePickerList`

不要用 `Menu` 或局部状态替代主 picker 的导航模型。

### 3. 不再扩散 `custom` 作为标题用途

新增 menu 分组标题时优先使用：

- `label`

只有在必须渲染复杂布局时才允许继续使用：

- `custom`

### 4. Status 特性只允许保留最小增量

status 相比普通 option，允许新增的能力只应包括：

- section grouping
- `Move To category`

除此之外不再复制普通 option editor 的 rename / color / delete 逻辑。

## Status Option 编辑能力拆分建议

现有 status schema editor 里已经有一套 `StatusOptionEditorPopover` 逻辑，支持：

- rename
- color
- move category
- delete

这套能力不应继续只埋在 schema editor 内，但也不应继续以“独立 status editor”形态存在。

建议拆分为共享组件，供以下场景共用：

- `FieldStatusOptionsSection`
- `StatusValueEditor`

推荐拆分方式：

- 将 rename / color / delete 回归通用 option editor
- 将 `Move To category` 抽成 status 专用附加 section
- 根据场景决定 trigger 是 schema row 还是 value picker row 的 more 按钮

## 具体落地顺序

### 第一步：增强 `ui/src/menu.tsx`

新增：

- `label` item
- `trailing` 支持

并整理已有 `custom` 用法：

- 能转成 `label` 的地方转成 `label`
- 保留真正复杂布局所需的 `custom`

### 第二步：抽共享的 picker row 组件

让 `OptionPickerEditor` 先接入共享 row。

要求：

- 不改变现有行为
- 保留 `OptionEditorPopover`
- 保留 `VerticalReorderList` 接口

### 第三步：收敛 option editor

以通用 option editor 为唯一主体：

- 支持默认 rename / color / delete
- 支持插入 status 的 `Move To category` 扩展 section

不再保留独立的 status editor 壳。

### 第四步：抽共享的 status more popover 内容

这里的“status more”不是新的 status editor 壳，而是：

- 通用 option editor + status extra section

结构：

- rename input 区
- menu 区

menu 区使用增强后的 `Menu` 表达：

- 颜色
- Move To
- Delete

### 第五步：重写 `StatusValueEditor` 下半部分

保留：

- status sections
- section label

替换：

- 现有 chip/button 渲染

改为：

- section 内标准列表行
- 右侧 more
- `usePickerList` 完整接线

### 第六步：回收重复逻辑

收敛：

- status category meta
- option label 生成
- more popover 的 rename/color/move/delete 回调

尽量减少 schema editor 与 value editor 的复制粘贴。

## 预期结果

落地后，status picker 应达到以下效果：

- 顶部输入与 option picker 一致
- 下半部分列表行风格与 option picker 一致
- status 仍保留清晰分组
- 每个 status option 拥有统一的 more 入口
- more 内 rename 与命令列表职责清晰
- 普通 option 与 status option 只保留一套编辑主体
- `ui/src/menu.tsx` 变得更通用，后续别处也可受益

## 风险与注意点

### 1. Rename 与 menu 焦点关系

rename input 在 popover 中，menu 也在同一个 popover 中时，要明确：

- 初始焦点给谁
- rename input 是否会抢占键盘事件
- 打开 popover 后是否默认聚焦 rename

建议默认不要自动聚焦 rename，避免更多菜单被打开后立即进入编辑态。

### 2. Status category move 的语义

如果在 value editor 中允许 move category，需要确认这是否符合该场景预期。

如果希望 value editor 偏轻量，可考虑：

- value editor more 中保留 rename/color/delete
- move category 仍仅出现在 schema editor

这个点需要在实现前再确认一次产品边界。

### 3. `label` 与 `custom` 的边界

不要因为新增了 `label`，就把复杂布局也硬塞进去。

边界应保持：

- 标题说明 -> `label`
- 复杂结构 -> `custom`

## 结论

推荐最终方案：

- `menu` 只负责命令型内容
- rename input 不进入 menu 本体
- 给 `menu` 增加 `label`
- 给 menu item 增加 `trailing`
- 保留 `usePickerList` 作为主 picker 列表导航层
- 将 status picker 的 section 内部统一成标准 picker row
- 不保留独立的 `StatusOptionEditorPopover`
- 将 status 的 more 设计为“通用 option editor + status extra section”的两段式结构

这是在复用、清晰边界和后续可维护性之间最平衡的方案。
