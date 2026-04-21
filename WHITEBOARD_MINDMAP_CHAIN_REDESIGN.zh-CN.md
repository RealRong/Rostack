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

### 2.5 public read 和 internal query 没有分层

当前 `EditorRead` 直接把 `query` 中的 mindmap/node 结构半公开出来，包括：

- `editor.read.mindmap.layout`
- `editor.read.mindmap.node`
- 未来很容易继续暴露 `editor.read.node.projected`

这会让本来只该存在于 runtime 内部的中间语义，逐步变成对外承诺。

一旦 public surface 和 internal store 绑死，后续任何清链都会变难。

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

### 3.5 API 必须分 internal / public 两层

最终必须明确区分两套接口：

- `EditorRuntimeQuery`
- `EditorRead`

边界规则：

- `EditorRuntimeQuery` 只给 editor 内部 runtime、action、input、内部测试使用
- `EditorRead` 才是对外稳定接口
- internal node 可以暴露 `committed -> projected -> render`
- public node 只能暴露 `render`
- internal mindmap 可以保留 `layout`
- public mindmap 不暴露 `layout`，更不暴露 `node`

结论很明确：

- `committed / projected` 是 runtime 语义，不是 public 语义
- public API 只能暴露最终消费结果，不能把上游几何真相泄漏出去

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

目标类型：

```ts
type ProjectedMindmapLayout = {
  id: NodeId
  rootId: NodeId
  nodeIds: readonly NodeId[]
  computed: MindmapLayout
  connectors: readonly MindmapRenderConnector[]
}
```

最小 projector API：

```ts
const projectMindmap = (input: {
  structure: MindmapStructureItem
  committed: MindmapLayoutItem
  liveSizes: ReadonlyMap<NodeId, Size | undefined>
  preview?: MindmapGesturePreview
}) => ProjectedMindmapLayout
```

目标读取方式：

- `mindmap.layout.get(treeId)` 读取整棵树
- 需要 node rect 时，调用方直接通过 `computed.node[nodeId]` 查

明确删除：

- `MindmapNodeLayoutItem`
- `MindmapLayoutRead.node`
- `query.mindmap.node`

另外明确一条：

- `ProjectedMindmapInput` 不作为公共类型单独导出
- 它只是 `projectMindmap()` 的局部输入对象，不是稳定 API

## 4.6 NodeModel

最终 `Node` 不能再同时承担“语义模型”和“几何模型”。

目标类型：

```ts
type NodeModel = Omit<Node, 'position' | 'size' | 'rotation'>
```

规则：

- `NodeModel` 只承载 node 语义本身
- 运行时几何真相只存在于 `rect / bounds / rotation`
- 一切 projected/render/renderer 层都改用 `NodeModel`

这条规则的目的非常直接：

- 防止 `node.position/size/rotation` 和 `render.rect` 再次形成双重真相
- 防止 renderer 从 `node` 上偷读旧几何，绕过 projection 链

## 4.7 ProjectedNode

最终 node query 的核心不是 `geometry/content/item/render` 这条长链，而是一个统一的 node projection。

目标类型：

```ts
type ProjectedOwnerGeometry = {
  rect: Rect
  rotation: number
}

type ProjectedNode = {
  nodeId: NodeId
  node: NodeModel
  rect: Rect
  bounds: Rect
  rotation: number
}
```

最小 projector API：

```ts
const projectNode = (input: {
  committed: NodeItem
  ownerGeometry?: ProjectedOwnerGeometry
  draft?: DraftMeasure
  preview?: {
    geometry?: NodeGeometryPreview
    text?: TextLayoutPreview
  }
}) => ProjectedNode
```

构造规则：

- free node:
  - committed node 作为基线
  - text edit draft 只影响 intrinsic size 或 fit fontSize
  - geometry preview 只影响 free node 自己
- mindmap owned node:
  - committed 基线来自 engine owner-aware rect
  - live rect 只来自 `ownerGeometry`
  - 不再吃 node 级 geometry preview

这里有两个明确删除项：

- `finalRect: Rect` 不再作为输入字段存在
- `contentDraft?: NodeContentDraft` 不再作为独立公共类型存在

原因：

- `finalRect` 本来就是 projection 的输出，不应该提前伪装成输入
- 文本编辑态在 projector 边界上只保留 `DraftMeasure`，不再保留半成品内容补丁对象

这意味着 `projectNode()` 是唯一的 node final projection 入口。

## 4.8 NodeRender 与 NodeRenderProps

render 只在 projected node 上追加 runtime。

目标类型：

```ts
type NodeRender = {
  nodeId: NodeId
  node: NodeModel
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

type NodeRenderProps = {
  node: NodeModel
  rect: Rect
  rotation: number
  selected: boolean
  hovered: boolean
  edit?: {
    field: EditField
    caret: EditCaret
  }
  write: NodeWrite
}
```

最小 render API：

```ts
const buildNodeRender = (input: {
  projected: ProjectedNode
  runtime: {
    hovered: boolean
    hidden: boolean
    resizing: boolean
    patched: boolean
    selected: boolean
    edit?: {
      field: EditField
      caret: EditCaret
    }
  }
  capability: NodeCapability
}) => NodeRender
```

render 不再知道：

- draft measure
- projected mindmap 输入
- committed rect 修补逻辑

另外明确一条：

- `NodeRenderInput` 不作为公共类型单独导出
- renderer 契约只有 `NodeRenderProps`

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

- `committed node + ownerGeometry + draft measure + preview -> projected node`

不负责：

- committed rect 补丁
- tree flatten index
- 完整 mindmap tree 语义

也就是说：

- runtime glue 可以依赖 `mindmap.layout`
- 但纯 `projectNode()` 只认 `ownerGeometry`

## 5.6 render/query facade

负责：

- 输出 internal runtime query
- 输出 public read facade

不负责：

- 二次布局推导

---

## 6. 最终 API 收口

这里明确区分三层：

1. `EngineRead`
2. `EditorRuntimeQuery`
3. `EditorRead`

只有第三层是 public surface。

## 6.1 EngineRead

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

说明：

- engine 层保留 committed 语义
- committed rect 在这里已经完成 owner-aware 收口

## 6.2 EditorRuntimeQuery

这是 editor 内部运行时接口，不对外承诺稳定性。

```ts
type EditorRuntimeQuery = {
  node: {
    list: ReadStore<readonly NodeId[]>
    committed: KeyedReadStore<NodeId, NodeItem | undefined>
    projected: KeyedReadStore<NodeId, ProjectedNode | undefined>
    render: KeyedReadStore<NodeId, NodeRender | undefined>
    capability: (node: Pick<NodeModel, 'id' | 'type' | 'owner'>) => NodeCapability
    idsInRect: (rect: Rect, options?: NodeRectHitOptions) => NodeId[]
    ordered: () => readonly NodeModel[]
  }
  mindmap: {
    list: ReadStore<readonly NodeId[]>
    structure: KeyedReadStore<NodeId, MindmapStructureItem | undefined>
    layout: KeyedReadStore<NodeId, ProjectedMindmapLayout | undefined>
    scene: KeyedReadStore<NodeId, MindmapSceneItem | undefined>
    chrome: KeyedReadStore<NodeId, MindmapChrome | undefined>
    navigate: (input: {
      id: NodeId
      fromNodeId: NodeId
      direction: 'parent' | 'first-child' | 'prev-sibling' | 'next-sibling'
    }) => NodeId | undefined
  }
  edge: {
    render: KeyedReadStore<EdgeId, EdgeRender | undefined>
    selectedChrome: KeyedReadStore<EdgeId, EdgeSelectedChrome | undefined>
  }
}
```

说明：

- internal node 保留 `committed / projected / render` 三层
- internal mindmap 保留 `layout`
- `EditorRuntimeQuery` 可以被 action、input、内部测试消费
- 它不能通过 `editor.read` 暴露给业务层

## 6.3 EditorRead

这是最终 public surface，也是 package 对外唯一应承诺稳定的读接口。

```ts
type EditorRead = {
  node: {
    render: KeyedReadStore<NodeId, NodeRender | undefined>
  }
  edge: {
    render: KeyedReadStore<EdgeId, EdgeRender | undefined>
    selectedChrome: KeyedReadStore<EdgeId, EdgeSelectedChrome | undefined>
  }
  mindmap: {
    structure: KeyedReadStore<NodeId, MindmapStructureItem | undefined>
    scene: KeyedReadStore<NodeId, MindmapSceneItem | undefined>
    chrome: KeyedReadStore<NodeId, MindmapChrome | undefined>
    navigate: (input: {
      id: NodeId
      fromNodeId: NodeId
      direction: 'parent' | 'first-child' | 'prev-sibling' | 'next-sibling'
    }) => NodeId | undefined
  }
  document: ...
  group: ...
  history: ...
  scene: ...
  selection: ...
  tool: ...
  viewport: ...
  chrome: ...
  panel: ...
}
```

public 明确不暴露：

- `editor.read.node.committed`
- `editor.read.node.projected`
- `editor.read.mindmap.layout`
- `editor.read.mindmap.node`

这也是最终答案：

- `EditorNodeRead` 不应该作为 public type 存在
- public node 最终只暴露 `render`
- `committed / projected` 只属于 `EditorRuntimeQuery`

## 6.4 对外稳定语义

public 还保留 `mindmap.structure` 的原因不是历史兼容，而是它确实是产品语义：

- 键盘导航需要 tree 结构
- 插入 child/sibling 需要 tree 结构
- 某些选择和快捷操作需要 parent/child/sibling 语义

public 还保留 `mindmap.scene` 的原因也很明确：

- bbox 是稳定 UI 语义
- connectors 是稳定 UI 语义

而 `mindmap.layout` 不保留的原因同样明确：

- 它是 runtime tree geometry 真相
- 它属于 internal projector 输出
- public 只应该拿 scene/chrome 这种已经抽象好的消费结果

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

- internal 一个统一的 `committed`
- internal 一个统一的 `projected`
- internal 一个基于 `projected` 的 `render`

并且必须同步删除：

- 任何把完整 `Node` 继续带到 `projected/render` 的实现

### 7.4 editor/query/mindmap/read.ts

删除：

- `node`

internal 只保留：

- `layout`
- `scene`
- `chrome`
- `navigate`

public 只保留：

- `structure`
- `scene`
- `chrome`
- `navigate`

### 7.5 editor/read.ts 与 editor/types/editor.ts

删除 public 暴露：

- `mindmap.layout`
- `mindmap.node`

不再定义这种 public 类型：

- `EditorNodeRead`

最终 public node surface 只有：

- `node.render`

### 7.6 preview types

删除当前这种混合字段设计：

- `feedback.text.position`
- `feedback.text.size`

改为明确拆分的 preview store。

### 7.7 renderer contract

必须统一：

- `ProjectedNode.node` 使用 `NodeModel`
- `NodeRender.node` 使用 `NodeModel`
- `NodeRenderProps.node` 使用 `NodeModel`

不再允许：

- renderer 从 `node.position`
- renderer 从 `node.size`
- renderer 从 `node.rotation`

偷读几何真相。

### 7.8 命名

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

在 editor runtime 中只保留：

- `mindmap.layout`

所有 node 级 mindmap rect 读取都改为：

- 通过 node owner 找 tree
- 从 `mindmap.layout.get(treeId)?.computed.node[nodeId]` 取 rect
- 再归一成 `ownerGeometry` 传给 `projectNode()`

## 8.3 第三步：引入 `NodeModel`

先把 `Node` 的几何字段从 projected/render/renderer 侧彻底剥掉。

目标：

- `ProjectedNode.node` 改为 `NodeModel`
- `NodeRender.node` 改为 `NodeModel`
- `NodeRenderProps.node` 改为 `NodeModel`

这一步不做，后面的 API 收口会继续被旧几何绕穿。

## 8.4 第四步：重写 node projector

新建统一的 `projectNode()`：

- 输入 committed node
- 输入 `ownerGeometry`
- 输入 draft measure
- 输入 preview
- 输出 `ProjectedNode`

然后所有后续层都只围绕 `ProjectedNode` 工作。

## 8.5 第五步：拆 internal/public API

把现有“query 直接半公开”的结构拆成两层：

- `EditorRuntimeQuery`
- `EditorRead`

然后一次性完成：

- internal 保留 `node.committed/projected/render`
- internal 保留 `mindmap.layout`
- public 只保留 `node.render`
- public 删除 `mindmap.layout/node`

## 8.6 第六步：拆 preview 语义

把现在的混合 `feedback.text` 拆成：

- geometry preview
- text layout preview
- mindmap gesture preview

## 8.7 第七步：清理命名和测试

所有调用方一次性更新到新语义：

- `committed`
- `projected`
- `render`

不保留旧 API 别名。

如果测试要断言 internal layout：

- 直接测 `EditorRuntimeQuery`
- 不再借 public `EditorRead` 走后门

---

## 9. 完成判定

只有同时满足下面条件，才算这次重构完成。

### 9.1 结构判定

- editor 中不存在 `readCommittedLayoutNodeItem()`
- editor 中不存在 `query.mindmap.node`
- editor 中不存在 `MindmapNodeLayoutItem`
- `query.node` 不再暴露 `geometry/content/rect/bounds/canvas`

### 9.2 public API 判定

- `EditorRead.node` 只暴露 `render`
- `EditorRead.mindmap` 不暴露 `layout`
- `EditorRead.mindmap` 不暴露 `node`
- public 不存在 `EditorNodeRead`

### 9.3 语义判定

- `mindmap owned node` 的 committed rect 在 engine 层已经正确
- live edit 下 topic auto width 只通过 `draft measure -> mindmap projector -> ownerGeometry -> node projected` 生效
- free node preview 与 mindmap preview 不再共享同一条 geometry patch 语义
- projected/render/renderer 侧不再持有几何版 `Node`

### 9.4 调试判定

出现几何问题时，排查路径最多只需要看：

1. committed node
2. draft measure
3. projected mindmap layout
4. ownerGeometry
5. projected node
6. render

如果还需要跨更多层排查，说明设计仍然不够短。

---

## 10. 最终结论

下一阶段不应该继续围绕“怎么让现有链再稳一点”做局部优化。

真正应该做的是一次性完成下面四件事：

1. 把 committed rect 真相前移到 engine
2. 把 tree-level 几何和 node-level 几何彻底分层
3. 把 `Node` 的几何字段从 projected/render/renderer 侧剥掉
4. 把 API 收口成 internal `EditorRuntimeQuery` / public `EditorRead`

做到这四点之后：

- mindmap 不会再和 node 自己争夺 rect
- 派生链会明显变短
- 上下游边界会真正清楚
- public surface 会稳定很多
- 以后再排 bug，不需要在多条平行链之间来回猜
