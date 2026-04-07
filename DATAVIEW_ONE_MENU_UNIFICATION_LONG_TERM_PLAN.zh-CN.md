# Dataview 只保留一个 Menu 的长期重构方案

## 结论

长期最优方案不是：

- `Menu` 保留一套
- `PickerList` 再保留一套
- 两边只共享一点内部代码

而是：

- 最终只保留一个 `Menu` 内核
- `PickerList`、`ReorderablePickerList`、`PickerRow` 被删除
- 对外 API 不暴露 `selectedKeys`、`highlightedKey` 这种底层控制器状态
- 对外只保留少量语义化入口
  - `Menu`
  - `Menu.Reorder`
  - `Menu.Dropdown`

也就是说：

- 内核只有一个
- 外壳可以有少量名字空间式 preset
- 但不再存在“menu 宇宙”和“picker 宇宙”两套平行体系

## 为什么要这么收

现在 `Menu` 和 `PickerList` 的重叠已经远大于差异。

它们共同拥有：

- leading
- label
- suffix
- trailing
- divider / label / custom
- hover / active 背景
- submenu / dropdown / disclosure 的需求
- 键盘上下移动
- 行级点击触发

真正剩下的差异只在：

- `PickerList` 额外有 reorder
- `Menu` 额外有 submenu/toggle

这不足以支撑两套组件体系继续长期共存。

继续分裂的直接后果是：

- 同样的 row 渲染写两遍
- 同样的 hover/highlight 问题修两遍
- 业务层不断思考“这里该用 menu 还是 picker”
- submenu/dropdown 的交互能力要做两份

所以长期最优不是“让两套体系互相借一点东西”，而是直接统一成一个 `Menu`。

## 公开 API 的核心原则

这次重构最重要的收敛点，不只是组件数量，而是 API 语义。

### 原则 1

不要把内核状态直接暴露成主 API。

尤其不要让下面这些词成为公开主模型：

- `highlightedKey`
- `selectedKeys`
- `activePath`
- `expandedPath`

这些词都更像实现细节，而不是业务语义。

### 原则 2

公开 API 应该尽量使用业务词汇，而不是控件内部词汇。

所以最终应优先使用：

- `value`
- `defaultValue`
- `onValueChange`

而不是：

- `selectedKeys`
- `defaultSelectedKeys`
- `onSelectedKeysChange`

### 原则 3

`highlighted` 不应该出现在 item 数据模型里。

它属于：

- hover
- 键盘漫游
- 当前指针停留

这些都应该是 `Menu` controller 的内部状态。

### 原则 4

`active` 这个词过于模糊，应该彻底避免作为公共字段。

它可能被误用成：

- hover
- selected
- submenu open
- editor open
- pressed

长期看只会制造更多歧义。

## 最终的对外形态

### 目标

外部最终看到的应该不是一个巨胖的 `Menu(props...)`，也不是两三套互不相关的组件，而是：

```tsx
<Menu ... />
<Menu.Reorder ... />
<Menu.Dropdown ... />
```

这三个入口底层都走同一个 `Menu` 内核。

### 为什么需要 `Menu.Reorder`

`reorder` 虽然不是另一套组件体系的理由，但它确实是一整套模式：

- drag handle
- drag aria label
- `onMove`
- 某些行 affordance 不同

如果硬把这些全塞进基础 `Menu` 的 props，会让基础 `Menu` 过胖。

所以长期最优是：

- 一个内核
- 一个 `Menu.Reorder` 语义壳

它不是第二套组件，而是同一内核的 preset。

### 为什么需要 `Menu.Dropdown`

这个场景已经在大量出现：

- 点击 trigger 打开浮层
- 浮层里是 menu
- 有点击型 submenu
- 有 dropdown 型 submenu

现在的 [dropdown-menu.tsx](/Users/realrong/Rostack/ui/src/dropdown-menu.tsx) 本质上已经是这个方向。

长期最优应该是把它收成：

- `Menu.Dropdown`

而不是让 `DropdownMenu` 长期作为并列体系存在。

## 最终的公开值模型

### 结论

对外不要主推 `selectedKeys`。

公开值模型应该统一成：

```ts
value?: string | readonly string[]
defaultValue?: string | readonly string[]
onValueChange?: (value: string | readonly string[]) => void
selectionMode?: 'none' | 'single' | 'multiple'
```

### 为什么不是 `selectedKeys`

因为 `value` 是业务语义，`selectedKeys` 是控件实现语义。

以 dataview 场景来看，外部业务真正关心的是：

- 当前 draft 值
- 当前 filter 值
- 当前字段值
- 当前 schema 选项值

这本质上都是 `value`，而不是“内部有几个 selected keys”。

### 为什么不是只做单值 `selected`

因为底层统一之后必须同时覆盖：

- 单选 picker
- 多选 picker
- filter 多选
- toggle/check

因此要么一开始就只支持数组模型，要么用一个宽一点的 `value` 联合类型。

长期最优是：

- 公开 API 统一叫 `value`
- 单选时传 `string`
- 多选时传 `string[]`
- 通过 `selectionMode` 约束语义

## 最终的 item 模型

### 目标

把 `action`、`toggle`、`picker item` 收成一个统一行模型。

### 推荐模型

```ts
type MenuItem =
  | {
      kind: 'item'
      key: string
      label: ReactNode
      leading?: ReactNode
      suffix?: ReactNode
      trailing?: ReactNode
      disabled?: boolean
      tone?: 'default' | 'destructive'
      indicator?: 'none' | 'check' | 'switch'
      closeOnSelect?: boolean
      onSelect?: () => void
    }
  | {
      kind: 'submenu'
      key: string
      label: ReactNode
      leading?: ReactNode
      suffix?: ReactNode
      trailing?: ReactNode
      disabled?: boolean
      presentation?: 'cascade' | 'dropdown'
      items?: readonly MenuItem[]
      content?: ReactNode | (() => ReactNode)
      placement?: Placement
      offset?: PopoverOffset
      size?: PopoverSurfaceSize
      surface?: 'list' | 'panel'
      contentClassName?: string
    }
  | {
      kind: 'divider'
      key: string
    }
  | {
      kind: 'label'
      key: string
      label: ReactNode
    }
  | {
      kind: 'custom'
      key: string
      node?: ReactNode
      render?: () => ReactNode
    }
```

### 关键约束

- item 上不再放 `selected`
- item 上不再放 `highlighted`
- item 上不再放 `active`
- submenu 上不再放 `open`

这些都不属于 item 数据。

### 为什么 action / toggle / picker item 要收成一个

因为它们的差异本质只在：

- 点击后行为不同
- 是否显示 check/switch
- 是否 closeOnSelect

但它们的行骨架是同一件事：

- leading
- label
- suffix
- trailing
- disabled

如果还保留多个顶层 kind，渲染代码就会继续分叉。

## 内部状态模型

### 结论

`highlightedKey` 这种东西应该存在，但只存在于 `Menu` 内核内部，不作为主公开 API。

### 内部应统一管理的状态

`Menu` 内核内部统一负责：

- 当前 pointer/keyboard 高亮项
- submenu 展开路径
- item ref 注册
- hover 离开后的清理
- click 模式 submenu 的保持/关闭逻辑

这些状态可以继续以：

- `highlightedKey`
- `activePath`
- `expandedPath`

的形式存在于内部实现中，但不要成为主要对外接口。

### 何时才暴露 escape hatch

如果未来真的出现极少数必须手动控制内部高亮的场景，可以再单独提供低级 escape hatch。

但这不应该是主 API。

## `Menu` 需要原生具备的能力

统一掉 `PickerList` 之后，`Menu` 必须天然覆盖下面这些能力。

### 1. 单选 / 多选 / 无选择

由 `selectionMode` + `value/defaultValue/onValueChange` 控制。

### 2. Reorder

由 `Menu.Reorder` 或 `Menu` 内部的 reorder preset 承担。

需要支持：

- drag handle
- drag aria label
- `onMove`

### 3. Submenu

必须继续支持：

- `presentation: 'cascade'`
- `presentation: 'dropdown'`

并且这些语义仍由 `Menu` 自己处理：

- 打开方式
- 定位方式
- 箭头方向
- click/hover 行为

### 4. 整行 disclosure / row trigger

所有“整行点击打开子菜单、dropdown、editor”的场景，都应该作为 `Menu` 行的原生交互语义，而不是业务层手写。

### 5. Hover / keyboard 漫游

这部分统一收进 `Menu` 内核，不再让 `PickerList` 维护第二套高亮逻辑。

## 渲染层如何统一

### 当前问题

现在渲染逻辑分散在：

- `ui/src/menu.tsx`
- `ui/src/picker-list.tsx`
- `ui/src/picker-row.tsx`

三处都在做类似的事：

- 行骨架
- leading/suffix/trailing
- hover/active
- 点击/键盘/鼠标高亮

### 最终方案

最终统一成一个内部 row primitive，例如内部概念上：

- `MenuRow`

这个组件不一定要导出，但要求：

- `Menu` item 用它
- `Menu` submenu trigger 用它
- `Menu.Reorder` row 用它

这样视觉和交互只维护一份。

## 最终文件形态

### 对外保留

- `ui/src/menu.tsx`
- `ui/src/list-structure.tsx`

### 名字空间式入口

最终 `ui/src/menu.tsx` 对外提供：

- `Menu`
- `Menu.Reorder`
- `Menu.Dropdown`

### 删除

- `ui/src/picker-list.tsx`
- `ui/src/picker-row.tsx`

### 可能保留但只做内部实现

- `menu-row.tsx`
- `menu-controller.ts`
- `menu-reorder.ts`
- `menu-dropdown.tsx`

这些都不对外暴露为独立体系。

## 面向 dataview 的最终落地结果

### `OptionPickerEditor`

改成：

- `Menu`
- `selectionMode="single" | "multiple"`
- `value={draft}`
- 不再使用 `PickerList`
- 不再使用 `usePickerList`

### `StatusValueEditor`

改成：

- `Menu`
- section 用 `label/divider`
- item 用统一 `kind: 'item'`
- trailing editor 用 `OptionEditorPopover`

### `FieldOptionsSection`

改成：

- `Menu.Reorder`

### `FieldStatusOptionsSection`

改成：

- `Menu.Reorder`
- 整行点击打开 dropdown/editor
- `submenu.presentation = 'dropdown'` 用于组、子选择器等场景

### 其他 filter / sort / settings

全部逐步收敛成：

- `Menu`
- `Menu.Dropdown`

## 一次性重构的推荐步骤

用户已经明确不在乎成本，所以推荐直接做真收敛，不做长期兼容层。

### Phase 1. 定义最终公开 API

先把目标 API 定死：

- `Menu`
- `Menu.Reorder`
- `Menu.Dropdown`
- `value/defaultValue/onValueChange`
- `selectionMode`

不要先做实现，再边做边想 API。

### Phase 2. 重写 `Menu` item 类型

目标：

- 收成 `item/submenu/divider/label/custom`
- 彻底去掉 `active/highlighted/selected` 这些 item 级状态字段

### Phase 3. 重写 `Menu` 内核 controller

目标：

- 吞掉 `usePickerList`
- 吞掉 picker 的高亮/键盘漫游逻辑
- 吞掉 submenu/dropdown 逻辑

### Phase 4. 重写 `Menu` 行渲染

目标：

- 只剩一套 `MenuRow`
- 把普通 item / submenu / reorder row 全部统一

### Phase 5. 实现 `Menu.Reorder`

目标：

- 将 `VerticalReorderList` 能力整合进 `Menu` preset
- 对业务仍然暴露简洁 API

### Phase 6. 实现 `Menu.Dropdown`

目标：

- 把现有 `DropdownMenu` 收成 `Menu.Dropdown`

### Phase 7. dataview 全量迁移

迁移重点：

- `dataview/src/react/field/value/editor/pickers/option/*`
- `dataview/src/react/field/value/editor/pickers/status/*`
- `dataview/src/react/field/schema/editor/FieldOptionsSection.tsx`
- `dataview/src/react/field/schema/editor/FieldStatusOptionsSection.tsx`
- 其他 filter/sort/settings 中的列表选择器

### Phase 8. 删除旧体系

最终删除：

- `PickerList`
- `ReorderablePickerList`
- `PickerRow`
- `usePickerList`

## 迁移约束

### 1. 不做长期双轨并存

不要让：

- 新 `Menu`
- 旧 `PickerList`

长期一起存在。

### 2. 不把内部控制器状态变成公开主 API

尤其不要把：

- `highlightedKey`
- `selectedKeys`

这类字段包装成最终推荐 API。

### 3. 不在业务层继续手写“假菜单”

统一完成后，业务层不应该再自己做：

- 整行包 `Popover`
- 自己旋转 disclosure arrow
- 自己维护 hover/highlight/open

这些都应该交给 `Menu`。

## 风险

### 1. `Menu` 内核会变大

这是正确的复杂度归位，不是坏事。

以前不是没有复杂度，而是分散在多处。

### 2. 一次性迁移范围大

这是用户已经接受的成本。

真正危险的是：

- 改一半停住
- 新旧模型长期混用

### 3. 键盘交互回归

统一后必须重点回归：

- Arrow navigation
- Home / End
- Enter / Escape
- submenu open / close
- reorder handle

## 最终交付标准

完成后应满足：

1. `ui` 层对外交互列表只剩一个 `Menu` 体系
2. 对外入口只有 `Menu` 及其名字空间式 preset
3. 业务层只使用 `value/defaultValue/onValueChange`
4. `PickerList` / `ReorderablePickerList` / `PickerRow` 被删除
5. option/status picker 全部改用 `Menu`
6. schema option/status section 全部改用 `Menu.Reorder`
7. submenu/dropdown/reorder/highlight 都由 `Menu` 内核原生支持

## 最后判断

如果不在乎成本，长期最优不是“继续让 `PickerList` 和 `Menu` 共享一点点代码”，而是：

- 一个 `Menu` 内核
- 少量语义化外壳
- 对外只讲业务 `value`
- 不把内核状态泄漏成主 API

这比 `selectedKeys/highlightedKey` 那套模型明显更干净，也更容易被团队长期维护。
