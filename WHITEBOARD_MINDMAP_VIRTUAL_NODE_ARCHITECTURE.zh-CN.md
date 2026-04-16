# Whiteboard Mindmap 子节点 Node 中轴化最终架构

## 1. 目标

本文只解决一个问题：

mindmap 的嵌套子节点，必须像普通 node 一样：

- 可以单独 pick / select
- 可以弹出普通 toolbar
- 可以进入普通 edit
- `text` / `sticky` / `shape` 的行为与画布普通节点保持一致
- 不能一点击子节点就退化成选中整棵树

同时，整体设计仍然要保持简单：

- 文档里仍然只持久化一个 `mindmap` root node
- 不把每个子节点都展开成 document 里的真实 node
- 不新增一套平行的 mindmap toolbar / edit / layout / text 体系
- 不把逻辑散落到 react 各处修补

## 2. 最终结论

长期最优方案不是继续修 `pick.kind === 'mindmap'` 这条旁路，而是把 mindmap 子节点重构成：

`编辑器侧虚拟 node`

也可以叫：

`materialized node`

它的语义是：

1. 文档里仍然只有一棵 `MindmapTree`
2. tree 里的每个子节点 author 的是一个普通 node body
3. engine / editor query 把这个 body 加上 computed rect 后，物化成一个真正可被 selection / toolbar / edit / layout 使用的 `NodeView`
4. 只有坐标来源和写回路径与普通 node 不同

也就是说：

- 交互层统一成 `node`
- 数据存储层仍然保持 `mindmap tree`
- 中间通过一个稳定的 `virtual node` 适配层衔接

这是最简单、复用最多、长期维护成本最低的方案。

## 3. 为什么不能继续走当前方案

### 3.1 当前问题不是单纯 pick 没接上

现在的问题不是 “点不中 toolbar”，而是 mindmap 子节点根本不在普通 node 中轴里：

- 渲染走的是 mindmap 自定义 view
- pick 走的是 `kind: 'mindmap'`
- selection 不认识它是普通 node
- toolbar 不认识它是普通 node
- edit / layout / text draft 也都接不上

所以任何“补一个选中逻辑”的修法，都会继续制造第二套特例。

### 3.2 单独做一套 mindmap toolbar 是错误方向

如果为了 mindmap child 再做：

- `MindmapSelectionToolbar`
- `MindmapEditSession`
- `MindmapTextLayout`
- `MindmapNodeStylePanel`

那么本质上就是把普通 node 已经解决过的问题再做一遍。

这会直接导致：

- `text` 在普通画布和在 mindmap 里行为不一致
- font size / wrap / auto measure / placeholder / text color 再分叉
- edge / shape / sticky 未来也会复制分叉

这条路没有长期最优版本。

### 3.3 把每个 mindmap child 变成 document 真实 node 也不是最优

这看起来复用最多，但实际上会显著增加系统复杂度：

- 文档里会同时存在 tree 结构和展开后的 node 列表
- copy / paste / history / duplicate / delete / order / group 都会变复杂
- root tree 与 children nodes 会出现双真相

所以也不应该这么做。

## 4. 最终设计原则

### 4.1 单一 authored truth

文档中 mindmap 的 authored truth 仍然只有：

`document node.data = MindmapTree`

不新增：

- `mindmap child document nodes`
- `computed child nodes`
- `mindmap view`

### 4.2 普通 node 能力必须成为唯一中轴

只要一个 mindmap 子节点在产品语义上是文字块、sticky 或 shape，它在交互层就应该表现为：

`node`

而不是：

`mindmap special item`

### 4.3 mindmap 特有逻辑只保留两类

mindmap 只保留真正独有的逻辑：

- tree structure
- branch / subtree / root move / layout

其他能力一律复用普通 node：

- selection
- toolbar
- edit
- text layout
- field schema
- style capability

## 5. 最终数据模型

## 5.1 外层仍然只有一个 root node

```ts
type MindmapRootNode = Node & {
  type: 'mindmap'
  data: MindmapTree
}
```

root node 继续负责：

- `position`
- `locked`
- `groupId`
- `layer`
- `zIndex`

## 5.2 Tree child 不再是自定义 label/style 模型

最终不应该继续保留这种语义：

```ts
type MindmapTreeNode = {
  data?: MindmapTopicData
  style: {
    node: MindmapNodeStyle
    branch: MindmapBranchStyle
  }
}
```

因为这里的 `data + style.node` 本质上是在重复定义一套 “普通 node 的内容和外观”。

## 5.3 Tree child 改为 author 一个普通 node body

最终推荐模型：

```ts
type MindmapNodeBody = {
  type: 'text' | 'sticky' | 'shape'
  data?: Node['data']
  style?: Node['style']
}

type MindmapTreeNode = {
  id: MindmapNodeId
  parentId?: MindmapNodeId
  side?: 'left' | 'right'
  collapsed?: boolean
  body: MindmapNodeBody
  branch: MindmapBranchStyle
}
```

这里的原则非常直接：

- `body` 复用普通 node authored 模型
- `branch` 保留为 mindmap 专属 authored 模型

这样：

- child 是 `text`，就和普通 `text` 使用同一套 data/style 语义
- child 是 `sticky`，就和普通 `sticky` 使用同一套 data/style 语义
- child 是 `shape`，就和普通 `shape` 使用同一套 data/style 语义

## 5.4 为什么 `branch` 挂在 node 上

`branch` 的正确语义仍然是：

当前 node 到它 direct children 的连线样式

所以：

```ts
type MindmapTreeNode = {
  body: MindmapNodeBody
  branch: MindmapBranchStyle
}
```

是最自然的建模。

这和产品交互完全一致：

- 选中某个 node
- toolbar 改 branch
- 它到 children 的连接线变化

## 6. 虚拟 node 中轴

## 6.1 核心概念

需要新增一个稳定的中轴对象：

```ts
type MindmapVirtualNodeRef = {
  kind: 'mindmap-node'
  treeId: NodeId
  nodeId: MindmapNodeId
}
```

它不是 document node id，也不是临时 react state。

它是：

mindmap child 在 editor 内部的稳定身份。

## 6.2 物化后的节点视图

query 层需要把 authored tree child 物化成一个普通 node 视图：

```ts
type MaterializedMindmapNode = {
  ref: MindmapVirtualNodeRef
  node: Node
  rect: Rect
  rotation: number
  treeId: NodeId
  branch: MindmapBranchStyle
}
```

其中：

- `node.type / node.data / node.style` 来自 `MindmapTreeNode.body`
- `node.position` 来自 computed layout + root position
- `node.size` 来自 layout result
- `rotation` 通常是 `0`

关键点：

这里的 `node` 必须满足普通 node renderer / toolbar / edit 的输入要求。

## 6.3 不把它写回 document

这层 materialized node 只存在于 engine / editor query 中，不写回文档。

所以它不是 authored data，也不是 compatibility layer。

它只是：

将 `MindmapTreeNode.body + computed layout` 投影为普通 `Node`。

## 7. selection 最终方案

## 7.1 子节点必须进入普通 node selection

点击 child body 后，selection 的主体必须是：

```ts
type SelectionTarget =
  | { kind: 'node'; id: NodeId }
  | { kind: 'mindmap-node'; treeId: NodeId; nodeId: MindmapNodeId }
  | { kind: 'edge'; id: EdgeId }
```

但为了尽量少改已有体系，更推荐不要在 selection 层扩充很多 kind，而是新增一个中央解析层：

```ts
type SelectionNodeRef =
  | { kind: 'node'; id: NodeId }
  | { kind: 'mindmap-node'; treeId: NodeId; nodeId: MindmapNodeId }
```

然后 selection 内部的 “node 集合” 改成存这个 ref，而不是裸 `NodeId`。

## 7.2 为什么不能继续只存 `NodeId`

因为 mindmap child 没有 document `NodeId`。

如果仍然强行只存 `NodeId`，就只能：

- 选中整棵 tree root
- 或者给 child 伪造一个 document node id

这两个都不是长期最优。

## 7.3 推荐的 selection 中轴

推荐引入一个统一 ref：

```ts
type CanvasNodeRef =
  | { kind: 'node'; id: NodeId }
  | { kind: 'mindmap-node'; treeId: NodeId; nodeId: MindmapNodeId }
```

然后：

```ts
type SelectionTarget = {
  nodes: readonly CanvasNodeRef[]
  edgeIds: readonly EdgeId[]
}
```

这是这次重构里最关键的一步。

一旦 selection 中轴接受 `CanvasNodeRef`，后面这些全都会自然打通：

- selection summary
- target bounds
- toolbar context
- edit start
- delete / duplicate

## 7.4 tree root 如何被选中

tree root 仍然可以被选中，但它和 child node 的 pick 必须分开：

- 点击 child body：选中 `mindmap-node`
- 点击 tree 空白区域 / root 容器外壳：选中 `node(root mindmap)`
- 点击 connector：根据产品语义选择 tree 或 branch affordance

不允许再出现：

- 点击 child body，实际选中 root tree

## 8. pick 与 interaction 最终方案

## 8.1 `mindmap` pick 不应该再代表节点 body

当前的 `pick.kind === 'mindmap'` 只适合用于：

- subtree drag affordance
- root drag affordance
- tree 空白区域
- connector / branch affordance

它不应该再用于 child body。

## 8.2 child body 应改为普通 node pick

最终应该变成：

- 真实 document node body -> `pick.kind === 'node'`
- mindmap child virtual node body -> `pick.kind === 'node'` 或 `pick.kind === 'canvas-node'`

长期更清晰的做法是统一成新的 pick：

```ts
type CanvasNodePick =
  | {
      kind: 'canvas-node'
      target: { kind: 'node'; id: NodeId }
      part: 'body' | 'field' | 'transform' | 'connect'
      field?: 'text' | 'title'
    }
  | {
      kind: 'canvas-node'
      target: { kind: 'mindmap-node'; treeId: NodeId; nodeId: MindmapNodeId }
      part: 'body' | 'field'
      field?: 'text' | 'title'
    }
```

这样 selection/input/editor 看到的就是一个统一 node 世界。

## 8.3 为什么不建议继续保留 `mindmap` interaction 抢前

当前做法里 mindmap interaction 在 selection interaction 之前，会优先吃掉 child body pointer down。

这导致：

- 子节点无法先被正常 select
- drag 和 selection 是两条并行体系

长期最优应该改成：

1. body 先走统一 selection press
2. 达到 drag threshold 后，再根据 node ref 决定 move strategy

而不是：

1. 先看是不是 mindmap
2. 是的话直接进入另一套 interaction

## 9. toolbar 最终方案

## 9.1 不做第二套 mindmap child toolbar

mindmap child 的 toolbar 必须复用普通 selection toolbar。

也就是说：

- `text` child 用普通 text toolbar
- `sticky` child 用普通 sticky toolbar
- `shape` child 用普通 shape toolbar

唯一额外需要的是：

- `branch` scope

## 9.2 toolbar 应该是双 scope，而不是双体系

选中一个 mindmap child 后，toolbar 最终应支持：

```ts
type SelectionToolbarScope =
  | { kind: 'node-body'; ... }
  | { kind: 'mindmap-branch'; ... }
```

也就是说：

- `node-body` scope 复用普通 node toolbar
- `mindmap-branch` scope 只承载 branch color / line / width / stroke 等

这样用户体验是：

- 同一个 toolbar
- 不同 scope 切换
- 而不是两个完全不同的 toolbar

## 9.3 为什么这是最优

因为 branch 是 mindmap 专属语义，但 body 不是。

所以：

- body 走 node 中轴
- branch 走 mindmap 中轴

这是边界最清晰的拆分。

## 10. edit 最终方案

## 10.1 child edit 必须复用普通 node edit

最终不应该新增：

- `MindmapEditSession`
- `MindmapTextEditSession`

而应继续使用普通：

```ts
type EditSession =
  | { kind: 'node'; target: CanvasNodeRef; field: 'text' | 'title'; ... }
  | { kind: 'edge-label'; ... }
```

注意这里也应该把 `nodeId` 升级为统一的 `CanvasNodeRef`。

## 10.2 为什么 edit 也必须 ref 化

如果 `EditSession.kind === 'node'` 仍然只能指向 document `nodeId`，那 mindmap child edit 还是接不上。

所以 edit 中轴要和 selection 中轴保持一致：

- 真实 node
- mindmap virtual node

都通过一个统一 `CanvasNodeRef` 指向。

## 10.3 commit 路径

edit commit 时：

- 真实 node -> `node.patch`
- mindmap child -> `mindmap.patchNode`

这个分流必须放在 editor command 中央路由里，不要放在 react 组件里判断。

## 11. layout 最终方案

## 11.1 text / sticky / shape 的内容测量必须复用普通 layout

mindmap child 不能再继续走：

- label string
- 自定义 padding
- 自定义 width / height 盒子

否则它永远不会和普通 text / sticky / shape 行为一致。

最终应该是：

1. `body.type` 决定使用哪个 node definition / renderer / layout capability
2. layout service 使用同一套文本测量与 patch 策略
3. mindmap 只负责提供 anchor / branch / tree layout

## 11.2 mindmap layout 与 node layout 的职责边界

最终边界应为：

- `node layout`
  负责单个 node 的内容尺寸与 authored patch 语义
- `mindmap layout`
  负责树结构下每个 child node 的相对位置与 branch path

也就是说：

- 宽高怎么由文本内容推导，是 node layout 的事
- 节点在树上的 x/y 怎么排布，是 mindmap layout 的事

## 11.3 最终接口

```ts
type MindmapNodeMeasure = {
  target: MindmapVirtualNodeRef
  size: Size
}

type MindmapLayoutInput = {
  tree: MindmapTree
  rootPosition: Point
  measureNode: (node: MindmapTreeNode) => Size
}
```

`measureNode` 不再依赖 mindmap 自己的 label/style 模型，而是走普通 node definition 的测量。

## 12. commands 最终方案

## 12.1 中央路由必须统一

需要新增一个 editor 级 node target 路由：

```ts
type CanvasNodeTarget =
  | { kind: 'node'; id: NodeId }
  | { kind: 'mindmap-node'; treeId: NodeId; nodeId: MindmapNodeId }
```

并提供统一命令入口：

```ts
type CanvasNodeCommands = {
  patch: (targets: readonly CanvasNodeTarget[], update: NodeUpdateInput) => void
  delete: (targets: readonly CanvasNodeTarget[]) => void
  duplicate: (targets: readonly CanvasNodeTarget[]) => void
  startEdit: (target: CanvasNodeTarget, field: 'text' | 'title') => void
}
```

## 12.2 路由规则

中央路由规则应该固定：

- `node` -> 普通 node command
- `mindmap-node`
  - `patch` -> `mindmap.patchNode`
  - `delete` -> `mindmap.removeSubtree`
  - `duplicate` -> `mindmap.cloneSubtree`
  - `move` -> `mindmap.moveSubtree` 或 `mindmap.moveRoot`

这条路由必须放在 editor command 层，不要分散在 toolbar item、react component、editable slot 里。

## 12.3 为什么不应该让 toolbar 自己知道 mindmap

toolbar item 不应该判断：

- 当前是不是 mindmap child
- 如果是就调用 `mindmap.patchNode`
- 否则调用 `node.patch`

这样会把所有 item 都污染一遍。

长期最优必须是：

- toolbar 只操作统一 `CanvasNodeTarget`
- editor command 负责分流

## 13. react 渲染最终方案

## 13.1 不再手写 mindmap child 自定义 node 盒子

当前这种组件长期应该删除：

- 手写 label
- 手写 fill / frame / padding
- 手写 pick ref
- 手写 editing display

最终 react 应该只保留：

- tree connector 渲染
- child node host 渲染

## 13.2 child host 应复用普通 node registry

最终建议新增一个通用组件：

```ts
type VirtualNodeHostProps = {
  target: CanvasNodeTarget
  node: Node
  rect: Rect
  selected: boolean
}
```

它内部直接复用现有：

- node registry
- node renderer
- editable slot
- text source binding
- node view style pipeline

mindmap tree view 只负责把 materialized nodes 喂给这个 host。

## 13.3 tree view 的最终职责

最终 `MindmapTreeView` 只负责：

- connector svg
- child node host 列表
- drag ghost / insertion preview

它不再负责：

- 解释 body 是什么类型
- 决定文本怎么渲染
- 决定编辑态怎么渲染
- 决定 pick / toolbar / edit 如何接线

## 14. capability 与约束

## 14.1 body 复用普通 node capability

mindmap child body 的默认 capability 应继承普通 node definition：

- text 可编辑 font size / color / align
- sticky 可编辑 fill / color / font
- shape 可编辑 fill / stroke / text

## 14.2 通过中央 capability 禁用不适用能力

但 mindmap child 也有一些必须禁掉的能力：

- group / ungroup
- frame
- order
- align / distribute
- connect edge
- 独立 rotate
- 独立 resize

这些不应该靠 react 隐藏按钮来实现，而应该通过 editor capability 中央裁剪。

推荐接口：

```ts
type CanvasNodeCapability = {
  edit: boolean
  fill: boolean
  stroke: boolean
  font: boolean
  textAlign: boolean
  branch: boolean
  resize: boolean
  rotate: boolean
  connect: boolean
  group: boolean
  order: boolean
}
```

然后由：

- 普通 node capability
- mindmap target capability override

共同生成最终能力。

## 15. 最终 API 设计

## 15.1 Core

```ts
export type MindmapNodeBody = {
  type: 'text' | 'sticky' | 'shape'
  data?: Node['data']
  style?: Node['style']
}

export type MindmapTreeNode = {
  id: MindmapNodeId
  parentId?: MindmapNodeId
  side?: 'left' | 'right'
  collapsed?: boolean
  body: MindmapNodeBody
  branch: MindmapBranchStyle
}
```

## 15.2 Editor 中轴 ref

```ts
export type CanvasNodeTarget =
  | { kind: 'node'; id: NodeId }
  | { kind: 'mindmap-node'; treeId: NodeId; nodeId: MindmapNodeId }
```

## 15.3 Query

```ts
export type MaterializedMindmapNode = {
  target: Extract<CanvasNodeTarget, { kind: 'mindmap-node' }>
  treeId: NodeId
  nodeId: MindmapNodeId
  node: Node
  rect: Rect
  rotation: number
  branch: MindmapBranchStyle
}

export type CanvasNodeRead = {
  item: KeyedReadStore<CanvasNodeTarget, MaterializedCanvasNode | undefined>
  bounds: KeyedReadStore<CanvasNodeTarget, Rect | undefined>
  capability: (target: CanvasNodeTarget) => CanvasNodeCapability
}
```

其中：

```ts
type MaterializedCanvasNode =
  | {
      target: { kind: 'node'; id: NodeId }
      node: Node
      rect: Rect
      rotation: number
    }
  | MaterializedMindmapNode
```

## 15.4 Edit

```ts
type NodeEditSession = {
  kind: 'node'
  target: CanvasNodeTarget
  field: 'text' | 'title'
  initial: EditSnapshot
  draft: EditSnapshot
  layout: EditLayout
  caret: EditCaret
  status: EditStatus
  capabilities: EditCapability
}
```

## 15.5 Commands

```ts
type CanvasNodeCommands = {
  patch: (
    targets: readonly CanvasNodeTarget[],
    update: NodeUpdateInput,
    options?: { origin?: Origin }
  ) => void
  delete: (targets: readonly CanvasNodeTarget[]) => void
  duplicate: (targets: readonly CanvasNodeTarget[]) => void
  edit: {
    start: (target: CanvasNodeTarget, field: 'text' | 'title') => void
  }
}
```

## 15.6 Toolbar

```ts
type SelectionToolbarScope =
  | {
      key: string
      kind: 'node-body'
      target: SelectionTarget
      node: SelectionToolbarNodeScope
    }
  | {
      key: string
      kind: 'mindmap-branch'
      target: SelectionTarget
      branch: {
        treeId: NodeId
        nodeId: MindmapNodeId
        color?: string
        line?: 'curve' | 'elbow' | 'rail'
        width?: number
        stroke?: 'solid' | 'dashed' | 'dotted'
      }
    }
```

## 16. 落地顺序

## 16.1 第一阶段：引入 `CanvasNodeTarget`

先把 editor 中轴从裸 `NodeId` 升级成：

- `node`
- `mindmap-node`

覆盖范围：

- selection
- edit
- target bounds
- toolbar context

这是整次重构的地基。

## 16.2 第二阶段：引入 materialized mindmap node read

让 query 能返回：

- materialized `node`
- rect
- bounds
- capability

并且让 react 可以用普通 node host 渲染它。

## 16.3 第三阶段：切掉 child body 的 `mindmap` pick

把 child body 从 mindmap 专用 interaction 里拿出来，改为统一 node press / selection / edit 路线。

此时：

- 点击子节点可以单独选中
- 普通 toolbar 可以弹出
- 普通 edit 可以进入

## 16.4 第四阶段：中央命令路由接通

把：

- patch
- delete
- duplicate
- edit start
- move

都统一走 `CanvasNodeTarget` 中央路由。

此时 toolbar 和 edit 不再需要知道它是不是 mindmap child。

## 16.5 第五阶段：删除旧的 mindmap child 自定义渲染/编辑语义

删除：

- label 专用渲染
- child 专用文本样式逻辑
- child 专用 pick 旁路
- child 专用 edit 旁路

最终只保留：

- connector / tree drag / branch affordance

这些真正 mindmap 专属的能力。

## 17. 非目标

本文不建议在这一轮同时做：

- mindmap child 变成 document 实体 node
- mindmap 与 group / frame / order 深度集成
- 任意类型 node 都能放进 tree

本轮长期最优的边界应该收敛为：

- child body 先支持 `text | sticky | shape`
- 行为与普通 node 保持一致
- tree / branch 逻辑仍然由 mindmap 独占

## 18. 最终一句话

mindmap 子节点的长期最优方案不是继续给 `mindmap` 补特例，而是：

把它建模为 `tree 中 author 的普通 node body`，再在 editor 中轴里物化成 `virtual node`，让 selection、toolbar、edit、layout、commands 全部复用普通 node 体系。

只有 tree structure、branch 和 subtree move 仍然属于 mindmap 自己。
