# Whiteboard Mindmap 交互与 UI 最终重构方案

## 1. 目标

这一轮 mindmap 优化要一次性解决四件事：

1. 新增子节点时，节点要从本次插入锚点沿 branch 路径过渡到最终位置，branch 从一开始就连上并随节点一起过渡。
2. mindmap toolbar 要补齐 branch style 和 border style，而不是只复用普通 text toolbar。
3. 通过按钮或 toolbar 新增子节点后，要自动选中并进入该子节点编辑态。
4. 增加 mindmap 专属快捷键，包括导航和快速创建；快捷键创建不切走当前焦点，不进入新节点编辑态。

目标不是堆更多组件内状态，而是把这些能力收敛到 editor 中轴，React 只做展示。

---

## 2. 现状问题

当前 mindmap 虽然已经是“扁平 owned text node + tree container”的正确大方向，但交互层仍然缺三条关键中轴：

- 没有独立的 `mindmap enter transition` 临时态，所以新增节点只能瞬移。
- toolbar 只知道“这是 text node”，不知道“这是 mindmap topic，因此还应暴露 branch style”。
- 快捷键体系只覆盖通用 whiteboard 行为，没有 mindmap navigation / quick insert 语义。

这导致：

- add child 只能立刻落在最终位置，没有产品级动画。
- 用户看不到 node style 和 branch style 的清晰分工。
- 通过快捷键高频建树时，行为不统一，也不能做到“继续停在当前节点上快速连续创建”。

---

## 3. 设计原则

### 3.1 Mindmap topic 仍然是真实 text node

不新增 mindmap-topic 这种新 node type。

topic 继续保持：

- document 里是真实 `type: 'text'`
- `mindmapId` 指向所属 tree
- 文本编辑、字号、边框、填充仍复用 text node 基础设施

### 3.2 Tree 特有语义只放在 mindmap 中轴

只有这几类能力属于 `mindmap`：

- branch style
- insert / navigate / subtree 操作
- enter / drag / drop / relayout 过渡
- toolbar 中对 tree 特性的补充展示

不要把这些塞进普通 text command 或 React 局部状态。

### 3.3 “创建行为”和“创建结果”分离

新增子节点时，真正创建出来的 document 结果始终是最终状态。

动画只是 transient preview，不应把 document 先写成中间状态再修正。

也就是：

```ts
final document commit
  + transient enter preview
  -> render interpolated motion
  -> preview 自行结束
```

而不是：

```ts
commit temporary node
  -> animate
  -> commit final node
```

### 3.4 快捷键策略必须显式建模

“按钮新增后进入编辑态”和“快捷键快速创建但不抢焦点”不是同一行为，必须显式表达为 insert behavior，而不是让调用方各自 patch 一堆 selection/edit 操作。

---

## 4. 最终中轴

最终收敛成四条中轴：

1. `editor.actions.mindmap.insert*`
   负责 tree patch、transactional commit、selection/edit 后续动作、enter preview 启动。
2. `local.feedback.mindmap`
   负责 root move / subtree move / enter transition 这类纯 transient 状态。
3. `query.selection.toolbar`
   负责把“mindmap-owned text selection”提升成带 `mindmap` 扩展信息的 toolbar scope。
4. `canvas shortcut`
   负责把键盘事件翻译为 `mindmap.navigate` / `mindmap.insert`。

React 只消费：

- `query.read.mindmap.render`
- `query.read.selection.toolbar`

不自己拼 selection、focus、动画策略。

---

## 5. 最终 API 设计

## 5.1 Insert behavior

这是这次最核心的新建模。

```ts
export type MindmapInsertFocus =
  | 'edit-new'
  | 'select-new'
  | 'keep-current'

export type MindmapInsertEnter =
  | 'none'
  | 'from-anchor'

export type MindmapInsertBehavior = {
  focus?: MindmapInsertFocus
  enter?: MindmapInsertEnter
}
```

语义：

- `edit-new`: 新建后选中新节点并进入编辑态
- `select-new`: 新建后只选中新节点
- `keep-current`: 新建后保持当前节点选择与焦点不变
- `from-anchor`: 启动从本次插入锚点出发的 enter transition

这里的 `anchor` 不是固定 root，而是本次 insert 的起始锚点：

- `child` 插入：anchor = `parentId`
- `sibling` 插入：anchor = 目标 sibling 所依附的插入锚点
- `parent` 插入：anchor = 被包裹的原节点

默认策略：

```ts
const DEFAULT_BUTTON_INSERT_BEHAVIOR = {
  focus: 'edit-new',
  enter: 'from-anchor'
} satisfies MindmapInsertBehavior

const DEFAULT_SHORTCUT_INSERT_BEHAVIOR = {
  focus: 'keep-current',
  enter: 'from-anchor'
} satisfies MindmapInsertBehavior
```

---

## 5.2 Mindmap command

现有 `insert` / `insertByPlacement` 继续保留，但新增 `behavior`。

```ts
export type MindmapCommands = {
  create: (
    payload?: MindmapCreateInput,
    options?: {
      focus?: 'edit-root' | 'select-root' | 'none'
    }
  ) => CommandResult<{
    mindmapId: MindmapId
    rootId: MindmapNodeId
  }>

  insert: (
    id: MindmapId,
    input: MindmapInsertInput,
    options?: {
      behavior?: MindmapInsertBehavior
    }
  ) => CommandResult<{ nodeId: MindmapNodeId }>

  insertByPlacement: (input: {
    id: MindmapId
    tree: MindmapTree
    targetNodeId: MindmapNodeId
    placement: 'left' | 'right' | 'up' | 'down'
    layout: MindmapLayoutSpec
    payload?: MindmapTopicData
    behavior?: MindmapInsertBehavior
  }) => CommandResult<{ nodeId: MindmapNodeId }> | undefined

  navigate: (input: {
    id: MindmapId
    fromNodeId: MindmapNodeId
    direction: 'parent' | 'first-child' | 'prev-sibling' | 'next-sibling'
  }) => MindmapNodeId | undefined
}
```

说明：

- `create` 补一个简单 `focus`，避免 React insert bridge 自己补 root edit。
- `insert*` 内部统一处理 selection / edit / transition。
- `navigate` 只返回目标 node id，不直接写 selection，便于 toolbar / shortcut / command palette 复用。

---

## 5.3 Branch style command

branch 是 tree 数据，不是 text node style，必须走 `mindmap` command。

```ts
export type MindmapBranchPatch = Partial<{
  color: string
  line: MindmapBranchLineKind
  width: number
  stroke: MindmapStrokeStyle
}>

export type MindmapStyleCommands = {
  branch: (input: {
    id: MindmapId
    nodeIds: readonly MindmapNodeId[]
    patch: MindmapBranchPatch
    scope?: 'node' | 'subtree'
  }) => CommandResult
}
```

最终挂载：

```ts
editor.actions.mindmap.style.branch(...)
```

推荐默认：

- toolbar 修改 branch 时，默认 `scope: 'subtree'`

原因：

- 用户对 branch 的理解是“这个节点发出去的分支，以及它的子树风格”
- 这与目前 preset 的风格传播语义一致

实现规则：

- `node`: 只改 `tree.nodes[nodeId].branch`
- `subtree`: 深拷贝 subtree，批量改 subtree 内每个 tree node 的 `branch`

---

## 5.4 Border style command

border style 本质上仍是 owned text node style，不另起 tree 数据模型。

```ts
export type MindmapBorderPatch = Partial<{
  frameKind: 'ellipse' | 'rect' | 'underline'
  stroke: string
  strokeWidth: number
  fill: string
}>

export type MindmapStyleCommands = {
  topic: (input: {
    nodeIds: readonly NodeId[]
    patch: MindmapBorderPatch
  }) => CommandResult
}
```

最终挂载：

```ts
editor.actions.mindmap.style.topic(...)
```

内部实现直接委托到 `node.updateMany`，因为 topic 仍是 text node。

这里不要把 frame style 再冗余写回 `tree.nodes`。

---

## 5.5 Mindmap transient preview

在现有 `MindmapPreviewState` 上补一条 enter preview。

```ts
export type MindmapEnterPreview = {
  treeId: NodeId
  nodeId: MindmapNodeId
  parentId: MindmapNodeId
  route: readonly Point[]
  fromRect: Rect
  toRect: Rect
  startedAt: number
  durationMs: number
}

export type MindmapPreviewState = {
  rootMove?: MindmapRootMovePreview
  subtreeMove?: MindmapSubtreeMovePreview
  enter?: readonly MindmapEnterPreview[]
}
```

为什么不用只存一个 `fromNodeId`：

- 渲染层需要直接拿到稳定的 route 和 rect，避免再次从旧 layout 倒推
- 进入动画应该与最终 commit 解耦，不依赖“旧文档是否还保留插入前快照”

---

## 5.6 Toolbar scope 扩展

现有 `SelectionToolbarNodeScope` 需要补一个 `mindmap` 扩展，而不是新增新的 scope kind。

```ts
export type SelectionToolbarMindmapScope = {
  treeId?: MindmapId
  nodeIds: readonly MindmapNodeId[]
  primaryNodeId?: MindmapNodeId
  canEditBranch: boolean
  branchColor?: string
  branchLine?: MindmapBranchLineKind
  branchWidth?: number
  branchStroke?: MindmapStrokeStyle
  canEditBorder: boolean
  borderKind?: MindmapNodeFrameKind
}

export type SelectionToolbarNodeScope = {
  ...
  mindmap?: SelectionToolbarMindmapScope
}
```

构建规则：

- 仅当选中的 node 全是 `mindmapId` 非空的 owned text node 时，填充 `mindmap`
- `treeId` 只有在选区都属于同一棵 tree 时才有值
- branch 值通过 `readUniformValue` 风格聚合
- border 值复用 node style 聚合

这样普通 text toolbar 仍能用，而 recipe 只需在 `node.mindmap` 存在时追加 mindmap 专属项。

---

## 5.7 Toolbar item

新增两个 item 即可，不要做独立第二套 toolbar：

```ts
type ToolbarItemKey =
  | ...
  | 'mindmap-branch'
  | 'mindmap-border'
```

### `mindmap-branch`

展示：

- line color
- line kind: `curve | elbow | rail`
- line width
- stroke style: `solid | dashed | dotted`

提交：

```ts
editor.actions.mindmap.style.branch({
  id: treeId,
  nodeIds: [primaryNodeId],
  patch,
  scope: 'subtree'
})
```

### `mindmap-border`

展示：

- frame kind: `ellipse | rect | underline`
- border color
- border width
- fill

提交：

```ts
editor.actions.mindmap.style.topic({
  nodeIds: selectedOwnedNodeIds,
  patch
})
```

### Recipe 规则

对 node scope：

```ts
font/text controls
divider
mindmap-branch
mindmap-border
divider
lock
more
```

仅当 `activeScope.node?.mindmap` 存在时追加这两项。

---

## 5.8 Shortcut action

在通用 shortcut action 上扩展：

```ts
export type ShortcutAction =
  | ...
  | 'mindmap.navigate.parent'
  | 'mindmap.navigate.first-child'
  | 'mindmap.navigate.prev-sibling'
  | 'mindmap.navigate.next-sibling'
  | 'mindmap.insert.child'
  | 'mindmap.insert.sibling'
  | 'mindmap.insert.parent'
```

默认绑定：

```ts
ArrowLeft   -> mindmap.navigate.parent
ArrowRight  -> mindmap.navigate.first-child
ArrowUp     -> mindmap.navigate.prev-sibling
ArrowDown   -> mindmap.navigate.next-sibling
Tab         -> mindmap.insert.child
Enter       -> mindmap.insert.sibling
Shift+Tab   -> mindmap.insert.parent
```

触发前提：

- 当前不是文本编辑态
- 当前选中的是单个 mindmap-owned node

执行规则：

- 导航：切换 selection 到目标 node
- 快速创建：调用 `insertByPlacement(..., { behavior: DEFAULT_SHORTCUT_INSERT_BEHAVIOR })`
- 快速创建后保持当前 selection 不变，不进入编辑态

如果目标不存在：

- 导航返回 false
- 快速创建按命令返回值处理

---

## 6. 过渡的最终语义

## 6.1 用户看到的行为

通过按钮或 toolbar 新增子节点时：

1. document 立刻提交最终 tree 和最终 node position
2. 同时启动 enter preview
3. 新节点从本次插入锚点沿 route 移向最终位置
4. root 到该节点的 branch 从第一帧就存在，线尾始终跟随移动中的节点
5. 动画结束后，preview 清除，只剩最终静态状态

通过快捷键新增时：

- 走同样动画
- 但不改变当前编辑焦点
- 不自动选中新节点

## 6.2 route 计算

enter route 不直接走“root 到终点的直线”，而是走最终 tree connector 语义：

- 第一段：root anchor -> 第一层 branch 拐点
- 第二段：沿父级 branch 方向推进
- 第三段：进入最终 parent -> child connector

简单做法：

```ts
resolveMindmapEnterRoute({
  tree,
  computed,
  nodeId
}): Point[]
```

输入：

- 最终 tree
- 最终 computed layout
- 新节点 id

输出：

- 一条离散 polyline route

对于 `curve`：

- route 仍返回离散点
- render 层将离散点平滑化为贝塞尔路径

## 6.3 render 方式

最简单且长期可维护的方案：

- editor/query 产出“当前插值后的临时 rect”
- render 继续复用 `resolveMindmapRender`

不要在 React 里手写“移动 node + 单独画一条特殊 branch”。

推荐做法：

```ts
readProjectedMindmapItem(base, preview, now)
  -> if enter preview active
     -> replace entering node rect with interpolated rect
     -> recompute connectors
```

这样 root/child/branch 永远走同一套 render 管线。

## 6.4 时间推进

新增一个轻量 editor clock 即可，不要每个 tree 自己开 timer。

```ts
type AnimationClock = ReadStore<number>
```

用途：

- `query.mindmap.read` 读取 `now`
- 当存在 `mindmap.preview.enter` 时触发重算

结束条件：

```ts
now >= startedAt + durationMs
```

然后自动清掉对应 `enter` entry。

---

## 7. 焦点与选择策略

## 7.1 按钮 / toolbar 新增

行为：

```ts
behavior = {
  focus: 'edit-new',
  enter: 'from-anchor'
}
```

提交后顺序：

1. selection.replace(newNodeId)
2. edit.startNode(newNodeId, 'text')
3. start enter preview

## 7.2 快捷键新增

行为：

```ts
behavior = {
  focus: 'keep-current',
  enter: 'from-anchor'
}
```

提交后顺序：

1. 保持当前 selection 不变
2. 不触发 edit.startNode
3. start enter preview

这样用户可以：

- 按住当前 topic
- 连续 `Tab` / `Enter`
- 快速往某个分支重复加节点

---

## 8. 最终实施方案

## 阶段 1：命令与临时态中轴

1. 扩展 `MindmapInsertBehavior`
2. 扩展 `MindmapCommands.create/insert/insertByPlacement`
3. 新增 `mindmap.navigate`
4. 扩展 `MindmapPreviewState.enter`
5. 新增 `resolveMindmapEnterRoute`

## 阶段 2：query/render 过渡

1. 给 query 增加 animation clock 依赖
2. 在 `readProjectedMindmapItem` 里处理 `enter`
3. 对 entering node 使用插值 rect
4. 复用 `resolveMindmapRender` 生成跟随中的 branch path
5. 动画结束自动清 preview

## 阶段 3：toolbar

1. 扩展 `SelectionToolbarNodeScope.mindmap`
2. 新增 `mindmap-branch` item + panel
3. 新增 `mindmap-border` item + panel
4. 在 toolbar recipe 中对 `node.mindmap` 追加 section
5. `mindmap-border` 走 `editor.actions.mindmap.style.topic`
6. `mindmap-branch` 走 `editor.actions.mindmap.style.branch`

## 阶段 4：shortcut

1. 扩展 `ShortcutAction`
2. 增加默认绑定
3. 在 `runShortcut` 里解析当前单选是否为 mindmap topic
4. 导航通过 `mindmap.navigate`
5. 快速创建通过 `mindmap.insertByPlacement(..., { behavior: DEFAULT_SHORTCUT_INSERT_BEHAVIOR })`

## 阶段 5：UI 入口统一

1. `MindmapTreeChrome` 的 add child 改为走 `behavior: edit-new + from-anchor`
2. 未来 toolbar 上的 add child 走同一命令
3. insert bridge 创建 root 时，root focus 策略改由 `mindmap.create(..., { focus })` 控制

---

## 9. 不应做的事情

不要这样做：

- 在 React 组件里单独维护 `isEntering` / `fromX` / `fromY`
- 为 mindmap 再造一套专属 text toolbar
- 把 branch style 写回 owned text node.style
- 快捷键创建后再由 React 补 selection/edit
- 先创建到 root 上，再二次 patch 到最终位置

这些做法都会再次把 mindmap 逻辑打散。

---

## 10. 最终结论

长期最优方案不是继续修某一个按钮或某一个动画，而是把 mindmap 交互正式收敛为：

- `mindmap command` 负责最终 commit 与行为策略
- `mindmap transient preview` 负责 enter / drag 这类动画态
- `selection toolbar scope` 负责把 mindmap topic 暴露为“text + branch”复合编辑对象
- `shortcut action` 负责把键盘语义统一映射到同一套 command

一句话总结：

**mindmap topic 继续复用 text node，mindmap tree 只负责 branch / topology / transition / navigation；新增、过渡、toolbar、快捷键全部走 editor 中轴，不在 React 组件里散落实现。**
