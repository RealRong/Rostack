# Dataview Field Schema Menu/Submenu 迁移方案

## 背景

当前 dataview 的 field schema/editor 在交互层同时混用了：

- `Popover + Button`
- `Popover + Menu`
- `DropdownMenu`
- feature 私有包装组件

这导致了几个持续恶化的问题：

1. 组件层级过厚，同一类交互被重复包了多层。
2. menu / submenu / popover 的职责边界不清。
3. padding 归属分散，`p-1.5` 到处漂浮。
4. trigger 组件不透明，容易把 overlay/floating 注入的 props 吞掉。
5. 同类配置项在不同地方的打开方式、内容宽度、内边距都不一致。

这份文档定义长期最优迁移方向，不涉及这一步的代码实现。

## 目标

### 交互目标

- field schema 中所有“枚举型设置”统一走 `Menu` / `submenu`。
- 同一屏内不再继续手工拼 `Popover + Menu` 做选择器。
- field schema 里用户感知到的是一套统一的“设置菜单系统”，不是多个松散浮层。

### 结构目标

- 尽量减少 feature 私有中间组件。
- UI chrome、padding、submenu surface 统一收敛到 `ui/src`。
- dataview 侧只保留业务语义、字段元数据、engine patch 逻辑。

### 约束目标

- padding 只允许由 `ui/menu` 体系拥有。
- 调用方只声明宽度、最大高度、语义，不再声明 menu surface padding。
- trigger 必须是 prop-transparent 的，不能吞掉 `Popover` / `DropdownMenu` 注入的事件与属性。
- 宽度不再通过 `widthClassName` / `w-[...]` 传递，统一改为 `size` token。

## 当前问题诊断

## 1. schema editor 里重复包装过多

当前 field schema/editor 里存在这些重复层：

- [FieldSchemaRows.tsx](/Users/realrong/Rostack/dataview/src/react/field/schema/editor/FieldSchemaRows.tsx)
  - `FieldMenuRow`
  - `FieldToggleRow`
  - `FieldSwitchRow`
  - `FieldChoiceList`
  - `FieldPopoverRow`
- [FieldKindPicker.tsx](/Users/realrong/Rostack/dataview/src/react/field/schema/FieldKindPicker.tsx)
  - 自己再包一层 `Menu`
- [FieldFormatSection.tsx](/Users/realrong/Rostack/dataview/src/react/field/schema/editor/FieldFormatSection.tsx)
  - 重复使用 `FieldPopoverRow + FieldChoiceList`
- [OptionEditorPopover.tsx](/Users/realrong/Rostack/dataview/src/react/field/options/OptionEditorPopover.tsx)
- [FieldStatusOptionsSection.tsx](/Users/realrong/Rostack/dataview/src/react/field/schema/editor/FieldStatusOptionsSection.tsx)
  - 又定义了一套 status option editor popover

结果是：

- 同一类“点一行，展开一组选项”的交互被实现了很多次。
- `ui/dropdown-menu.tsx` 已经存在，但 schema editor 没有把它当主路径。

## 2. padding 归属已经失控

当前 padding 既出现在 `Menu` 内部，也出现在调用方传入的 `contentClassName` / `widthClassName` 中。

典型例子：

- `ui/src/menu.tsx`
  - submenu 默认内容类名里已经包含 `p-1.5`
- `dataview/src/react/field/schema/editor/FieldFormatSection.tsx`
  - `widthClassName="w-[220px] p-1.5"`
- `dataview/src/react/field/options/OptionEditorPopover.tsx`
  - `contentClassName="w-[220px] p-1.5"`
- `dataview/src/react/field/schema/editor/FieldStatusOptionsSection.tsx`
  - `contentClassName="w-[220px] p-1.5"`

这里最糟糕的点不是视觉差异，而是 API 语义已经塌了：

- `widthClassName` 这个名字按理说只该负责宽度。
- 但现在它还在偷偷承载 `padding`。
- 这意味着调用方已经在覆盖 surface 结构，而不是只配置尺寸。

这不是局部问题，而是整个 menu/popover 体系的边界问题。

此外，宽度表达方式也已经失控：

- 有的地方传 `widthClassName`
- 有的地方传 `contentClassName="w-[220px] p-1.5"`
- 有的地方直接依赖 submenu 默认 `w-[180px]`

这意味着：

- surface 尺寸没有统一 token
- 宽度和 padding 被绑在同一个 className 字符串里
- repo 无法建立稳定的 menu surface 尺寸规范

## 3. trigger 组件不透明，容易制造交互 bug

以 [FieldMenuRow](/Users/realrong/Rostack/dataview/src/react/field/schema/editor/FieldSchemaRows.tsx) 为例，它只接收了极少数字段，没有把外层 trigger 注入的其余 props 原样透传。

这会破坏 `Popover` / `Floating UI` 依赖的这些能力：

- `onPointerDown`
- `onMouseDown`
- `onClick`
- `ref`
- overlay layer attribute
- aria / focus / role 相关 props

一旦 trigger 不是 prop-transparent，所有 overlay/menu 交互都会变脆。

### 结论

“字段配置项自己的触发器组件”不能再是随便封一个 `Button`。

长期最优解不是继续 patch 某个组件，而是明确一条规则：

- 任何 menu/popover trigger，要么直接用 `Button`
- 要么只能用一个可证明 prop-transparent 的通用 trigger 组件

## 4. schema editor 的信息架构不够 menu-centric

现在 schema editor 的思路更像：

- 一行设置
- 对应一个独立 `Popover`
- 里面再塞 `Menu`

但从用户心智来看，field schema 的大部分设置其实都属于：

- 一个菜单项
- 往右展开一个子菜单
- 在子菜单里选中一个值

也就是说，长期最优模型不是“一行一个 popover”，而是“一组 row item + submenu tree”。

## 长期目标架构

## 1. `ui/menu` 成为唯一 menu surface owner

长期目标是把 menu surface 的结构责任收敛到 `ui/src/menu.tsx`：

- 菜单项间距
- 内边距
- submenu 默认宽度
- list surface vs panel surface 的差异
- submenu 的对齐与 offset

调用方不再负责这些。

### 强约束

- 业务调用方不得向 menu/submenu surface 传入 `p-*`
- `contentClassName` 如果继续保留，只允许承载尺寸类或布局限制
- 如果需要 surface 差异，应该通过 `ui/menu` 的显式 API 表达，而不是 className 拼接

### size token 约束

长期目标是用统一尺寸 token 取代所有菜单宽度 class：

- `size: 'sm' | 'md' | 'lg' | 'xl'`

推荐映射：

- `sm = 180`
- `md = 220`
- `lg = 240`
- `xl = 280`

这组 token 应覆盖当前 repo 里最常见的几档菜单宽度：

- `w-[180px]`
- `w-[220px]`
- `w-[240px]`
- `w-[280px]`

强约束：

- 不再新增 `widthClassName`
- 不再通过 `contentClassName` 传宽度 class
- 不再允许把 `p-*` 混进宽度表达
- 菜单 surface 宽度只能通过 `size` token 或少数保底 API 表达

## 2. field schema 的枚举设置统一转为 submenu

以下设置长期都应迁移到 menu submenu：

- field kind
- number format
- display date format
- display time format
- default value kind
- default timezone

这些都满足同一个模式：

- 当前值显示在 row suffix
- 点击 row 打开 submenu
- submenu 是一个可勾选列表
- 选择后立即关闭当前 submenu

这类设置不应该继续保留 `FieldPopoverRow + FieldChoiceList` 这种 feature 私有双层包装。

同时，这些 submenu 的 surface 尺寸也应统一改成 token 驱动，而不是各自传：

- `widthClassName="w-[220px]"`
- `contentClassName="w-[240px]"`
- `contentClassName="w-[220px] p-1.5"`

## 3. schema editor 应该减少为“描述菜单项”，而不是“拼浮层”

长期目标不是继续新增 `Field*Row` 组件，而是把 schema editor 收敛成两种职责：

### dataview 层负责

- 生成字段相关的 `MenuItem` 描述
- 生成当前值 label / suffix
- 把用户选择映射为 engine command / patch

### ui 层负责

- 如何渲染菜单
- 如何渲染 submenu
- 如何处理 padding / focus / keyboard / open state

也就是说，长期最优方向是：

- dataview 生成 menu schema
- ui 渲染 menu tree

而不是 dataview 自己拼一套 popover tree。

## 4. 输入型 editor 不应强行伪装成普通 menu list

“字段相关的都可以用 submenu”这个方向整体是对的，但需要分两类：

### 适合直接 submenu 化的

- 枚举选择
- 开关选择
- 单选切换

### 不适合硬塞进普通 list submenu 的

- option rename
- status option rename
- 颜色 + 分类 + 删除这种复合 editor

原因很简单：

- 它们不是 list selection，而是小型 form/editor
- 键盘语义、focus 语义、关闭语义都和纯 menu 不同

### 长期最优解

不是继续保留 feature 私有 `Popover`，也不是把它们硬塞进普通 menu list。

而是给 `ui/menu` 增加一种正式的 submenu surface 语义：

- `list surface`
- `panel surface`

这样 option/status editor 未来仍然可以挂在 submenu 链上，但它用的是“panel 型 submenu”，不是“伪装成菜单项列表的 editor”。

## 组件边界建议

## 应该从 dataview 删掉或消失的组件

以下组件长期不应该继续保留为 dataview 私有组件：

- `FieldChoiceList`
- `FieldPopoverRow`

这两者本质都是 UI 封装，不是领域组件。

## 应该尽量收缩或内联的组件

以下组件如果不迁进 `ui`，也不该继续长成 feature 私有层：

- `FieldMenuRow`
- `FieldToggleRow`
- `FieldSwitchRow`

长期最优原则：

- 要么直接使用 `Button`
- 要么上提为 `ui` 里的通用 inspector/menu row 组件
- 不要继续停留在 dataview feature 私有层

## 应该保留在 dataview 的组件

以下逻辑必须留在 dataview：

- field kind / format / timezone 的领域映射
- `meta` 绑定
- `engine.fields.update / convert / rename / options.*`
- status category 迁移、排序与 reorder 规则

换句话说：

- UI 结构上提
- 字段领域逻辑不上提

## `ui/src` 需要承担的新契约

## 1. menu padding 契约

长期目标：

- `Menu` 自己决定 list surface padding
- submenu 如果渲染 `items`，padding 由 `Menu` 自己负责
- submenu 如果渲染 `content/panel`，padding 也由 `Menu` 的 panel 语义负责

调用方只允许做这些：

- 指定宽度 token
- 指定最大高度
- 指定对齐 / offset
- 指定 submenu 是 `list` 还是 `panel`

调用方不允许再做这些：

- 传 `p-1.5`
- 传 `px-* py-*`
- 让 `widthClassName` 混入 padding
- 让 `contentClassName` 直接承担 `w-[...]`

## 2. submenu surface 契约

`MenuSubmenuItem` 长期应能表达两种内容：

### list 型 submenu

- 用于枚举选择
- 默认内部 padding 由 `Menu` 统一提供

### panel 型 submenu

- 用于输入框、颜色选择、删除按钮这类 editor
- 默认内部 padding 仍由 `Menu` 统一提供
- panel 内容只写结构，不写外层 surface padding

无论 `list` 还是 `panel`，surface 都应支持统一尺寸 token：

- `size: 'sm' | 'md' | 'lg' | 'xl'`

而不是让调用方继续拼接 className。

## 3. 宽度 API 契约

长期不建议给 `Menu` 根组件暴露 `width: number`。

原因：

- `Menu` 是 list 语义本体，不是 surface 容器
- 宽度属于 menu surface / submenu surface，不属于 list 本身
- 如果把宽度挂到 `Menu` 根上，`Menu` 的职责会继续膨胀

长期建议：

- `DropdownMenu` 暴露 `size`
- `MenuSubmenuItem` 暴露 `size`
- 未来 panel 型 submenu 也暴露 `size`

而不是：

- `Menu` 根组件暴露 `width: number`
- 调用方继续透传 `w-[...]`

## 4. trigger 契约

长期必须明确：

- trigger 组件必须转发 `ref`
- trigger 组件必须透传未识别 props
- trigger 组件不能只声明一个窄接口然后吞掉其余事件

否则 menu/popover 的所有交互都不稳定。

## field schema/editor 的目标形态

## 根形态

`FieldSchemaEditor` 长期应收敛为：

- 顶部：字段名输入
- 下方：一组统一风格的设置 row
- row 的展开全部由 menu/submenu 系统负责

## kind / format 形态

这类配置最终都应是：

- row item
- suffix 显示当前值
- submenu 显示候选列表

示意结构：

1. `Type`
   右侧显示当前 kind
   右侧展开 submenu，列出所有可选 kind
2. `Format`
   右侧显示当前 format
   展开 submenu，列出格式枚举
3. `Timezone`
   右侧显示当前 timezone
   展开 submenu，列出 `floating + timezone list`

## option/status 形态

长期目标分两步：

### 第一步

- plain option editor
- status option editor

仍允许用独立 editor surface，但必须开始对齐到统一的 `ui/menu panel` 语义。

### 第二步

- option 编辑
- status option 编辑

统一迁移到 submenu panel surface。

这样信息架构依然是 menu/submenu 树，但 editor 面板不再是 feature 私有 `Popover`。

## 最小化组件原则

这次迁移有一个明确原则：

- 优先删层，不优先造层。

### 可以接受新增的组件类型

只允许新增这两类：

1. `ui` 层真正通用的 menu/inspector 复合件
2. dataview 内真正承载领域逻辑的 item builder / panel builder

### 不应新增的组件类型

- 只服务一个 feature 的薄包装 row
- 只把 `Menu` 再包一层但不增加语义的组件
- 把 `widthClassName` 和 `padding` 混在一起的配置组件

## 迁移顺序

## Phase 1: 先收紧 `ui/menu` 契约

目标：

- 明确 menu/list/panel surface 的 padding owner 是 `ui/menu`
- 让调用方不再需要传 `p-1.5`
- 引入统一 `size` token，替代 repo 中零散的菜单宽度 class
- 明确 `contentClassName` 只用于尺寸，不用于 surface padding

交付标准：

- `ui/menu` 的 submenu surface 有统一默认 padding
- 文档里明确禁止调用方传 menu padding
- `ui/menu` / `DropdownMenu` / submenu surface 的宽度由 `size` token 驱动

## Phase 2: schema editor 的枚举型配置全部 submenu 化

目标：

- 删除 `FieldChoiceList`
- 删除 `FieldPopoverRow`
- `FieldKindPicker` 收敛为 item builder，而不是自己渲染 `Menu`
- `FieldFormatSection` 不再手写 `Popover + Menu`

交付标准：

- kind / format / timezone 全部走统一 submenu 模型
- schema editor 中不再有 feature 私有枚举 popover 容器

## Phase 3: option editor 统一 surface

目标：

- 把 `OptionEditorPopover`
- `StatusOptionEditorPopover`

对齐成同一种 submenu panel surface 模型。

交付标准：

- editor surface 的 padding 不再在调用点声明
- option/status editor 的外壳统一

## Phase 4: repo-wide padding 清扫

需要扫掉所有 menu/popover surface 上漂浮的 `p-1.5` 和零散宽度 class，重点包括：

- `dataview/src/react/field/schema/editor/FieldFormatSection.tsx`
- `dataview/src/react/field/options/OptionEditorPopover.tsx`
- `dataview/src/react/field/schema/editor/FieldStatusOptionsSection.tsx`
- `dataview/src/react/field/value/editor/pickers/date/DateValueEditor.tsx`
- `dataview/src/react/page/features/filter/FilterRulePopover.tsx`
- `dataview/src/react/page/features/viewSettings/panels/GroupingPanel.tsx`
- `dataview/src/react/page/features/sort/SortRuleRow.tsx`
- `dataview/src/react/page/Toolbar.tsx`
- `dataview/src/react/views/table/components/column/ColumnHeader.tsx`

说明：

这个问题不是 schema editor 独有问题，但 schema editor 应该成为第一块被彻底收敛的区域。

清扫完成后的要求：

- 不再出现 `widthClassName`
- 不再出现菜单 surface 的 `w-[180px]` / `w-[220px]` / `w-[240px]` / `w-[280px]`
- 改为统一的 `size` token

## Phase 5: 删除 feature 私有旧层

最终应删除或重写：

- `FieldChoiceList`
- `FieldPopoverRow`
- 狭窄接口版 `FieldMenuRow`

并把 feature 代码重心改成：

- 构建 item schema
- 处理业务 patch

而不是：

- 手工维护一堆 row-level popover state

## 明确结论

## 结论 1

field schema/editor 的长期最优方向是 **menu/submenu-first**，不是继续维护“每行一个独立 popover”。

## 结论 2

padding 必须统一收敛到 `ui/menu`，调用方不应再传 `p-1.5`。

## 结论 3

`FieldPopoverRow` / `FieldChoiceList` 这类 feature 私有 UI 包装层长期应删除。

## 结论 4

trigger 必须 prop-transparent，否则任何 menu/popover 体系都会持续出现开关时序 bug。

## 结论 5

“字段相关都可以用 menu submenu”这个方向整体成立，但要区分：

- 枚举型配置：直接 submenu 化
- 输入型 editor：迁到 submenu panel surface，而不是继续做 feature 私有 popover

## 迁移完成后的验收标准

- schema editor 中不再手工拼 `Popover + Menu` 做枚举选择
- schema editor 中不再存在 `FieldChoiceList`
- schema editor 中不再存在 `FieldPopoverRow`
- menu/submenu surface padding 不再由调用方决定
- `widthClassName` / `contentClassName` 不再承载 padding
- menu/submenu surface 宽度不再由 `w-[...]` class 直接表达
- menu/submenu surface 宽度统一改为 `size: 'sm' | 'md' | 'lg' | 'xl'`
- 同一套 menu/submenu 语义可复用于 schema editor、grouping、filter、sort、column menu 等场景
- 同一行点击 trigger 时不再出现由于 trigger 不透明导致的异常开关时序
