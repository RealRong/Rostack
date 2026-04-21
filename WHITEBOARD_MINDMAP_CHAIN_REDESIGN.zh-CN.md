# Whiteboard Mindmap 派生链一步到位重构方案

本文不是增量修补方案，而是下一阶段的唯一目标方案。

约束只有三条：

- 不在乎改动成本
- 不要求兼容现有 editor/query/read API
- 目标是一次性把 mindmap 相关派生链做正确、做短、做清楚

本文应视为下一阶段的总设计，优先级高于现有的增量边界文档，包括 [mindmap.md](./mindmap.md) 和 [MINDMAP_LAYOUT_BOUNDARY_PLAN.zh-CN.md](./MINDMAP_LAYOUT_BOUNDARY_PLAN.zh-CN.md)。

---

## 1. 最终目标

最终只接受下面四条真相链：

1. committed document 真相链
2. edit input 真相链
3. mindmap tree geometry 真相链
4. node final projection 真相链

更具体地说：

- `mindmap owned node` 的 committed rect 真相必须前移到 engine
- editor 不再修补 committed rect
- editor 不再维护 tree-level layout 之外的 `mindmap.node` 扁平索引层
- node query 不再把同一份输入拆成 `geometry/content/item/rect/bounds/render/canvas` 七层链
- 文字测量必须是 typography/profile 驱动，而不是 node 语义驱动
- 下游只能消费已经投影好的结果，不能再知道上游细节

一句话总结：

- tree 怎么排，归 `mindmap layout`
- text 怎么量，归 `text measure`
- node 最后画成什么，归 `node projection`

除了这三件事，不允许再有额外“补丁层”参与几何真相竞争。

---

## 2. 对当前实现的判断

当前实现已经修掉了最明显的 bug，但整体结构仍然偏长，主要复杂度来自五个地方。

### 2.1 committed rect 真相分裂

现状里有两份 committed 几何来源：

- `engine.read.node.item`
- `engine.read.mindmap.layout`

editor 为了把它们拼起来，又额外引入了一层 `readCommittedLayoutNodeItem()`，位置在 `whiteboard/packages/whiteboard-editor/src/layout/runtime.ts`。

这说明 committed 真相没有在 engine 层收口，editor 还在做补偿。

这是当前整条链里最根本的复杂度来源。

### 2.2 `mindmap.node` 是索引层，不是业务层

当前 `createMindmapLayoutRead()` 先产出 tree-level `item`，再把整棵树 flatten 成：

- `nodeId -> { mindmapId, nodeId, rect }`

位置在 `whiteboard/packages/whiteboard-editor/src/layout/mindmap.ts`。

这层的价值只是“方便按 nodeId 查 rect”，不是新的业务语义。

如果 tree-level `layout.item` 已经是几何真相，那么 `mindmap.node` 只是中间索引层。

### 2.3 `query.node` 内部层数过多

当前 `createNodeRead()` 里同时维护：

- `geometry`
- `content`
- `item`
- `rect`
- `bounds`
- `render`
- `canvas`

位置在 `whiteboard/packages/whiteboard-editor/src/query/node/read.ts`。

这些层里真正大量被消费的是：

- `item`
- `render`
- `canvas`

而 `geometry / rect / bounds` 基本只是内部转手结果。

这类“为了拆而拆”的 store 会显著增加派生深度和排查成本。

### 2.4 preview 的语义仍然混合

当前 `feedback.text` 同时混了两类东西：

- 几何预览字段：`position / size`
- 文本布局字段：`fontSize / mode / wrapWidth / handle`

位置在：

- `whiteboard/packages/whiteboard-editor/src/session/preview/types.ts`
- `whiteboard/packages/whiteboard-editor/src/session/preview/node.ts`

结果就是：

- geometry 层要读它
- content 层也要读它

这会继续模糊“内容投影”和“几何投影”的边界。

### 2.5 draft 仍然承担了过多形态

当前 `DraftNodeLayout` 是：

```ts
type DraftNodeLayout = {
  size?: Size
  fontSize?: number
  wrapWidth?: number
}
```

其中：

- `size` 是真实测量结果
- `fontSize` 是 fit 结果
- `wrapWidth` 更像 layout 参数回显，而不是 live draft 结果

这会让 draft 既像 measure result，又像 commit payload cache。

---

## 3. 最终设计原则

### 3.1 单一几何真相

任何时刻，一个 node 只能有一份最终 rect 真相。

规则如下：

- committed 阶段，真相来自 `engine.read.node.committed`
- live edit mindmap 阶段，真相来自 `projected mindmap layout`
- free node 交互预览阶段，真相来自 `node projection`

不允许：

- committed node rect 和 committed mindmap rect 并存
- draft size 和 projected rect 同时作为最终几何输入
- node 级 preview geometry 与 mindmap tree geometry 同时争夺一个 node 的 rect

### 3.2 上游不泄漏

下游只能看到最窄输入。

具体规则：

- text measure 不知道 node 是否属于 mindmap
- mindmap projector 不知道 `text / caret / composing`
- node projector 不知道完整 `EditSession`
- render 不知道 draft measure 和 tree projector 的中间细节

### 3.3 tree 级问题只在 tree 级解决

凡是会影响整棵树布局的问题，都只能从 tree projector 进入。

包括：

- mindmap topic 尺寸变化
- root move
- subtree move
- enter animation

不允许用 node 级 geometry patch 去“局部覆盖” mindmap node 的 rect。

### 3.4 文字测量与 node 语义解耦

文字测量只认：

- typography profile
- text
- width mode
- wrap width
- frame insets
- font style inputs

不认：

- node 是否属于 mindmap
- node 是否是 topic
- node 是否正在编辑

也就是说，测量后端是纯 `LayoutRequest -> LayoutResult`，而不是“某种 node 特判器”。

### 3.5 query 只暴露稳定语义，不暴露中间产物

query 层只应该暴露：

- committed
- projected
- render

不应该把 geometry 分解后的每一个中间 store 都拿出来当公共接口。

---

## 4. 最终状态模型

## 4.1 Engine committed 层

最终 engine 必须直接提供 owner-aware committed node rect。

目标接口：

```ts
type EngineNodeCommitted = {
  list: ReadStore<readonly NodeId[]>
  committed: KeyedReadStore<NodeId, NodeItem | undefined>
}
```

这里的关键要求不是接口形状，而是语义：

- 对 free node，`committed.rect` 来自 node 自身 geometry
- 对 `mindmap owned node`，`committed.rect` 必须已经等于 committed mindmap layout rect

也就是说，到了 editor 之前，committed rect 已经收口。

这会直接删除：

- `readCommittedLayoutNodeItem()`
- editor 对 committed rect 的 owner special-case

## 4.2 EditSession

最终保持最小输入态：

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

不再向 session 回写：

- size
- rect
- wrapWidth
- fontSize
- status
- capability

## 4.3 DraftMeasure

最终 draft 不再是“半个 layout item”，而只是当前编辑输入的测量结果。

目标类型：

```ts
type DraftMeasure =
  | {
      kind: 'size'
      size: Size
    }
  | {
      kind: 'fit'
      fontSize: number
    }
  | undefined
```

明确删除：

- `wrapWidth` 从 draft 中移除

原因：

- `wrapWidth` 是 layout 参数，不是 live measure 结果
- commit 时如果需要它，应直接从 committed node 或 preview layout 参数读取

## 4.4 PreviewState

最终 preview 必须拆语义，不再让 `feedback.text` 同时承担 geometry 和 text layout。

目标拆分：

```ts
type NodeGeometryPreview = {
  position?: Point
  size?: Size
  rotation?: number
}

type TextLayoutPreview = {
  fontSize?: number
  widthMode?: TextWidthMode
  wrapWidth?: number
}

type MindmapGesturePreview = {
  rootMove?: MindmapRootMovePreview
  subtreeMove?: MindmapSubtreeMovePreview
  enter?: readonly MindmapEnterPreview[]
}
```

如果仍然需要 resize handle，它只能留在 text layout preview 这一路里，不能再和 geometry preview 混用。

明确规则：

- free node 的 resize/rotate 只进入 `NodeGeometryPreview`
- 文本布局相关临时值只进入 `TextLayoutPreview`
- mindmap 的位置变化只进入 `MindmapGesturePreview`
- `mindmap owned node` 不再接受 node 级 geometry preview

## 4.5 ProjectedMindmap

最终 mindmap projector 只保留 tree-level 结果，不再额外维护 `mindmap.node`。

目标接口：

```ts
type ProjectedMindmapLayout = {
  id: NodeId
  rootId: NodeId
  nodeIds: readonly NodeId[]
  computed: MindmapLayout
  connectors: readonly MindmapRenderConnector[]
}
```

目标读取方式：

- `mindmap.layout.get(treeId)` 读取整棵树
- 需要 node rect 时，调用方直接通过 `computed.node[nodeId]` 查

明确删除：

- `MindmapNodeLayoutItem`
- `MindmapLayoutRead.node`
- `query.mindmap.node`

如果后续确实还需要“按 nodeId 取 mindmap rect”的能力，也应作为轻量 helper 存在，而不是常驻 flatten store。

## 4.6 ProjectedNode

最终 node query 的核心不是 `geometry/content/item/render` 这条长链，而是一个统一的 node projection。

目标类型：

```ts
type ProjectedNode = {
  nodeId: NodeId
  node: Node
  rect: Rect
  bounds: Rect
  rotation: number
}
```

构造规则：

- free node:
  - committed node 作为基线
  - text edit draft 只影响 intrinsic size 或 fit fontSize
  - geometry preview 只影响 free node 自己
- mindmap owned node:
  - committed 基线来自 engine owner-aware rect
  - live rect 只来自 `projected mindmap layout`
  - 不再吃 node 级 geometry preview

这意味着 `projectNode()` 是唯一的 node final projection 入口。

## 4.7 NodeRender

render 只在 projected node 上追加 runtime。

目标类型：

```ts
type NodeRender = {
  nodeId: NodeId
  node: Node
  rect: Rect
  bounds: Rect
  rotation: number
  hovered: boolean
  hidden: boolean
  resizing: boolean
  patched: boolean
  selected: boolean
  edit?: {
    field: EditField
    caret: EditCaret
  }
  canConnect: boolean
  canResize: boolean
  canRotate: boolean
}
```

render 不再知道：

- draft measure
- projected mindmap 输入
- committed rect 修补逻辑

---

## 5. 最终模块边界

## 5.1 engine

负责：

- committed node
- committed mindmap structure
- committed mindmap layout

要求：

- node committed rect 对 owner 语义已经正确

不负责：

- live edit
- live measure
- interaction preview

## 5.2 text measure runtime

负责：

- `LayoutRequest -> LayoutResult`

不负责：

- node owner 语义
- mindmap tree 语义
- selection / edit session

## 5.3 editor draft runtime

负责：

- 从 `EditSession` 计算 `DraftMeasure`

不负责：

- tree 几何
- node 最终 rect

## 5.4 mindmap projector

负责：

- `committed mindmap layout + live size + gesture preview -> projected tree layout`

不负责：

- text 内容
- caret
- edit session 细节
- node 单独 geometry patch

## 5.5 node projector

负责：

- `committed node + projected mindmap layout + draft measure + preview -> projected node`

不负责：

- committed rect 补丁
- tree flatten index

## 5.6 render/query facade

负责：

- 输出稳定查询接口给 action、input、react

不负责：

- 二次布局推导

---

## 6. 最终公开 API

## 6.1 Engine

```ts
type EngineRead = {
  node: {
    list: ReadStore<readonly NodeId[]>
    committed: KeyedReadStore<NodeId, NodeItem | undefined>
  }
  mindmap: {
    list: ReadStore<readonly NodeId[]>
    structure: KeyedReadStore<NodeId, MindmapStructureItem | undefined>
    layout: KeyedReadStore<NodeId, MindmapLayoutItem | undefined>
  }
}
```

## 6.2 Editor Query

```ts
type EditorNodeRead = {
  committed: KeyedReadStore<NodeId, NodeItem | undefined>
  projected: KeyedReadStore<NodeId, ProjectedNode | undefined>
  render: KeyedReadStore<NodeId, NodeRender | undefined>
  capability: (node: Pick<Node, 'id' | 'type' | 'owner'>) => NodeCapability
}

type EditorMindmapRead = {
  structure: KeyedReadStore<NodeId, MindmapStructureItem | undefined>
  layout: KeyedReadStore<NodeId, ProjectedMindmapLayout | undefined>
  scene: KeyedReadStore<NodeId, MindmapSceneItem | undefined>
  chrome: KeyedReadStore<NodeId, MindmapChrome | undefined>
  navigate: (...)
}
```

明确删除的 query 输出：

- `query.node.geometry`
- `query.node.content`
- `query.node.item`
- `query.node.rect`
- `query.node.bounds`
- `query.node.canvas`
- `query.mindmap.node`

如果某些内部调用方确实需要现在 `canvas` 那种数据，直接读 `query.node.projected`。

---

## 7. 必删清单

以下内容在一步到位方案里不是“可选优化”，而是必须删除。

### 7.1 editor/layout/runtime.ts

删除：

- `readCommittedLayoutNodeItem()`
- draft 中的 `wrapWidth`
- editor 对 committed rect 的 owner special-case

### 7.2 editor/layout/mindmap.ts

删除：

- `MindmapNodeLayoutItem`
- `nodeSource`
- `node` flatten store

保留：

- tree-level `item`

### 7.3 editor/query/node/read.ts

删除公共中间层：

- `geometry`
- `content`
- `item`
- `rect`
- `bounds`
- `canvas`

改为：

- 一个统一的 `projected`
- 一个基于 `projected` 的 `render`

### 7.4 editor/query/mindmap/read.ts

删除：

- `node`

只保留：

- `layout`
- `scene`
- `chrome`
- `navigate`

### 7.5 preview types

删除当前这种混合字段设计：

- `feedback.text.position`
- `feedback.text.size`

改为明确拆分的 preview store。

### 7.6 命名

必须统一：

- engine 的 committed 叫 `committed`
- editor 的最终节点投影叫 `projected`
- UI 消费结果叫 `render`

不再允许：

- engine `item`
- editor `item`
- render `item`

三层同时都叫 `item`。

---

## 8. 一步到位实施顺序

## 8.1 第一步：前移 committed rect 真相

先改 engine，而不是先改 query。

目标：

- `engine.read.node.committed` 对 mindmap-owned node 已经返回 committed tree rect

只有这一步完成后，editor 才能真正删除 `readCommittedLayoutNodeItem()`。

这是本方案最关键的一步。

## 8.2 第二步：删除 `mindmap.node`

在 editor 中只保留：

- `mindmap.layout`

所有 node 级 mindmap rect 读取都改为：

- 通过 node owner 找 tree
- 从 `mindmap.layout.get(treeId)?.computed.node[nodeId]` 取 rect

## 8.3 第三步：重写 node projector

新建统一的 `projectNode(nodeId)`：

- 输入 committed node
- 输入 projected mindmap layout
- 输入 draft measure
- 输入 preview
- 输出 `ProjectedNode`

然后所有后续层都只围绕 `ProjectedNode` 工作。

## 8.4 第四步：砍掉 query.node 中间层

把当前 `geometry/content/item/rect/bounds/canvas/render` 全部收口成：

- `committed`
- `projected`
- `render`

## 8.5 第五步：拆 preview 语义

把现在的混合 `feedback.text` 拆成：

- geometry preview
- text layout preview
- mindmap gesture preview

## 8.6 第六步：清理命名和测试

所有调用方一次性更新到新语义：

- `committed`
- `projected`
- `render`

不保留旧 API 别名。

---

## 9. 完成判定

只有同时满足下面条件，才算这次重构完成。

### 9.1 结构判定

- editor 中不存在 `readCommittedLayoutNodeItem()`
- editor 中不存在 `query.mindmap.node`
- editor 中不存在 `MindmapNodeLayoutItem`
- `query.node` 不再暴露 `geometry/content/rect/bounds/canvas`

### 9.2 语义判定

- `mindmap owned node` 的 committed rect 在 engine 层已经正确
- live edit 下 topic auto width 只通过 `draft measure -> mindmap projector -> node projected` 生效
- free node preview 与 mindmap preview 不再共享同一条 geometry patch 语义

### 9.3 调试判定

出现几何问题时，排查路径最多只需要看：

1. committed node
2. draft measure
3. projected mindmap layout
4. projected node
5. render

如果还需要跨更多层排查，说明设计仍然不够短。

---

## 10. 最终结论

下一阶段不应该继续围绕“怎么让现有链再稳一点”做局部优化。

真正应该做的是一次性完成下面三件事：

1. 把 committed rect 真相前移到 engine
2. 把 tree-level 几何和 node-level 几何彻底分层
3. 把 node query 收口成 `committed -> projected -> render`

做到这三点之后：

- mindmap 不会再和 node 自己争夺 rect
- 派生链会明显变短
- 上下游边界会真正清楚
- 以后再排 bug，不需要在多条平行链之间来回猜
