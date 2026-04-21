# Mindmap 编辑态布局边界方案

本文不是调试记录，而是对 `mindmap` 编辑态布局的状态边界、依赖方向和模块职责做一次重新定义。

目标只有四个：

- `mindmap owned node` 不再同时拥有两套几何真相
- 编辑态 auto width 在浏览器里稳定生效
- 上下游依赖关系清晰，避免“下游知道上游细节”
- 文字测量从具体 node 语义里解耦出来

---

## 1. 一句话结论

对 `mindmap owned text node` 来说，应该把三件事彻底拆开：

1. `text` 属于 node 的编辑语义
2. `intrinsic size` 属于 node draft layout 的测量结果
3. 最终显示 `rect` 属于 projected mindmap layout

其中最关键的一条是：

- `node draft size` 只能作为 `mindmap layout projector` 的输入
- 不能再直接成为 `mindmap node` 的最终渲染几何

如果这两条没有分开，node 和 mindmap 就会继续在编辑态争夺同一个 `rect`。

---

## 2. 正确的状态分层

## 2.1 `committed.document`

这是 document / engine 里已经持久化的状态。

包含：

- committed node data
- committed node rect
- committed mindmap structure
- committed mindmap layout

职责：

- 作为所有投影链的基线
- 不表达编辑中的临时文本
- 不表达编辑中的临时测量

下游消费者：

- edit session 初始化
- draft layout 测量基线
- projected mindmap layout 基线

---

## 2.2 `edit.session`

这是“用户正在编辑什么”的会话状态。

建议只保留：

- `nodeId`
- `field`
- `text`
- `caret`
- `composing`

职责：

- 表达输入语义
- 表达编辑行为
- 不直接携带几何信息

不应该包含：

- `size`
- `rect`
- `wrapWidth`
- `fontSize` 这种布局结果

原因：

- 这些不是输入语义，而是测量产物
- 一旦把布局结果塞回 edit session，session 就从“输入源”变成了“半成品投影”

---

## 2.3 `draft.layout.node`

这是“如果现在提交，这个 node 应该采用的临时布局结果”。

建议形态：

```ts
type DraftNodeLayout = {
  size?: Size
  fontSize?: number
  wrapWidth?: number
}
```

它是纯派生层。

输入：

- `committed node`
- `edit.session.text`
- layout backend

输出：

- text node 的 `size`
- sticky 之类 fit node 的 `fontSize`
- wrap 模式下的 `wrapWidth`

职责：

- 为 commit 提供临时布局值
- 为 projector 提供 intrinsic measurement override

不应该知道：

- mindmap tree 如何排版
- node 最终显示在画布上的 `rect`
- selection / chrome / connectors

---

## 2.4 `preview.gesture`

这是交互预览层。

应该只表达：

- root move
- subtree move
- enter animation

职责：

- 表达临时位移和过渡动画
- 不承担文本编辑尺寸

不应该包含：

- text edit size
- text draft layout

原因：

- 文本编辑和拖拽预览是两类完全不同的语义
- 一旦把它们混在一起，preview 就会变成“临时状态垃圾桶”

---

## 2.5 `projected.mindmap`

这是 `mindmap owned node` 的唯一几何真相源。

输入：

- committed mindmap structure
- committed mindmap layout
- committed node intrinsic size
- `draft.layout.node`
- `preview.gesture`

输出：

- projected tree bbox
- projected node rect
- projected connectors

职责：

- 把“局部 intrinsic size 变化”投影成“整棵树几何变化”
- 给 node render / connectors / chrome 提供同一份几何结果

不应该知道：

- caret
- composing
- edit session 里的任何 UI 状态
- 文本编辑 UI 的任何细节

它最多只应该知道：

- 某个 `nodeId` 当前存在一个临时 intrinsic size override

也就是说，`mindmap projector` 不该依赖完整的 `EditSession`，而应该依赖一个更窄的输入：

```ts
type MindmapNodeSizeOverride = {
  nodeId: NodeId
  size: Size
}
```

或者更通用一点：

```ts
type DraftLayoutByNode = KeyedReadStore<NodeId, DraftNodeLayout | undefined>
```

---

## 2.6 `node.render`

这是最终展示层。

对于普通 text node：

- `rect` 可以直接来自 `draft.layout.node`

对于 mindmap owned text node：

- `rect` 必须来自 `projected.mindmap.nodeRect(nodeId)`

职责：

- 组合内容和最终 rect
- 输出给 React / canvas / overlay

不应该再做：

- 第二次布局推导
- 把 `draft.layout.node.size` 和 `mindmap.rect` 再拼一遍
- 对同一个 node 再做两套 geometry merge

---

## 3. 依赖方向

正确的依赖方向应该是：

```txt
TextSlot input
  -> edit.session
  -> draft.layout.node
  -> projected.mindmap
  -> node.render / mindmap.scene / connectors / chrome
```

其中：

- 上游可以影响下游
- 下游不能反向决定上游语义

换句话说：

- `node.render` 不应该反过来决定 `draft.layout`
- `projected.mindmap` 不应该直接依赖 `TextSlot`
- `draft.layout` 不应该依赖最终 render rect

---

## 4. 哪些边界现在仍然混在一起

当前实现里最危险的混线点有四个。

## 4.1 `NodeEditView` 同时承担编辑语义和布局结果

如果一个对象同时有：

- `text`
- `caret`
- `size`
- `fontSize`

那它已经不是纯 edit view 了，而是 edit + layout 的混合体。

问题在于：

- query 层一旦消费这个对象，就很容易把布局结果再带回 geometry 合成

正确做法：

- edit view 只服务编辑 UI
- draft layout 单独读

---

## 4.2 `mindmap layout` 直接知道 `EditSession`

如果 `mindmap projector` 直接读取：

- `session.kind`
- `session.field`
- `session.nodeId`

这说明 mindmap 域已经知道了编辑交互语义。

这不是最优边界。

正确做法：

- mindmap projector 只读取 `draft layout override`
- 是否正在编辑、caret 在哪、是否 composing，不属于 mindmap layout 域

---

## 4.3 `node layout helper` 知道 `mindmapRect: committed | projected`

如果 node layout helper 需要决定：

- 这个 node 当前应该取 committed mindmap rect
- 还是 projected mindmap rect

说明 node 层已经开始替 mindmap 层做几何来源选择。

这会造成：

- node intrinsic measurement
- mindmap final geometry

这两层的职责交叉。

正确做法：

- intrinsic measurement 只用 committed intrinsic baseline
- final render geometry 只在 render/projector 层决定

---

## 4.4 `projectNodeGeometryItem` 仍在合并两套几何来源

当一个函数同时读：

- `draft.layout.node.size`
- `feedback.patch`
- `mindmap.rect`

并试图产出最终 geometry 时，它天然会变成冲突汇合点。

对于普通 text node，这么做问题不大，因为没有 mindmap projector。

对于 mindmap node，这么做很危险，因为：

- `draft.layout.node.size` 是局部 intrinsic size
- `mindmap.rect` 是全局树投影结果

这两个不是同层语义。

---

## 5. 文字测量的正确职责

你提的问题是对的：

- 文字测量本身应该和“这是哪个 node”无关
- 真正的测量动作应该由隐藏测量元素完成

更准确地说，应该拆成两层。

## 5.1 文本测量核心应该是 node-agnostic 的

它只应该关心这些输入：

- `text`
- typography profile
- `fontSize`
- `fontWeight`
- `fontStyle`
- `widthMode`
- `wrapWidth`
- `frame insets`
- `minWidth`
- `maxWidth`

输出只有：

- measured `size`

也就是说，测量核心不该知道：

- `nodeId`
- node 是否属于 mindmap
- 当前是不是 root/topic
- 当前组件实例是谁

它就是一个纯文字盒模型测量器。

---

## 5.2 浏览器适配层可以可选读取真实 DOM 的排版样式

在浏览器里，测量实现可以为了拿到更接近真实渲染的 typography，读取一个真实 DOM source 的 computed style。

但这层只是：

- typography source resolver

而不是：

- correctness source of truth

也就是说：

- 没有 source element 时，测量也应该仍然成立
- source element 只是帮助拿到真实字体、行高、字重等样式

正确分层是：

```txt
TextMeasureCore
  <- normalized typography input

BrowserTypographyResolver
  <- optional DOM source
  -> normalized typography input
```

而不是：

```txt
measure(nodeId)
  -> 找到这个 node 的 DOM
  -> 依赖它才能测
```

---

## 5.3 当前实现处于“半解耦”状态

当前浏览器实现里，真正的文字宽高测量确实是通过隐藏测量元素完成的。

也就是说：

- 真正测量宽高的是隐藏 `div`
- 不是直接拿当前 node 的 DOM 宽高当结果

但当前实现还有一层 node-aware 痕迹：

- layout request 里仍然带了 `source`
- runtime 会通过 `nodeId + field` 找到当前 node 对应的 DOM 元素
- 再从那个 source 读取 computed style

所以当前状态不是“完全和 node 无关”，而是：

- 测量机制无 node
- typography source 解析仍带 node 身份

这是可以接受的过渡态，但不是最干净的终态。

---

## 6. 最简 API

## 6.1 编辑层

```ts
type EditSession = {
  nodeId: NodeId
  field: 'text' | 'title'
  text: string
  caret: EditCaret
  composing: boolean
}
```

编辑层只表达输入。

---

## 6.2 测量层

```ts
type TextMeasureInput = {
  text: string
  typography: TextTypographySpec
  widthMode: 'auto' | 'wrap'
  wrapWidth?: number
  frame: TextFrameInsets
  minWidth?: number
  maxWidth?: number
}

type TextMeasureOutput = {
  size: Size
}
```

测量层不感知 node。

---

## 6.3 draft layout 层

```ts
type DraftNodeLayout = {
  size?: Size
  fontSize?: number
  wrapWidth?: number
}
```

它只负责把编辑文本变成 intrinsic layout result。

---

## 6.4 projector 层

最简设计下，projector 不直接读 `EditSession`，也不直接读整份 `draftLayout` store。

它只吃三个东西：

- committed 的 tree + layout 基线
- 当前正在变化的一个 live size override
- 可选的 gesture preview

```ts
type MindmapLiveSize = {
  nodeId: NodeId
  size: Size
}

type ProjectedMindmapInput = {
  base: {
    structure: MindmapStructureItem
    layout: MindmapLayoutItem
  }
  liveSize?: MindmapLiveSize
  preview?: MindmapGesturePreview
}
```

等价的最简函数签名可以直接写成：

```ts
projectMindmap(base, liveSize?, preview?) => ProjectedMindmap
```

projector 层只关心几何输入，不关心编辑 UI 语义。

---

## 6.5 render 层

最简设计下，render 层不再接收 `contentDraft`，也不再区分 `finalRect` 这种说明性命名。

原因很简单：

- draft text 应该在 render 之前就已经投影进 `node`
- render 阶段只应该看到“要显示的 node”和“要画到哪里”

```ts
type NodeRenderInput = {
  node: Node
  rect: Rect
  edit?: {
    field: EditField
    caret: EditCaret
  }
}
```

等价的最简函数签名可以直接写成：

```ts
renderNode(node, rect, edit?) => View
```

render 层只消费显示结果，不再关心这些结果是怎么推出来的。

---

## 6.6 两个接口为什么要这么收

`ProjectedMindmapInput` 之所以只保留 `base/liveSize/preview`，是因为 projector 真正需要的只有：

- 这棵树原来长什么样
- 哪个 node 的 intrinsic size 临时变了
- 有没有拖拽/过渡动画

它不需要知道：

- `EditSession`
- `caret`
- `composing`
- `field`

`NodeRenderInput` 之所以只保留 `node/rect/edit`，是因为 render 真正需要的只有：

- 当前要显示什么内容
- 当前几何在哪里
- 是否需要显示 caret/edit chrome

它不需要知道：

- `contentDraft`
- `draftLayout`
- `mindmap liveSize`
- `finalRect` 是怎么计算出来的

---

## 7. 重构方向

如果按“最少状态、最清边界”去收口，建议分三步。

## Step 1

先冻结语义边界：

- `EditSession` 不再携带布局结果
- `DraftNodeLayout` 成为唯一测量产物
- `projected.mindmap` 成为 mindmap node 唯一几何来源

## Step 2

把 `mindmap projector` 对 `EditSession` 的直接依赖收窄成对 `DraftNodeLayout` 的依赖。

也就是：

- 不再让 `mindmap` 关心 `field/caret/composing`
- 只让它关心 `nodeId -> size override`

## Step 3

把 `query/node/read.ts` 里混合 geometry 的逻辑拆开。

目标是：

- 普通 text node: geometry 可直接使用 draft layout
- mindmap text node: geometry 只使用 projected mindmap rect
- 两者共享内容 draft，但不共享 geometry merge 逻辑

---

## 8. 最终判定标准

当下面四条都成立时，说明这套边界才真正收住了：

1. 编辑 mindmap root/topic 时，浏览器里宽度实时变化
2. `render.rect` 永远等于 `projected.mindmap.nodeRect`
3. `EditSession` 里找不到任何 `size/rect/fontSize/wrapWidth`
4. 测量层不需要知道 `nodeId`，最多只需要 optional typography source

---

## 9. 最短版本

如果只记一句话，就记这个：

- `node` 负责文本
- `draft layout` 负责 intrinsic size
- `mindmap projector` 负责最终 `rect`
- `render` 只消费 `node + rect + edit`

文字测量本身应该是 node-agnostic 的，隐藏测量元素是正确实现方向；具体 node DOM 最多只能作为可选样式来源，不能成为布局正确性的前提。
