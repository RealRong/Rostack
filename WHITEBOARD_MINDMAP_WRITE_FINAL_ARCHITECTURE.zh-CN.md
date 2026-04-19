# Whiteboard Mindmap Write Final Architecture

这份文档只回答一件事：

**如果完全不考虑兼容成本、不考虑渐进迁移、不考虑对现有 API 和数据结构的破坏性影响，whiteboard 的 mindmap write 架构最终应该长成什么样，才能让语义最清晰、职责最明确、长期复杂度最低。**

本文的立场是激进且固定的：

1. 不保留现有 `translate` / `plan` / editor 旁路 write 的兼容层。
2. 不以“少改代码”为目标。
3. 不以“尽量复用当前 document shape”为目标。
4. 只以长期最优语义、最低长期维护复杂度、最清晰的领域边界为目标。

---

## 1. 先给结论

如果只用一句话概括最终方案：

**mindmap 必须被提升为一等 aggregate，但 topic 必须继续保留在统一的 node/read/spatial 模型里；真正要删除的不是 topic 的 node 身份，而是 topic 作为“无 owner 的普通 node 被 generic write 随便改”的现状。最终写路径必须重构为 `command -> owner routing -> mutation draft -> finalize -> operation compile -> reduce -> commit`。**

这个结论同时意味着七件事：

1. `node.type === 'mindmap'` 这件事最终必须消失。
2. `node.mindmapId` 这种 ad-hoc 归属字段最终必须消失。
3. topic 继续是 document 里的 node，可以参与 selection、toolbar、edge connect 和 `node.read`。
4. 但 topic 不再属于 generic node write domain，而是属于 `mindmap` owner。
5. generic `node/document/group` handler 里不再允许散落 mindmap 特判。
6. editor 和 engine 之间不再各自维护一套正式 mindmap 写编译器。
7. layout / relayout / aggregate 同步不再由 handler 手工补偿，而由 draft + finalize 统一收敛。

---

## 2. 当前问题的真正根因

当前问题不是“mindmap 很复杂”本身，而是复杂度被放错了层。

### 2.1 topic 的 read 身份和 write 身份被混成了一层

当前 topic 同时承担了两套语义：

1. 它是一个可以被 hit-test、selection、toolbar、edge anchor 看到的空间 node。
2. 它又被当作 generic node write 的直接作用对象。

第一层语义没有问题。问题出在第二层。

只要 topic 被 generic `node.patch`、`node.move`、`document.delete`、`group.merge` 直接碰，就会逼着这些通用 handler 去理解 mindmap 的结构和 relayout 规则。

### 2.2 source of truth 被拆裂

当前实现里：

1. 结构树主要存在 root node 的 `data.tree`。
2. topic 的文本、样式、尺寸、位置又散在 node 表里。
3. handler 写入时要同时维护树和 node。
4. 不同层又各自重算 layout 和补偿操作。

这使得 `translate` 不再是翻译层，而是事务编排层。

### 2.3 同一套正式写语义裂成了两份

当前 mindmap 正式写入并没有单一归属层：

1. engine `translate/plan/mindmap.ts` 在编译 mindmap command。
2. editor `write/mindmap.ts` 也在自己 `insert -> measure -> layout -> applyOperations`。
3. preview/read 又在自己做 live projection。

结果不是“一个复杂域”，而是“几套半重叠的复杂域实现”。

---

## 3. 修正后的核心判断

前一版最需要修正的一点是：

**长期最优不是把 topic 踢出 generic node 模型，而是把 node 模型拆成“统一 read/spatial 身份”和“owner 决定的 write 权限”两层。**

也就是说：

1. topic 在 `read / selection / toolbar / edge connect / hit-test` 上仍然是 node。
2. topic 在 `write / ownership / capability` 上不是 standalone node，而是 `mindmap-owned node`。
3. 这种差异只能集中出现在 owner routing 和 capability policy 里。
4. 不能继续散落在每个 generic handler 里各自特判。

这才是长期复杂度最低的版本。

---

## 4. 最终原则

最终架构必须严格遵守下面这些原则。

### 4.1 read 统一

所有视觉上可选中、可命中、可连接、可编辑的 topic，都必须继续进入统一 node read 模型。

这意味着：

1. topic 必须有稳定 `NodeId`。
2. topic 必须出现在 `Document.nodes`。
3. topic 必须能走统一 `node.read`。
4. selection、toolbar、anchor query 不应该因为 topic 另开一整套协议。

### 4.2 owner 明确

虽然 topic 是 node，但它不是无 owner 的 generic node。

最终模型里：

1. standalone node 的 owner 是 `document`。
2. topic node 的 owner 是 `mindmap`。
3. write 权限由 owner 决定，不由调用方根据 `NodeId` 猜。

### 4.3 source of truth 单一

最终要把状态分成两类 canonical truth：

1. `Document.nodes`
2. `Document.mindmaps`

它们各自管理自己的事实，不再互相重复存储同一语义。

对于 topic：

1. topic 的文本、样式、尺寸、位置属于 `nodes`。
2. topic 的拓扑关系、side、collapse、branch style、layout policy 属于 `mindmaps`。
3. root node 的 `data` 里不再嵌一整棵 `tree`。

### 4.4 top-level canvas 语义和 aggregate 内部语义分层

最终必须区分两类 node：

1. top-level canvas node
2. aggregate-owned node

topic 仍然是 node，但不一定是 top-level canvas item。

### 4.5 handler 不手工拼 operations

最终正式写 handler 的职责只能是：

1. 读取 draft
2. 表达领域意图
3. 修改 draft
4. 标记 dirty

handler 不能再：

1. 一边读 document，一边维护局部 next map
2. 一边补偿 relayout
3. 一边手工拼整批 `Operation[]`

### 4.6 editor 与 engine 共享一套正式写语义

editor 可以有：

1. preview
2. measurement adapter
3. interaction session

但 editor 不能再有第二套正式 commit compiler。

---

## 5. 最终 document 模型

长期最优形态下，document 模型必须重做，但重做方向不是“topic 消失”，而是“topic 保留为 node，mindmap 变成 owner 和 topology”。

### 5.1 顶层结构

```ts
type Document = {
  id: string
  background?: Background
  canvas: {
    order: CanvasItemRef[]
  }
  nodes: Record<NodeId, NodeRecord>
  edges: Record<EdgeId, EdgeRecord>
  groups: Record<GroupId, GroupRecord>
  mindmaps: Record<MindmapId, MindmapRecord>
}
```

### 5.2 CanvasItemRef

最终不需要把 topic 从 node 体系里拎出来另立身份。

```ts
type CanvasItemRef =
  | { kind: 'node'; id: NodeId }
  | { kind: 'edge'; id: EdgeId }
```

关键点：

1. topic 仍然通过 `node` 引用进入系统。
2. 但并不是所有 node 都参与 top-level canvas order。
3. 哪些 node 是 top-level item，由 node 自身的 canvas role 决定。

### 5.3 NodeRecord

```ts
type NodeOwner =
  | { kind: 'document' }
  | { kind: 'mindmap'; id: MindmapId }

type NodeCanvasRole =
  | 'top-level'
  | 'owned-internal'

type NodeRecord = {
  id: NodeId
  type: NodeType
  owner: NodeOwner
  canvasRole: NodeCanvasRole
  position: Point
  size?: Size
  rotation?: number
  layer?: number
  zIndex?: number
  locked?: boolean
  groupId?: GroupId
  data?: Record<string, unknown>
  style?: Record<string, unknown>
}
```

这里最重要的不是字段长什么样，而是三条语义：

1. topic 仍然有 `NodeId`、`position`、`size`、`data`、`style`。
2. `node.mindmapId` 被结构化的 `owner` 替代。
3. `canvasRole` 明确区分 top-level node 和 aggregate 内部成员。

### 5.4 MindmapRecord

最终 `mindmap` 不再是特殊 node，而是拥有 topic node 的 aggregate。

```ts
type MindmapRecord = {
  id: MindmapId
  rootNodeId: NodeId
  members: Record<NodeId, MindmapMemberRecord>
  children: Record<NodeId, NodeId[]>
  layout: MindmapLayoutSpec
  meta?: {
    createdAt?: string
    updatedAt?: string
  }
}

type MindmapMemberRecord = {
  parentId?: NodeId
  side?: 'left' | 'right'
  collapsed?: boolean
  branchStyle: MindmapBranchStyle
}
```

这里最关键的是 ownership 拆分：

1. `nodes` 存内容和几何。
2. `mindmaps` 存拓扑和 aggregate policy。
3. `mindmaps` 不再在 root node `data` 里嵌整棵 tree。

### 5.5 root topic 的角色

长期最优下，mindmap 的 top-level 代理就是 root topic node。

也就是说：

1. root topic 是一个 node。
2. 它的 `canvasRole = 'top-level'`。
3. mindmap aggregate 用 `rootNodeId` 指向它。
4. child topic 是 `canvasRole = 'owned-internal'`。

这样做的好处是：

1. canvas order 仍然只处理 node/edge。
2. selection 和 `node.read` 不需要引入新 ref 类型。
3. 整个 mindmap 的 top-level 位置由 root topic node 承担。

### 5.6 明确不进入 document 的数据

下面这些仍然应该在 document 外面：

1. connector path
2. hit-test spatial index
3. preview draft
4. live edit geometry
5. animation state
6. measurement cache

但要注意：

1. topic node 的 `position` / `size` 仍然是 persistent node state。
2. 不应该再把它们误当成 projection-only。

原因很简单：

1. topic 要参与统一 `node.read`。
2. topic 要参与 edge connect。
3. topic 要参与 selection / toolbar / geometry query。

既然如此，topic 的基本几何就应该继续是 node canonical state，只是 owner 决定谁可以改它。

---

## 6. mindmap 的最终语义

最终应该这样定义 `mindmap`：

**mindmap 是一个拥有若干 node 的 aggregate。topic 继续是统一 node 模型的一部分，但 topology、branch policy 和结构变更只属于 `mindmap` domain。**

这个定义比“topic 不是 node”更符合产品约束，也更符合长期复杂度最优。

### 6.1 topic 在 read 上是 node

因此：

1. topic 可以参与 selection。
2. topic 可以出 toolbar。
3. topic 可以被 edge 连接。
4. topic 可以被统一 hit-test 和 anchor query 读取。
5. topic 可以走统一 `node.read`。

### 6.2 topic 在 write 上受 owner 约束

因此：

1. 不是所有 `node.*` 命令都能直接改 topic。
2. topic 的写入先看 `node.owner`。
3. 命中 `{ kind: 'mindmap' }` owner 时，必须进入 mindmap capability policy。

### 6.3 结构编辑仍然属于 mindmap domain

因此：

1. 插入 topic 是 mindmap 结构命令。
2. 移动 subtree 是 mindmap 结构命令。
3. 删除 subtree 是 mindmap 结构命令。
4. collapse / side / branch style 是 mindmap 结构命令。

### 6.4 内容和视觉 patch 可以继续走统一 node patch 入口

为了保留 toolbar 和 node-style write 的统一性，长期最优不应该把 topic 的所有写入都强制改成新 API。

更合理的做法是：

1. `node.patch` 仍然是统一入口。
2. 但 `node.patch` 在执行前必须做 owner routing。
3. 对 standalone node，直接走 `node` domain。
4. 对 topic node，转给 `mindmap` domain 来解释这次 patch 是否允许、是否需要 relayout、是否需要扩散影响。

这样保留了 API 统一性，同时把复杂度收口到 owner layer。

---

## 7. 最终 capability 模型

长期最优必须有一张显式 capability matrix，而不是散落在各个 handler 里 `if (mindmap)`。

### 7.1 capability 的本质

系统必须回答这三个问题：

1. 这个 `NodeId` 属于谁
2. 当前命令对这个 owner 是否允许
3. 如果允许，是直接执行、路由到 owner，还是展开成其他命令

### 7.2 典型矩阵

下面是最终应该有的语义。

#### 7.2.1 `node.patch`

1. 命中 standalone node：直接由 `node` domain 处理。
2. 命中 topic node：路由到 `mindmap` domain。

对于 topic node，`mindmap` domain 再区分 patch 类型：

1. 文本和样式 patch：允许。
2. root position patch：允许，但解释为 mindmap root move。
3. child position patch：非法，除非来自 finalize 或内部布局命令。
4. 任意破坏 aggregate invariant 的字段 patch：非法。

#### 7.2.2 `node.delete`

1. standalone node：直接删除。
2. root topic：删除整个 mindmap aggregate。
3. child topic：删除 subtree。

#### 7.2.3 `node.duplicate`

1. standalone node：generic duplicate。
2. root topic：duplicate 整个 mindmap。
3. child topic：clone subtree。

#### 7.2.4 `node.move`

1. standalone node：generic move。
2. root topic：move 整个 mindmap。
3. child topic：非法，或解释为 subtree move，但只能由明确的 mindmap gesture 触发。

长期最优下，我建议：

1. generic drag 选中 child topic 时，不直接走 `node.move`。
2. mindmap drag interaction 直接构造 `mindmap.subtree.move`。

#### 7.2.5 `group.merge`

对任何 `owner.kind === 'mindmap'` 的 node，一律非法。

group 的职责是 standalone canvas item grouping，不应该再尝试吸纳 aggregate-owned member。

#### 7.2.6 `canvas.order`

1. standalone top-level node：允许。
2. root topic：允许，表示对整个 mindmap 顶层排序。
3. child topic：非法，因为它不参与 top-level canvas order。

### 7.3 capability 必须集中实现

最终这套矩阵只能集中出现在：

1. owner router
2. capability policy

不能继续扩散到：

1. `node` handler
2. `document` handler
3. `group` handler
4. `edge` handler

---

## 8. 最终 command 模型

长期最优下，command surface 应该保留统一性，但把结构语义显式化。

### 8.1 document command 只处理整份文档

保留：

1. `document.replace`
2. `document.background.set`

### 8.2 canvas command 处理 top-level item

```ts
type CanvasCommand =
  | { type: 'canvas.delete'; refs: CanvasItemRef[] }
  | { type: 'canvas.duplicate'; refs: CanvasItemRef[] }
  | { type: 'canvas.order'; mode: OrderMode; refs: CanvasItemRef[] }
```

这里的 `refs` 仍然只看 top-level item。

### 8.3 node command 保持统一入口，但不再直接等于 generic owner

```ts
type NodeCommand =
  | { type: 'node.create'; input: NodeInput }
  | { type: 'node.patch'; updates: NodePatchBatch[] }
  | { type: 'node.move'; ids: NodeId[]; delta: Point }
  | { type: 'node.delete'; ids: NodeId[] }
  | { type: 'node.duplicate'; ids: NodeId[] }
```

关键点：

1. `node.*` 是统一入口，不是统一 owner。
2. 真正的 owner 在执行前解析。
3. `node.*` 不再默认假设所有 node 都是 standalone。

### 8.4 mindmap command 只承载明确的结构语义

```ts
type MindmapCommand =
  | { type: 'mindmap.create'; input: MindmapCreateInput }
  | { type: 'mindmap.delete'; ids: MindmapId[] }
  | { type: 'mindmap.patchLayout'; id: MindmapId; patch: Partial<MindmapLayoutSpec> }
  | { type: 'mindmap.topic.insert'; id: MindmapId; input: MindmapTopicInsertInput }
  | { type: 'mindmap.topic.move'; id: MindmapId; input: MindmapTopicMoveInput }
  | { type: 'mindmap.topic.delete'; id: MindmapId; input: MindmapTopicDeleteInput }
  | { type: 'mindmap.topic.clone'; id: MindmapId; input: MindmapTopicCloneInput }
  | { type: 'mindmap.branch.patchStyle'; id: MindmapId; topicIds: NodeId[]; patch: MindmapBranchStylePatch }
  | { type: 'mindmap.topic.toggleCollapse'; id: MindmapId; topicId: NodeId; collapsed?: boolean }
```

关键点：

1. 结构编辑始终显式走 `mindmap.*`。
2. 内容和样式 patch 可以继续通过 `node.patch` 进入，再由 owner routing 收口。

---

## 9. 最终 write pipeline

最终 write pipeline 不应该再是“每个 planner 手写 operation 列表”，而应该是显式事务草稿模型。

### 9.1 最终流程

```text
command
  -> command router
  -> owner / capability routing
  -> open mutation draft
  -> domain handler mutate draft
  -> finalize dirty mindmaps and related entities
  -> compile diff to operations
  -> reduce
  -> inverse / impact
  -> commit
```

### 9.2 每一层职责

#### 9.2.1 command router

只做一件事：

1. 根据命令入口把它送到统一的解析流程。

它不做：

1. 领域校验
2. aggregate 路由
3. operation 拼接

#### 9.2.2 owner / capability routing

这是长期必须补上的核心底层模型。

它负责：

1. 根据 `NodeId` / `EdgeId` 找到真正 owner。
2. 根据 command type 查 capability matrix。
3. 决定是：
   1. 直接执行
   2. 路由到 owner domain
   3. 展开成 owner-specific semantic command
   4. 拒绝

#### 9.2.3 mutation draft

所有 handler 只允许修改 draft，不允许直接输出 operations。

#### 9.2.4 finalize

finalize 负责：

1. 收敛 dirty mindmap 的布局结果。
2. 把 topology 变化同步到 owned topic node 的 position/size。
3. 执行 aggregate invariant repair。
4. 产出 projection dirty 集合和 read invalidation 信息。

这一步是长期复杂度收口的关键。

#### 9.2.5 operation compiler

compiler 只做一件事：

1. 比较 `base` 和 `draft next`，输出最终 `Operation[]`。

operation 不再是 handler 手写结果，而是 diff 编译产物。

---

## 10. 必须补上的底层模型

长期最优架构里，下面这些底层模型都是必需品。

### 10.1 `MutationDraft`

这是最终 write 内核的核心。

```ts
type MutationDraft = {
  base: Document
  next: EntityOverlay
  ids: IdAllocator
  measure: MeasurementAdapter
  dirty: DirtySet
  runtime: WriteRuntimeContext
  repos: {
    nodes: NodeDraftRepo
    edges: EdgeDraftRepo
    groups: GroupDraftRepo
    mindmaps: MindmapDraftRepo
  }
}
```

它必须提供：

1. overlay read
2. overlay write
3. owner lookup
4. id allocation
5. dirty marking
6. runtime service access

### 10.2 `EntityOverlay`

这是一次事务里的 typed overlay store。

```ts
type EntityOverlay = {
  document?: {
    background?: Background
  }
  canvas?: {
    order?: CanvasItemRef[]
  }
  nodes: OverlayTable<NodeId, NodeRecord>
  edges: OverlayTable<EdgeId, EdgeRecord>
  groups: OverlayTable<GroupId, GroupRecord>
  mindmaps: OverlayTable<MindmapId, MindmapRecord>
}
```

关键点：

1. 它是 typed overlay，不是杂乱 `Map<string, unknown>`。
2. handler 一律通过 draft repo 工作。

### 10.3 `OwnerResolver`

这是把 read 身份和 write owner 解耦的核心模型。

```ts
type OwnerResolver = {
  resolveNodeOwner(nodeId: NodeId, draft: MutationDraft): NodeOwner
  resolveEdgeOwner(edgeId: EdgeId, draft: MutationDraft): EdgeOwner
}
```

### 10.4 `CapabilityPolicy`

```ts
type CapabilityPolicy = {
  resolve(input: RoutedCommand, draft: MutationDraft): CapabilityDecision
}
```

它的输出至少要区分：

1. `allow-direct`
2. `route-to-owner`
3. `expand-to-owner-command`
4. `reject`

### 10.5 `IdAllocator`

```ts
type IdAllocator = {
  node(): NodeId
  edge(): EdgeId
  group(): GroupId
  mindmap(): MindmapId
}
```

长期最优下，topic 不需要单独再造一套 `MindmapTopicId`，因为 topic 本身就是 node。

### 10.6 `MeasurementAdapter`

这是统一 editor 和 engine mindmap 写语义的关键。

```ts
type MeasurementAdapter = {
  patchNodeCreate(input: NodeInput): NodeInput
  patchNodeUpdate(id: NodeId, update: NodeUpdateInput): NodeUpdateInput
  measureNode(id: NodeId, draft: MutationDraft): Size | undefined
}
```

关键点：

1. engine 不再靠 editor 旁路拼 operations。
2. editor 只通过 adapter 提供测量能力。
3. headless runtime 可以提供 bootstrap fallback。

### 10.7 `DirtySet`

```ts
type DirtySet = {
  canvasOrder: boolean
  background: boolean
  nodeIds: Set<NodeId>
  edgeIds: Set<EdgeId>
  groupIds: Set<GroupId>
  mindmapIds: Set<MindmapId>
  projections: Set<ProjectionKind>
}
```

关键点：

1. handler 改了什么，就显式标记什么 dirty。
2. finalize 只跑 dirty 目标，不再扫全局做兜底补偿。

### 10.8 `MindmapFinalizer`

这是最终替代当前分散 relayout 逻辑的关键模型。

```ts
type MindmapFinalizer = {
  run(mindmapId: MindmapId, draft: MutationDraft): void
}
```

它负责：

1. 读取 aggregate topology
2. 读取 owned topic node size
3. 计算布局
4. 更新 owned topic node position / size
5. 标记 projection dirty

它不负责：

1. 再次解释业务命令
2. 直接产出 operations

### 10.9 `OperationCompiler`

```ts
type OperationCompiler = {
  compile(base: Document, draft: MutationDraft): Operation[]
}
```

长期最优下，compiler 直接比较实体表差异并输出：

1. `node.create/update/delete`
2. `edge.create/update/delete`
3. `group.create/update/delete`
4. `mindmap.create/update/delete`
5. `canvas.order.set`
6. `document.background.set`

---

## 11. 最终 read / interaction 模型

写路径要降复杂度，read 路径也必须配合。

### 11.1 `node.read` 继续统一

最终：

1. topic 继续通过 `node.read.get(nodeId)` 被读取。
2. toolbar 继续基于 node target 工作。
3. edge connect 继续基于 node anchor query 工作。

这样不会把复杂度转移到整个 editor/query 系统。

### 11.2 owner 信息进入 read model

为了让 interaction 层做出正确选择，`node.read` 的返回结果里必须带 owner / capability 相关信息。

也就是说外层应该能直接知道：

1. 这是 standalone node 还是 mindmap-owned node。
2. 它是否是 root topic。
3. 它是否参与 top-level canvas order。

### 11.3 preview 仍然只覆盖 presentation

preview 层可以继续做：

1. root move preview
2. subtree drag preview
3. live text edit relayout preview

但 preview 不再承担正式提交语义，不再自己拼正式 `Operation[]`。

---

## 12. 必须删除的现有结构

如果目标是长期最优，下面这些结构不应该继续保留。

### 12.1 删除 `node.type === 'mindmap'`

mindmap 不再伪装成 node type。

### 12.2 删除 `node.mindmapId`

它必须被结构化的 `node.owner` 替代。

### 12.3 删除 root node `data.tree`

拓扑结构不再塞进 node data。

### 12.4 删除 generic handler 中的 mindmap 特判扩散

最终 generic handler 里不再允许出现：

1. `node?.type === 'mindmap'`
2. `Boolean(node?.mindmapId)`
3. `Mindmap nodes do not support generic ...`

这些都应该收口到 owner router / capability policy。

### 12.5 删除 editor 的正式 mindmap operation compiler

editor 不再在正式提交时自己：

1. `insertNode`
2. `computeMindmapLayout`
3. `buildMindmapInsertOperations`
4. `applyOperations`

这套逻辑统一回到 engine write pipeline。

### 12.6 删除“空 finalize + handler 手工补 derived state”

finalize 必须真正承担 dirty aggregate 收敛职责。

---

## 13. 为什么这版比“topic 完全退出 node”更优

这点必须单独说清楚，因为这正是前一版最需要修正的地方。

### 13.1 它保住了统一 read surface

如果 topic 完全退出 node 模型，那么你必须重新设计：

1. selection ref
2. toolbar target
3. edge endpoint
4. hit-test result
5. node query

这会把复杂度从 write 层挪到整个 editor/read/edge 系统里。

### 13.2 它把复杂度收口到 owner 层，而不是扩散到所有域

真正应该特殊化的不是 read 身份，而是 write ownership。

这层特殊性最终只存在于：

1. `node.owner`
2. `OwnerResolver`
3. `CapabilityPolicy`
4. `MindmapFinalizer`

### 13.3 它消除了双重身份冲突

当前最糟糕的状态是：

1. topic 看起来像普通 node
2. topic 写起来又不是普通 node
3. 于是每个 handler 都得自己猜

最终方案会把这个矛盾显式化：

1. topic 是 node
2. topic 不是 standalone node
3. 是否允许写、如何写，由 owner 决定

### 13.4 它比“完全 aggregate-internal topic”更贴近产品语义

既然 topic 真正要参与：

1. selection
2. toolbar
3. edge connect
4. node.read

那就不应该为了追求架构纯度，强行把 topic 变成 projection-only object。

长期最优不是最理论化的模型，而是**在真实产品语义下最稳定、最低复杂度的模型**。

---

## 14. 最终架构摘要

长期最优的最终形态可以压缩成下面这几句话：

1. **mindmap 是一等 aggregate，不再伪装成 node type。**
2. **topic 继续是 node，继续参与统一 `node.read`、selection、toolbar、edge connect。**
3. **topic 的 owner 是 `mindmap`，不是 generic standalone node。**
4. **结构语义在 `mindmaps` 表里，内容和几何在 `nodes` 表里。**
5. **所有正式写入先做 owner routing，再进入 mutation draft。**
6. **layout 和 relayout 由 finalize 统一收敛，不再由 handler 手工补偿。**
7. **editor 不再维护第二套正式 mindmap compiler。**

如果必须再压成一句最核心的设计约束，那就是：

**不要把“topic 应该参与统一 node read”误解成“topic 应该归 generic node write 直接拥有”；长期最优是 read 统一、owner 明确、capability 收口、finalize 统一，而不是让所有层都知道 mindmap。**
