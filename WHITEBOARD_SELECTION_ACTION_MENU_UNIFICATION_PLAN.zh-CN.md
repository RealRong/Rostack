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

- 让 `ContextMenu` 和 `NodeToolbar more` 共用同一份 selection action 数据源。
- 避免两个入口分别维护 `Copy / Cut / Duplicate / Delete / Group / Ungroup / Align / Distribute / Layer`。
- 保留“同一数据源、不同展示密度”的能力，而不是强制两个入口视觉完全一致。
- 统一 whiteboard chrome 菜单的 `Menu` 尺寸和内边距。

## 结论

### 1. 统一的不是组件，而是 action model

不要只抽一个共同的菜单组件。

更合理的方案是：

- 先统一 selection actions 的数据模型
- 再让不同入口消费同一份模型
- 最后按入口决定展示哪些 section

也就是说，真正应该复用的是：

- section 列表
- action 列表
- section 顺序
- 是否显示某 section 的规则

而不是先去抽一个“看起来一样的 Menu 组件”。

### 2. `NodeToolbar more` 和 `ContextMenu` 应共用同一份 selection sections

推荐把 selection 的动作统一组织成以下几类 section：

- `layer`
- `structure`
- `layout`
- `edit`
- `danger`

每个 section 下包含对应 action：

- `layer`
  - Bring to front
  - Bring forward
  - Send backward
  - Send to back
- `structure`
  - Group
  - Ungroup
- `layout`
  - Align top / left / right / bottom / horizontal center / vertical center
  - Distribute horizontally / vertically
- `edit`
  - Copy
  - Cut
  - Duplicate
- `danger`
  - Delete

这份 section 数据应该成为 selection actions 的唯一 source of truth。

### 3. 两个入口可以共源，但不一定完全同内容

有两种产品策略：

#### 策略 A：完全对齐 Miro

- `ContextMenu` 和 `NodeToolbar more` 显示同一份完整 section
- 顺序一致
- 内容一致

好处：

- 用户认知最统一
- 所有 selection actions 无论从右键还是 toolbar 都能找到

代价：

- `ContextMenu` 会变长
- 会削弱“ContextMenu 只做轻量上下文命令层”的收敛方向

#### 策略 B：同源，但分密度展示

- `NodeToolbar more` 显示完整 section
- `ContextMenu` 只显示其中一部分 section

推荐默认裁剪为：

- `edit`
- `danger`

如果后续确认用户确实强依赖右键结构操作，再逐步放出：

- `structure`
- `layer`
- `layout`

这是我更推荐的策略。

原因是：

- 数据源完全统一
- 不会重复实现
- 仍然保留 `ContextMenu` 的轻量和快速
- `NodeToolbar more` 可以承担完整 selection editing 角色

## 推荐架构

### 1. `selection.ts` 只负责生成共享 action sections

当前 selection 层已经在生成 toolbar `moreSections`，长期应该把它改造成更中性的共享模型。

推荐命名：

- `actionSections`

而不是继续使用：

- `moreSections`

因为这份数据已经不只是服务 toolbar more，而是 selection actions 的共享模型。

推荐结构：

- `filter`
- `actionSections`

其中：

- `filter` 服务 toolbar 首位 filter 入口
- `actionSections` 服务 `NodeToolbar more` 和 `ContextMenu`

### 2. 抽一个共享的 section -> `MenuItem[]` 转换层

建议新增一个共享转换函数，把 action sections 转成 `@ui Menu` 能消费的 items。

输入：

- `actionSections`
- 可选 section 过滤规则

输出：

- `MenuItem[]`

这个层负责统一：

- section label
- divider 插入
- action tone / disabled
- action 回调透传

这样可以避免：

- `ShapeMoreMenu` 自己拼一遍
- `ContextMenu` 自己再拼一遍

### 3. `ShapeMoreMenu` 变成纯渲染层

`ShapeMoreMenu` 不应该再承载 selection action 的业务语义。

它应该只负责：

- 接受共享 section 或共享 menu items
- 渲染 `Menu`
- 处理 `onClose`

这样它就只是一个 whiteboard chrome menu shell，而不是 selection 逻辑的承载点。

### 4. `ContextMenu` 的 selection 分支只消费共享模型

`ContextMenu` 不再自己维护 selection actions。

它应该做的只有：

- 读取当前 selection 的共享 `actionSections`
- 按当前策略筛选 section
- 渲染为 `Menu`

这样 selection context menu 的逻辑就会变成：

- 数据来源统一
- 入口呈现独立
- 不再有第二套动作定义

## 建议的产品策略

我推荐：

- `NodeToolbar more` 使用完整 `actionSections`
- `ContextMenu` 默认只显示 `edit` 和 `danger`

这是最平衡的方案。

理由：

- 用户在 toolbar more 里可以找到完整 selection actions
- 右键菜单仍然保持短和快
- 代码层只有一份 actions 定义
- 将来如果要把 `layer / structure / layout` 放回右键，只需要改 section filter，不需要重写业务逻辑

如果未来你们决定完全对齐 Miro，再把 `ContextMenu` 的 section filter 放开即可。

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

先收敛数据源：

- 把 selection 层的 `moreSections` 改成更中性的 `actionSections`
- 保证 `NodeToolbar more` 和 `ContextMenu` 都从这份数据读取

### Phase 2

抽共享转换函数：

- `actionSections -> MenuItem[]`
- 支持 section 过滤

### Phase 3

统一三个菜单的 `Menu` 参数：

- `padding="menu"`
- `size="md"`

### Phase 4

根据产品选择最终形态：

- 保持 `ContextMenu` 精简版
- 或完全对齐 Miro，显示完整 sections

## 最终形态

推荐最终形态如下：

- selection 数据层产出：
  - `filter`
  - `actionSections`
- `NodeToolbar`
  - 首位 `filter`
  - `more` 使用完整 `actionSections`
- `ContextMenu`
  - selection 分支消费同一份 `actionSections`
  - 默认只显示 `edit + danger`
- 所有 whiteboard chrome 操作菜单统一：
  - `padding="menu"`
  - `size="md"`

这样可以同时满足：

- 产品结构一致
- 代码只有一份 action model
- 入口职责清晰
- 后续扩展成本低
