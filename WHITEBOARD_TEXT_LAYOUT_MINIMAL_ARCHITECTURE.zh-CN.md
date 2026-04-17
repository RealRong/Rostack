# Whiteboard Text Layout 最终最简架构

## 1. 结论

本文档作为 `text` / `mindmap root topic` / 其他 framed text node 的最终实施依据，替代旧的零散修补方案。

当前 `text` / `mindmap root topic` 的核心问题，不是某一个 CSS 细节，而是系统里同时存在多套尺寸语义：

- 有的路径把 `node.size` 当内容盒
- 有的路径把 `node.size` 当外框盒
- edit draft 又临时修正成第三种结果

于是会出现：

- 编辑态宽高正确
- 脱离编辑态后宽高又错
- `wb-text-node-viewport` 高度被压成 `0px`
- `mindmap` root 在显示态和编辑态之间跳变

长期最优方案必须一步到位收敛成一条中轴：

**`text.size` 永远表示最终外框的 border-box size。**

并且：

- display 与 edit 共用一个 text host
- CSS 不再依赖 `height: 100% / min-height: 100%`
- measure 直接产出外框尺寸
- document 写回只由 editor 驱动

这条线复杂度最低，也最不容易出错。

---

## 2. 当前问题的本质

以 mindmap root 为例，当前 root topic 可能有：

- `paddingY: 10`
- `paddingX: 18`
- `strokeWidth: 2`
- `frameKind: ellipse`

如果 committed `node.size.height = 20`，renderer 又把这个 `20` 当成外框总高度，那么：

- 外框总高只有 `20`
- 但光上下 padding 就要 `20`
- 再加上下 border `4`

内容盒高度必然被压成 `0`

于是：

- `.wb-text-node-viewport { height: 100% }` 最终拿到 `0px`
- 编辑态如果走 draft size，会暂时正确
- 显示态回到 committed size，又立即错

这说明问题不是“某个节点特殊”，而是：

**同一个 `size` 字段被不同路径解释成了不同语义。**

---

## 3. 最终目标

最终要达到的行为非常明确：

1. `text` 的 committed `size` 永远就是最终外框大小。
2. 任何 frame/padding/stroke 都必须被 layout 计算进 `size`。
3. display 和 edit 不再切换 text 宿主 DOM。
4. `mindmap root topic` 与普通 `text` 完全同模，只是拖拽策略不同。
5. React 不再把“source host mounted”错误地当成“该写 document”。

---

## 4. 唯一正确的数据语义

## 4.1 `text`

`text` 的 authored inputs：

- `data.text`
- `style.fontSize`
- `style.fontWeight`
- `style.fontStyle`
- `data.widthMode`
- `data.wrapWidth`
- `style.paddingX`
- `style.paddingY`
- `style.strokeWidth`
- `style.frameKind`
- `position`
- `rotation`

`text` 的 computed output：

- `size`

这里的 `size` 语义必须被严格写死为：

```ts
type TextNodeSize = {
  width: number  // 最终外框 border-box 宽度
  height: number // 最终外框 border-box 高度
}
```

也就是说：

- `size` 不是内容盒尺寸
- `size` 不是纯文本行高尺寸
- `size` 不是“未加 padding 的测量值”

它就是用户最终看到的那个 node 外框。

## 4.2 `wrapWidth`

为了避免再次分裂语义，最终建议：

- `data.wrapWidth` 也表示最终外框宽度

而不是内容盒宽度。

这样一来：

- authored 的是 node 外框宽
- computed 的是 node 外框高

这套模型对用户和代码都最直观。

## 4.3 内容盒不持久化

内容盒宽高只在 layout 内部临时推导：

```ts
contentWidth = outerWidth - horizontalInsets
contentHeight = measureTypography(...)
outerHeight = contentHeight + verticalInsets
```

内容盒永远不写入 document。

---

## 5. 最简 DOM 结构

最终 `text` DOM 应只保留两层：

```html
<div class="wb-node-block">
  <div class="wb-text-host"></div>
</div>
```

## 5.1 `wb-node-block`

职责：

- 位置
- 宽高
- 背景
- 边框
- 圆角
- padding
- overflow

它就是最终外框。

## 5.2 `wb-text-host`

职责：

- 只负责文本内容本身
- display / edit 共用同一个宿主
- 编辑时只切换 `contenteditable`
- 不再在 display 与 edit 之间切换 DOM host

这是最关键的长期简化点之一。

## 5.3 不再需要的结构

长期最优中，下面这些层应该删除或合并：

- `wb-text-node-viewport`
- `wb-text-node-content`
- display `<div>` 与 edit `<EditableSlot>` 的双宿主结构

如果 display/edit 继续各自挂一个 host，就会持续带来：

- focus/caret 抖动
- IME 失稳
- source ref 重绑
- 绑定时机驱动错误的 layout.sync

所以最终应明确：

**text host 只能有一个。**

---

## 6. 最简 CSS 模型

## 6.1 外层 `wb-node-block`

推荐语义：

```css
.wb-node-block {
  box-sizing: border-box;
  overflow: hidden;
}
```

它接收：

- `width`
- `height`
- `padding`
- `border`
- `border-radius`
- `background`

这些全部来自 node style + node size。

## 6.2 内层 `wb-text-host`

推荐语义：

```css
.wb-text-host {
  display: block;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: break-word;
}
```

只管文本内容，不负责布局盒子。

## 6.3 明确禁止的 CSS 方向

长期最优里应明确避免这些写法：

- `height: 100%`
- `min-height: 100%`
- `max-height: 100%`
- 依赖父内容盒高度的 text host

原因很简单：

- text node 的高度应由 layout 预先保证
- 而不是靠 CSS 在渲染期去补

一旦依赖 `100%`，只要父内容盒语义再出一次错，文本区就会直接塌成 `0px`。

---

## 7. 最简 Measure 设计

measure 必须直接产出最终外框尺寸，不再只量内容盒。

最终推荐的核心 API：

```ts
type TextFrameInsets = {
  paddingTop: number
  paddingRight: number
  paddingBottom: number
  paddingLeft: number
  borderTop: number
  borderRight: number
  borderBottom: number
  borderLeft: number
}

type MeasureTextOuterSizeInput = {
  text: string
  placeholder: string
  typography: {
    fontSize: number
    fontWeight?: number | string
    fontStyle?: string
  }
  widthMode: 'auto' | 'wrap'
  outerWrapWidth?: number
  frame: TextFrameInsets
}

type MeasureTextOuterSizeResult = {
  width: number
  height: number
}
```

内部公式只有一套：

```ts
horizontalInsets =
  paddingLeft + paddingRight + borderLeft + borderRight

verticalInsets =
  paddingTop + paddingBottom + borderTop + borderBottom

contentWidth =
  widthMode === 'wrap'
    ? outerWrapWidth - horizontalInsets
    : autoMeasure(...)

contentHeight =
  measureTypography(contentWidth)

outerWidth =
  widthMode === 'wrap'
    ? outerWrapWidth
    : contentWidth + horizontalInsets

outerHeight =
  contentHeight + verticalInsets
```

这就是全部。

## 7.1 不要再测内容尺寸后让 renderer 猜外框

这是当前最大的问题来源之一。

必须明确禁止：

- measure 返回 content size
- renderer 自己加 padding/border 猜 node size

因为这样会导致：

- editor 路径和 react 路径各算一遍
- committed 和 draft 再次分裂

正确模型只有一条：

**layout backend 直接返回 outer size。**

---

## 8. Editor / React 职责边界

## 8.1 editor

editor 是唯一布局协调者，负责：

- 何时测量
- 何时只更新 local draft
- 何时写回 committed document
- edit / transform / toolbar / command 统一走同一条 layout runtime

## 8.2 react

react 只负责：

- 提供单一 text host
- 提供 DOM typography measurement backend
- 提供 contenteditable 能力

react 不负责：

- document patch
- 布局提交时机
- source mount 时自动同步 size

## 8.3 明确禁止的旁路

下面这些都应视为错误方向：

- `bindRef -> layout.sync`
- `editable mounted -> patch document`
- `display host -> edit host` 切换时自动测量并写回
- renderer 里 `useEffect(() => patchNode(...))`

这些都是视图生命周期，不是布局语义事件。

---

## 9. Display / Edit 的最终统一模型

这是长期最优里最重要的一条。

## 9.1 最终目标

display 和 edit 共用一个 `wb-text-host`。

它们只在下面几点不同：

- 是否 `contenteditable`
- 是否允许 text selection / caret
- placeholder 展示逻辑

除此之外：

- 同一个 DOM
- 同一套 CSS
- 同一套 box model
- 同一套 layout size

## 9.2 为什么这是最优解

这样能一次性消除：

- focus 抖动
- caret 丢失
- IME 输入后不可见
- host rebind 引发的 source store 变化
- 进入编辑或退出编辑时的 layout 跳变

如果继续保留 display host / edit host 双宿主，问题只会不断换形态复发。

---

## 10. 与 mindmap 的关系

## 10.1 root topic 与 child topic

在这套模型下：

- root topic 就是普通 `text`
- child topic 也是普通 `text`

唯一差异仍然只有：

- drag policy

也就是：

- root body drag -> move whole tree
- child body drag -> subtree drag

除此之外：

- edit
- toolbar
- selection box
- layout
- DOM

都必须和普通 `text` 完全一致。

## 10.2 branch 不参与

branch 继续保持：

- 纯视觉
- 不参与 pick
- 不参与 layout 语义

这样 mindmap 就不会再次把 text layout 搞复杂。

---

## 11. sticky / shape 如何统一但不混乱

统一的应该是：

- text host
- typography measure backend
- editor layout runtime

不统一的应该是：

- 谁驱动外框
- 谁驱动字号

## 11.1 `text`

- 内容决定外框
- 输出 `size`

## 11.2 `sticky`

- 外框 authored
- 内容决定字号
- 输出 `fontSize`

## 11.3 `shape`

- 外框 authored
- 当前 label 不反推外框
- 如未来要 fit，也应走同一条 layout backend，不新增 shape 专属旁路

这就是“统一基础设施，但不混业务语义”的最简方案。

---

## 12. 最终 API 建议

## 12.1 core

```ts
type TextFrameInsets = {
  paddingTop: number
  paddingRight: number
  paddingBottom: number
  paddingLeft: number
  borderTop: number
  borderRight: number
  borderBottom: number
  borderLeft: number
}

type TextFrameMetrics = TextFrameInsets & {
  width: number
  height: number
}

readTextFrameInsets(node: Node): TextFrameInsets
resolveTextFrameMetrics(input: {
  node: Node
  width: number
  height: number
}): TextFrameMetrics
resolveTextContentBox(frame: TextFrameMetrics): {
  width: number
  height: number
}
```

## 12.2 editor layout request

```ts
type LayoutRequest =
  | {
      kind: 'size'
      nodeId: NodeId
      sourceId: TextSourceId
      text: string
      placeholder: string
      widthMode: 'auto' | 'wrap'
      wrapWidth?: number // outer width
      frame: TextFrameMetrics
      fontSize: number
      fontWeight?: number | string
      fontStyle?: string
    }
  | {
      kind: 'fit'
      ...
    }
```

## 12.3 react backend

```ts
measureTextOuterSize(request: Extract<LayoutRequest, { kind: 'size' }>): Size
```

注意这里名字就应该体现：

- 它测的是 outer size
- 不是裸 text size

---

## 13. 落地顺序

## Phase 1

统一 `text.size` 语义为 outer border-box size。

## Phase 2

把 measure request 改成显式带 `frame metrics`。

## Phase 3

删掉 text 多层 wrapper，收敛成：

- `wb-node-block`
- `wb-text-host`

## Phase 4

让 display 与 edit 共用一个 host，不再切换宿主 DOM。

## Phase 5

清理所有 renderer 侧隐式 patch 旁路，只保留 editor 统一提交。

---

## 14. 作为实现依据的硬约束

1. `text.size` 永远是最终外框 `border-box size`。
2. `wrapWidth` 表示最终外框宽度，而不是内容盒宽度。
3. 内容盒尺寸永远不持久化。
4. display 和 edit 共用一个 text host。
5. text host 不使用 `height: 100% / min-height: 100%`。
6. measure 必须直接返回 outer size。
7. React 不直接写 document。
8. editor 是唯一布局协调者。
9. mindmap root/child 与普通 `text` 共享同一套 text layout / DOM / edit 模型。
10. 任何 “host mounted -> layout.sync -> patch document” 的链路都应删除。

---

## 15. 对当前现象的直接解释

“进入编辑态宽高正确，退出后又不对”的直接原因通常只有一条：

- 编辑态叠加了 local draft size
- 这个 draft size 更接近正确的 outer size
- 退出编辑后又回退到 committed `node.size`
- 而 committed `node.size` 仍带着旧的 content-box 语义或半修正语义

于是视觉上就会出现：

- 编辑态正常
- 非编辑态塌陷
- mindmap root 尤其明显，因为它带 padding / border / capsule frame

这再次证明：

- 不能依赖 display/edit 两套 DOM 互相兜底
- 不能让 CSS 用 `height: 100%` 去补语义错误
- 必须从底层把 `size`、DOM、measure 三者统一成同一套 outer-box 模型

---

## 16. 一句话总结

当前问题不是 `mindmap` 特殊，而是 `text` 的尺寸语义不纯。

长期最优、复杂度最低、最不容易错的方案只有一条：

**单一 text host**

**单一 outer-size 语义**

**单一 editor 提交入口**

只要坚持这三条，`text`、`mindmap root`、带 capsule/underline/frame 的文本节点都会一起稳定。
