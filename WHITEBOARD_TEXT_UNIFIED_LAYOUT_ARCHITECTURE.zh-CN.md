# Whiteboard Text 统一布局长期方案

## 1. 结论

普通 `text` 应该成为整个白板文本系统的基准模型。

长期最优方案不是给 `mindmap root`、`child topic`、`sticky`、`shape label` 分别补特例，而是先把普通 `text` 的语义收成一条中轴，再让其他文本类节点按能力复用它。

唯一正确且长期最稳的模型是：

- `text` 的 authored 输入只描述文本内容、排版模式和视觉样式
- `text.size` 永远表示最终外框的 `border-box` 尺寸
- `text` 的外框尺寸由 editor 统一通过 layout service 计算并写回 document
- React 只提供 DOM 测量 backend，不直接决定 document 何时写回
- `mindmap topic` 本质上就是 owned `text node`
- `sticky` 不是另一套 text size 系统，而是同一条 layout 中轴里的 `fit` 变体

一句话总结：

**普通 `text` 负责“内容决定外框”，所有其他文本节点都只能在这条中轴上做受控变体，不能再各自发明尺寸语义。**

---

## 2. 设计目标

这套方案只追求五件事：

1. 普通 `text`、`mindmap topic`、`sticky` 的布局语义一致。
2. display / edit / transform / toolbar 改字重字号都走同一条 layout 入口。
3. `node.size` 的语义固定，不再在内容盒、外框盒、临时盒之间来回漂移。
4. 初始创建、编辑中预览、commit 后持久态三阶段结果一致。
5. 复杂度尽量压到 editor 中轴，React 不做业务判断。

明确不做的事：

- 不在 renderer 里 `useEffect + patch document`
- 不让 toolbar 自己修正 text 尺寸
- 不让 mindmap 单独维护一套 topic width 规则
- 不让 edit host 切换时顺带触发 geometry 写回
- 不再把 bootstrap size 当 steady-state 语义

---

## 3. 普通 Text 的最终模型

## 3.1 authored 与 computed

普通 `text` 的 authored 输入应只有这些：

- `position`
- `rotation`
- `data.text`
- `data.widthMode`
- `data.wrapWidth`
- `style.fontSize`
- `style.fontWeight`
- `style.fontStyle`
- `style.paddingX`
- `style.paddingY`
- `style.strokeWidth`
- `style.frameKind`
- `style.minWidth`
- `style.maxWidth`

普通 `text` 的 computed 输出只有一个：

- `size`

这里必须把语义写死：

```ts
type TextSize = {
  width: number
  height: number
}
```

并且：

- `width` 是最终外框宽度
- `height` 是最终外框高度
- 不是内容盒宽高
- 不是纯文本自然宽高
- 不是“未加 padding 的内部测量值”

也就是说：

**用户看到的 node 框多大，`node.size` 就多大。**

## 3.2 `widthMode`

普通 `text` 只保留两种宽度模式：

```ts
type TextWidthMode = 'auto' | 'wrap'
```

语义如下：

- `auto`
  - 宽度由内容决定
  - 高度由内容决定
  - 结果写回 `node.size`
- `wrap`
  - `data.wrapWidth` 是 authored 外框宽度
  - 高度由内容决定
  - 结果写回 `node.size`

这里建议明确：

**`wrapWidth` 表示外框宽度，不表示内容盒宽度。**

这样所有 UI 和交互都更直观：

- 拖拽左右 handle 改的是 node 看起来的总宽度
- document 里存的也是 node 看起来的总宽度
- layout 内部再去扣掉 padding / border 计算内容盒

## 3.3 `minWidth` / `maxWidth`

`style.minWidth` 和 `style.maxWidth` 可以保留，但必须只作为 layout clamp 的 authored visual constraint，而不是另一套布局来源。

也就是：

```ts
resolvedOuterWidth = clamp(
  measuredOuterWidth,
  style.minWidth,
  style.maxWidth
)
```

注意：

- `minWidth` 不是 fallback size
- `minWidth` 不是 bootstrap size
- `minWidth` 不是 mindmap 专属规则
- `minWidth` 必须在 display、edit、commit 三阶段都一致生效

---

## 4. 最简统一语义

## 4.1 普通 Text

普通 `text` 的唯一规则：

**内容和排版输入决定最终外框。**

公式可以统一成：

```ts
contentBoxWidth = resolveContentWidth(widthMode, wrapWidth, measuredLineWidth)
contentBoxHeight = measureWrappedTextHeight(contentBoxWidth)
outerWidth = clamp(contentBoxWidth + horizontalInsets, minWidth, maxWidth)
outerHeight = contentBoxHeight + verticalInsets
```

其中：

- `horizontalInsets = paddingLeft + paddingRight + borderLeft + borderRight`
- `verticalInsets = paddingTop + paddingBottom + borderTop + borderBottom`

最关键的是：

- auto 模式和 wrap 模式只是“内容盒宽度来源”不同
- 最终都必须归一到“输出外框尺寸”

## 4.2 Mindmap Topic

`mindmap topic` 不应该再有自己的 text width 语义。

它本质上就是：

- `type: 'text'`
- `mindmapId: string`
- `position` 由 mindmap layout 驱动
- `style` 来自 mindmap rule
- `size` 仍然来自普通 text layout 中轴

唯一不同的是：

- `position` 不是用户自由拖拽结果，而是树布局结果

除此之外：

- 初始宽度
- 编辑态宽度
- 非编辑态宽度
- selection box
- toolbar
- measure
- commit

都必须和普通 `text` 完全一致。

如果 `mindmap` 需要胶囊节点更宽，那也只能通过 `style.minWidth` 表达，而不能另起一套 fallback/template/bootstrap 宽度规则。

## 4.3 Sticky

`sticky` 不是“内容决定外框”，而是“外框决定字号”。

所以 `sticky` 不复用普通 `text` 的输出字段，但复用同一个 layout 中轴：

- 普通 `text`: `layout.kind = 'size'`
- `sticky`: `layout.kind = 'fit'`

`sticky` 的 authored 输入：

- `position`
- `rotation`
- `size`
- `data.text`
- `data.fontMode`
- `style.fontWeight`
- `style.fontStyle`
- `style.fontSize` 在 `fixed` 模式下是 authored

`sticky` 的 computed 输出：

- `style.fontSize` 在 `auto` 模式下由 layout 写回

这说明：

- `sticky` 和 `text` 不是两套系统
- 它们只是同一个 layout service 的两个方向

---

## 5. 统一中轴分层

## 5.1 Core

`core` 只负责定义文本布局语义，不负责何时测量。

`core` 里最适合保留的能力：

- 文本 frame inset 解析
- widthMode / wrapWidth 读取与写入
- clamp 规则
- 从 authored 数据构造 layout input
- 从 layout result 构造 `node.size` patch

推荐的最小 API：

```ts
export type TextLayoutInput = {
  nodeId: string
  text: string
  widthMode: 'auto' | 'wrap'
  wrapWidth?: number
  fontSize: number
  fontWeight?: number | string
  fontStyle?: string
  frame: {
    paddingTop: number
    paddingRight: number
    paddingBottom: number
    paddingLeft: number
    borderTop: number
    borderRight: number
    borderBottom: number
    borderLeft: number
  }
  minWidth?: number
  maxWidth?: number
}

export type TextLayoutResult = {
  size: {
    width: number
    height: number
  }
}
```

再配一组短 helper：

```ts
export const readTextLayoutInput
export const buildTextLayoutPatch
export const shouldPatchTextLayout
```

职责应该很清晰：

- `readTextLayoutInput(node)` 从 node 读 authored 布局输入
- `buildTextLayoutPatch(node, result)` 产出标准 `size` patch
- `shouldPatchTextLayout(node, result)` 判定是否真的要写回

## 5.2 Editor

`editor` 是整个文本布局系统的唯一调度层。

它负责：

- 何时请求 layout
- 何时只更新 local draft
- 何时写回 document
- transform / toolbar / edit 是否需要触发布局
- 给 query/read 提供投影后的 live rect

editor 里应该只保留一个统一 runtime：

```ts
type LayoutRuntime = {
  syncNode(nodeId: NodeId): NodeUpdateInput | undefined
  patchNodeUpdate(nodeId: NodeId, update: NodeUpdateInput): NodeUpdateInput
  editNode(input: {
    nodeId: NodeId
    field: 'text'
    text: string
  }): {
    size?: Size
    fontSize?: number
    wrapWidth?: number
  } | undefined
  resolvePreviewPatches(
    patches: readonly TransformPreviewPatch[]
  ): readonly TransformPreviewPatch[]
}
```

原则如下：

- 只要 authored 输入变化，editor 决定是否触发 layout
- 只要是 edit draft，先写 local，不写 document
- 只要是 commit，再把最终 computed 写回 document
- 只要是 transform preview，就走 preview patch，不碰 committed doc

## 5.3 React

React 不负责业务决策，只负责 Web 平台测量 backend。

它只需要提供：

- 文本 source element 注册
- DOM typography 读取
- 文本测量实现

最小职责：

```ts
type LayoutBackend = {
  measure(request: LayoutRequest): LayoutResult | undefined
}
```

React 不应该做的事：

- source 绑定时自动 `syncNode`
- edit host 切换时自动 patch document
- 根据组件生命周期决定 node 几何

---

## 6. display / edit / transform 的统一规则

## 6.1 Display

display 只读取 committed node：

- `node.data.text`
- `node.size`
- `node.style`

如果当前 node 正在编辑，则 editor query 再叠加 local draft projection。

display 自己不测量，不写 document。

## 6.2 Edit

进入编辑态时：

1. 读取 committed node
2. 构造 draft text
3. editor 调用 layout runtime 测量 draft size
4. 将 draft `text` 和 draft `size` 放入 local edit state
5. query 侧把 draft 结果投影到当前 node rect

也就是说：

- 编辑态宽度变化必须来自 editor local draft
- 不能来自 renderer 自己偷偷改 DOM 外框
- 更不能来自 source host 切换时的额外 patch

## 6.3 Transform

文本 transform 也必须统一：

- 左右 resize
  - 进入 `wrap`
  - 更新 `wrapWidth`
  - layout runtime 重新算高度
- 四角 scale
  - 更新字号
  - 如果起始为 `wrap`，同步更新 `wrapWidth`
  - layout runtime 重新算 `size`
- preview 只更新 preview patch
- commit 才写 document

普通 `text` 不应该再出现“拖拽时一套尺寸、提交后一套尺寸”。

---

## 7. 初始创建的正确语义

这是当前最容易出错的地方。

长期最优规则应该是：

- 创建普通 `text`
  - 先写 authored 字段
  - 若运行时有 layout backend，则立刻测量一次并写入最终 `size`
  - 若当下没有 backend，允许暂用 bootstrap size，但首次 `layout.sync` 后必须收敛到真实尺寸
- 创建 `mindmap topic`
  - 只继承 style，不继承 template size
  - 用当前文本内容跑一遍同一个 text layout
  - 得到 `size` 后再参与树布局

这里要明确：

**bootstrap size 只能是兜底，不是设计语义。**

否则就一定会出现：

- 初始很宽
- 进入编辑又变窄
- 脱离编辑又弹回去

---

## 8. DOM 与 CSS 的长期最简模型

普通 `text` 的 DOM 应尽量简化为：

```html
<div class="wb-node-block">
  <div class="wb-text-host"></div>
</div>
```

职责分工：

- `wb-node-block`
  - 负责外框尺寸、背景、边框、圆角、padding、overflow
- `wb-text-host`
  - 只负责文本渲染
  - display / edit 共用同一个 host
  - 编辑时只切换 `contenteditable`

CSS 规则也应尽量朴素：

```css
.wb-node-block {
  box-sizing: border-box;
  overflow: hidden;
}

.wb-text-host {
  display: block;
  margin: 0;
  padding: 0;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: break-word;
  outline: none;
}
```

应避免继续依赖：

- `height: 100%`
- `min-height: 100%`
- 额外 viewport/content 双层包裹
- display host / edit host 双宿主切换

这些结构很容易把 `size` 语义重新带偏。

---

## 9. 为什么这是最复用、最通用、最简单的方案

因为它只要求系统记住一件事：

**文本节点的最终布局结果，由 editor 用统一 layout service 产出；document 里保存这个结果；renderer 只负责显示。**

这套模型的复用性最高：

- 普通 `text` 直接用
- `mindmap topic` 直接用
- edge label 以后也可以按同一输入模型做 local measurement
- `shape label` 如果未来需要自动适配，也可以挂到同一个 runtime
- `sticky` 只是在同一 runtime 里换成 `fit`

这套模型的复杂度最低：

- 一个 layout runtime
- 一个 layout backend
- 一套 authored/computed 语义
- 一种 text host

这套模型的长期稳定性最好：

- 没有 host 切换副作用
- 没有 toolbar 补丁职责
- 没有 mindmap 特殊尺寸系统
- 没有 bootstrap/fallback 被误用成持久语义

---

## 10. 最终实施准则

后续实现必须遵守以下规则：

1. 普通 `text` 的 `size` 永远表示最终外框尺寸。
2. `wrapWidth` 永远表示最终外框宽度。
3. `minWidth` / `maxWidth` 只是统一 layout clamp，不是独立布局来源。
4. `mindmap topic` 复用普通 `text` 的布局语义，不再维护单独宽度系统。
5. `sticky` 复用同一个 layout 中轴，但输出是 `fontSize` 而不是 `size`。
6. 所有 computed 写回都由 editor 统一触发。
7. React 只提供测量 backend，不直接决定何时 patch document。
8. 初始创建不允许继承陈旧 `size` 作为 steady-state 语义。

如果后续出现新的文本类节点，也应先判断它属于哪一类：

- 内容决定外框：接入 `size`
- 外框决定字号：接入 `fit`
- 都不是：`none`

不要再新增第四套文本布局机制。
