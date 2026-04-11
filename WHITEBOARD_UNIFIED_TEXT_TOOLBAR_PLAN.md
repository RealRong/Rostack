# Whiteboard 文本编辑统一 Toolbar 方案

## 目标

这份方案只解决一个明确问题：

- `shape / text / sticky` 进入编辑态后，toolbar 不应该切成另一套内容

在当前产品约束下：

- 没有文本局部样式能力
- 没有选中一段文字单独加粗、改颜色、改单段对齐
- 文本样式始终是 node 级或 edge label 级样式

因此长期最优不是 `edit-aware toolbar`，而是更简单的一种：

- 只保留一套 node toolbar
- toolbar 完全基于当前 selection
- 进入编辑态不切 toolbar
- toolbar 上的样式操作全部直接 commit
- `EditSession` 只负责文本输入，不负责样式草稿

一句话：

- 统一 toolbar surface
- 统一 selection-based context
- 样式修改直接写 document

## 当前问题的本质

现在的实现里，node 文本相关操作实际上分成了两条互相独立的产品链路：

1. 选中态 toolbar
- 来源：`SelectionToolbarContext`
- 读取位置：[selectionPresentation.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/read/selectionPresentation.ts)
- 渲染位置：[NodeToolbar.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/selection/chrome/NodeToolbar.tsx)
- recipe 位置：[recipe.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/selection/chrome/toolbar/recipe.ts)

2. 编辑态 toolbar
- 来源：`EditorTextToolbarPresentation`
- 读取位置：[createEditor.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/editor/createEditor.ts)
- 类型位置：[editor.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/types/editor.ts)
- 渲染位置：[TextStyleToolbar.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/selection/chrome/TextStyleToolbar.tsx)

而且当前 `selection toolbar` 在进入编辑态后会被直接关闭：

- [selectionPresentation.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/read/selectionPresentation.ts)
- `resolveSelectionToolbar(...)` 里有 `edit !== null` 就 `return undefined`

这意味着：

- 进入编辑态时 toolbar surface 会切换
- toolbar anchor 会重建
- active panel 会丢失
- recipe 会切换到另一套规则
- `shape / text / sticky` 的内容和按钮逻辑不再来自同一模型

所以现在的“toolbar 内容不一致”不是按钮配置问题，而是架构层面定义了两套产品模型。

## 为什么不需要 `edit-aware`

这里最关键的一点是：

- 你们现在没有文本内部局部样式能力

这决定了 toolbar 的样式操作语义不是：

- 修改当前编辑器中某一段文字的临时 draft style

而是：

- 修改当前对象的整体样式

例如：

- 改字号
- 改粗细
- 改斜体
- 改文本颜色
- 改背景色

这些动作的真实含义都是：

- patch 当前 node 或 edge label 的 committed style

所以长期最优不应该是：

- selection toolbar 一套
- edit toolbar 一套
- edit draft style 一套

而应该是：

- toolbar 永远只服务当前 selection
- 编辑态只负责文本输入
- 样式按钮直接 commit

## 最终原则

### 1. 只保留一套 node toolbar surface

最终只保留：

- `NodeToolbar`

删除：

- `TextStyleToolbar`

`shape / text / sticky / frame title` 进入编辑态后，仍然使用同一块 toolbar surface。

### 2. toolbar 只基于 selection，不基于 edit session

toolbar 的 context 不需要感知：

- 当前是不是在编辑
- 当前是不是 draft style

toolbar 只需要感知：

- 当前选中了谁
- 当前对象支持哪些能力
- 当前 committed style 值是什么

进入编辑态后：

- toolbar 不隐藏
- toolbar 不切换
- toolbar 当前值仍然来自当前 selection 对象

### 3. 编辑态只影响文本输入，不影响样式控制模型

`EditSession` 长期只应该负责：

- 当前谁在编辑
- 编辑的是 `text / title / edge label`
- 当前 draft text
- caret
- composing
- 必要的 live layout
- commit / cancel

不应该继续负责：

- 样式草稿
- toolbar tools
- toolbar values

### 4. toolbar 样式操作全部 direct commit

只要 toolbar 上点的是对象级样式：

- `fontSize`
- `fontWeight`
- `fontStyle`
- `textAlign`
- `textColor`
- `fill`

就应该直接写 committed document。

也就是说：

- 选中态点字号，直接改 node style
- 编辑态点字号，也直接改 node style

并不需要引入一套 “edit draft style”。

## 推荐架构

## 1. 用单一 `nodeToolbar` 取代 `selectionToolbar + textToolbar`

当前 panel 模型中有：

- `selectionToolbar`
- `edgeToolbar`
- `textToolbar`

长期最优应该改成：

- `nodeToolbar`
- `edgeToolbar`

其中：

- `nodeToolbar` 同时覆盖普通选中态和文本编辑态
- `edgeToolbar` 继续独立

`nodeToolbar` 只描述当前 selection 的 committed presentation，不再引入 edit overlay。

## 2. `nodeToolbar` 的 context 结构

建议最终统一成一个短命名结构：

```ts
type NodeToolbarContext = {
  box: Rect
  key: string
  kind: 'shape' | 'text' | 'sticky' | 'frame' | 'draw' | 'group' | 'mixed'
  nodeIds: readonly NodeId[]
  nodes: readonly Node[]
  primary?: Node
  filter?: {
    label: string
    types: readonly SelectionNodeTypeInfo[]
  }
  caps: {
    shapeKind: boolean
    fontSize: boolean
    fontWeight: boolean
    fontStyle: boolean
    textAlign: boolean
    textColor: boolean
    fill: boolean
    fillOpacity: boolean
    stroke: boolean
    strokeOpacity: boolean
    strokeDash: boolean
    opacity: boolean
    lock: boolean
    more: boolean
  }
  values: {
    shapeKind?: ShapeKind
    fontSize?: number
    fontWeight?: number
    fontStyle?: 'normal' | 'italic'
    textAlign?: 'left' | 'center' | 'right'
    textColor?: string
    fill?: string
    fillOpacity?: number
    stroke?: string
    strokeWidth?: number
    strokeOpacity?: number
    strokeDash?: readonly number[]
    opacity?: number
    locked: SelectionNodeInfo['lock']
  }
}
```

关键点：

- 没有 `mode`
- 没有 `target`
- 没有 `session overlay`
- 这就是一份纯 selection toolbar context

## 3. toolbar action 统一经过 `editor.actions.toolbar.*`

虽然 toolbar context 不需要 edit-aware，但 toolbar React 组件仍然不应该自己散落写 patch。

建议新增统一动作：

```ts
editor.actions.toolbar.setFontSize(value)
editor.actions.toolbar.setFontWeight(value)
editor.actions.toolbar.toggleItalic()
editor.actions.toolbar.setTextAlign(value)
editor.actions.toolbar.setTextColor(value)
editor.actions.toolbar.setFill(value)
editor.actions.toolbar.setFillOpacity(value)
editor.actions.toolbar.setStroke(input)
editor.actions.toolbar.setOpacity(value)
editor.actions.toolbar.setShapeKind(value)
```

这些 action 的语义统一是：

- 作用于当前 selection
- 直接 patch committed document

不要再让 toolbar item 各自判断：

- 当前是否在 edit
- 当前要不要写 draft

因为长期已经不需要那条分支。

## 4. 编辑态文本宿主必须稳定挂载

这里要特别说明一个实现原则：

虽然 toolbar 样式操作直接 commit，但不代表编辑宿主可以被重建。

必须保证：

- 你在编辑 `text / sticky / shape`
- 点击 toolbar 改字号或颜色
- 当前 `contentEditable` 宿主不卸载
- caret 和 composition 不丢

也就是说：

- 样式直接 commit
- DOM 宿主稳定存在
- editable 只响应样式更新

这才是正确的实现方式。

## recipe 如何处理

当前 [recipe.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/selection/chrome/toolbar/recipe.ts) 的问题不是“有 recipe”，而是产品上叠了第二套 `TextStyleToolbar`。

长期应保留 recipe 机制，但只保留一套：

- `shape`
- `text`
- `sticky`
- `frame`
- `draw`
- `group`
- `mixed`

recipe 的作用只应该是：

- 决定 toolbar 布局模板
- 再由 capability 过滤真实可见项

它不应该再参与：

- 编辑态/非编辑态切换

## 必须删除的旧实现

这部分必须明确，不做兼容，不保留过渡层。

### 1. 删除独立 `textToolbar` presentation

删除：

- [createEditor.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/editor/createEditor.ts) 里 `textToolbar` derived store
- [editor.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/types/editor.ts) 里的 `EditorTextToolbarPresentation`
- [editor.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/types/editor.ts) 里的 `panel.textToolbar`

### 2. 删除独立 `TextStyleToolbar`

删除：

- [TextStyleToolbar.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/selection/chrome/TextStyleToolbar.tsx)

原因很简单：

- 它本质上就是“第二套 node toolbar”

### 3. 删除 `EditSession` 里的样式草稿与工具定义

删除：

- `EditStyleDraft`
- `draft.style`
- `initial.style`
- `mutate.style(...)`
- `edit.capabilities.tools`

保留：

- 文本内容草稿
- caret
- composing
- live layout

### 4. 删除 `resolveSelectionToolbar` 中的 `edit !== null` 短路

删除：

- [selectionPresentation.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/read/selectionPresentation.ts)
- `resolveSelectionToolbar(...)` 里因为 edit session 存在就直接隐藏 toolbar 的逻辑

## 新的 API 设计

命名目标：

- 短
- 清晰
- 按命名空间分组

## runtime read

```ts
editor.select.panel().nodeToolbar
editor.select.panel().edgeToolbar
```

删除：

```ts
editor.select.panel().selectionToolbar
editor.select.panel().textToolbar
```

## runtime actions

```ts
editor.actions.toolbar.setFontSize(value)
editor.actions.toolbar.setFontWeight(value)
editor.actions.toolbar.toggleItalic()
editor.actions.toolbar.setTextAlign(value)
editor.actions.toolbar.setTextColor(value)
editor.actions.toolbar.setFill(value)
editor.actions.toolbar.setFillOpacity(value)
editor.actions.toolbar.setStroke(input)
editor.actions.toolbar.setOpacity(value)
editor.actions.toolbar.setShapeKind(value)
```

说明：

- `toolbar.*` 只负责“作用于当前 selection 并直接 commit”
- 不暴露 draft/commit 分支

## editor 内部 read

建议内部统一为：

```ts
read.node.toolbar
read.edge.toolbar
```

删除内部旧语义：

```ts
read.selection.toolbar
textToolbar
```

这里不是说 selection 概念被删除，而是：

- toolbar 是一个独立 read 模型
- 它内部当然仍然依赖 selection
- 但对外不再暴露成 `selectionToolbar`

## 分阶段实施方案

## 阶段 1. 统一 surface

目标：

- 先只保留 `NodeToolbar`
- 让编辑态继续显示 node toolbar

动作：

- 删 `TextStyleToolbar`
- 删 `textToolbar`
- 去掉 `resolveSelectionToolbar(...)` 中 `edit !== null` 的短路
- 让 `NodeToolbar` 成为唯一入口

阶段完成标准：

- `shape / text / sticky` 进入编辑态时，不再切另一条 toolbar

## 阶段 2. 删 edit style draft

目标：

- 文本编辑 session 不再维护样式草稿

动作：

- 删除 `EditStyleDraft`
- 删除 `edit.capabilities.tools`
- 删除 `editor.actions.edit.style`
- 所有 toolbar 样式操作改成 direct commit

阶段完成标准：

- edit session 只剩文本输入职责

## 阶段 3. 统一 toolbar context

目标：

- 用 `nodeToolbar` 取代 `selectionToolbar`

动作：

- 统一 context 类型
- `NodeToolbar` 只消费一份 selection-based context
- `recipe` 只按 selection kind + capability 工作

阶段完成标准：

- toolbar runtime 模型只剩一套

## 阶段 4. 收敛 actions

目标：

- React toolbar 不直接 patch document

动作：

- 增加 `editor.actions.toolbar.*`
- 按当前 selection 做统一 committed patch

阶段完成标准：

- toolbar item 只表达 UI，不表达写入策略

## 最终结论

在“不支持文本局部样式”的前提下，长期最优非常明确：

- 不要 `edit-aware toolbar`
- 不要 `textToolbar`
- 不要 `TextStyleToolbar`
- 不要 `EditSession.style draft`

而应该是：

- 只保留一套 `nodeToolbar`
- toolbar 完全基于 selection
- 进入编辑态不切 surface
- toolbar 样式操作全部 direct commit
- `EditSession` 只负责文本内容输入

这样做以后：

- `shape / text / sticky` 进入编辑态不会再像“换了个产品”
- toolbar 位置和内容稳定
- runtime 模型明显更简单
- React 层复杂度也会下降
