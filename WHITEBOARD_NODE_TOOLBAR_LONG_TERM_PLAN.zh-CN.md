# Whiteboard Node Toolbar 长期方案

## 背景

本轮 whiteboard toolbar 改造已经把 `shape` toolbar 独立出来，并开始复用 `@ui` 的：

- `Popover`
- `Menu`
- `Slider`
- `Button`

这是正确方向。

但当前实现还有一个明显问题：

- `NodeToolbar` 目前只接 shape-only 路由
- 非 shape 选区拿不到 toolbar model
- 因此普通 node 的 toolbar 直接消失

这不是样式问题，而是路由层被硬编码成了 shape-only。

## 当前问题

### 1. Toolbar 路由被收窄为 shape-only

当前 `NodeToolbar` 只消费 `resolveShapeToolbarModel(...)`。

这意味着：

- 单选 `shape` 或多选全是 `shape` 时有 toolbar
- 其他 node 或混选时没有 toolbar

因此：

- `text`
- `sticky`
- `frame`
- `draw`
- `group`
- mixed selection

全部都缺少 toolbar fallback。

### 2. 现有类型系统不够表达真实 toolbar 差异

当前 registry 元信息里有：

- `NodeFamily = 'text' | 'shape' | 'container' | 'draw'`
- `ControlId = 'fill' | 'stroke' | 'text' | 'group'`

这个粒度只够做很粗的能力判断，不够直接决定 toolbar 内容。

例如：

- `text` 和 `sticky` 都是 `family: 'text'`，但 toolbar 不应该相同
- `frame` 和 `group` 都是 `family: 'container'`，但 toolbar 也不应该相同

所以长期方案不能直接等同于 “family = toolbar”。

## 目标

长期目标是建立一套：

- 唯一 shell
- 统一视觉
- 可按 node 类型稳定扩展
- 不会再次出现某一类 node toolbar 丢失

的体系。

明确目标如下：

- 所有可编辑 node selection 都应该有明确 toolbar recipe 结果
- `NodeToolbar` 继续作为唯一 toolbar shell
- `@ui` 负责通用基础组件，不负责 whiteboard 业务语义
- toolbar 内容按 summary 解析为一串有序 recipe items
- 样式体系统一，不再出现 shape 一套、普通 node 另一套的长期分裂

## Toolbar 输入来源

toolbar 不应该在多个组件里直接散读 `selected nodes` 后各自做判断。

长期应明确分成两层 summary 输入：

### 1. core selection summary

来源：

- `whiteboard/packages/whiteboard-core/src/selection/summary.ts`

职责：

- 当前选区是 `none / node / nodes / edge / edges / mixed`
- node / edge 数量
- primary node / edge
- transform 能力
- selection box

这层回答的是：

- “选中了什么”
- “当前选区是否可显示 node toolbar”
- “toolbar 应锚定在哪里”

### 2. react node summary

来源：

- `whiteboard/packages/whiteboard-react/src/features/node/summary.ts`

职责：

- 当前 node selection 的 type 统计
- `mixed` 与否
- 共享 controls 能力
- 共享样式能力，例如 `fill / stroke / text / opacity`
- lock 状态

这层回答的是：

- “这些 node 共同支持什么能力”
- “适合进入哪一类 toolbar”
- “toolbar 里哪些按钮应该显示、禁用或折叠”

### 3. 结论

长期方案应该是：

- 先读 core summary
- 再读 node summary / can / style
- 最后在一个地方统一 resolve 成 toolbar recipe

而不是：

- 在 `NodeToolbar` JSX 里直接散写 `selectedNodes[0].type === ...`
- 各个 panel 自己重新推断选区类型
- 用 `NodeFamily` 或单个 node type 生硬决定全部 toolbar 语义

## 核心原则

### 1. 唯一 Shell

继续保留：

- `NodeToolbar`

它负责：

- toolbar 显示时机
- anchor / position session
- panel open state
- `WhiteboardPopover`
- z-index / pointer event / overlay 行为

它不负责：

- 某个 node family 的具体按钮拼装
- 直接散读 node style / schema / data

### 2. Toolbar 不应按 Node Kind 建模

不要直接用 `NodeFamily` 作为 toolbar 结构的切分依据。

也不要把长期架构做成：

- `shapeToolbarModel.ts`
- `textToolbarModel.ts`
- `stickyToolbarModel.ts`
- `frameToolbarModel.ts`
- `drawToolbarModel.ts`
- `groupToolbarModel.ts`
- `mixedToolbarModel.ts`

原因：

- `NodeFamily` 太粗
- toolbar 的差异主轴不应该是 node kind，而应该是 item 组合
- 一旦按 kind 横向拆分，维护成本会按 “node kind x toolbar feature” 膨胀
- node kind 应该只是 summary 输入之一，而不应成为架构主轴

### 3. `ToolbarKind` 不是核心，核心是 Recipe

`ToolbarKind` 可以存在，但最多只应是一个很薄的局部概念。

例如：

- 是否显示 toolbar
- 是否需要走某个 recipe 模板
- 是否需要隐藏某些 item

它不应该成为长期架构的中心。

推荐输入顺序：

- `SelectionSummary`
- `NodeSummary`
- `NodeSelectionCan`
- `NodeSelectionStyle`

推荐输出结果：

- `ToolbarRecipe`
- 或更进一步的 `ToolbarRecipeItem[]`

### 4. Recipe 不要只停在 `string[]`

方向上可以理解为：

- `['shape-kind', 'font-size', 'stroke', 'fill', 'lock', 'more']`

但长期不要只输出裸字符串数组，因为这不够表达：

- divider
- disabled
- hidden
- mixed
- variant
- panel 类型

因此更稳的形态应是轻量 descriptor：

```ts
type ToolbarItemKey =
  | 'shape-kind'
  | 'font-size'
  | 'bold'
  | 'italic'
  | 'text-align'
  | 'text-color'
  | 'stroke'
  | 'fill'
  | 'align'
  | 'distribute'
  | 'order'
  | 'group'
  | 'lock'
  | 'more'

type ToolbarRecipeItem =
  | { kind: 'item'; key: ToolbarItemKey }
  | { kind: 'divider' }
```

如果后续确实需要，也可以在 `item` 上再补少量状态字段。

### 5. Item Registry 和 Shell 分离

推荐责任划分：

- recipe resolver 负责决定“显示哪些 item，顺序如何”
- item registry 负责根据 key 渲染具体 toolbar item
- shell 负责位置、popover、frame 样式和 panel 生命周期

也就是说，不再按：

- shape content
- text content
- draw content

做整套组件切换，而是按：

- `stroke`
- `fill`
- `font-size`
- `text-color`
- `lock`
- `more`

这些基础 item 去组合。

### 6. `@ui` 只放无业务语义组件

不要把 selection-aware toolbar shell 塞进 `@ui`。

`@ui` 只负责：

- 可复用的视觉组件
- 不依赖 whiteboard runtime 的基础交互件

whiteboard 本地层负责：

- summary context
- recipe resolver
- item registry
- anchor 计算
- toolbar session
- command 调度

## 推荐架构

### 1. Shell 层

保留：

- `NodeToolbarShell`

建议最终由现有 `NodeToolbar` 演进为：

```ts
type NodeToolbarShellProps = {
  containerRef: RefObject<HTMLDivElement | null>
}
```

职责：

- 读取 selection presentation
- 读取 toolbar summary context
- 管理 frozen position session
- 管理 active panel
- 挂载 `WhiteboardPopover`
- 统一 toolbar frame 样式

### 2. Summary Context 层

建议统一产出一份归一化上下文：

```ts
type ToolbarSummaryContext = {
  selection: SelectionSummary
  nodeSummary: NodeSummary
  can: NodeSelectionCan
  style: NodeSelectionStyle | null
  selectionKey: string | null
  visible: boolean
}
```

建议新增函数：

```ts
resolveToolbarSummaryContext({
  selection,
  registry
}): ToolbarSummaryContext
```

这层只回答：

- 当前选区的归一化事实是什么
- 后续 recipe resolver 和 item renderer 应该消费什么上下文

### 3. Recipe Resolver 层

建议新增函数：

```ts
resolveToolbarRecipe({
  context
}): readonly ToolbarRecipeItem[]
```

它只回答一件事：

- 当前选区应该显示哪些 toolbar items，以及它们的顺序

推荐输入来源：

- `selection` 来自 core `SelectionSummary`
- `nodeSummary` 来自 react `readNodeSummary(...)`
- `can` 来自 react `readNodeSelectionCan(...)`
- `style` 来自 react `readNodeSelectionStyle(...)`

建议规则：

- 单选或多选全是 `shape` 时，输出 shape 常用 recipe
- 单选或多选全是 `text` 时，输出 text 常用 recipe
- 单选或多选全是 `sticky` 时，输出 sticky 常用 recipe
- 单选或多选全是 `frame` 时，输出 frame 常用 recipe
- 单选或多选全是 `draw` 时，输出 draw 常用 recipe
- 单选或多选全是 `group` 时，输出 group 常用 recipe
- 其他纯 node 混选时，输出 mixed recipe
- 有 edge 或不支持场景时，输出空 recipe

这里的关键不是“切换到某个 toolbar 组件”，而是“选择一份 recipe 模板，再按 summary 做裁剪”。

例如：

```ts
const shapeRecipe = [
  { kind: 'item', key: 'shape-kind' },
  { kind: 'item', key: 'font-size' },
  { kind: 'divider' },
  { kind: 'item', key: 'bold' },
  { kind: 'item', key: 'italic' },
  { kind: 'item', key: 'text-align' },
  { kind: 'item', key: 'text-color' },
  { kind: 'divider' },
  { kind: 'item', key: 'stroke' },
  { kind: 'item', key: 'fill' },
  { kind: 'divider' },
  { kind: 'item', key: 'lock' },
  { kind: 'item', key: 'more' }
] as const
```

同一个 `stroke` item 可以被：

- shape recipe 复用
- frame recipe 复用
- draw recipe 复用
- mixed recipe 在安全场景下复用

### 4. Item Registry 层

建议新增：

```ts
type ToolbarItemSpec = {
  key: ToolbarItemKey
  render: (context: ToolbarRenderContext) => ReactNode
}
```

它负责：

- 根据 key 渲染基础 toolbar item
- 从归一化 context 中读取当前值
- 绑定 editor commands
- 打开对应 panel 或执行即时动作

它不应该：

- 重新散读 selected nodes
- 自己推导 selection 类型
- 各自维护一套独立的 toolbar 架构

### 5. 局部 Route 仍可存在，但不应成为主轴

如果实现上确实需要保留一个很薄的 route，也可以：

```ts
type ToolbarRoute =
  | { kind: 'none' }
  | { kind: 'recipe'; selectionKey: string }
```

它的作用仅限于：

- 控制 shell 是否显示
- 控制 position session 生命周期
- 帮助区分空选区和可渲染 recipe

不要再把它演化成按 node kind 横向分叉的中心结构。

## 基础组件先留在 `whiteboard-react`

目前 whiteboard 本地已有一些临时 primitives，例如：

- `Panel`
- `PanelSection`
- `SwatchButton`
- `SegmentedButton`

当前阶段不要直接把这些组件迁到 `@ui`。

原因：

- toolbar 还在快速演进，交互和字段模型都没有稳定
- item registry、panel 结构、recipe 顺序都还会变
- 现在直接上移到 `@ui`，很容易把 whiteboard 局部语义过早固化成全局通用组件
- 一旦抽象失败，回撤成本比先留在 `whiteboard-react` 高很多

因此当前策略应明确为：

- 先把基础组件全部放在 `packages/whiteboard-react`
- 先在 whiteboard 内把命名、交互、样式、组合关系跑稳定
- 等至少经历一轮完整 toolbar 重构和若干选区场景验证后，再评估是否迁移到 `@ui`

### 第一落点

建议统一先放在：

- `whiteboard/packages/whiteboard-react/src/features/selection/chrome/toolbar/`

建议子目录：

- `context/`
- `recipe/`
- `items/`
- `primitives/`
- `panels/`

### whiteboard-react 内建议新增的本地组件

以下组件先作为 `whiteboard-react` 内部组件落地，不直接进入 `@ui`：

#### 1. `ToolbarPanel`

统一弹层主体：

- padding
- min width
- section gap
- surface token

用途：

- fill panel
- border panel
- text panel
- frame panel

#### 2. `ToolbarSection`

统一 panel section：

- title
- spacing
- optional description / trailing

#### 3. `SegmentedControl`

比单个 `SegmentedButton` 更通用：

- 单选或多选组
- icon / text / mixed icon-text
- current value

适用：

- align
- border style
- line cap / line dash
- shape preset mode

#### 4. `ColorSwatchButton`

统一颜色圆点：

- active
- mixed
- custom color
- accessible label

#### 5. `ColorSwatchGrid`

统一色板网格：

- spacing
- fixed columns
- keyboard navigation

#### 6. `SliderField`

不是仅 `Slider`，而是：

- label
- value text
- marks
- commit/change

适用：

- stroke width
- opacity
- font size

#### 7. `NumberStepperField`

适用：

- font size
- stroke width

原因：

- slider 不适合所有精度场景
- 需要更快的数值输入

#### 8. `IconToggleGroup`

适用：

- bold / italic
- align left / center / right
- line style

#### 9. `OptionChipGroup`

适用：

- font size preset
- shape kind preset
- draw width preset

### 哪些内容必须留在 `whiteboard-react`

这些仍应留在 whiteboard：

- toolbar summary context
- toolbar recipe resolver
- toolbar item registry
- toolbar position session
- selection-aware shell
- whiteboard command binding
- item key 和 item 级业务语义

### 什么时候才考虑迁移到 `@ui`

只有满足以下条件，才值得评估迁移：

- 至少有两类以上非 whiteboard 场景也需要同类组件
- 组件的 props 和交互模型已经稳定
- 组件不再依赖 whiteboard 语义命名
- whiteboard 去掉该组件后，不需要写大量适配胶水

如果做不到这些，宁可长期留在 `whiteboard-react`。

## Whiteboard 本地应保留的公共层

除了 `NodeToolbarShell`，whiteboard 还应保留一层本地公共 primitives：

- `ToolbarIconButton`
- `ToolbarDivider`
- `ToolbarColorIcon`
- `ToolbarStrokeIcon`
- `ToolbarFillIcon`
- `ToolbarMoreMenu`

这层不是 `@ui`，因为它已经带有 whiteboard toolbar 语义和视觉约束。

它的职责是：

- 保持所有 toolbar item 的按钮框架统一
- 避免各 item 各自再造按钮外观

## 各类选区的典型 Recipe 模板

下面这些不是“每类 node 一套独立 toolbar 组件”，而是：

- recipe resolver 在不同 summary 条件下应产出的典型 item 组合
- 同一个 item 可以被多类选区复用

### 1. Shape

适用：

- 单选 `shape`
- 多选且全是 `shape`

建议功能：

- shape kind
- font size
- bold
- italic
- text align
- text color
- border color
- border style
- border thickness
- border opacity
- fill color
- fill opacity
- lock
- more

备注：

- 这是最完整的一套 recipe
- 其中大部分 item 应复用到其他选区，而不是做 shape 专属实现

### 2. Text

适用：

- 单选 `text`
- 多选且全是 `text`

建议功能：

- font size
- bold
- italic
- text align
- text color
- lock
- more

暂不建议：

- fill
- stroke

因为当前 `text` 本体不是 shape box 语义。

### 3. Sticky

适用：

- 单选 `sticky`
- 多选且全是 `sticky`

建议功能：

- fill color
- text color
- lock
- more

第二阶段可选：

- font size

但第一阶段建议不要做，因为当前 sticky 文本尺寸是 auto-fit 语义，直接引入字号会把模型搞乱。

### 4. Frame

适用：

- 单选 `frame`
- 多选且全是 `frame`

建议功能：

- fill color
- border color
- border thickness
- title color
- lock
- more

不建议直接套 shape toolbar。

因为 `frame` 更像：

- 容器轮廓
- 顶部标题条

不是普通 shape。

### 5. Draw

适用：

- 单选 `draw`
- 多选且全是 `draw`

建议功能：

- stroke color
- thickness
- opacity
- lock
- more

长期可选：

- dash

但第一阶段不必强上。

### 6. Group

适用：

- 单选 `group`
- 多选且全是 `group`

建议功能：

- ungroup
- lock
- layer / order
- more

不建议给：

- fill
- stroke
- text

因为 group 自己不是内容节点。

### 7. Mixed

适用：

- 多选 node family 不一致

建议功能：

- align
- distribute
- group / ungroup
- layer / order
- lock
- duplicate
- delete
- more

第一阶段不要做太多 style 交集能力。

理由：

- mixed selection style UI 很容易变复杂
- 先把“不会空白”和“常用布局动作”做好最重要

## 混选规则建议

混选长期应遵循：

- 优先提供布局和状态动作
- 谨慎提供样式动作

建议分三类：

### 1. 纯布局动作

总是允许：

- align
- distribute
- order
- group
- lock

### 2. 共有交集样式动作

仅在确实安全时显示：

- text color
- fill
- stroke

这部分建议第二阶段再做，不要一开始复杂化。

### 3. 选区专属动作

混选时不出现：

- shape kind
- sticky color preset
- draw-specific stroke preset

## Command 层原则

所有 toolbar 行为都必须有 editor command 承接。

保持：

- 不在 React toolbar 里直接拼 document patch
- 不在 panel 里写临时更新逻辑
- 继续复用现有 `text` / `appearance` / `lock` / `order` 命令

必要时新增：

- `frame` 专属命令
- `group` 专属命令
- `mixed` layout action 收口命令
- item 级统一命令入口

## 样式统一原则

长期必须统一：

- toolbar shell 外观
- panel 外观
- icon button 尺寸
- section 标题样式
- panel 间距
- color swatch 交互

允许不同的仅是：

- 内容种类
- 顺序
- 少量 icon 差异

不允许：

- shape 一套 panel 视觉
- text 另一套 panel 视觉
- draw 再来第三套

## 推荐落地顺序

### 第一阶段：恢复非 shape toolbar

目标：

- 不再出现“普通 node 没 toolbar”

工作：

- 引入 `resolveToolbarSummaryContext`
- 引入 `resolveToolbarRecipe`
- 先做 `mixed` fallback recipe
- 至少补齐 `text` / `draw` 的 recipe 模板和 item 组合

### 第二阶段：先在 `whiteboard-react` 内收敛本地 primitives

目标：

- whiteboard toolbar 视觉统一
- 各场景不再手写局部 primitives

工作：

- 在 `whiteboard-react` 内新增 `toolbar/primitives/`
- 把 `Panel` / `PanelSection` / `SwatchButton` / `SegmentedButton` 收口成本地 toolbar primitives
- 保持 `ToolbarIconButton` / `ToolbarDivider` / `ToolbarColorIcon` 等也统一放在本地层
- 暂不迁移到 `@ui`

### 第三阶段：补齐 item registry 覆盖面

目标：

- 所有核心选区都能通过同一套 item registry 渲染

工作：

- 补齐 `shape-kind`
- 补齐 `stroke`
- 补齐 `fill`
- 补齐 `font-size`
- 补齐 `text-color`
- 补齐 `group`
- 补齐 `order`
- 补齐 `more`

### 第四阶段：再做 mixed style 交集

目标：

- mixed selection 不只支持布局动作，也能支持可安全合并的样式动作

但这一步必须排在后面。

### 第五阶段：最后才评估迁移到 `@ui`

目标：

- 只把真正通用、稳定、无 whiteboard 语义的组件迁出去

工作：

- 审查 `toolbar/primitives/` 中哪些组件已去业务语义
- 审查 props 是否已经稳定
- 审查是否存在 whiteboard 外的第二个消费者
- 仅迁移纯视觉、纯交互 primitives
- `context` / `recipe` / `items` / `commands` 永远留在 `whiteboard-react`

## 详细落地方案

下面给出更具体的实施路径，目标是保证本轮改造能连续落地，而不是停留在概念上。

### 1. 目录方案

建议以当前 `NodeToolbar.tsx` 为入口，逐步收敛到：

```txt
whiteboard/packages/whiteboard-react/src/features/selection/chrome/
  NodeToolbar.tsx
  toolbar/
    context/
      resolveToolbarSummaryContext.ts
      types.ts
    recipe/
      resolveToolbarRecipe.ts
      templates.ts
      normalize.ts
    items/
      types.ts
      registry.tsx
      shapeKind.tsx
      fontSize.tsx
      textStyle.tsx
      textColor.tsx
      stroke.tsx
      fill.tsx
      align.tsx
      distribute.tsx
      order.tsx
      group.tsx
      lock.tsx
      more.tsx
    primitives/
      ToolbarFrame.tsx
      ToolbarIconButton.tsx
      ToolbarDivider.tsx
      ToolbarValueButton.tsx
      ToolbarColorIcon.tsx
      ToolbarStrokeIcon.tsx
      ToolbarFillIcon.tsx
      ToolbarPanel.tsx
      ToolbarSection.tsx
      ColorSwatchButton.tsx
      ColorSwatchGrid.tsx
      SliderField.tsx
      SegmentedControl.tsx
    panels/
      ShapePickerPanel.tsx
      FontSizePanel.tsx
      TextColorPanel.tsx
      BorderPanel.tsx
      FillPanel.tsx
      MoreMenu.tsx
```

原则：

- `NodeToolbar.tsx` 只做 shell
- `context/` 只做 summary 归一化
- `recipe/` 只做 item 排序和裁剪
- `items/` 只做 item 级渲染和 command 绑定
- `primitives/` 只做 whiteboard-react 本地基础组件
- `panels/` 只做弹层内容

### 2. 第一批必须抽出来的类型

建议先稳定这些类型，再开始大规模搬代码：

```ts
type ToolbarSummaryContext = {
  selection: SelectionSummary
  nodeSummary: NodeSummary
  can: NodeSelectionCan
  style: NodeSelectionStyle | null
  selectionKey: string | null
  visible: boolean
}

type ToolbarItemKey =
  | 'shape-kind'
  | 'font-size'
  | 'bold'
  | 'italic'
  | 'text-align'
  | 'text-color'
  | 'stroke'
  | 'fill'
  | 'align'
  | 'distribute'
  | 'order'
  | 'group'
  | 'lock'
  | 'more'

type ToolbarRecipeItem =
  | { kind: 'item'; key: ToolbarItemKey }
  | { kind: 'divider' }
```

这一层一旦稳定，后面迁移 JSX 和 panel 会顺很多。

### 3. `NodeToolbar.tsx` 的重构边界

`NodeToolbar.tsx` 最终应该只保留：

- 读取 `selectionPresentation`
- 调用 `resolveToolbarSummaryContext(...)`
- 调用 `resolveToolbarRecipe(...)`
- 维护 frozen position session
- 维护 active panel key
- 遍历 recipe，调用 item registry 渲染
- 挂载 `WhiteboardPopover`

`NodeToolbar.tsx` 不应该继续承担：

- shape 专属状态读取
- 具体按钮 JSX 拼装
- 直接绑定某个 node kind 的命令
- 一堆 panel switch 分支

### 4. 第一轮 item registry 的最小集合

第一轮不要追求全覆盖，先保证“不空白”和“高频编辑路径”。

建议首批实现：

- `font-size`
- `bold`
- `italic`
- `text-align`
- `text-color`
- `stroke`
- `fill`
- `lock`
- `more`

第二批再补：

- `shape-kind`
- `align`
- `distribute`
- `order`
- `group`

这样可以先把 shape、text、draw、mixed 的主路径恢复起来。

### 5. Recipe resolver 的实现方式

不要在 resolver 里写一大堆分散的 `if` 直接返回 JSX。

建议做成：

- 若干 recipe templates
- 一层基于 summary 的模板选择
- 一层基于 `can/style/types` 的 item 裁剪
- 一层 divider 清理

例如流程：

1. 根据 `nodeSummary.types` 选择基础模板
2. 根据 `can` 去掉不适用 item
3. 根据 `style` 去掉没有值来源的 item
4. 清理首尾和连续 divider

### 6. Panel 的落地顺序

当前已经有：

- `ShapePickerPanel`
- `FontSizePanel`
- `TextColorPanel`
- `BorderPanel`
- `FillPanel`

这批 panel 先不要重写，先移动到新的 `toolbar/panels/` 结构中继续复用。

后续再做：

- 命名统一
- props 统一
- 内部 primitives 统一

先收口，再美化，不要反过来。

### 7. 命令层收口方式

item registry 里的每个 item 只允许做两件事：

- 调 editor command
- 打开 panel

不允许：

- 在 item 内部拼 document patch
- 在 panel 内维护一套旁路状态同步逻辑
- 直接散读 runtime 中不相关的 editor 状态

如果发现某个 item 很难实现，优先补 command，不要在 toolbar 层打补丁。

### 8. 验证顺序

建议每一阶段都按同一顺序验证：

1. 单选 shape
2. 多选纯 shape
3. 单选 text
4. 多选纯 text
5. 单选 draw
6. 多选 mixed
7. 选区 box 改变时 toolbar 是否保持位置稳定
8. slider 拖动时 panel 是否保持打开

先验证行为，再验证视觉。

## 最终建议

长期最优方案不是：

- 再维护一套 shape toolbar 和一套普通 node toolbar
- 继续把 `NodeToolbar` 写成一个只服务 shape 的组件
- 直接用 `NodeFamily` 生硬推导 toolbar
- 按 node kind 横向拆出一排 `XToolbarModel.ts`
- 做一个过度复杂的 schema 自动生成 toolbar 系统

长期最优方案应该是：

- `NodeToolbar` 继续做唯一 shell
- summary 统一收口为 context
- 用 recipe resolver 决定 item 顺序和显隐
- 用 item registry 渲染基础 toolbar 组件
- 基础组件先全部留在 `whiteboard-react`
- 只有稳定后才评估是否迁移部分纯 primitives 到 `@ui`
- 所有 toolbar item 共用统一视觉和交互框架

一句话总结：

最好的长期方案是“一个 shell，summary 驱动一份 recipe，一套基础 item registry 负责渲染”，而不是“按 node kind 复制整套 toolbar”。
