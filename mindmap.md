# Mindmap 编辑态布局边界

## 结论

这次重构之后，mindmap 编辑态的核心规则只有一条：

- `mindmap owned node` 的最终几何只认 `projected.mindmap`

旧问题的根因，就是同一个 node 在编辑时同时存在两套几何来源：

- 一套来自 `draft.layout.node.size`
- 一套来自 `projected.mindmap.nodeRect`

当两条派生链更新不同步时，后者会把前者覆盖掉，表现出来就是浏览器里节点自动宽度不跟随输入。现在已经把这两条链拆清了。

---

## 1. 状态边界

## 1.1 `committed node` / `committed mindmap`

这是所有派生链的基线。

它们提供：

- committed node 内容
- committed node intrinsic rect
- committed mindmap structure
- committed mindmap layout

它们不表达：

- 编辑中的文本
- 编辑中的临时测量
- 编辑中的临时几何

---

## 1.2 `edit.session`

这是纯输入态状态，只表达“用户正在编辑什么”。

当前最小形态：

```ts
type EditSession =
  | {
      kind: 'node'
      nodeId: NodeId
      field: EditField
      text: string
      caret: EditCaret
      composing: boolean
    }
  | {
      kind: 'edge-label'
      edgeId: EdgeId
      labelId: string
      text: string
      caret: EditCaret
      composing: boolean
    }
  | null
```

它只负责：

- 输入文本
- caret
- composing
- 当前 edit target

它不再负责：

- `size`
- `rect`
- `wrapWidth`
- `fontSize`
- `capabilities`
- `initial`
- `status`

也就是说，`edit.session` 不再是“半个布局结果”，而只是一份输入源。

---

## 1.3 `draft.layout.node[nodeId]`

这是唯一的临时测量产物。

```ts
type DraftNodeLayout = {
  size?: Size
  fontSize?: number
  wrapWidth?: number
}
```

它的输入是：

- committed node
- `edit.session.text`
- layout backend

它的输出是：

- text node 的 `size`
- sticky 之类 fit node 的 `fontSize`
- wrap 模式相关的 `wrapWidth`

它不应该知道：

- mindmap tree 如何排
- node 最终在画布上的 `rect`
- selection / chrome / connector

这里的职责很单纯: 把文本变化变成 intrinsic layout override。

---

## 1.4 `liveMindmapSize[treeId]`

这是 edit/draft 到 mindmap projector 之间唯一保留的桥。

最小形态：

```ts
type MindmapLiveSize = {
  nodeId: NodeId
  size: Size
}
```

它只在下面这个条件成立时存在：

- 当前 session 正在编辑一个 `mindmap owned node`
- `draft.layout.node[nodeId].size` 已经算出来

它的作用只是把一句话传给 projector：

- “这个 node 的 intrinsic size 现在临时变成了这个值”

除此之外，projector 不需要知道任何编辑 UI 细节。

---

## 1.5 `projected.mindmap[treeId]`

这是 `mindmap owned node` 的唯一几何真相源。

最小输入：

```ts
type ProjectedMindmapInput = {
  base: {
    structure: MindmapStructureItem
    layout: MindmapLayoutItem
  }
  liveSize?: MindmapLiveSize
  preview?: MindmapGesturePreview
}
```

也可以直接理解为：

```ts
projectMindmap(base, liveSize?, preview?) => ProjectedMindmap
```

它只负责：

- 把局部 intrinsic size 变化投影成整棵树的几何变化
- 输出统一的 node rect / tree bbox / connectors

它不应该知道：

- `EditSession`
- `text`
- `caret`
- `composing`
- `field`

它只知道：

- 哪个 node 的 intrinsic size 临时变了

---

## 1.6 `node.render`

render 层只吃显示结果，不参与布局推导。

最小输入：

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

也就是说：

- 要显示什么内容，看 `node`
- 要画到哪里，看 `rect`
- 是否展示 caret/edit chrome，看 `edit`

render 不再接收：

- `contentDraft`
- `draftLayout`
- `finalRect`
- `mindmap liveSize`

这些都应该在 render 之前已经投影完成。

---

## 2. 上下游关系

现在的链路应该按下面理解：

1. `committed node`
2. `edit.session`
3. `draft.layout.node`
4. `liveMindmapSize`
5. `projected.mindmap`
6. `query.node`
7. `render`

每一层只把更窄的结果往下传，不把整个上游状态整包泄漏下去。

具体来说：

- `draft.layout.node` 只吃 `edit.session.text`，不把 session 整包传给 projector
- `liveMindmapSize` 只传 `nodeId + size`
- `projected.mindmap` 只输出 rect，不把内部 layout 过程暴露给 render
- `render` 只看 `node + rect + edit chrome`

这就是“下游不应该知道上游”的实际落地方式。

---

## 3. `node` 本地状态和 `mindmap` 状态怎么分

这是这次最关键的拆分。

### 非 mindmap 文本节点

几何可以直接消费 `draft.layout.node.size`，因为它本来就没有整棵树投影这一层。

链路是：

- `edit.session.text`
- `draft.layout.node.size`
- `node rect`

### mindmap owned node

几何不能直接消费 `draft.layout.node.size` 作为最终 rect。

链路必须是：

- `edit.session.text`
- `draft.layout.node.size`
- `liveMindmapSize`
- `projected.mindmap.nodeRect`
- `node rect`

也就是说：

- `draft.layout.node.size` 是 mindmap projector 的输入
- `projected.mindmap.nodeRect` 才是 mindmap node 的最终几何输出

node 自己不能一边吃 `draft.size`，mindmap 又一边给它另一份 `rect`。这正是旧实现里“node 本地状态和 mindmap 在打架”的根源。

---

## 4. 为什么现在不会再打架

现在 `query/node/read.ts` 已经把 content 和 geometry 明确分开了。

content 路径负责：

- 编辑中的文本覆盖 committed text
- sticky 的临时 `fontSize` 覆盖 committed style

geometry 路径负责：

- mindmap node: 只读 `mindmap.rect`
- 非 mindmap text node: 可以读 `draft.size`
- 其他位置/尺寸 patch: 走 preview / feedback patch

这个拆法的关键收益是：

- 文本内容的临时变化，不再等于几何来源
- mindmap 几何只有一份最终答案
- render 不需要知道 rect 是怎么推出来的

---

## 5. 文字测量放在哪里

文字测量不是 node 状态，也不是 mindmap 状态。

它是独立的 layout 能力，应该藏在 `LayoutBackend` / `TextMetricsResource` 后面。

实现上可以有不同 backend：

- editor core 里的通用 text metrics 资源
- 浏览器 runtime 里的 DOM hidden measure 实现

但这些都只是“测量引擎”的实现细节。

对状态边界来说，真正重要的是：

- node 只提供 text / typography / width mode 之类输入
- 测量结果只落到 `draft.layout.node`
- `edit.session` 不缓存测量结果
- `projected.mindmap` 只消费 size override，不关心测量是用 canvas 还是 hidden DOM 算出来的

---

## 6. 当前实现要遵守的三条规则

1. `EditSession` 只表达输入态，不携带布局结果。
2. `DraftNodeLayout` 是唯一临时测量结果。
3. `mindmap owned node` 的最终几何只认 `projected.mindmap`。

只要这三条不破，mindmap 编辑态的自动宽度、上下游边界和派生链长度都会保持稳定。
