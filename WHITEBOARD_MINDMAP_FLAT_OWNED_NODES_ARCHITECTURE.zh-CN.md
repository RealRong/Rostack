# Whiteboard Mindmap 扁平化 Owned Nodes 最终架构

## 1. 最终结论

mindmap 的嵌套子节点，长期最优方案不是 virtual node，也不是继续保留 tree 内嵌 body/style，而是：

`MindmapTree 只存结构`

`子节点作为 document 里的真实 node 平铺存储`

`position / size / data / style 全部以真实 node 为权威`

`mindmap 负责结构、layout、branch，并统一控制 owned nodes`

也就是说，最终模型应当是：

1. document 里存在一个 `type: 'mindmap'` 的 root node
2. document 里同时存在这个 mindmap 拥有的真实 child nodes
3. `mindmap.data` 只存树结构与分支样式，不再存 node body
4. child node 的位置由 mindmap layout 命令统一写回 node

这是“复用最多基础设施，同时不引入 virtual adapter 层”的最终方案。

## 2. 为什么这条路更简单

如果 mindmap child 是 document 里的真实 node，那么下面这些能力基本都能直接复用：

- pick
- selection
- toolbar
- edit
- text layout
- node registry
- bounds / hit test
- selection box
- viewport / export / clipboard

也就是说，编辑器不再需要额外发明：

- virtual node ref
- materialized node query
- mindmap child pick 特判
- mindmap child edit 特判
- mindmap child toolbar 特判

复杂度不再堆在 editor/react 交互层，而是收敛到：

- 文档语义
- ownership
- command 路由
- capability 约束

这条线更中轴化。

## 3. 必须避免的错误版本

这条路只有在**彻底扁平化**时才简单。

绝对不能做成下面这种双真相：

- tree 里存 child 的 text / style / data
- document.nodes 里也存 child 的 text / style / data
- 两边同步

这种做法会让：

- toolbar 不知道写哪边
- edit 不知道提交哪边
- copy / duplicate / delete 需要双写
- layout / render / undo 会出现分裂语义

所以必须一步到位站队：

**node 内容和外观只存在于真实 node 上**

**tree 只存结构和 branch**

## 4. 最终持久化模型

## 4.1 Document Nodes

最终 document 应类似这样：

```ts
document.nodes = {
  mind_1: {
    id: 'mind_1',
    type: 'mindmap',
    position: { x: 400, y: 240 },
    data: {
      rootNodeId: 'node_root',
      nodes: {
        node_root: {
          parentId: undefined,
          side: undefined,
          collapsed: false,
          branch: {
            color: '#2563eb',
            line: 'curve',
            width: 2,
            stroke: 'solid'
          }
        },
        node_a: {
          parentId: 'node_root',
          side: 'right',
          collapsed: false,
          branch: {
            color: '#2563eb',
            line: 'curve',
            width: 2,
            stroke: 'solid'
          }
        }
      },
      children: {
        node_root: ['node_a'],
        node_a: []
      },
      layout: {
        side: 'both',
        mode: 'tidy',
        hGap: 28,
        vGap: 18
      }
    }
  },
  node_root: {
    id: 'node_root',
    type: 'text',
    position: { x: 400, y: 240 },
    size: { width: 120, height: 40 },
    data: { text: 'Central topic' },
    style: { color: '#0f172a', fontSize: 16, fill: '#dbeafe' },
    mindmapId: 'mind_1'
  },
  node_a: {
    id: 'node_a',
    type: 'text',
    position: { x: 560, y: 240 },
    size: { width: 100, height: 32 },
    data: { text: 'Branch A' },
    style: { color: '#0f172a', fontSize: 14 },
    mindmapId: 'mind_1'
  }
}
```

关键点：

- `mindmap root node` 仍然存在
- `child nodes` 是真实 node
- child node 的 `position / size / data / style` 都在 node 上
- `mindmap.data` 只存结构、branch、layout

## 4.2 Tree 数据只保留结构语义

最终推荐：

```ts
type MindmapTree = {
  rootNodeId: NodeId
  nodes: Record<NodeId, MindmapTreeNode>
  children: Record<NodeId, NodeId[]>
  layout: MindmapLayoutSpec
  meta?: {
    createdAt?: string
    updatedAt?: string
  }
}
```

```ts
type MindmapTreeNode = {
  parentId?: NodeId
  side?: 'left' | 'right'
  collapsed?: boolean
  branch: MindmapBranchStyle
}
```

这里不再需要：

- `MindmapTopicData`
- `MindmapTreeNode.style.node`
- `MindmapTreeNode.body`

因为这些都应该直接存在真实 node 上。

## 5. position 和 size 的权威归属

## 5.1 最终结论

`position` 和 `size` 都应该存在于真实 child node 上。

不要做：

- position 只存在 computed layout
- size 只存在 tree view

也不要做：

- 一部分在 tree
- 一部分在 node

## 5.2 为什么 position 也应该写回真实 node

因为这样可以直接复用：

- node rect / bounds
- selection / marquee
- toolbar 定位
- viewport / export
- pick hit testing
- clipboard / duplicate

虽然这些位置是由 mindmap layout 控制的，但它们仍然应该是：

`真实 node.position`

只是写入路径不再是用户自由拖拽，而是：

`mindmap layout -> patch child node.position`

## 5.3 size 也应以真实 node 为权威

如果 child 需要和普通 `text` / `sticky` / `shape` 完全一致，那么：

- 文本测量
- wrap
- auto measure
- font size
- shape label layout

都必须继续走普通 node 中轴。

因此最终：

- size 仍然落在真实 node 上
- mindmap layout 只是读取这个 size 决定排布

## 6. ownership 的最终设计

这次最关键的决策之一，就是 child node 如何表达“归属于某个 mindmap”。

候选方案有两种：

### 6.1 方案 A：专用字段 `node.mindmapId`

```ts
type Node = {
  ...
  groupId?: GroupId
  mindmapId?: NodeId
}
```

优点：

- 简单直接
- 查询快
- 语义清晰
- 对 mindmap 这个场景最少抽象

缺点：

- 比 `groupId` 多一条平行字段
- 如果以后还有别的 owner 类型，会继续加字段

### 6.2 方案 B：统一 owner

```ts
type NodeOwner =
  | { kind: 'group'; id: GroupId }
  | { kind: 'mindmap'; id: NodeId }

type Node = {
  ...
  owner?: NodeOwner
}
```

优点：

- 模型更统一
- 以后扩展别的宿主关系更自然
- 从语义上比 `groupId + mindmapId` 更中轴化

缺点：

- 需要把现在围绕 `groupId` 的很多读写逻辑一起改造
- 会把本轮范围从 “mindmap 架构重做” 扩到 “node ownership 基础层重做”
- 如果当前系统里 group 还有很多历史语义，迁移成本会更高

## 6.3 最终建议

### 短中期长期最优平衡建议

如果目标是：

- 一步到位把 mindmap 扁平化 owned-node 模型落地
- 但不要同时引爆 group 基础层重构

那么最终建议是：

**本轮采用 `node.mindmapId`**

也就是：

```ts
type Node = {
  ...
  groupId?: GroupId
  mindmapId?: NodeId
}
```

原因：

1. 它能最快把 mindmap 的 owned-node 语义落稳
2. 不要求本轮把 `groupId` 全部抽象成 owner
3. 对 selection / query / command / layout 的改动边界更清晰
4. 可以先把 mindmap 中轴架构打通

## 6.4 本轮明确结论

为了把扁平化 owned-node mindmap 尽快收稳，本轮明确不做：

- `owner?: { kind: 'group' | 'mindmap'; id: string }`
- `host?: { kind: 'mindmap'; id: NodeId }`
- `container?: ...`

本轮唯一 ownership 字段就是：

```ts
type Node = {
  ...
  groupId?: GroupId
  mindmapId?: NodeId
}
```

这不是说更抽象的模型永远不可能成立，而是：

1. `group` 和 `mindmap` 当前不是同一类语义
2. `group` 不接管 order / lifecycle / layout
3. `mindmap` 会接管 order / lifecycle / layout
4. 如果现在强行统一成 `owner`，后续几乎所有实现都会充满 `owner.kind` 分支

所以本轮实现依据必须明确：

**先用 `mindmapId` 落地 mindmap owned-node 语义，不做更高层抽象。**

## 7. root mindmap node 的语义

扁平化之后，root `mindmap` node 仍然必须保留。

它的职责是：

- 整棵树的宿主节点
- layout 参数、branch 结构的持久化宿主
- 整体移动 / 整体选择 / 整体删除的入口
- 未来 tree 级 toolbar 的承载对象

也就是说：

- child 是真实 node
- root 仍然是树容器 node

这比“没有 root 只剩 children”更稳定。

## 8. selection 最终语义

## 8.1 child node 直接走普通 node selection

因为 child 已经是 document 真实 node，所以点击 child 后：

- 直接选中这个 node
- 直接弹出普通 node toolbar
- 直接进入普通 edit

这里不需要再发明：

- mindmap child selection target
- virtual node ref
- special toolbar context

## 8.2 root tree 与 child node 的选择边界

最终应该明确：

- 点击 child body：选中 child node
- 点击 root node 本体：选中 root node
- branch 线段本身不可点击、不可选中、不可作为 toolbar 入口
- 点击 tree 的空白区域：等价于 background，或命中 tree 下方真实 edge/node

不能再出现：

- 点击 child body 却选中 root tree
- 点击 tree 空白区域却选中 root node
- 点击 branch 线段却选中 root 或 child node

## 8.3 group 约束

基于当前产品语义，本轮还应明确：

- mindmap root 不允许参加 group
- owned child node 也不允许参加 group

也就是说：

- `groupId` 与 `mindmapId` 在产品上不会同时成立
- 但数据模型上仍然先保留两条独立字段

这样可以避免为了 “group 与 mindmap 统一 ownership” 而提前重构整套 group 体系。

## 9. toolbar 最终语义

## 9.1 child toolbar 直接复用普通 node toolbar

因为 child 是真实 node，所以：

- text child -> 普通 text toolbar
- sticky child -> 普通 sticky toolbar
- shape child -> 普通 shape toolbar

无需单独做 `MindmapNodeToolbar`。

## 9.2 branch 编辑如何处理

branch 不是普通 node 的一部分，所以它不应混进 child node 的普通 style 里。

推荐方案：

- 选中 child node 后，toolbar 提供一个额外 scope 或 item 进入 branch 编辑
- branch 的写入目标仍然是 root mindmap tree 的 `nodes[nodeId].branch`

并且需要明确：

- branch 编辑入口来自已选中的 node toolbar
- branch 本身不是可 pick 元素
- branch 不支持点击选中
- branch 不支持单独 hover/selection chrome

也就是说：

- body 样式写真实 node
- branch 样式写 tree

边界是清晰的。

## 10. edit 与 layout 最终语义

## 10.1 edit

因为 child 已经是真实 node，所以：

- `EditSession.kind === 'node'`
- `edit.startNode(nodeId, field)`
- `EditableSlot`
- text draft
- commit / cancel

都可以直接复用。

不需要任何新的 mindmap edit 模型。

## 10.2 layout

因为 child 是真实 node，所以：

- text auto measure
- sticky auto font
- shape label layout

都继续走普通 node layout。

mindmap 自己只做：

- 读取 child rect / size
- 计算树布局
- 回写 node positions

职责边界非常清晰。

## 10.3 text 尺寸变化后的自动 relayout

这一点需要明确写成最终实现规则：

如果 child node 是 `text` / `sticky` / `shape`，并且因为内容或样式变化导致实际尺寸变化，那么必须自动触发 mindmap relayout。

典型触发源包括：

- text 内容变化
- fontSize 变化
- fontWeight / fontStyle 变化
- wrap 宽度变化
- sticky auto font 变化
- shape label 尺寸变化

原则是：

**只要 child rect 变了，就应该自动 relayout 对应 mindmap。**

## 10.4 editor 与 engine 的职责边界

这里不是 “纯 editor 驱动” 或 “纯 engine 驱动” 的二选一，而是明确拆成两段：

### editor 负责

- 基于真实 DOM 测量 child 的最新 size
- 在编辑过程中做本地实时 relayout 预览
- 只要尺寸变化，就生成需要提交的 size 更新事实

### engine 负责

- 接收最终的 child size / text / style 更新
- 读取对应 `mindmapId`
- 基于最新 child sizes 重新计算树布局
- 把受影响 child nodes 的 `position` 统一写回 document

也就是说：

- `measure` 在 editor
- `preview relayout while editing` 在 editor
- `authoritative relayout commit` 在 engine

## 10.5 为什么不能纯 engine 或纯 editor

不能纯 engine 的原因：

- 文本真实尺寸依赖 DOM、字体、排版规则
- engine 无法稳定测量浏览器中的文本结果

不能纯 editor 的原因：

- relayout 结果最终必须进入 document
- 否则 undo / redo / 协作 / read model 真相都会分裂

所以最终模型必须是：

**editor 产出尺寸事实**

**engine 产出文档事实**

## 11. command 架构

## 11.1 核心原则

child 是真实 node，不代表所有 node command 都应该无约束地放开。

需要引入明确规则：

- 普通 node command 负责 node 本身的数据、样式、文本、size
- mindmap command 负责树结构、branch、layout、owned-node 生命周期

## 11.2 写入分工

### 真实 node 直接写

这些改动直接写 child node：

- text
- fill
- stroke
- fontSize
- fontWeight
- fontStyle
- textAlign
- opacity
- size

### tree 结构写 root mindmap

这些改动写 `mindmap.data`：

- parent / children
- side
- collapsed
- branch style
- layout spec

这里要明确：

- `preset` 不是 authored data
- `preset` 只允许作为 `create` / `applyPreset` 等命令的输入参数
- 命令执行完成后，不在 `mindmap.data` 中持久化 `preset`
- 也不写入 `meta`
- preset

### layout 统一事务写

mindmap 结构变化后，command 应统一：

1. 更新 tree
2. 读取 child sizes
3. 重新计算布局
4. 批量 patch child node positions

这应该是一条事务，不允许散落在 react 组件里。

同样地，child 尺寸变化导致的 relayout 也必须遵守相同规则：

1. 提交最终 child node 的 text / style / size 更新
2. 读取对应 mindmap 的最新 tree 与 child sizes
3. 重新计算布局
4. 批量 patch 受影响 child nodes 的 position

也就是说，最终不要把：

- `node.patch(size)`
- `mindmap.relayout()`

做成两条松散命令，而应该在 engine 里收口为同一条事务性提交流程。

## 11.3 order 最终语义

`order` 必须做成非常明确的模型：

**owned child node 没有独立全局 order。**

**它们的有效 order 与 root mindmap 一致。**

最终语义是：

1. `document.order` 只记录顶层 canvas item
2. mindmap root 作为一个顶层 canvas item 进入 `document.order`
3. owned child nodes 不进入 `document.order`
4. child node 的视觉层级整体继承 root 所在的那个 order 槽位

也就是说，child node 虽然是 `document.nodes` 里的真实 node，但它不是：

- 顶层 canvas item
- 独立 order participant

这点必须成为实现基础。

## 11.4 为什么 child 不应进入 `document.order`

如果 child 也进入 `document.order`，会立刻引出一批脆弱语义：

- root 前移时是否要带着全部 child 一起移动 order block
- child 是否允许和外部 node 穿插排序
- duplicate / delete / clipboard 时如何维护连续块
- root 与 child 的渲染顺序如何保持稳定

这些问题都没有收益，只会让 mindmap 从“整体对象”退化成“很多偶然碰巧关联的 node”。

所以最终实现必须禁止：

- child 独立 order
- child 参与全局前后穿插排序

## 11.5 order 命令路由

这要求 editor command 明确路由：

- 对普通 node 执行 `order`：正常处理
- 对 `mindmap` root 执行 `order`：正常处理
- 对 `mindmapId` child 执行 `order`：
  - 禁用
  - 或自动折叠为对对应 root mindmap 执行 `order`

本轮更建议直接禁用 child 的独立 order UI，并在命令层兜底折叠到 root。

## 11.6 生命周期命令

推荐最终命令语义：

```ts
type MindmapCommands = {
  create: (...) => {
    create root mindmap node
    create root child node
  }
  insertChild: (...) => {
    create child node
    patch tree
    relayout
  }
  insertSibling: (...) => {
    create child node
    patch tree
    relayout
  }
  insertParent: (...) => {
    create child node
    patch tree
    relayout
  }
  moveSubtree: (...) => {
    patch tree
    relayout
  }
  removeSubtree: (...) => {
    delete subtree child nodes
    patch tree
  }
  cloneSubtree: (...) => {
    clone subtree child nodes
    patch tree
    relayout
  }
  patchBranch: (...) => {
    patch tree.nodes[nodeId].branch
  }
  relayout: (...) => {
    patch child positions
  }
}
```

## 12. capability 约束

扁平化后 child 是真实 node，但不应该拥有全部普通 node 权限。

最终应通过 editor capability 中央约束：

- 可以 edit
- 可以改样式
- 可以被 select
- 可以被 toolbar 操作

但默认禁止：

- group / ungroup
- frame
- order
- connect edge
- 独立自由 move 脱离 tree
- 独立 rotate
- 独立 resize handle 拖拽布局

也就是说，它是：

`真实 node`

但不是：

`完全自由的普通 canvas node`

## 13. query / read 最终要求

因为 child 是真实 node，engine read model 不应该再过滤掉它们。

需要明确：

- `read.node.list` 包含这些 child nodes
- `read.node.item` 能直接读取这些 child nodes
- `read.target.bounds` 对它们正常工作
- `selection summary` 对它们正常工作

mindmap read 则专注于：

- root mindmap item
- tree structure
- branch connectors
- tree-level chrome

而不是重复再构建一套 child node read。

## 14. 渲染与 DOM 层级最终方案

扁平化后，渲染必须收口到两层：

- 顶层 scene
- root mindmap 内部 scene

这点与 `order` 模型强相关。

## 14.1 顶层 scene

顶层 scene 只遍历 `document.order`。

也就是说，顶层只渲染：

- 普通自由 node
- edge
- root mindmap

不会直接按 `document.nodes` 全量平铺渲染。

## 14.2 owned child 不直接参加顶层渲染

owned child 虽然是 `document.nodes` 里的真实 node，但它们不作为顶层 scene item 渲染。

否则会出现：

- 顶层渲染一遍
- root mindmap 内部再渲染一遍

导致重复 DOM、重复 pick、重复 selection。

所以 read model 最终必须区分：

- `topLevelCanvasItems`
- `mindmapOwnedNodeIds(mindmapId)`

## 14.3 root mindmap 内部渲染岛

每个 root mindmap 都应该是一个顶层渲染槽位内的渲染岛。

它在 DOM 上类似：

```html
<div data-canvas-item="mindmap:mind_1" class="wb-mindmap-root">
  <svg class="wb-mindmap-connectors"></svg>
  <div class="wb-mindmap-children-layer">
    <div data-node-id="node_root"></div>
    <div data-node-id="node_a"></div>
    <div data-node-id="node_b"></div>
  </div>
  <div class="wb-mindmap-chrome-layer"></div>
</div>
```

语义是：

- root 与外部世界的前后关系，由 `document.order` 决定
- child 之间的前后关系，由 root 内部层次决定
- child 不能跑到 root 槽位之外参与全局 order

## 14.4 内部层级规则

root 内部层级建议固定为：

1. connector / branch layer
2. child node layer
3. tree chrome / drag affordance / overlay layer

如果后续需要细分，也只能在 root 内部细分，而不是让 child 进入全局 order。

其中 branch layer 还需要明确：

- 只负责视觉渲染
- 默认 `pointer-events: none`
- 不参与 pick / selection / toolbar / edit
- 不能通过点击 branch 选中任何对象

## 14.5 child node

child 直接通过普通 `NodeItem` 渲染。

不再需要：

- 单独的 `MindmapNodeItem` 去解释 label/style.node
- 单独的 child pick 逻辑
- 单独的 child editing 逻辑

## 14.6 root mindmap

root mindmap node 只负责：

- connector / branch 渲染
- tree-level affordance

不要再同时负责 child body 渲染语义。

更准确地说：

- child 的内容语义仍然由普通 `NodeItem` / node registry 负责
- root 只负责把这些 child 放进自己的渲染岛里
- root 不应额外生成一个可点击的透明背景壳体

## 14.7 最终 order 与 DOM 关系

这一点需要明确写成实现依据：

**child 不进 `document.order`，不等于 child 不存在于 DOM。**

真正的规则是：

- child 不参加全局顶层 DOM 顺序
- child 作为 root mindmap DOM 子树的一部分存在
- child 的全局视觉层级由 root 所在 order 槽位决定

这正是“child 的 order 和 root 一样”的产品语义。

## 15. 删除与复制语义

## 15.1 删除 root

删除 root mindmap node 时，应级联删除所有 `mindmapId === root.id` 的 owned child nodes。

## 15.2 删除 child

删除 child node 时，不应走普通 `node.delete` 直接删单节点。

应该路由为：

- `mindmap.removeSubtree`

因为 tree 拓扑必须一起更新。

## 15.3 duplicate / clipboard

复制一个整棵 mindmap 时，应：

- 复制 root mindmap node
- 复制所有 owned child nodes
- 重建 child id 与 tree id 映射

复制单个 child 时，应该视产品定义决定：

- 禁止
- 或等价于 `cloneSubtree`

不建议让普通 `node.duplicate` 直接对 mindmap child 生效。

## 16. 最终 API 设计

## 16.1 Node

```ts
type Node = {
  id: NodeId
  type: NodeType
  position: Point
  size?: Size
  rotation?: number
  data?: NodeData
  style?: NodeStyle
  groupId?: GroupId
  mindmapId?: NodeId
}
```

## 16.2 Mindmap

```ts
type MindmapTreeNode = {
  parentId?: NodeId
  side?: 'left' | 'right'
  collapsed?: boolean
  branch: MindmapBranchStyle
}

type MindmapTree = {
  rootNodeId: NodeId
  nodes: Record<NodeId, MindmapTreeNode>
  children: Record<NodeId, NodeId[]>
  layout: MindmapLayoutSpec
  meta?: {
    createdAt?: string
    updatedAt?: string
  }
}
```

## 16.3 Read Helpers

```ts
type MindmapOwnedNodeRead = {
  list: (mindmapId: NodeId) => readonly NodeId[]
  item: (mindmapId: NodeId, nodeId: NodeId) => Node | undefined
}
```

## 16.4 Commands

```ts
type MindmapCommands = {
  create: (input: {
    id?: NodeId
    root?: NodeInput
    position?: Point
    preset?: MindmapPresetKey
  }) => void
  applyPreset: (mindmapId: NodeId, preset: MindmapPresetKey) => void
  insert: (mindmapId: NodeId, input: MindmapInsertInput) => void
  moveSubtree: (mindmapId: NodeId, input: MindmapMoveSubtreeInput) => void
  removeSubtree: (mindmapId: NodeId, input: { nodeId: NodeId }) => void
  cloneSubtree: (mindmapId: NodeId, input: { nodeId: NodeId }) => void
  patchBranch: (mindmapId: NodeId, input: {
    nodeId: NodeId
    patch: Partial<MindmapBranchStyle>
  }) => void
  relayout: (mindmapId: NodeId) => void
}
```

## 17. 一步到位落地顺序

## 17.1 第一阶段：树结构改成只存结构

先删掉 tree 内部的：

- body
- node style
- topic data

只保留：

- parent / children
- side
- collapsed
- branch
- layout

## 17.2 第二阶段：create / insert 改为创建真实 child nodes

所有新增子节点的命令都改成：

- 先创建真实 node
- 再把 node id 写入 tree

## 17.3 第三阶段：layout 改为读取真实 node size，回写真实 node position

此时：

- tree 不再负责 child rect
- child rect 完全来自真实 node

## 17.4 第四阶段：react 改为普通 NodeItem 渲染 child

删除 child 的专用 render 语义，只保留 connector / tree affordance。

## 17.5 第五阶段：capability 与 command 路由收口

把：

- delete
- duplicate
- move
- group
- frame
- order

全部在 editor 中央路由上对 `mindmapId` child 做约束。

## 17.6 preset 只作为命令输入

在最终模型里还需要明确：

- `preset` 可以是 `mindmap.create(...)` 的输入参数
- `preset` 也可以是 `mindmap.applyPreset(...)` 的输入参数
- 但它不进入 `mindmap.data`
- 也不进入 `meta`

也就是说，preset 是一次性规则来源，不是持久化主模型的一部分。

## 18. 最终一句话

mindmap 的嵌套子节点，最简单且长期最优的方案是：

把它们彻底变成 document 里的真实 node，mindmap 只保留结构与 branch/layout 语义，并通过 `node.mindmapId` 表达 ownership。

这样 selection、toolbar、edit、layout、renderer 都能直接复用普通 node 中轴，而不会继续制造第二套 mindmap child 基础设施。
