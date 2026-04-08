# Whiteboard Context Menu 交互规则与实现方案

## 目标

这份文档聚焦两个问题：

- 右键命中 node / selection / edge / background 时，selection、toolbar、handles、context menu 应该如何联动
- `Layer / Bring to front / Send backward / Send to back` 这类 arrange 命令应该放在哪里，以及如何实现

目标不是回退到旧模型，而是在当前长期方向上，把交互边界补完整，避免出现：

- 右键后目标不明确
- 右键菜单和 toolbar 互相打架
- `Layer` 这类标准右键命令被过度迁移，导致发现性下降

## 总原则

### 1. 右键首先要确定操作目标

用户右键点到一个 node / edge / group 时，系统应先把当前操作目标稳定下来，再打开菜单。

这意味着：

- 右键命中未选中的 node：应切换 selection 到该 node
- 右键命中未选中的 group：应切换 selection 到该 group 对应的 selection
- 右键命中 edge：应切换 selection 到该 edge
- 右键命中当前 selection 内对象：复用当前 selection

这条规则应保留，不建议取消。

原因是：

- 右键菜单里的命令必须有明确目标
- `Copy / Delete / Duplicate / Layer` 都依赖稳定 selection
- 如果右键不更新 selection，菜单会和画布上的可见状态脱节

### 2. 右键菜单打开时，以 context menu 为主

右键菜单是一层“临时命令面板”。

它打开时，不应该再同时把别的悬浮编辑层推到最前面抢注意力。

因此：

- 右键菜单打开时，不应强调 `NodeToolbar`
- 右键菜单打开时，不应强调 resize / rotate handles
- 右键菜单关闭后，保留 selection，再让 toolbar 回到正常可见状态

这不是说 selection chrome 要完全消失，而是说视觉优先级必须明确：

- 菜单打开时：context menu 是主角
- 菜单关闭后：toolbar / handles 恢复正常

### 3. `ContextMenu` 负责标准上下文命令

`ContextMenu` 不应该重新承担属性编辑职责，但它仍然应该保留用户天然会在右键里寻找的标准命令。

应该继续归 `ContextMenu` 的典型命令：

- Copy / Cut / Duplicate / Delete
- Paste
- Undo / Redo
- Select all
- Layer

其中 `Layer` 很重要，它不应被完全迁移走。

### 4. `NodeToolbar` 负责持续编辑能力

`NodeToolbar` 适合承载：

- 属性编辑
- selection 级结构操作
- 多选 filter

但 toolbar 更像持续可见的 editing surface，不应在右键菜单打开时争夺焦点。

## 推荐交互规则

### Background 右键

行为：

- 不改变现有 selection，或按现有规则清空后打开菜单
- 打开 canvas context menu

菜单建议保留：

- Paste
- Undo
- Redo
- Select all

菜单建议删除：

- Create

原因：

- `Create` 已有主入口，不是强上下文命令
- background 右键应尽量保持轻量

### Single Node 右键

行为：

- 若该 node 不在当前 selection 中，先选中它
- 打开 node selection context menu
- 右键菜单打开期间，不强调 toolbar
- 右键菜单关闭后，toolbar 正常可见

视觉反馈建议：

- 应显示该 node 已被选中
- 可以保留 selection frame
- 不建议在菜单打开期间强调 resize / rotate handles

菜单建议保留：

- Copy
- Cut
- Duplicate
- Delete
- Layer

菜单建议迁走：

- Stroke
- Fill
- Text color
- Shape kind
- Font size
- Align / Distribute
- Group / Ungroup
- Filter
- Summary

### Multi-select 右键

行为：

- 如果命中当前 selection 内对象，复用当前 selection
- 打开 selection context menu
- 菜单关闭后恢复 toolbar

toolbar 行为建议：

- 保持当前 selection
- toolbar 在菜单关闭后继续可见
- toolbar 最前面展示 `filter summary button`

菜单建议保留：

- Copy
- Cut
- Duplicate
- Delete
- Layer

菜单建议迁走到 toolbar：

- Group / Ungroup
- Align / Distribute
- Filter

### Group 右键

行为：

- 先切换到 group 对应 selection
- 打开 context menu

toolbar 行为建议：

- group 也属于 selection toolbar 的作用域
- 如果 group selection 同时包含多种类型或可过滤类型，应允许显示首位 filter

菜单建议保留：

- Copy
- Cut
- Duplicate
- Delete
- Layer

菜单建议迁走：

- Ungroup
- 其他结构/布局编辑能力

### Edge 右键

行为：

- 先选中该 edge
- 打开 edge context menu

菜单建议保留：

- Layer
- Copy
- Cut
- Duplicate
- Delete

不建议为 edge 专门引入 toolbar。

## `Layer` 的职责归属

### 结论

`Layer` 不应该从 node / selection 的右键菜单里完全消失。

更稳妥的方案是：

- `ContextMenu` 保留 `Layer`
- `NodeToolbar` 的 `more` 中也可以保留 `Layer`

也就是说，`Layer` 可以双入口，但不能只剩 toolbar。

### 原因

`Layer` 和 `stroke / fill / text color` 不一样。

它更像：

- 标准上下文命令
- 临时结构操作
- 用户在右键里天然会寻找的能力

如果完全迁到 toolbar，会出现两个问题：

- node 右键菜单会显得过于“只剩编辑基础项”，缺少图形编辑器常见命令
- edge 右键仍然有 `Layer`，而 node 右键没有，语义不一致

### 设计建议

推荐保留以下结构：

- Background context menu
  - 无 `Layer`
- Edge context menu
  - 有 `Layer`
- Node / multi-selection context menu
  - 有 `Layer`
- NodeToolbar `more`
  - 也可有 `Layer`

这样用户既可以：

- 右键快速改层级
- 也可以在 toolbar 的持续编辑面里找到它

## Toolbar、Handles、Context Menu 的联动规则

### 推荐规则

#### 菜单打开时

- `ContextMenu` 为最高优先级
- `NodeToolbar` 不应主动弹到用户注意力中心
- transform handles 不应成为主要视觉元素

#### 菜单关闭后

- selection 保持
- `NodeToolbar` 恢复正常显示
- handles 按普通 selection 规则显示

### 为什么不建议“右键时同时完整显示 toolbar + handles”

因为这会造成三层竞争：

- 右键菜单
- toolbar
- transform affordance

这三者同时很强，会让界面变得拥挤，而且用户难以判断当前应该看哪里。

更合理的模型是“单焦点”：

- 右键期间只聚焦菜单
- 关闭后回到 selection editing

## 实现建议

## 一、selection 更新规则

当前右键流程里，应保留“先同步 selection，再读 view”的机制。

实现层面应继续遵守：

- 命中未选中 node：先 `syncNodeSelection`
- 命中 group：先替换 selection
- 命中 edge：先 `syncSingleEdgeSelection`
- 命中当前 selection 内 node：复用现有 selection

这部分原则上不需要推翻。

## 二、增加 context-menu-open 的交互状态

为了让 toolbar / handles 在菜单打开期间降级，建议引入显式状态，而不是靠样式猜测。

建议新增一个 runtime 级或 chrome 级布尔状态：

- `contextMenuOpen: boolean`

这个状态应在：

- 打开 `ContextMenu` 时设为 `true`
- 菜单关闭时设为 `false`

用途：

- `NodeToolbar` 根据它决定是否隐藏或弱化
- selection handles 根据它决定是否隐藏或弱化

## 三、`NodeToolbar` 的显示策略

推荐实现策略：

- 不改变 toolbar 的 selection 数据来源
- 只在显示层增加一条规则：当 `contextMenuOpen === true` 时，不渲染 toolbar 或直接返回 `null`

这是最干净的方案。

比起“菜单打开时 toolbar 还在，但降透明度/降层级”，完全不渲染通常更稳，因为：

- 不会和 popover 层互相遮挡
- 不会留下点击穿透或视觉残影问题
- 逻辑更简单

## 四、selection handles 的显示策略

推荐实现策略：

- 保留 selection 本身
- 对 handles / transform chrome 增加一条 gating 规则：`contextMenuOpen === false` 时才显示

这样可以做到：

- 右键选中目标仍然成立
- 菜单打开期间不出现过强的变换提示
- 菜单关闭后 selection 立即恢复正常编辑态

## 五、`Layer` 的实现归属

`Layer` 建议在两处存在：

- `ContextMenu`
- `NodeToolbar` 的 `more`

实现上应避免复制业务逻辑，只复用同一组 command helper。

推荐做法：

- 把 `Layer` 的菜单项定义抽成共享 helper
- `ContextMenu` 复用这一组 item 定义
- toolbar `more` 的 section 也复用同一组 item 定义

这样可以避免：

- 一处是 `Bring to front`，另一处叫法或顺序不同
- 两个入口的能力不一致

## 六、`filter` 的实现归属

`filter` 不再属于右键菜单。

推荐实现保持为：

- 多选或 group selection 时，toolbar 最前面显示一个 `filter summary button`
- 点击后弹出 popover
- popover 中列出类型项
- 选择类型后收敛 selection

这里的关键不是“把旧 filter strip 搬过去”，而是建立新的 toolbar-first 模型。

## 七、建议的改动顺序

### Phase A

- 保留右键选中目标的行为
- 为 `ContextMenu` 增加 `contextMenuOpen` 生命周期状态

### Phase B

- `NodeToolbar` 根据 `contextMenuOpen` 在菜单打开期间隐藏
- handles 根据 `contextMenuOpen` 在菜单打开期间隐藏

### Phase C

- 在 node / selection 的 `ContextMenu` 中恢复 `Layer`
- 复用现有 `Layer` command 逻辑

### Phase D

- 保持 `filter` 在 `NodeToolbar` 首位
- 不把它重新放回 `ContextMenu`

## 最终建议

最终推荐模型如下：

- 右键点 node / group / edge 时，应先选中目标
- 右键菜单打开时，应以 `ContextMenu` 为唯一主焦点
- 菜单打开期间，不应强调 `NodeToolbar` 和 handles
- 菜单关闭后，selection 保持，toolbar / handles 恢复
- `Layer` 应保留在 node / selection / edge 的右键菜单里
- `Layer` 也可以继续存在于 `NodeToolbar` 的 `more`
- `filter` 应保留在多选或 group 的 `NodeToolbar` 首位入口
- `summary` 不需要迁回任何地方
- background 右键 `Create` 不应恢复

这是在当前长期方向上，兼顾稳定性、可发现性和交互清晰度的最优方案。
