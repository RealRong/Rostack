# Whiteboard Mindmap Write Final Architecture

这份文档只回答一件事：

**如果完全不考虑兼容成本、不考虑渐进迁移、不考虑对现有 API 和数据结构的破坏性影响，whiteboard 的 mindmap write 架构最终应该长成什么样，才能让语义最清晰、职责最明确、长期复杂度最低。**

本文的立场是激进且固定的：

1. 不保留现有 `translate` / `plan` / editor 旁路 write 的兼容层。
2. 不以“少改代码”为目标。
3. 不以“尽量复用当前 document shape”为目标。
4. 只以长期最优语义、最低长期维护复杂度、最清晰的领域边界为目标。

这版文档明确选择的最终路线是：

**semantic-operation-first**

也就是：

1. `command` 只表达用户意图。
2. `command` 先被路由并编译成一批语义化 `operation`。
3. 更新 document 的唯一入口是 `operation reducer`。
4. reducer 内部可以用 draft / overlay / apply context，但那只是 reducer 的实现细节，不是对外主模型。
5. `reconcile` 跑在 operation apply 之后，通过显式 `ReconcileQueue` 收敛 aggregate 派生约束。

---

## 1. 先给结论

如果只用一句话概括最终方案：

**mindmap 必须被提升为一等 aggregate；topic 必须继续保留在统一的 node/read/spatial 模型里；command 不再直接手写一堆低层 patch，也不再把“先 mutate 大 draft 再 compile patch”作为主路径，而是统一走 `command -> semantic operations -> reducer.applyBatch(apply + reconcile) -> commit`。**

这个结论同时意味着八件事：

1. `node.type === 'mindmap'` 这件事最终必须消失。
2. `node.mindmapId` 这种 ad-hoc 归属字段最终必须消失。
3. topic 继续是 document 里的 node，可以参与 `selection`、`toolbar`、`edge connect` 和统一 `node.read`。
4. 但 topic 不再属于 generic standalone node write domain，而是属于 `mindmap` owner。
5. `operation` 成为真正的状态变迁单位、历史单位、协作单位和调试单位。
6. generic `node/document/group` handler 里不再允许散落 mindmap 特判。
7. editor 和 engine 之间不再各自维护一套正式 mindmap 写编译器。
8. aggregate 的 relayout / invariant repair 不再由 command handler 手工补偿，而由 reducer 之后的 `reconcile` 阶段统一收敛。

---

## 2. 为什么明确选择 semantic-operation-first

这里先把几条可能路线说透。

### 2.1 不是 `command -> low-level patch operations -> apply`

这条路的问题不是 operation-first，而是 operation 太低层。

如果 command 直接生成的都是这种 operation：

1. `node.update`
2. `node.delete`
3. `edge.update`
4. `canvas.order.set`

那每个 command handler 最后都会被迫承担：

1. owner 规则
2. aggregate invariant
3. relayout
4. derived state 补偿
5. op 顺序安排
6. 重复 patch 合并

这正是当前 `translate/plan/*` 膨胀的根源。

### 2.2 也不是把 `draft-first + compile operations` 作为最终主模型

`draft-first` 有它的价值，但它不适合做最终对外主抽象。

因为 whiteboard 这类系统最重要的是：

1. operation 是历史单位
2. operation 是协作单位
3. operation 是 replay/debug 单位
4. reducer 是唯一状态更新入口

如果把主模型定义成：

`command -> mutate draft -> compile ops -> apply`

那 operation 反而变成了“提交前的附属产物”，这和系统长期需要的语义中心不一致。

### 2.3 最终路线：command 先产生 semantic operation

长期最优应该是：

1. `command` 只做用户意图表达。
2. owner routing 和 capability policy 决定 command 的真正语义归属。
3. 生成的是 aggregate-aware 的 semantic operation，而不是低层 patch。
4. reducer 负责更新 document。
5. `reconcile` 负责收敛 aggregate 派生几何和确定性约束。

所以最终主流程是：

```text
command
  -> owner routing
  -> semantic operations
  -> reducer.applyBatch
    -> apply semantic operations
    -> reconcile queued aggregate work
  -> commit
```

---

## 3. 最终原则

最终架构必须严格遵守下面这些原则。

### 3.1 read 统一

所有视觉上可选中、可命中、可连接、可编辑的 topic，都必须继续进入统一 node read 模型。

这意味着：

1. topic 必须有稳定 `NodeId`。
2. topic 必须出现在 `Document.nodes`。
3. topic 必须能走统一 `node.read`。
4. selection、toolbar、anchor query 不应该因为 topic 另开一整套协议。

### 3.2 owner 明确

虽然 topic 是 node，但它不是无 owner 的 generic node。

最终模型里：

1. standalone node 的 owner 为空。
2. topic node 的 owner 是 `mindmap`。
3. write 权限由 owner 决定，不由调用方根据 `NodeId` 猜。

### 3.3 source of truth 单一

最终 document 里存在两类 canonical truth：

1. `Document.nodes`
2. `Document.mindmaps`

对 topic：

1. topic 的文本、样式、几何属于 `nodes`。
2. topic 的拓扑关系、side、collapse、branch style、layout policy 属于 `mindmaps`。
3. root topic node 的 `data` 里不再嵌一整棵 tree。

### 3.4 operation 是状态变迁单位

最终定义里：

1. 更新 document 的不是 command。
2. 更新 document 的是 semantic operation reducer。
3. history、undo/redo、collab、replay 都建立在 semantic operation 上。

### 3.5 reconcile 是 operation apply 后阶段，不是 command handler 的脏活区

最终要求：

1. command handler 不再自己补 relayout。
2. operation apply 不再把 `invalidation` 或 `changes` 当成隐式调度器。
3. 需要后续收敛的 aggregate work 必须显式进入 `ReconcileQueue`。
4. `ChangeSet` 只描述净变化，`InvalidationSet` 只描述受影响范围，都不描述“下一步该跑什么”。

### 3.6 editor 与 engine 共享一套正式写语义

editor 可以有：

1. preview
2. measurement adapter
3. interaction session

但 editor 不能再有第二套正式 commit compiler。

---

## 4. 最终 document 模型

长期最优形态下，document 模型必须重做，但方向不是“topic 消失”，而是“topic 保留为 node，mindmap 成为 owner 和 topology”。

### 4.1 顶层结构

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

### 4.2 CanvasItemRef

最终不需要把 topic 从 node 体系里拎出来另立身份。

```ts
type CanvasItemRef =
  | { kind: 'node'; id: NodeId }
  | { kind: 'edge'; id: EdgeId }
```

关键点：

1. topic 仍然通过 `node` 引用进入系统。
2. 但并不是所有 node 都参与 top-level canvas order。
3. 哪些 node 是 top-level item，由 `owner + mindmap.root` 派生决定。

### 4.3 NodeRecord

```ts
type NodeOwner =
  | { kind: 'mindmap'; id: MindmapId }

type NodeRecord = {
  id: NodeId
  type: NodeType
  owner?: NodeOwner
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
3. `owner` 为空表示 standalone node，`owner.kind === 'mindmap'` 表示 mindmap-owned node。

### 4.4 MindmapRecord

最终 `mindmap` 不再是特殊 node，而是拥有 topic node 的 aggregate。

```ts
type MindmapRecord = {
  id: MindmapId
  root: NodeId
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

ownership 拆分是这里的核心：

1. `nodes` 存内容和几何。
2. `mindmaps` 存拓扑和 aggregate policy。
3. `mindmaps` 不再在 root topic node `data` 里嵌整棵 tree。

### 4.5 root topic 的角色

长期最优下，mindmap 的 top-level 代理就是 root topic node。

也就是说：

1. root topic 是一个 node。
2. mindmap aggregate 用 `root` 指向它。
3. child topic 仍然是 node，但它们不是 top-level canvas item。

这样做的好处是：

1. canvas order 仍然只处理 node/edge。
2. selection 和 `node.read` 不需要引入新 ref 类型。
3. 整个 mindmap 的顶层位置由 root topic node 承担。

### 4.6 top-level / internal 是派生语义，不是持久化字段

长期最优下，不应该再持久化一个 `NodeCanvasRole`。

更合理的做法是保留一个派生类型，只用于 read / capability / routing：

```ts
type DerivedNodePlacement =
  | { kind: 'standalone' }
  | { kind: 'mindmap-root'; mindmapId: MindmapId }
  | { kind: 'mindmap-member'; mindmapId: MindmapId }
```

它的推导规则非常直接：

1. `owner` 为空：`standalone`
2. `owner.kind === 'mindmap'` 且 `mindmap.root === node.id`：`mindmap-root`
3. `owner.kind === 'mindmap'` 且 `mindmap.root !== node.id`：`mindmap-member`

### 4.7 明确不进入 document 的数据

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

---

## 5. 最终 command 模型

command 是用户意图层，不是最终状态变迁单位。

长期最优下，command surface 可以继续保持接近当前产品语义，但它的输出不再是低层 patch，而是 semantic operation。

### 5.1 document command

```ts
type DocumentCommand =
  | { type: 'document.replace'; document: Document }
  | { type: 'document.background.set'; background?: Background }
```

### 5.2 canvas command

```ts
type CanvasCommand =
  | { type: 'canvas.delete'; refs: CanvasItemRef[] }
  | { type: 'canvas.duplicate'; refs: CanvasItemRef[] }
  | { type: 'canvas.order'; mode: OrderMode; refs: CanvasItemRef[] }
```

### 5.3 node command

`node.*` 保持统一入口，但不再等于统一 owner。

```ts
type NodeCommand =
  | { type: 'node.create'; input: NodeInput }
  | { type: 'node.patch'; updates: NodePatchBatch[] }
  | { type: 'node.move'; ids: NodeId[]; delta: Point }
  | { type: 'node.delete'; ids: NodeId[] }
  | { type: 'node.duplicate'; ids: NodeId[] }

type NodePatchBatch = {
  id: NodeId
  patch: NodePatchInput
}
```

关键点：

1. `node.*` 是 API 入口，不是最终 reducer 入口。
2. 真正 owner 在 command planning 阶段解析。
3. 命中 topic node 时，可能会展开成 `mindmap.*` operation。

### 5.4 mindmap command

结构编辑类命令仍然应显式存在：

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

### 5.5 最终 command union

```ts
type EngineCommand =
  | DocumentCommand
  | CanvasCommand
  | NodeCommand
  | MindmapCommand
```

---

## 6. 最终 semantic operation 模型

这是这版架构里最重要的部分。

最终 operation 不应该是“低层 patch 集合”，而应该是**aggregate-aware 的语义状态变迁单位**。

### 6.1 operation 的定义原则

最终 semantic operation 必须满足：

1. 能直接进入 reducer 更新 document。
2. 不要求 command handler 先手写一堆低层 `node.update`。
3. 能作为 history / undo / redo / collab / replay 的统一单位。
4. 能明确表达 aggregate 语义，而不是只表达对象补丁。

### 6.2 最终类型

```ts
type NodeSemanticPatch = {
  fields?: Partial<Pick<NodeRecord, 'position' | 'size' | 'rotation' | 'layer' | 'zIndex' | 'locked' | 'groupId'>>
  data?: Record<string, unknown>
  style?: Record<string, unknown>
}

type EdgeSemanticPatch = Partial<Omit<EdgeRecord, 'id'>>

type GroupSemanticPatch = Partial<Omit<GroupRecord, 'id'>>

type MindmapTopicSemanticPatch = {
  data?: Record<string, unknown>
  style?: Record<string, unknown>
}

type MindmapBranchStylePatch = Partial<MindmapBranchStyle>

type SemanticOperation =
  | { type: 'document.replace'; document: Document }
  | { type: 'document.background.set'; background?: Background }
  | { type: 'canvas.order.set'; refs: CanvasItemRef[] }
  | { type: 'node.create'; node: NodeRecord }
  | { type: 'node.patch'; id: NodeId; patch: NodeSemanticPatch }
  | { type: 'node.move'; id: NodeId; delta: Point }
  | { type: 'node.delete'; id: NodeId }
  | { type: 'node.duplicate'; id: NodeId }
  | { type: 'edge.create'; edge: EdgeRecord }
  | { type: 'edge.patch'; id: EdgeId; patch: EdgeSemanticPatch }
  | { type: 'edge.delete'; id: EdgeId }
  | { type: 'group.create'; group: GroupRecord }
  | { type: 'group.patch'; id: GroupId; patch: GroupSemanticPatch }
  | { type: 'group.delete'; id: GroupId }
  | { type: 'mindmap.create'; mindmap: MindmapRecord; nodes: NodeRecord[] }
  | { type: 'mindmap.delete'; id: MindmapId }
  | { type: 'mindmap.root.move'; id: MindmapId; position: Point }
  | { type: 'mindmap.layout.patch'; id: MindmapId; patch: Partial<MindmapLayoutSpec> }
  | { type: 'mindmap.topic.insert'; id: MindmapId; input: MindmapTopicInsertInput; node: NodeRecord }
  | { type: 'mindmap.topic.move'; id: MindmapId; input: MindmapTopicMoveInput }
  | { type: 'mindmap.topic.delete'; id: MindmapId; input: MindmapTopicDeleteInput }
  | { type: 'mindmap.topic.clone'; id: MindmapId; input: MindmapTopicCloneInput }
  | { type: 'mindmap.topic.patch'; id: MindmapId; topicIds: NodeId[]; patch: MindmapTopicSemanticPatch }
  | { type: 'mindmap.branch.patch'; id: MindmapId; topicIds: NodeId[]; patch: MindmapBranchStylePatch }
  | { type: 'mindmap.topic.toggleCollapse'; id: MindmapId; topicId: NodeId; collapsed?: boolean }
```

这套类型的重点不是字段细节，而是 operation 的层级：

1. standalone node 还是 node 语义。
2. mindmap 结构变更明确是 mindmap 语义。
3. reducer 可以直接按 aggregate 规则处理这些 op。

### 6.3 为什么 `mindmap.create` 带 `nodes`

因为在最终 document 模型里：

1. topology 在 `mindmaps`
2. topic 内容和几何在 `nodes`

所以 `mindmap.create` 是一个 aggregate-level semantic operation，它天然需要同时建立：

1. `MindmapRecord`
2. 初始 topic node 集合

这不是低层 patch 拼接，而是一个完整的 aggregate 创建语义。

### 6.4 为什么还保留 `node.patch`

因为产品上：

1. toolbar
2. style panel
3. edit action

通常天然都走统一 node 入口。

长期最优不应该为了架构洁癖，把所有 topic 内容改动都强制改成外部单独调用 `mindmap.topic.patch`。

更合理的做法是：

1. API 层仍然允许 `node.patch`
2. owner routing 把它解释成正确的 semantic operation

例如：

1. `node.patch` 命中 standalone node -> `node.patch`
2. `node.patch` 命中 topic text/style -> `mindmap.topic.patch`
3. `node.patch` 命中 root position -> `mindmap.root.move`

### 6.5 operation batch

最终命令不一定只生成一个 operation。

因此需要显式的 batch 类型：

```ts
type SemanticOperationBatch = {
  operations: SemanticOperation[]
  output?: unknown
}
```

command planner 的职责就是生成这个 batch。

---

## 7. 最终 routing 与 planning 模型

### 7.1 OwnerResolver

```ts
type OwnerResolver = {
  resolveNodeOwner(nodeId: NodeId, doc: Document): NodeOwner | undefined
}
```

### 7.2 CapabilityDecision

```ts
type CapabilityDecision =
  | { kind: 'allow-direct' }
  | { kind: 'route-to-owner'; owner: NodeOwner }
  | { kind: 'expand-to-operations'; operations: SemanticOperation[] }
  | { kind: 'reject'; code: 'invalid' | 'cancelled'; message: string; details?: unknown }
type CapabilityPolicy = {
  decide(command: EngineCommand, doc: Document, ctx: CapabilityContext): CapabilityDecision
}

type CapabilityContext = {
  owner: OwnerResolver
}
```

### 7.3 CommandPlanner

```ts
type CommandPlanner = {
  plan(command: EngineCommand, doc: Document, ctx: PlanningContext): PlanResult
}

type PlanResult =
  | {
      ok: true
      batch: SemanticOperationBatch
    }
  | {
      ok: false
      error: {
        code: 'invalid' | 'cancelled'
        message: string
        details?: unknown
      }
    }
```

### 7.4 PlanningContext

```ts
type PlanningContext = {
  ids: IdAllocator
  measure: MeasurementAdapter
  owner: OwnerResolver
  capability: CapabilityPolicy
}
```

### 7.5 Supporting Contracts

```ts
type IdAllocator = {
  node(): NodeId
  edge(): EdgeId
  group(): GroupId
  mindmap(): MindmapId
}

type MeasurementAdapter = {
  patchNodeCreate(input: NodeInput): NodeInput
  patchNodePatch(id: NodeId, patch: NodePatchInput): NodePatchInput
  measureNode(id: NodeId, doc: Document): Size | undefined
}
```

### 7.6 典型 planning 映射

这部分很重要，因为它直接体现了为什么 `node.*` 仍然可以作为统一 API 入口，但最终 reducer 只看 semantic operation。

#### 7.6.1 topic 文本编辑

输入 command：

```ts
{
  type: 'node.patch',
  updates: [{
    id: topicNodeId,
    patch: {
      data: {
        text: 'New title'
      }
    }
  }]
}
```

planning 结果：

```ts
{
  operations: [{
    type: 'mindmap.topic.patch',
    id: mindmapId,
    topicIds: [topicNodeId],
    patch: {
      data: {
        text: 'New title'
      }
    }
  }]
}
```

#### 7.6.2 root topic 拖动

输入 command：

```ts
{
  type: 'node.patch',
  updates: [{
    id: rootTopicId,
    patch: {
      fields: {
        position: {
          x: 240,
          y: 120
        }
      }
    }
  }]
}
```

planning 结果：

```ts
{
  operations: [{
    type: 'mindmap.root.move',
    id: mindmapId,
    position: {
      x: 240,
      y: 120
    }
  }]
}
```

#### 7.6.3 child topic 删除

输入 command：

```ts
{
  type: 'node.delete',
  ids: [childTopicId]
}
```

planning 结果：

```ts
{
  operations: [{
    type: 'mindmap.topic.delete',
    id: mindmapId,
    input: {
      topicId: childTopicId
    }
  }]
}
```

#### 7.6.4 root topic 删除

输入 command：

```ts
{
  type: 'node.delete',
  ids: [rootTopicId]
}
```

planning 结果：

```ts
{
  operations: [{
    type: 'mindmap.delete',
    id: mindmapId
  }]
}
```

#### 7.6.5 standalone node patch

输入 command：

```ts
{
  type: 'node.patch',
  updates: [{
    id: standaloneNodeId,
    patch: {
      style: {
        fill: '#f00'
      }
    }
  }]
}
```

planning 结果：

```ts
{
  operations: [{
    type: 'node.patch',
    id: standaloneNodeId,
    patch: {
      style: {
        fill: '#f00'
      }
    }
  }]
}
```

关键点：

1. planner 只读当前 document，不直接更新 document。
2. planner 输出 semantic operation batch。
3. planner 不再输出低层 patch 集合。

---

## 8. 最终 reducer 模型

这是 semantic-operation-first 里真正的内核。

### 8.1 reducer 是唯一状态更新入口

最终要求：

1. document 只能被 operation reducer 更新。
2. command 不能直接更新 document。
3. editor 不能绕过 reducer 自己拼正式提交。

### 8.2 最终类型

```ts
type OperationReducer = {
  applyBatch(doc: Document, batch: SemanticOperationBatch, ctx: ApplyContext): ApplyResult
}

type ApplyContext = {
  ids: IdAllocator
  measure: MeasurementAdapter
  now: () => number
}

type ApplyResult =
  | {
      ok: true
      doc: Document
      inverse: SemanticOperation[]
      changes: ChangeSet
      invalidation: InvalidationSet
      impact: KernelReadImpact
      output?: unknown
    }
  | {
      ok: false
      error: {
        code: 'invalid' | 'cancelled'
        message: string
        details?: unknown
      }
    }
```

### 8.3 reducer 内部可以有 draft，但只是内部实现

这里要明确：

semantic-operation-first 并不等于 reducer 内部不能用 draft。

它真正强调的是：

1. 对外主协议是 operation
2. 不是 command mutate draft

所以 reducer 内部完全可以这样实现：

1. 打开一次 `ApplyDraft`
2. 顺序 apply semantic operation
3. 记录 `ChangeSet` / `InvalidationSet` 并入队 reconcile task
4. drain reconcile queue
5. materialize next document
6. compute impact

但这层 draft 是 reducer 内部机制，不是系统主抽象。

### 8.4 为什么 reducer 内部仍然值得有 `ApplyDraft`

因为 aggregate op 往往不是单表原子更新。

例如：

1. `mindmap.topic.insert`
2. `mindmap.topic.delete`
3. `mindmap.topic.clone`

都需要同时更新：

1. `mindmaps`
2. `nodes`
3. change set
4. invalidation set
5. reconcile queue

因此 reducer 内部仍然需要一个事务执行上下文。

长期最优下，`ChangeSet` 更适合作为 draft 内的增量归并结构，而不是最后再做一次全表 diff；但对外 contract 只要求它表达 batch 的净效果，不绑定具体实现。

最终建议的内部类型：

```ts
type ApplyDraft = {
  base: Document
  next: EntityOverlay
  changes: ChangeSet
  invalidation: InvalidationSet
  reconcile: ReconcileQueue
  inverse: SemanticOperation[]
}
```

再次强调：

1. 这是 reducer internals
2. 不是 command-facing 模型
3. `changes`、`invalidation` 和 `reconcile` 不是一回事

### 8.5 最小 reducer 骨架

最终 reducer 至少应该长成下面这样：

```ts
function applyBatch(
  doc: Document,
  batch: SemanticOperationBatch,
  ctx: ApplyContext
): ApplyResult {
  const draft = createApplyDraft(doc)

  for (const op of batch.operations) {
    const step = applyOperation(draft, op, ctx)
    if (!step.ok) {
      return step
    }
  }

  const settled = draft.reconcile.drain((task) =>
    reconcileTask(draft, task, ctx)
  )
  if (!settled.ok) {
    return settled
  }

  const nextDoc = materializeDocument(draft)
  const impact = computeImpact(doc, nextDoc, draft.invalidation)

  return {
    ok: true,
    doc: nextDoc,
    inverse: draft.inverse,
    changes: draft.changes,
    invalidation: draft.invalidation,
    impact,
    output: batch.output
  }
}
```

这里的关键点不是函数名，而是执行顺序：

1. operation 顺序 apply
2. operation 在 apply 时显式入队 reconcile task，并持续归并 `ChangeSet` / `InvalidationSet`
3. reducer 把 reconcile queue drain 到为空
4. materialize next document
5. 基于 `InvalidationSet` 计算 impact
6. 对外返回 `doc + inverse + changes + invalidation + impact`

### 8.6 单条 operation 的 apply 分发

```ts
function applyOperation(
  draft: ApplyDraft,
  op: SemanticOperation,
  ctx: ApplyContext
): Step {
  switch (op.type) {
    case 'node.create':
      return applyNodeCreate(draft, op)
    case 'node.patch':
      return applyNodePatch(draft, op)
    case 'mindmap.create':
      return applyMindmapCreate(draft, op)
    case 'mindmap.root.move':
      return applyMindmapRootMove(draft, op)
    case 'mindmap.topic.insert':
      return applyMindmapTopicInsert(draft, op, ctx)
    case 'mindmap.topic.move':
      return applyMindmapTopicMove(draft, op)
    case 'mindmap.topic.delete':
      return applyMindmapTopicDelete(draft, op)
    case 'mindmap.topic.patch':
      return applyMindmapTopicPatch(draft, op)
    default:
      return err('invalid', 'Unsupported semantic operation.')
  }
}
```

最终每个 `applyXxx` 都只做对应 aggregate 的直接状态变更、inverse 记录和必要的 task 入队，不负责 global reconcile。

---

## 9. 最终 reconcile 模型

`reconcile` 是 reducer 之后的固定阶段，但它不是“遍历 invalidation set 的隐藏二次 reducer”，而是一个显式的派生约束收敛阶段。

只要 `ReconcileTask` 仍然是 internal、deterministic、non-public 的执行单元，它就不会重新膨胀成第二个业务状态机；真正危险的是把用户意图、owner routing 或公开 history 语义偷偷塞回这层。

### 9.1 `ChangeSet`、`InvalidationSet` 与 `ReconcileQueue` 必须分离

```ts
type EntityChangeSet<Id> = {
  added: Set<Id>
  updated: Set<Id>
  deleted: Set<Id>
}

type ChangeSet = {
  documentReplaced: boolean
  backgroundChanged: boolean
  canvasOrderChanged: boolean
  nodes: EntityChangeSet<NodeId>
  edges: EntityChangeSet<EdgeId>
  groups: EntityChangeSet<GroupId>
  mindmaps: EntityChangeSet<MindmapId>
}

type InvalidationSet = {
  document: boolean
  background: boolean
  canvasOrder: boolean
  nodeIds: Set<NodeId>
  edgeIds: Set<EdgeId>
  groupIds: Set<GroupId>
  mindmapIds: Set<MindmapId>
  projections: Set<ProjectionKind>
}

type ReconcileTask =
  | { type: 'mindmap.layout.reconcile'; id: MindmapId }

type ReconcileQueue = {
  enqueue(task: ReconcileTask): void
  drain(run: (task: ReconcileTask) => Step): Step
}
```

两者回答的是不同问题：

1. `ChangeSet` 只回答“最终净变化是什么”，服务于订阅者、selection repair、增量渲染和 cache 更新。
2. `InvalidationSet` 只回答“哪些 read/projection/index 需要重新看”，它允许保守 over-approximation。
3. `ReconcileQueue` 只回答“还有什么派生收敛工作要跑”，服务于 reducer internals。
4. 不能再让 `invalidation.mindmapIds` 或 `changes.mindmaps` 兼任调度信号，否则 reducer 会重新长成隐式 scheduler。
5. `enqueue` 必须按 task key 去重，`drain` 必须一直执行到队列为空或返回错误。

### 9.2 `ChangeSet` 必须表达净效果，而不是过程日志

长期最优下，`ChangeSet` 不是 reducer 每一步副作用的流水账，而是整个 batch 收敛之后的 net effect。

最基本的归并规则至少要固定成下面这样：

1. `add -> update` 折叠成 `added`。
2. `update -> update` 仍然是 `updated`。
3. `update -> delete` 折叠成 `deleted`。
4. `add -> delete` 在同一 batch 内折叠为“无净实体变化”。
5. `document.replace` 直接把 `documentReplaced = true` 立起来；订阅方可以据此退化为 full refresh，而不是依赖细粒度 entity diff。

这也正是为什么 `ChangeSet` 不应该和 `InvalidationSet` 合并：

1. `add -> delete` 可能没有净实体变化。
2. 但它依然可能让 projection、selection、index 或 measurement cache 失效。
3. 所以 `InvalidationSet` 仍然可能非空。

### 9.3 `MindmapReconciler`

```ts
type MindmapReconciler = {
  run(id: MindmapId, draft: ApplyDraft, ctx: ApplyContext): Step
}

function reconcileTask(
  draft: ApplyDraft,
  task: ReconcileTask,
  ctx: ApplyContext
): Step {
  switch (task.type) {
    case 'mindmap.layout.reconcile':
      return mindmapReconciler.run(task.id, draft, ctx)
    default:
      return err('invalid', 'Unsupported reconcile task.')
  }
}
```

它负责：

1. 读取 aggregate topology。
2. 读取 owned topic node size。
3. 计算布局。
4. 更新 owned topic node 的派生 `position` / `size`。
5. 如果某个 owned topic node 的 persistent geometry 被改写，必须同时归并到 `changes.nodes.updated` 和 `invalidation.nodeIds`。
6. 标记相关 projection / aggregate invalidation。
7. 把 aggregate 收敛到稳定不变量。

它不负责：

1. 再次解释 command。
2. 再次做 owner routing。
3. 改写 topology、owner 或 top-level canvas order。
4. 向 history / collab 暴露新的公开 operation。

### 9.4 典型入队规则

长期最优下，哪些 operation 需要触发 `mindmap.layout.reconcile`，必须显式写死：

1. `mindmap.create`
2. `mindmap.root.move`
3. `mindmap.layout.patch`
4. `mindmap.topic.insert`
5. `mindmap.topic.move`
6. `mindmap.topic.delete`
7. `mindmap.topic.clone`
8. `mindmap.topic.toggleCollapse`
9. `mindmap.topic.patch`，但仅限会影响测量或布局的 patch

反过来：

1. standalone `node.patch` / `node.move` 不入队 mindmap reconcile task。
2. `mindmap.delete` 直接删除 aggregate，不需要再跑布局 reconcile。

### 9.5 reconcile 阶段约束

1. reconciler 必须是确定性的，同样输入必须得到同样结果。
2. reconciler 必须是幂等的，队列重复执行同一 task 不应产生额外语义变化。
3. reconciler 只允许写 aggregate-owned 的派生几何，以及必要的 `ChangeSet` / `InvalidationSet` 归并结果。
4. reconciler 不能偷偷扩张成新的 public write protocol；一旦它开始承载用户意图，它就又会变成第二个状态机。

### 9.6 reconcile 顺序

长期最优下，`reconcile` 的顺序应该是：

1. apply semantic operations
2. 在 apply 过程中显式 `enqueue` reconcile task
3. `drain` reconcile queue 直到为空
4. materialize next document
5. 基于 `InvalidationSet` 计算 impact
6. commit

---

## 10. 最终 pipeline

这是这份文档最明确的结论之一。

### 10.1 总流程

```text
engine.execute(command)
  -> plan(command)
  -> SemanticOperationBatch
  -> reducer.applyBatch(doc, batch)
    -> apply semantic ops in order
    -> drain reconcile queue
    -> materialize next document
    -> emit inverse + changes + invalidation + impact
  -> commit
```

### 10.2 展开后的最终写路径

```text
UI / editor action
  -> EngineCommand
  -> CommandPlanner.plan(command, currentDoc, planningCtx)
  -> SemanticOperationBatch
  -> OperationReducer.applyBatch(currentDoc, batch, applyCtx)
  -> ApplyDraft
  -> apply op #1
  -> apply op #2
  -> ...
  -> ReconcileQueue.enqueue(...)
  -> ReconcileQueue.drain(...)
  -> MindmapReconciler.run(mindmapId)
  -> next Document
  -> inverse SemanticOperation[]
  -> ChangeSet
  -> InvalidationSet
  -> KernelReadImpact
  -> Commit
```

### 10.3 对应的最小 facade

```ts
type Writer = {
  execute<C extends EngineCommand>(command: C): ExecuteResult<C>
  apply(batch: SemanticOperationBatch): ApplyResult
}
```

其中：

1. `execute(command)` 是正常业务入口
2. `apply(batch)` 是更低层的 semantic operation 入口

### 10.4 Commit 结构

既然 semantic operation 是真正的状态变迁单位，最终 commit 也应该围绕它组织。

```ts
type Commit = {
  rev: number
  at: number
  doc: Document
  operations: SemanticOperation[]
  inverse: SemanticOperation[]
  changes: ChangeSet
  invalidation: InvalidationSet
  impact: KernelReadImpact
}
```

关键点：

1. commit 里记录的是 semantic operation，而不是低层 patch array。
2. `changes` 是订阅和增量刷新使用的净变化摘要，不是另一套 history 协议。
3. `invalidation` 是 runtime invalidation 元数据，不是另一套 history 协议。
4. debug / replay / collab / history 仍然围绕 semantic operation 工作。
5. internal `ReconcileTask` 不进入 commit，不成为对外 history 协议。

最终不再需要把“low-level patch operation array”暴露为核心公开写接口。

---

## 11. capability matrix 的最终语义

长期最优必须有显式 capability matrix，而不是散落在 generic handler 里的 `if (mindmap)`。

### 11.1 `node.patch`

1. 命中 standalone node -> 生成 `node.patch`
2. 命中 topic text/style -> 生成 `mindmap.topic.patch`
3. 命中 root position -> 生成 `mindmap.root.move`
4. 命中 child position -> 拒绝；child position 只允许由 `mindmap.layout.reconcile` 内部写入

### 11.2 `node.delete`

1. standalone node -> `node.delete`
2. root topic -> `mindmap.delete`
3. child topic -> `mindmap.topic.delete`

### 11.3 `node.duplicate`

1. standalone node -> `node.duplicate`
2. root topic -> 生成一个新的 `mindmap.create`，并携带 cloned subtree nodes
3. child topic -> `mindmap.topic.clone`

### 11.4 `node.move`

1. standalone node -> `node.move`
2. root topic -> `mindmap.root.move`
3. child topic -> 拒绝或转成 `mindmap.topic.move`

长期最优下，我更建议：

1. generic drag 选中 child topic 时，不走 `node.move`
2. mindmap drag interaction 直接构造 `mindmap.topic.move`

### 11.5 `canvas.order`

1. standalone top-level node -> 允许
2. root topic -> 允许，表示整个 mindmap 顶层排序
3. child topic -> 拒绝

### 11.6 `group.merge`

对任何 `owner.kind === 'mindmap'` 的 node，一律拒绝。

group 的职责是 standalone canvas item grouping，不应该吸纳 aggregate-owned member。

---

## 12. aggregate 不变量

semantic-operation-first 真正成立的前提，是 reducer 和 reconcile 始终维护一组稳定不变量。

### 12.1 node / mindmap ownership 不变量

1. `MindmapRecord.members` 中的每个 `NodeId`，都必须存在于 `Document.nodes`。
2. 这些 node 的 `owner` 必须严格等于 `{ kind: 'mindmap', id: mindmapId }`。
3. `owner.kind === 'mindmap'` 的 node，必须且只能属于一个 `MindmapRecord`。
4. standalone node 的 `owner` 必须为空。

### 12.2 topology 不变量

1. `mindmap.root` 必须存在于 `members`。
2. `mindmap.root` 对应 node 必须存在于 `Document.nodes`。
3. `children[parentId]` 中出现的每个 child，必须存在于 `members`。
4. 每个非 root member 必须且只能有一个 `parentId`。
5. topology 不允许环。

### 12.3 canvas 不变量

1. root topic node 参与 top-level canvas 语义。
2. child topic node 不参与 top-level canvas order。
3. `canvas.order` 中不应该显式出现 child topic node。
4. `canvas.order` 中若命中 mindmap，只能命中 root topic。

### 12.4 geometry 不变量

1. every topic node 都有稳定 `position`。
2. every topic node 都有可用 `size`，即使来自 fallback measurement。
3. child topic 的位置最终由 mindmap layout 决定，而不是 generic `node.move` 决定。
4. root topic 的位置是整个 mindmap 的顶层锚点。

### 12.5 reducer 与 reconcile 的职责分界

上述不变量里：

1. topology 一致性由 semantic operation reducer 直接维护。
2. 布局几何一致性由 `MindmapReconciler` 收敛。
3. `ChangeSet` / `InvalidationSet` 由 reducer 和 reconciler 共同归并。
4. canvas 顶层引用一致性由 reducer 和 canvas policy 共同维护。

也就是说：

1. reducer 负责“结构正确”
2. reconciler 负责“几何收敛”
3. 二者共同负责把 net effect 和 invalidation 输出压实
4. planner 不负责兜底修复 document

---

## 13. 最终 read / interaction 模型

写路径要降复杂度，read 路径也必须配合。

### 13.1 `node.read` 继续统一

最终：

1. topic 继续通过 `node.read.get(nodeId)` 被读取。
2. toolbar 继续基于 node target 工作。
3. edge connect 继续基于 node anchor query 工作。

### 13.2 read model 暴露 owner / placement 派生信息

为了让 interaction 层做出正确选择，`node.read` 的返回结果里必须带这些派生信息：

1. `owner`
2. `placement`
3. `isTopLevelCanvasItem`
4. `isMindmapRoot`

### 13.3 preview 只覆盖 presentation

preview 层可以继续做：

1. root move preview
2. subtree drag preview
3. live text edit relayout preview

但 preview 不再承担正式提交语义，不再自己拼正式 operation batch。

---

## 14. 最终模块分层

长期最优不只是 type 正确，还要求模块边界稳定。

### 14.1 `@whiteboard/core`

最终只保留纯领域和纯算法：

1. `Document` / `NodeRecord` / `MindmapRecord` 等 canonical types
2. semantic operation types
3. `ChangeSet` / `InvalidationSet` / reconcile task types
4. 纯 aggregate reconciler helpers
5. node / edge / group / mindmap reducer helpers
6. layout algorithm
7. invariant check helpers
8. inverse operation builders

它不负责：

1. command planning
2. editor preview
3. layout backend 适配

### 14.2 `@whiteboard/engine`

最终负责：

1. command planner
2. owner resolver
3. capability policy
4. semantic operation reducer orchestration
5. reconcile orchestration
6. commit / history / change notification / read impact

它不负责：

1. pointer session
2. preview animation
3. editor UI 行为

### 14.3 `@whiteboard/editor`

最终负责：

1. interaction state
2. preview state
3. measurement adapter
4. action facade
5. 把用户手势翻译成 `EngineCommand`

它不负责：

1. 正式 semantic operation reducer
2. 正式 aggregate reconcile
3. 正式 commit 逻辑

### 14.4 模块依赖方向

最终依赖方向必须固定成：

```text
editor -> engine -> core
```

不允许：

1. engine 依赖 editor 的正式 write 逻辑
2. core 依赖 engine planner
3. editor 绕过 engine 自己维护正式写内核

---

## 15. 必须删除的现有结构

如果目标是长期最优，下面这些结构不应该继续保留。

### 15.1 删除 `node.type === 'mindmap'`

mindmap 不再伪装成 node type。

### 15.2 删除 `node.mindmapId`

它必须被结构化的 `node.owner` 替代。

### 15.3 删除 root topic node `data.tree`

拓扑结构不再塞进 node data。

### 15.4 删除 generic handler 中的 mindmap 特判扩散

最终 generic handler 里不再允许出现：

1. `node?.type === 'mindmap'`
2. `Boolean(node?.mindmapId)`
3. `Mindmap nodes do not support generic ...`

这些都应该收口到 planner / owner router / capability policy。

### 15.5 删除 editor 的正式 mindmap operation compiler

editor 不再在正式提交时自己：

1. `insertNode`
2. `computeMindmapLayout`
3. `buildMindmapInsertOperations`
4. `applyOperations`

这套逻辑统一回到 engine 的 semantic operation pipeline。

### 15.6 删除“command mutate draft -> compile low-level ops”作为系统主路径

这条路径可以作为 reducer internals 的实现技巧存在，但不能再是对外主模型。

---

## 16. 为什么这版比 draft-first 更适合 whiteboard

这点必须单独写清楚。

### 16.1 operation 更符合 history / collab / replay 的中心地位

whiteboard 这类系统的长期核心不是“怎么方便写 handler”，而是：

1. 操作怎么重放
2. 历史怎么表达
3. 协作怎么同步
4. 调试怎么审计

这些都天然更适合围绕 semantic operation 建模。

### 16.2 reducer 成为唯一真写入口

这会带来非常清晰的边界：

1. command 只生成 semantic operation
2. reducer 负责更新 document
3. reconcile 负责 aggregate 收敛
4. commit 负责 history / changes / invalidation / impact / notification

### 16.3 command handler 复杂度明显下降

handler 不再需要：

1. 手拼低层 patch
2. 管理局部 next map
3. 安排 relayout patch 顺序
4. 在多个实体表之间自己做补偿同步

### 16.4 它比“topic 退出 node 模型”更符合真实产品语义

既然 topic 真正要参与：

1. selection
2. toolbar
3. edge connect
4. node.read

那长期最优就不是把 topic 变成 projection-only object，而是让 topic 保持 node 身份，同时把 write ownership 收口到 semantic operation layer。

---

## 17. 最终架构摘要

长期最优的最终形态可以压缩成下面这几句话：

1. **mindmap 是一等 aggregate，不再伪装成 node type。**
2. **topic 继续是 node，继续参与统一 `node.read`、selection、toolbar、edge connect。**
3. **topic 的 owner 是 `mindmap`，不是 generic standalone node。**
4. **结构语义在 `mindmaps` 表里，内容和几何在 `nodes` 表里。**
5. **command 不直接更新 document，只生成 semantic operation batch。**
6. **document 的唯一更新入口是 semantic operation reducer。**
7. **reconcile 在 reducer 之后通过显式队列收敛 aggregate 派生约束。**
8. **editor 不再维护第二套正式 mindmap compiler。**

如果必须再压成一句最核心的设计约束，那就是：

**不要把“topic 应该参与统一 node read”误解成“topic 应该归 generic node write 直接拥有”；长期最优是 read 统一、owner 明确、command 产出 semantic operation、document 由 operation reducer 更新、aggregate 由 reconcile 收敛。**
