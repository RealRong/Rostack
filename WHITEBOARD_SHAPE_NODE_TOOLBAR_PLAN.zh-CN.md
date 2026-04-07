# Whiteboard Shape Node Toolbar 方案

## 目标

为 `shape` 节点建立一套长期稳定的 node toolbar 方案，满足以下要求：

- toolbar 视觉与交互接近图形编辑器常见形态
- toolbar 与弹层统一复用 `@ui`
- whiteboard 不再继续扩张 `wb-node-toolbar-*` 的旧自定义体系
- formatting 命令从 editor 层正式暴露，不在 React 层临时 patch 数据
- style 字段语义收敛，避免复用错误字段

本方案只覆盖 `shape` node family，不试图同时统一 `text / sticky / frame`。

## 范围

本轮 shape toolbar 包含：

- shape quick switch
- font size
- font style
- alignment
- text color
- border style
- border opacity
- border color
- node fill color
- node fill opacity
- lock
- more menu

其中 border 弹层参考 Miro 类似形态：

- style segmented
- thickness slider
- opacity slider
- color palette

其中 `Font Size` 不使用 slider，采用：

- 顶部直接输入数值
- 下方常用 presets

## 非目标

本轮暂不做：

- underline
- vertical align
- 自由 color picker
- 多 node family 混选统一 toolbar
- 旧 `wb-node-toolbar-*` 体系兼容桥接

## 架构原则

### 1. 保留 NodeToolbar 挂载点

现有 `NodeToolbar` 继续负责：

- 选区锚点计算
- toolbar 显示时机
- 弹层开关状态

但不再承担 shape toolbar 的具体内容拼装。

### 2. Shape Toolbar 独立建模

不新增 `ShapeNodeToolbar` 这一层。

继续保留 `NodeToolbar` 作为唯一 toolbar shell，仅新增 shape 专用 model 与 panels。

shape toolbar 服务：

- 单选 `shape`
- 或多选且全是 `shape`

对于混选，不进入这套 toolbar。

### 3. 弹层统一复用 @ui

toolbar 弹层统一走：

- `@ui/Popover`
- `@ui/Menu`
- 新增 `@ui/Slider`

whiteboard 仅保留极薄包装，例如 `WhiteboardPopover`。

### 4. 命令层正式化

所有 toolbar 操作都必须有 editor 命令承接。

不接受：

- React 层直接 `document.update`
- toolbar 内拼临时 patch
- 复用不准确的旧字段表达新语义

## Toolbar 信息架构

toolbar 分为 4 组：

### 1. Shape

- `shape kind`
- `font size`

### 2. Typography

- `bold`
- `italic`
- `text align`
- `text color`

### 3. Appearance

- `border`
- `fill`

### 4. State

- `lock`
- `more`

这种分组保证：

- 主编辑操作聚集在左侧
- 视觉样式聚集在中部
- 状态与次级操作聚集在右侧

## 交互模型

### Toolbar 本体

toolbar 继续悬浮在选区上方。

显示条件：

- 单选 shape：显示
- 多选且全是 shape：显示
- 其他场景：不显示或回退旧逻辑

### 弹层行为

toolbar 自身不阻塞画布。

toolbar 弹层使用阻塞层：

- 打开后出现透明 backdrop
- 点击 backdrop 关闭
- backdrop 打开期间不允许穿透到 whiteboard 画布

这保证：

- toolbar panel 的 dismiss 行为清晰
- 不会一边调 border/fill，一边误触画布

### 值提交流程

#### 枚举值

点击即提交：

- shape kind
- bold
- italic
- alignment
- text color
- border style
- border color
- fill color
- lock
- more actions

#### 连续值

拖动中连续更新，拖动结束正式提交：

- border thickness
- border opacity
- fill opacity

因此 `Slider` 需要：

- `onValueChange`
- `onValueCommit`

## 数据模型收敛

当前 whiteboard 中 `style.opacity` 被复用于太多语义，不适合继续扩展。

shape toolbar 需要的 style 字段应收敛为：

```ts
type NodeStyle = {
  fill?: string
  fillOpacity?: number

  stroke?: string
  strokeWidth?: number
  strokeOpacity?: number
  strokeDash?: number[]

  color?: string
  fontSize?: number
  fontWeight?: 400 | 500 | 600 | 700
  fontStyle?: 'normal' | 'italic'
  textAlign?: 'left' | 'center' | 'right'
}
```

### 关键决策

#### 1. 不再用整体 opacity 表达 border/fill opacity

必须拆开：

- `fillOpacity`
- `strokeOpacity`

#### 2. border style 收敛为 strokeDash

不新增 `borderStyle` 字段。

统一收敛为：

```ts
strokeDash?: number[]
```

toolbar 映射关系：

- `solid` -> `undefined` 或 `[]`
- `dashed` -> `[8, 6]`
- `dotted` -> `[2, 4]`

这样 shape / edge / draw 都能复用同一套 dash 语义。

#### 3. typography 字段直接进 style

不新增单独 typography 子对象。

原因：

- whiteboard 当前 style 模型已经是平面结构
- 保持复杂度最低
- render 与命令层接入成本最低

## Editor 命令设计

### shape

```ts
node.shape.setKind(nodeIds, kind)
```

语义：

- 更新 `node.data.kind`
- 只对 `type === 'shape'` 生效
- 不重置已有 fill/stroke/text style
- 仅在缺省字段时由 render fallback 到 spec default

### text

```ts
node.text.setSize(nodeIds, size)
node.text.setColor(nodeIds, color)
node.text.setWeight(nodeIds, weight)
node.text.setItalic(nodeIds, italic)
node.text.setAlign(nodeIds, align)
```

建议不要做单个 `setTypography({...})`，否则 toolbar 每个按钮都要构造大 patch。

### appearance

```ts
node.appearance.setFill(nodeIds, color)
node.appearance.setFillOpacity(nodeIds, opacity)

node.appearance.setStroke(nodeIds, color)
node.appearance.setStrokeWidth(nodeIds, width)
node.appearance.setStrokeOpacity(nodeIds, opacity)
node.appearance.setStrokeDash(nodeIds, dash)
```

### state

继续复用：

```ts
node.lock.set(nodeIds, locked)
```

## Toolbar Model

新增 `shapeToolbarModel.ts`，专门读取 shape toolbar 所需状态。

输出内容至少包括：

```ts
type ShapeToolbarModel = {
  nodeIds: readonly NodeId[]
  primaryNode: Node
  mixed: boolean

  shapeKind: ShapeKind

  fontSize?: number
  fontWeight?: 400 | 500 | 600 | 700
  fontStyle?: 'normal' | 'italic'
  textAlign?: 'left' | 'center' | 'right'
  textColor?: string

  fill?: string
  fillOpacity?: number

  stroke?: string
  strokeWidth?: number
  strokeOpacity?: number
  strokeDash?: number[]

  locked: boolean | 'mixed'
}
```

React toolbar 只消费这个 model，不直接散读 node/style/schema。

## UI 组件设计

## @ui/Slider

新增：

- [slider.tsx](/Users/realrong/Rostack/ui/src/slider.tsx)

推荐 API：

```ts
type SliderMark = {
  value: number
  label?: string
}

type SliderProps = {
  value?: number
  defaultValue?: number
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  marks?: readonly SliderMark[]
  formatValue?: (value: number) => string
  size?: 'sm' | 'md'
  onValueChange?: (value: number) => void
  onValueCommit?: (value: number) => void
}
```

要求：

- 支持 pointer drag
- 支持 keyboard
- 支持 marks
- 支持 commit 回调
- 只做单值 slider，不做 range

使用范围：

- border thickness
- border opacity
- fill opacity

不用于 `font size`。

### 其他 UI 复用

直接复用：

- `@ui/Button`
- `@ui/Popover`
- `@ui/Menu`

不再继续扩 `wb-node-toolbar-button` / `wb-node-toolbar-chip` 为主的旧体系。

## Toolbar 具体面板

### 1. Shape Picker

交互：

- toolbar 上显示当前 shape icon
- 点击展开 shape picker panel

数据来源：

- `@whiteboard/core/node` 中 shape specs
- 可复用 toolbox 的 shape menu 数据

UI 形态：

- 分组网格
- `basic / flowchart / annotation`

不建议用纯文本 menu list。

### 2. Font Size

toolbar 上直接显示当前字号，例如 `16`。

点击展开：

- 顶部数值 input
- 底部 preset chips

建议 presets：

- `12`
- `14`
- `16`
- `18`
- `20`
- `24`
- `32`
- `48`

交互要求：

- 打开 panel 时自动选中当前值
- `Enter` 提交
- `blur` 提交
- `Escape` 回滚
- `ArrowUp / ArrowDown` 按 step 调整

### 3. Font Style

toolbar 直接提供两个 toggle：

- `bold`
- `italic`

不打开弹层。

本轮不做 underline。

### 4. Alignment

toolbar 直接提供三个 toggle：

- `left`
- `center`
- `right`

本轮不做 vertical align。

### 5. Text Color

点击展开 color swatch panel：

- palette grid

本轮不做自由颜色选择器。

### 6. Border Panel

参考 Miro 风格，但收敛为：

- style segmented
  - `solid`
  - `dashed`
  - `dotted`
- thickness slider
- opacity slider
- color swatch grid

这是一个普通 `Popover` 面板，不是简单 menu。

### 7. Fill Panel

收敛为：

- opacity slider
- color swatch grid

### 8. Lock

toolbar 直接 icon toggle。

### 9. More Menu

继续走 `@ui/Menu`。

可包含：

- duplicate
- delete
- bring forward
- send backward
- reset style

## 渲染层要求

shape 渲染需要正式支持：

- `fontWeight`
- `fontStyle`
- `textAlign`
- `strokeDash`
- `strokeOpacity`
- `fillOpacity`

这意味着：

- shape label DOM 样式需要补齐 typography 字段
- shape SVG 需要输出 `strokeDasharray`
- shape fill/stroke opacity 不能再依赖整体 node opacity

## 组件拆分建议

whiteboard React 层建议拆为：

### 顶层

- `NodeToolbar.tsx`

职责：

- 作为唯一 toolbar shell
- 判断当前 selection 是否进入 shape toolbar 模式
- 管理 active panel key
- 管理 toolbar anchor

### model

- `shapeToolbarModel.ts`

职责：

- 从 selection / node / schema 读取 shape toolbar 状态
- 输出 toolbar 需要展示的状态、mixed 值与 capability

### panels

- `ShapePickerPanel.tsx`
- `FontSizePanel.tsx`
- `TextColorPanel.tsx`
- `BorderPanel.tsx`
- `FillPanel.tsx`
- `ShapeMoreMenu.tsx`

### toolbar 内联操作

不单独拆 panel：

- `bold`
- `italic`
- `alignment`
- `lock`

## 实施顺序

按下面顺序落地，风险最低：

### 第一阶段：数据与命令

1. 补 style 字段
2. 补 editor 命令
3. 补 schema / summary / model 读取

### 第二阶段：渲染

1. shape label 支持 typography
2. shape SVG 支持 dash / strokeOpacity / fillOpacity

### 第三阶段：UI 基础组件

1. 新增 `@ui/slider`
2. 补必要的 panel 内部基础结构

### 第四阶段：shape toolbar

1. 先支持单选 shape
2. 再支持多选 shape
3. 最后替换旧 toolbar 中 shape 相关入口

## 验收标准

### 功能

- 单选 shape 时出现新 toolbar
- 可切换 shape kind
- 可调整 font size
- 可切换 bold / italic
- 可切换 left / center / right
- 可调整 text color
- 可调整 border style / width / opacity / color
- 可调整 fill opacity / fill color
- 可 lock / unlock

### 协议

- 不再使用整体 `style.opacity` 表达 border/fill opacity
- border style 统一收敛为 `strokeDash`
- 所有 toolbar 操作都有正式 editor 命令

### 架构

- 弹层统一使用 `@ui`
- `shapeToolbarModel` 独立存在
- React toolbar 不直接拼 document patch

## 明确结论

这次 shape toolbar 的长期最优方案是：

- toolbar 只做 shape family
- `NodeToolbar` 保持唯一 shell
- 命令层先补齐
- style 字段先收敛
- `@ui/slider` 先进入 UI 基础层
- toolbar 和 panel 再正式落地

不接受以下方向：

- 继续在旧 `wb-node-toolbar-*` 体系上补功能
- 用 `style.opacity` 冒充 border 或 fill opacity
- 新增 `borderStyle` 这类只服务单个 toolbar 的中层字段
- React 层直接 patch 数据绕过 editor 命令
- 为 shape toolbar 再套一层 `ShapeNodeToolbar.tsx` 做无意义转发
