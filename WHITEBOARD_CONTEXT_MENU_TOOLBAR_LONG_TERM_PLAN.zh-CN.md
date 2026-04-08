# Whiteboard Context Menu / Node Toolbar 长期方案

## 背景

当前 whiteboard selection chrome 里，`ContextMenu` 同时承担了三类职责：

- 右键命令菜单
- selection 状态摘要展示
- 节点属性编辑入口

这导致 `ContextMenu` 和 `NodeToolbar` 的职责边界不清晰：

- `stroke` 在 `ContextMenu` 和 `NodeToolbar` 都有入口，产生重复能力。
- 多选 `filter` 与 `summary` 只服务于当前 `ContextMenu` 展示，不属于稳定的操作模型。
- `lock / group / order / align / distribute` 既像 selection 结构操作，又部分散落在右键菜单里，没有统一归属。

长期看，selection chrome 应该收敛到两种稳定模型：

- `ContextMenu` 负责“上下文命令”
- `NodeToolbar` 负责“纯节点选择态下的属性与结构操作”

## 目标

- 去掉 `ContextMenu` 中的属性编辑职责，避免和 toolbar 重复。
- 去掉 `ContextMenu` 中的状态摘要 UI，保持右键菜单轻量和可预测。
- 让 `NodeToolbar` 成为纯 node selection 的唯一编辑入口。
- 让 selection 结构性操作有一致归属，不再在多个位置重复表达。
- 保留 edge 和 canvas 的右键上下文能力，不强行迁移到 toolbar。

## 核心结论

### 1. `stroke` 应该放在 `NodeToolbar`

`stroke` 是典型的节点外观编辑能力，不是“右键上下文命令”。

它的稳定归属应当是：

- `NodeToolbar` 主入口或 panel
- 与 `fill / text color / shape kind / font size` 同层组织

长期目标下，`ContextMenu` 不再承载任何 `stroke` 相关入口，包括：

- stroke color
- stroke width
- stroke opacity
- stroke dash

### 2. 多选 `filter` 不应放在 `ContextMenu`，应迁移到 `NodeToolbar`

多选 `filter` 不适合继续放在右键菜单里，但它本身不应该被直接删除。

更合理的长期形态是：

- 仅在多选或 group selection 的 `NodeToolbar` 中显示
- 放在 toolbar 最前面，作为 selection 范围摘要入口
- 采用简单图标 + `N objects` 这种按钮形式
- 点击后弹出 popover，再选择要保留的类型

这样处理的原因是：

- `filter` 本质上是“对当前 selection 的再聚焦”，而不是右键上下文命令。
- 它和当前选区强绑定，更适合放在 selection chrome 的起始位置。
- 用一个轻量摘要按钮承载，比在 `ContextMenu` 里直接展开 filter strip 更稳定，也更节省空间。

长期方案下：

- `ContextMenu` 删除 `filter`
- `NodeToolbar` 在多选或 group selection 时新增前置 `filter` 入口
- `filter` 点击后通过 popover 呈现可选类型，而不是在 toolbar 主层直接铺开

### 3. `summary` 应该删除，不建议迁移

selection summary 只是状态说明，不是动作入口。

把 summary 放在 `ContextMenu` 里会带来两个问题：

- 右键菜单顶部被静态说明占据，真正命令被挤到后面。
- 它让 `ContextMenu` 既像 inspector，又像 menu，模型混乱。

长期方案下：

- `ContextMenu` 不展示 summary
- `NodeToolbar` 也不接 summary

原因很简单：summary 不是稳定操作模型的一部分，没有必要迁移。

## 长期职责边界

### `ContextMenu` 的稳定职责

`ContextMenu` 只保留“上下文命令”，即用户在当前点击位置最自然期待的命令列表。

建议长期保留：

- Canvas context
  - Paste
  - Undo / Redo
  - Select all
- Edge context
  - Layer
  - Copy / Cut / Duplicate / Delete
- Universal selection edit
  - Copy / Cut / Duplicate / Delete

这些能力有共同特点：

- 天然符合右键菜单心智模型
- 不依赖专门的 panel UI
- 即使没有 toolbar 也成立
- 对 edge / canvas 同样适用

不建议长期保留：

- Background / canvas 右键 `Create`

原因是：

- whiteboard 已经有主创建入口，右键 `Create` 属于重复导航。
- 它不是强上下文命令，更像一个备用创建入口。
- 它会稀释右键菜单的定位，让 canvas menu 同时承担“命令”和“创建器”两种角色。

除非产品明确要把“在鼠标落点精确创建 preset”作为核心工作流，否则长期应删除 background 右键 `Create`。

### `NodeToolbar` 的稳定职责

`NodeToolbar` 负责纯 node selection 下的所有编辑型与结构型操作。

建议长期归入 toolbar 的能力：

- 外观属性
  - selection filter
  - stroke
  - fill
  - text color
  - shape kind
  - font size
  - text align
  - bold / italic
- selection 状态
  - lock / unlock
- 结构与布局
  - group / ungroup
  - layer order
  - align
  - distribute

其中：

- 高频属性操作可作为一级按钮或直接 panel
- 次级结构操作统一进入 `more` 菜单

这会让 toolbar 真正成为“选中节点后的编辑带”，而不是只承载一半属性能力。

## 推荐的信息架构

### `ContextMenu`

长期应当尽量简化成下面三类：

- Canvas commands
- Edge commands
- Generic selection commands

它不再负责：

- selection summary
- selection filter
- node appearance editing
- node creation entry

### `NodeToolbar`

长期应当成为纯 node selection 的主控条：

- 一级直接编辑项：高频外观与文本编辑
- `more`：结构与布局操作

推荐分层：

- 主层
  - filter summary button
  - shape kind
  - font size
  - bold / italic
  - text align
  - text color
  - stroke
  - fill
  - lock
  - more
- `more`
  - group / ungroup
  - layer order
  - align
  - distribute

其中 `filter summary button` 的建议形态是：

- 仅在多选或 group selection 下出现
- 位于 toolbar 最前面
- 默认文案类似 `N objects`
- 搭配简洁图标表达“当前是一个聚合 selection”
- 点击后打开 popover
- popover 内展示可筛选的类型项，用户选择后保留对应类型

## 为什么 `lock / group / order / align / distribute` 更适合 toolbar

这些能力本质上都依赖当前 selection 本身，而不是依赖“右键点到了哪一类上下文”。

它们更像：

- 对选中节点集合的结构编辑
- 对选中节点集合的布局调整
- 对选中节点集合的状态切换

因此长期放在 toolbar 更合理，原因包括：

- 选择后可见，心智模型稳定
- 与属性编辑并列，形成统一 selection editing 面
- 可以通过 `more` 控制密度，避免 toolbar 过载
- 避免和 context menu 的 edit commands 混杂

## 为什么 edge 相关操作仍然留在 `ContextMenu`

目前 `NodeToolbar` 的天然作用域是“纯 node selection”。

edge 的操作模型更接近右键上下文命令：

- Layer
- Copy / Cut / Duplicate / Delete

这些动作留在 `ContextMenu` 更自然，也不必为 edge 单独扩展一个 toolbar 模型。

长期不建议为了对称性把 edge 操作硬塞进 `NodeToolbar`。

## 对现有代码结构的影响

### `ContextMenu` 应该被瘦身

长期目标是让 `ContextMenu` 只保留：

- view 解析
- menu group 构造
- popover 呈现

应删去：

- selection summary/header 逻辑
- filter strip 逻辑
- selection style group 逻辑

### `selection` 数据层应同步收敛

如果 `filter` 从 `ContextMenu` 迁移到 `NodeToolbar`，则以下数据结构需要重构，避免继续沿用当前的右键菜单模型：

- `SelectionMenuView.filter` 不应继续挂在 menu 视图模型上
- `SelectionFilterView` 需要改造成 toolbar filter 入口所需的数据模型
- `SelectionCan.filter`
- `NodeSelectionCan.filter`

其中能力位本身可以保留，但语义应改为“当前 selection 是否允许显示 toolbar filter”，而不是“context menu 是否显示 filter”。

如果 `stroke` 不再由 `ContextMenu` 使用，则只服务于右键 style group 的旧 style 汇总逻辑也应删除。

### `NodeToolbar` 应该接住结构操作

当前 toolbar 已有较清晰的架构：

- `context`
- `recipe`
- `item spec`
- `panel`
- `more`

长期应该沿这条线继续演进，而不是把新能力继续塞回 `ContextMenu`。

`filter` 的长期落点也应走这套体系：

- 新增 toolbar 首位 item，负责展示 selection 摘要按钮
- 点击后打开对应 popover / panel
- panel 中完成类型过滤，而不是回退到 `ContextMenu`

## 分阶段落地建议

### Phase 1

先做最明确、风险最低的收敛：

- 从 `ContextMenu` 删除 `stroke`
- 从 `ContextMenu` 删除 `summary`
- 从 `ContextMenu` 删除多选 `filter`
- 从 background `ContextMenu` 删除 `Create`

这一步不要求立刻重构所有结构操作，但 `filter` 应同步规划迁移到 `NodeToolbar`，避免能力被直接删除后缺位。

### Phase 2

把纯 node selection 的结构性操作逐步并入 toolbar：

- `lock`
- `group / ungroup`
- `layer`
- `align / distribute`

优先放入 `more`，避免 toolbar 顶层过重。

### Phase 3

将 `ContextMenu` 最终收敛为真正的上下文命令层：

- canvas commands
- edge commands
- generic edit commands

到这一步，selection chrome 的职责边界会非常明确。

## 最终形态

长期最优方案下：

- `ContextMenu` = 右键命令层
- `NodeToolbar` = 节点选择编辑层
- `summary` = 删除，不迁移
- `filter` = 迁移到多选或 group 的 `NodeToolbar` 首位入口
- background `Create` = 删除，不迁移
- `stroke` = 只保留 toolbar 入口
- `lock / group / order / align / distribute` = 统一归到 toolbar，优先进入 `more`

这是最稳定、可维护、也最符合用户心智的职责划分。
