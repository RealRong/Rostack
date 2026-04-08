# Whiteboard Selection Action Menu Unification Plan

## 背景

当前 whiteboard 里，selection 相关操作已经分布在两个入口：

- `ContextMenu`
- `NodeToolbar` 的 `more`

从产品形态上看，这两个入口在 Miro 里的内容基本是一致的，本质上都在表达“当前 selection 可执行的动作”。

当前代码层面的问题不是外观不同，而是职责和数据来源还没有彻底统一：

- `NodeToolbar more` 已经在消费 selection 侧生成的 section 数据。
- `ContextMenu` 仍然可能保留一套独立拼装 selection menu 的倾向。
- 后续如果继续演进 `group / layer / layout / edit / danger`，很容易再次出现两个入口重复维护。

因此长期应该把这两处都收敛到同一份 selection action model。

## 核心目标

- 让 `ContextMenu` 和 `NodeToolbar more` 直接复用同一个 selection action menu 组件。
- 明确该共享组件基于 `ui/src/menu` 组织，而不是 whiteboard 自己再包一层平行菜单体系。
- 避免两个入口分别维护 `Copy / Cut / Paste / Duplicate / Layer / Group / Ungroup / Lock / Create container / Zoom in / Delete`。
- 明确菜单从上到下的固定顺序、divider 位置、submenu 位置和条件显示规则。
- 统一 whiteboard chrome 菜单的 `Menu` 尺寸和内边距。

## 结论

### 1. 统一的不只是 action model，而是最终菜单组件

这里已经不再停留在“共享 action model”。

明确方案是：

- 共享一份 selection action data
- 共享一份 `MenuItem[]` 组织逻辑
- 共享同一个最终菜单组件

也就是说，`ContextMenu` 和 `NodeToolbar more` 在 selection 场景下最终看到的是同一个 menu component，只是挂载位置不同。

### 2. 共享菜单组件必须直接基于 `ui/src/menu`

明确要求：

- selection action menu 使用 `ui/src/menu`
- 不再在 whiteboard 内部额外维护一套平行菜单抽象
- whiteboard 侧只负责把 selection state 转成 `ui/src/menu` 需要的 menu items

推荐形态：

- 新增一个共享组件，例如 `SelectionActionMenu`
- 该组件内部直接使用 `@ui` 暴露出来的 `Menu`
- menu item、divider、submenu 都遵循 `ui/src/menu` 的组织方式

这样做的目的很明确：

- 和 UI 系统保持一致
- 以后菜单行高、submenu 行为、焦点管理、键盘行为都只跟着 `ui/src/menu`
- whiteboard 不再重复发明 selection menu 的内部组织模型

### 3. 采用策略 A：两个入口显示同一份完整 section

这里不再保留双策略。

明确采用：

- `ContextMenu` 和 `NodeToolbar more` 显示同一份完整菜单
- 菜单顺序一致
- 菜单内容一致
- 两个入口直接使用同一个菜单组件

这意味着产品上要完全对齐 Miro 的心智模型：

- selection actions 无论从右键还是 toolbar more 打开，看到的都是同一份菜单
- 用户不需要记忆“这个动作只在右键里”还是“只在 toolbar more 里”
- 后续新增或删减 selection actions 时，只维护一份菜单结构

这里的代价也是明确接受的：

- `ContextMenu` 会变长
- `ContextMenu` 不再保持 selection 场景下的极简版本

但在当前目标下，这个代价是可接受的，因为我们优先追求 selection actions 的一致性，而不是右键菜单的最小化。

## 菜单定义

### 1. 共享菜单必须使用固定顺序

selection action menu 从上到下固定为：

1. `Copy`
2. `Cut`
3. `Paste`
4. `Duplicate`
5. `divider`
6. `Layer`
7. `Group`
8. `Ungroup`
9. `Lock`
10. `Create container`
11. `divider`
12. `Zoom in`
13. `Delete`

这个顺序应当成为唯一标准，`ContextMenu` 和 `NodeToolbar more` 都不允许再各自调整排序。

### 2. `Layer` 使用 submenu

`Layer` 不是展开成一组平铺 action，而是一个 submenu。

submenu 内固定为：

- `Bring to front`
- `Bring forward`
- `Send backward`
- `Send to back`

也就是说，顶层菜单里只有一个 `Layer` 项，具体 order 调整通过 submenu 完成。

### 3. 条件显示规则

共享菜单需要支持以下条件：

- `Group`
  - 仅在多选时显示
- `Ungroup`
  - 仅在当前 selection 选中了 group 时显示
- `Lock`
  - 在 node selection 场景下显示
- `Create container`
  - 在 node selection 场景下显示

其余项默认作为 selection action menu 的标准项存在。

### 4. `Create container` 的明确语义

`Create container` 的行为明确为：

- 新建一个 `frame`
- frame 的尺寸基于当前 selection 的最外围 rect
- 在该 rect 外再加一圈固定 padding

也就是：

- 读取当前 selection 的外接 bounds
- 在 bounds 基础上扩张 padding
- 以这个结果创建新的 frame

这不是“把已有节点变成 container”，而是“围绕当前 selection 新建一个 frame 容器”。

## 推荐架构

### 1. `selection.ts` 只负责生成共享菜单所需的 selection action state

selection 层不再维护面向不同入口的分叉结构，而是统一产出共享菜单所需状态。

推荐结构：

- `filter`
- `actionMenu`

其中：

- `filter` 服务 toolbar 首位 filter 入口
- `actionMenu` 服务共享 selection action menu 组件

`actionMenu` 至少需要包含：

- 菜单项是否显示
- 菜单项是否禁用
- action 回调
- `Layer` submenu items

### 2. 抽一个共享的 selection action menu 组件

推荐做法：

- 将现有 `ShapeMoreMenu` 升级或重命名为更中性的组件，例如 `SelectionActionMenu`
- `NodeToolbar more` 和 `ContextMenu` 的 selection 分支都直接渲染这个组件

这个共享组件负责：

- 接受共享 `actionMenu` 数据
- 在组件内部转换成 `ui/src/menu` 所需结构
- 渲染统一的 `Menu`
- 处理 `onClose`

### 3. `ContextMenu` 和 `NodeToolbar more` 只负责挂载，不负责拼菜单

`ContextMenu` 的 selection 分支应该只做：

- 读取当前 selection 的 `actionMenu`
- 渲染共享 `SelectionActionMenu`

`NodeToolbar more` 也应该只做：

- 读取当前 selection 的 `actionMenu`
- 渲染同一个共享 `SelectionActionMenu`

两处都不再自己构造 menu items。

## 明确的产品策略

明确采用策略 A：

- `NodeToolbar more` 使用完整共享菜单
- `ContextMenu` 的 selection 分支使用同一个完整共享菜单
- 两个入口直接复用同一个共享菜单组件

不再保留 section filter，也不再保留“ContextMenu 精简版”方案。

## Menu 视觉统一

whiteboard chrome 里的操作菜单建议统一使用：

- `padding="menu"`
- `size="md"`

至少应覆盖：

- `ContextMenu`
- `NodeToolbar more`
- toolbar 的 `filter` popover menu

统一原因：

- 三类菜单的交互密度保持一致
- 不会出现右键菜单、more menu、filter menu 三套不同节奏
- 后续如果统一调整菜单视觉，只需要改一套约定

## 推荐实现方式

### Phase 1

先收敛 selection action state：

- 把 selection 层改成统一产出共享 `actionMenu`
- 明确菜单顺序、条件项、submenu 和回调都在这一层确定

### Phase 2

抽共享菜单组件：

- 组件内部完成 `actionMenu -> ui/src/menu`
- `NodeToolbar more` 和 `ContextMenu` selection 分支都直接使用该组件

### Phase 3

统一三个菜单的 `Menu` 参数：

- `padding="menu"`
- `size="md"`

### Phase 4

把原有入口中的重复 menu 拼装逻辑彻底删除，只保留共享组件。

## 最终形态

推荐最终形态如下：

- selection 数据层产出：
  - `filter`
  - `actionMenu`
- `NodeToolbar`
  - 首位 `filter`
  - `more` 直接使用共享 selection action menu 组件
- `ContextMenu`
  - selection 分支直接使用同一个共享 selection action menu 组件
- 所有 whiteboard chrome 操作菜单统一：
  - `padding="menu"`
  - `size="md"`

这样可以同时满足：

- 产品结构完全一致
- 代码只有一份 action model
- 菜单组件也只有一份
- 后续扩展成本最低

## 最终固定菜单顺序

最后再次明确，selection action menu 的固定顺序为：

1. `Copy`
2. `Cut`
3. `Paste`
4. `Duplicate`
5. `divider`
6. `Layer`
7. `Group`
8. `Ungroup`
9. `Lock`
10. `Create container`
11. `divider`
12. `Zoom in`
13. `Delete`

补充规则：

- `Layer` 使用 submenu
- `Group` 仅多选显示
- `Ungroup` 仅选中了 group 时显示
- `Create container` = 新建一个 frame，尺寸为当前 selection 最外层 rect + padding
- 共享菜单组件内部统一使用 `ui/src/menu`
- 统一传入：
  - `padding="menu"`
  - `size="md"`
