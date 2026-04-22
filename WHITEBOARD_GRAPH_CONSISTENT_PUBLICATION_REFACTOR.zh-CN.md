# Whiteboard 一致发布架构重写方案

本文不再讨论现有 whiteboard 派生链、既有 store 模型、历史兼容包袱应该如何修补。

本文只回答一个问题：

如果完全从长期最优出发，whiteboard 的 authoritative runtime 应该长什么样，哪些底层模式应该抽成高复用基础设施，才能让系统具备下面这些性质：

- 发布一致，不出现局部 fresh、局部 stale 同时对外可见。
- phase 边界清楚，任何 bug 都能定位到具体阶段。
- mindmap、free node、edge、selection、chrome 都消费同一份最终真相。
- live edit、preview、measurement、layout、render 可以共存，但不会互相打架。
- 运行时模式可以复用到 dataview、graph view、diagram、canvas 等其他投影型系统。

本文结论非常明确：

- whiteboard 的长期最优形态，不是“更聪明的 selector store”。
- 长期最优不是只改 editor，而是 `whiteboard-engine` 和 editor 一起重构。
- whiteboard 不是“两份并列真相”，而是 `DocumentEngine` committed truth 与 `EditorGraphRuntime` projection truth 两级 authoritative truth。
- 长期最优形态是“显式阶段运行时 + working state + 单次 publish 的 revisioned snapshot + sink-local source sync”。
- 真正值得复用的，不是当前某个 store API，而是一套 projection runtime contract。
- 最终方案不保留兼容层、不保留旧 `EngineRead` 投影模型、不允许新旧双轨长期并存。

---

## 1. 总体判断

whiteboard 的长期最优，不是“保留现在的 `whiteboard-engine` read 模型，再在 editor 上面加一层补丁运行时”。

长期最优应该同时重写 `whiteboard-engine` 和 editor 的运行时边界：

- `whiteboard-engine` 收敛成只负责 committed document、canonical graph facts、write transaction、document change set 的 `DocumentEngine`。
- editor 建设新的 `EditorGraphRuntime`，作为编辑器图状态的唯一 authoritative projection runtime。
- 当前 `whiteboard-engine` 里承担 projection/read/store 的那一层，要整体删除，而不是继续作为 editor 的底座。

这套 runtime 的职责不是“提供很多方便的 read 接口”，而是：

1. 接收所有会影响图投影的输入。
2. 通过显式 phase 把输入投影到 working state。
3. 在一个 revision 内只 publish 一次最终 `EditorSnapshot`。
4. 让所有外部消费者只读这份已发布 snapshot。
5. 让所有对外 store、React hook、canvas scene、命中检测、devtools 都只做 sink-local 同步，不再重算语义。

一句话概括：

> whiteboard 的最终形态应该是一个 projection engine，而不是一张由零散 `read()` 串起来的 selector graph。

---

## 2. 设计目标

### 2.1 一致性目标

对外必须满足以下契约：

- 同一时刻所有消费者看到的是同一 revision 的快照。
- 一个 revision 内不允许分批对外暴露中间结果。
- `layout`、`node render`、`scene`、`selection`、`chrome` 必须来自同一份最终发布结果。
- 任何 `get()`、订阅、hook render 都不能偷偷刷新中间状态并绕过 publish。

### 2.2 复杂度目标

系统要能长期承受：

- 文本编辑导致的连续测量变化
- owner 级树布局变化
- preview patch
- 多种 node owner
- selection / hover / chrome 的二次投影
- 大图场景下的局部增量更新

但复杂度必须集中在 runtime，而不是分散在一堆 store / hook / query 里。

### 2.3 复用目标

最终应沉淀成两层：

1. domain-specific runtime
   whiteboard、dataview、其他 graph-like 产品各自定义自己的 phase 和 snapshot schema。
2. reusable runtime kit
   提供 staged derivation、dirty planning、publish reuse、source sync、trace、测试夹具等通用底层模式。

也就是说：

- 业务语义不强行共用。
- runtime contract 和基础设施应高复用。

---

## 3. 最终总架构

### 3.1 系统边界

长期最优的 whiteboard 系统，应拆成 3 个明确边界：

1. `DocumentEngine`
2. `EditorGraphRuntime`
3. `Adapter / Host`

它们的关系是：

- `DocumentEngine` 只负责 committed domain truth。
- `EditorGraphRuntime` 只负责 editor projection truth。
- `Adapter / Host` 只负责输入接线、sink-local 同步、store/source 宿主管理、UI 集成。

这里必须明确一个很重要的判断：

- 这不是两份互相竞争的真相
- `DocumentEngine` 是 committed truth
- `EditorGraphRuntime` 是建立在 committed truth + editor 输入之上的 projection truth
- draft / preview / measure / selection / viewport 这些都不是“第三份真相”，它们只是 projection runtime 的输入

因此，whiteboard 真正特殊的地方，不是“临时态很多”，而是这些未提交输入会直接影响最终 geometry / layout / scene / pick / chrome。

必须明确：

- engine 不再对外暴露 node geometry、mindmap layout、mindmap scene、canvas scene 这类 projection read。
- editor 不再建立在 engine 已投影过一轮的 read store 之上。
- adapter 不再兜底一致性，不再偷读中间态。
- concrete `store` / `source runtime` 只能存在于 `whiteboard-editor`，不能存在于 `whiteboard-engine` 或 `whiteboard-editor-graph`。

因此，whiteboard 最终不是“一个 engine + 一堆 selector read”，而是“两级 runtime”：

- 一级是 committed 文档引擎
- 一级是 editor 投影引擎

二者都必须重构，不能只动 editor。

### 3.2 逻辑分层

长期最优建议固定为 4 层：

1. `Input`
2. `Runtime`
3. `Snapshot`
4. `Source`

它们的职责分别是：

#### 1. Input

只负责收集原始输入，不做语义派生。

输入包括：

- committed whiteboard document
- edit session state
- draft text
- text measurement results
- preview state
- interaction state
- viewport state
- tool state
- animation clock
- resource readiness

这些输入里，除了 committed document 以外，其他都不是对外公开真相。

它们的职责只有一个：

- 参与构造本轮 editor projection truth

#### 2. Runtime

唯一 authoritative projection runtime。

它维护：

- `WorkingState`
- `DirtyState`
- phase cache
- previous published snapshot
- trace / metrics

并负责：

- impact planning
- staged derivation
- publish

#### 3. Snapshot

对外唯一真相。

它是：

- immutable
- revisioned
- fully validated
- stable-reference aware

最终所有对外读取都只面向它。

#### 4. Source

只负责把 `previousSnapshot / nextSnapshot` 同步给不同 sink。

它不是第二个语义引擎。

对 whiteboard 来说，还要额外明确：

- `EditorGraphRuntime` 不拥有 concrete source runtime
- `whiteboard-editor` 才拥有 concrete store/source publication layer
- `EditorGraphRuntime` 如果需要表达发布分片，也只能输出 store-agnostic publish/apply spec

它不负责：

- 重新计算布局
- 重新组合 node render
- 推断哪些 tree 该 relayout
- 再定义 selection / chrome / scene 语义

它只负责：

- sink-local diff
- store patch
- keyed notification
- renderer sync

### 3.3 数据流

每次输入变化后的固定流程：

1. input adapter 产生 `InputChange`
2. runtime 计算 `ImpactPlan`
3. runtime 标记 dirty set
4. runtime 按 phase 顺序更新 `WorkingState`
5. runtime 产出 `nextSnapshot`
6. runtime publish `revision + 1`
7. source 以 sink-local 方式同步 `previousSnapshot -> nextSnapshot`
8. 外部消费者只收到 publish 结果

整个过程中不允许任何外部读取接触 `WorkingState`。

---

## 4. 核心抽象

### 4.1 `WorkingState`

`WorkingState` 是运行时内部可变工作区。

它应该包含 runtime 各阶段需要的中间结果，但这些结果只允许 phase 之间传递，不允许对外暴露。

建议结构：

```ts
interface WorkingState {
  inputs: InputState
  graph: GraphWorkingState
  measure: MeasureWorkingState
  tree: TreeWorkingState
  render: RenderWorkingState
  scene: SceneWorkingState
  publish: PublishWorkingState
}
```

特点：

- 可变
- 允许 phase 内多次修正
- 允许缓存
- 允许局部复用
- 不可被 UI 直接读

### 4.2 `EditorSnapshot`

`EditorSnapshot` 是对外唯一真相。

建议结构：

```ts
interface EditorSnapshot {
  revision: number
  meta: EditorSnapshotMeta
  nodes: EntityFamilySnapshot<NodeId, NodeRenderSnapshot>
  edges: EntityFamilySnapshot<EdgeId, EdgeRenderSnapshot>
  owners: {
    mindmaps: EntityFamilySnapshot<MindmapId, MindmapSnapshot>
    groups: EntityFamilySnapshot<GroupId, GroupSnapshot>
  }
  selection: SelectionSnapshot
  chrome: ChromeSnapshot
  scene: SceneSnapshot
  spatial: SpatialSnapshot
}
```

核心要求：

- 没变化的实体必须复用旧引用。
- 变化实体只在 publish 时创建新对象。
- 所有切片都带有明确边界，不能跨切片偷读中间态。

### 4.3 `ImpactPlan`

`ImpactPlan` 负责把输入变化翻译成 dirty 范围。

建议结构：

```ts
interface ImpactPlan {
  causes: readonly ChangeCause[]
  dirty: DirtyState
  priority: 'sync' | 'transition' | 'idle'
}
```

这是整个增量系统的起点。

关键原则：

- dirty 由显式算法决定，不由 selector 传播“猜”出来。
- runtime 在进入 phase 前，就应该知道大概会影响哪些实体和哪些阶段。

### 4.4 `Phase`

每个 phase 都是显式节点，而不是隐式 `read()` 网络。

通用 contract 建议固定成：

```ts
interface RuntimePhase<TContext> {
  name: string
  dependsOn: readonly string[]
  run(context: TContext): PhaseResult
}

interface PhaseResult {
  action: 'reuse' | 'sync' | 'rebuild'
  changed: ChangedSet
  metrics?: PhaseMetrics
}
```

phase 的职责是：

- 读取明确输入
- 更新 working state 的明确区域
- 声明 changed set
- 产出 trace / metrics

phase 不应该做的事：

- 直接通知 UI
- 直接写外部 store
- 直接触发另一个 phase 的订阅式刷新

### 4.5 `SourceSync`

source 层建议统一成 `previousSnapshot -> nextSnapshot` 的 sink-local 同步模型。

建议 contract：

```ts
interface SnapshotSourceSync<TSink> {
  sync(input: {
    previous?: EditorSnapshot
    next?: EditorSnapshot
    changed: PublishedChangeSet
    sink: TSink
  }): void
}
```

这里的关键点是：

- runtime 产出 snapshot 和 changed set
- sink 自己决定如何最小化更新
- 但 sink 不负责重新定义语义

### 4.6 `DocumentEngineSnapshot`

`whiteboard-engine` 的最终公共真相不应该是 projection read，而应该是 committed document snapshot。

建议结构：

```ts
interface DocumentEngineSnapshot {
  revision: number
  document: Document
  facts: DocumentFactsSnapshot
  change?: DocumentChangeSet
}

interface DocumentFactsSnapshot {
  nodes: ReadonlyMap<NodeId, Node>
  edges: ReadonlyMap<EdgeId, Edge>
  owners: OwnerFactsSnapshot
  relations: GraphRelationSnapshot
}
```

`DocumentEngine` 的职责应该只有：

- 文档 normalize / sanitize
- command compile / transaction
- document revision
- canonical committed graph facts
- committed change set / impact

它不应该负责：

- live edit
- preview
- text measurement
- layout
- node render
- edge render
- scene
- selection / chrome
- hit-test 依赖的 editor projection geometry

### 4.7 `DocumentEngine` 对外 contract

长期最优建议把 engine 收敛成下面这类接口：

```ts
interface DocumentEngine {
  getSnapshot(): DocumentEngineSnapshot
  subscribeCommits(
    listener: (snapshot: DocumentEngineSnapshot) => void
  ): () => void
  execute(command: Command): CommandResult
  apply(ops: readonly Operation[]): CommandResult
}
```

也就是说：

- editor runtime 读取的是 committed snapshot
- editor runtime 不再读取 engine projection store
- engine 只提供 committed truth，不提供 editor projection truth

### 4.8 必须删除的旧模型

既然目标是长期最优，下面这些模型最终都不应该保留：

- `EngineRead.node.committed`
- `EngineRead.node.geometry`
- `EngineRead.node.rect`
- `EngineRead.node.bounds`
- `EngineRead.edge.item`
- `EngineRead.mindmap.structure`
- `EngineRead.mindmap.layout`
- `EngineRead.mindmap.scene`
- `EngineRead.scene.list`
- `whiteboard-engine/src/read/store/projection.ts`
- `whiteboard-engine/src/read/store/*` 这整套 projection store runtime
- editor 当前基于 `store.read()` 串起来的 query/layout/read 旧链路

原因不是这些实现一定错误，而是它们把 committed truth 和 editor projection truth 混成了一层。

这在长期一定会回到：

- 双 authoritative geometry
- 双 publish 语义
- 依赖链隐式
- live edit / committed / scene 彼此错位

---

## 5. Whiteboard 运行时的最终 phase 设计

whiteboard 不适合只有一个“超级 derive”阶段。

长期最优应该固定成下面这些 phase。

### 5.1 `InputNormalizePhase`

职责：

- 把 committed document、session draft、preview、interaction、viewport、tool、clock 等原始输入归一成统一的 `InputState`
- 生成稳定的 input revision
- 对输入做最小必要校验

输出：

- `WorkingState.inputs`

不负责：

- layout
- render
- scene

### 5.2 `GraphAssemblePhase`

职责：

- 把 committed graph 和 transient overlay 合成为统一 graph facts
- 明确 node/edge/owner 的 canonical identity
- 明确 owner relation、tree relation、attachment relation
- 把 draft text、draft style、preview patch 变成 graph-level overlay，而不是在 node read 末端临时拼接

输出建议：

- `graph.nodes`
- `graph.edges`
- `graph.owners`
- `graph.overlays`
- `graph.indices`

关键原则：

- “这个 node 当前语义上是什么”只能在这里定。
- 后续 phase 不应该再回头猜 committed 与 draft 谁优先。

### 5.3 `MeasurePhase`

职责：

- 基于 graph facts 和文本内容生成测量请求
- 消费 text measurement backend 的结果
- 生成 node content box / intrinsic size / line metrics

输出建议：

- `measure.nodeContent`
- `measure.nodeSize`
- `measure.labelSize`
- `measure.pendingRequests`

关键原则：

- 文本测量不应该散落在 node render 或 owner layout 里临时触发。
- measurement 是独立真源，tree/layout 只能消费它。

### 5.4 `OwnerStructurePhase`

职责：

- 生成 owner 级结构模型
- 对 mindmap、group、container、table-like owner 等建立统一结构视图
- 明确 subtree membership、sibling order、anchor rule、layout policy

输出建议：

- `tree.ownerStructure`
- `tree.ownerMembers`
- `tree.nodeOwnerIndex`

关键原则：

- owner 结构是真正决定 relayout 范围的地方。
- node phase 不允许再修改 owner 级结构判断。

### 5.5 `TreeProjectionPhase`

职责：

- 根据 owner structure 和 measured size 计算 owner 级布局结果
- 产出 subtree bbox、anchored rect、ports、mindmap live layout、group content rect
- 处理会影响整棵树的几何变化

输出建议：

- `tree.nodeGeometry`
- `tree.ownerGeometry`
- `tree.subtreeBounds`
- `tree.portGeometry`

这一步是 whiteboard 最关键的 authoritative geometry phase。

必须明确规定：

- 凡是会影响 sibling / subtree / owner bbox 的变化，都只能在这里生效。
- 后续 node render 只能消费 `tree.nodeGeometry`，不能反向修补树布局。

这条规则正是避免“编辑时高度变了，但 topic left/top 不动，commit 后才回到正确位置”的根本手段。

### 5.6 `ElementProjectionPhase`

职责：

- 把 graph facts、measurement、tree geometry 合成为最终 node / edge render
- 计算 node visual rect、content rect、handle rect、decoration、edge path

输出建议：

- `render.nodes`
- `render.edges`
- `render.hitAreas`

关键原则：

- node render 必须完全站在 authoritative tree geometry 之上。
- 这里不允许再做 owner 级重定位。
- `contentRect`、`visualRect`、`selectionRect` 的定义要稳定，不允许每条消费链自己理解一套。

### 5.7 `SelectionProjectionPhase`

职责：

- 基于最终 node / edge render 和 interaction 状态生成 selection 结果
- 计算 marquee、selection frame、handles、multi-select outline

输出建议：

- `scene.selection`
- `chrome.handles`

### 5.8 `ChromeProjectionPhase`

职责：

- 生成 hover、anchor hint、drop indicator、editing caret overlay、guides、tool chrome

输出建议：

- `chrome.overlays`
- `chrome.guides`
- `chrome.editing`

### 5.9 `SceneProjectionPhase`

职责：

- 汇总 nodes / edges / owners / selection / chrome 成最终 scene
- 生成渲染层所需分层、排序、裁剪、spatial index、pick index

输出建议：

- `scene.layers`
- `scene.items`
- `scene.spatial`

### 5.10 `PublishPhase`

职责：

- 基于 `WorkingState` 构建最终 `EditorSnapshot`
- 复用未变化引用
- 生成 `PublishedChangeSet`
- 递增 revision

输出建议：

```ts
interface PublishResult {
  snapshot: EditorSnapshot
  changed: PublishedChangeSet
}
```

必须强调：

- publish 是 runtime 唯一对外边界。
- 一个输入变化内只能 publish 一次。
- 所有 source / store / React hook 都只订阅 publish 结果。

---

## 6. 依赖与禁止规则

长期最优架构不能只定义阶段，还要定义禁止规则。

### 6.1 允许的依赖方向

只允许：

1. `InputNormalize -> GraphAssemble`
2. `GraphAssemble -> Measure`
3. `GraphAssemble + Measure -> OwnerStructure`
4. `OwnerStructure + Measure -> TreeProjection`
5. `TreeProjection + GraphAssemble -> ElementProjection`
6. `ElementProjection + Interaction -> SelectionProjection`
7. `ElementProjection + SelectionProjection + Interaction -> ChromeProjection`
8. `ElementProjection + SelectionProjection + ChromeProjection -> SceneProjection`
9. `SceneProjection -> Publish`

### 6.2 明确禁止

必须禁止下面这些模式：

- node projection 再反向修改 tree geometry
- scene projection 再回头决定 node layout
- chrome 再偷偷读 draft store 自己拼编辑态
- hook 层为了“兜底”再去调用 runtime 内部 `get()` 补刷新
- source 根据 previous/next 自己再推导一套业务语义
- 任何 phase 通过全局隐式读写触发另一个 phase 的增量刷新

一句话：

> 允许下游消费上游结果，不允许下游重定义上游语义。

---

## 7. 增量更新模型

### 7.1 DirtyState 不是附属优化，而是主模型的一部分

建议：

```ts
interface DirtyState {
  inputs: boolean
  graph: {
    nodeIds: ReadonlySet<NodeId>
    edgeIds: ReadonlySet<EdgeId>
    ownerIds: ReadonlySet<OwnerId>
  }
  measure: {
    nodeIds: ReadonlySet<NodeId>
  }
  tree: {
    ownerIds: ReadonlySet<OwnerId>
    nodeIds: ReadonlySet<NodeId>
  }
  render: {
    nodeIds: ReadonlySet<NodeId>
    edgeIds: ReadonlySet<EdgeId>
  }
  scene: boolean
  selection: boolean
  chrome: boolean
}
```

关键点：

- dirty set 由 `ImpactPlan` 产生。
- phase 运行后可以扩展下游 dirty。
- 最终 publish 的 changed set 由 phase 结果汇总得到。

### 7.2 典型例子：编辑 mindmap topic 文本

理想影响链应该是：

1. draft text 变化
2. `MeasurePhase` 得到新 content size
3. `TreeProjectionPhase` 重新计算所属 mindmap subtree 布局
4. `ElementProjectionPhase` 重新生成受影响 node render 和相关 edge path
5. `SceneProjectionPhase` 更新 scene / spatial / chrome
6. `PublishPhase` 一次对外发布

这条链路里不允许出现：

- node content size 变了，但 tree geometry 还是旧的
- tree geometry 新了，但 node render 还拿旧 owner geometry
- scene 变了，但 selection / chrome 没跟上

### 7.3 典型例子：移动一个 free node

理想影响链应该是：

1. graph overlay 变化
2. tree 不一定脏
3. element render 脏该 node 和 incident edges
4. scene / selection / chrome 脏
5. publish

这说明 dirty 是领域算法，不是统一粗暴全量重算。

### 7.4 典型例子：viewport 改变

理想影响链应该是：

1. 不改变 authoritative graph geometry
2. 只影响 scene culling / chrome / overlays
3. 不触发 tree 或 node render 重算

这正是 phase 边界清晰带来的性能收益。

---

## 8. 发布模型

### 8.1 快照是唯一公共语言

最终对外公共语言应该只有：

- `EditorSnapshot`
- `PublishedChangeSet`

不建议再设计跨层通用 patch 语言，把整个 runtime 变成“先翻译成 patch，再让下游再翻一遍”。

更优做法是：

1. runtime 产出 snapshot
2. runtime 声明 changed set
3. sink-local source sync 决定如何最小化更新

### 8.2 稳定引用复用

publish 需要做到：

- 没变的 node render 直接复用旧对象
- 没变的 edge render 直接复用旧对象
- 没变的 scene layer / spatial bucket 尽量复用旧对象
- selection / chrome 在语义没变时也复用

这不是微优化，而是：

- keyed 订阅的基础
- React render 稳定性的基础
- 大图场景性能稳定性的基础

### 8.3 通知模型

建议 publish 阶段直接产出：

```ts
interface PublishedChangeSet {
  nodes: ReadonlySet<NodeId>
  edges: ReadonlySet<EdgeId>
  owners: ReadonlySet<OwnerId>
  scene: boolean
  selection: boolean
  chrome: boolean
}
```

所有 keyed 通知都应该基于这份 changed set。

不要把“哪些 key 变了”的判断留给外部 store 再猜一次。

---

## 9. 对外读取模型

### 9.1 只暴露 snapshot read

建议对外固定成下面这类接口：

```ts
interface EditorSnapshotRead {
  getSnapshot(): EditorSnapshot
  subscribeRevision(listener: (revision: number) => void): () => void
  subscribeChanges(
    listener: (change: PublishedChangeSet, snapshot: EditorSnapshot) => void
  ): () => void
}
```

这是一切外部适配层的基础。

### 9.2 可选暴露 entity-focused read

为了 ergonomics，可以暴露 entity-focused 读取，但其语义必须建立在已发布 snapshot 之上：

```ts
interface EditorEntityRead {
  getNode(id: NodeId): NodeRenderSnapshot | undefined
  getEdge(id: EdgeId): EdgeRenderSnapshot | undefined
  getMindmap(id: MindmapId): MindmapSnapshot | undefined
  subscribeNodes(ids: readonly NodeId[], listener: () => void): () => void
}
```

重点在于：

- 这些接口只是 snapshot 的 index/read facade
- 不是新的派生层
- 不允许内部再跑半套 runtime

### 9.3 React / store / renderer 都属于 adapter

推荐把下面这些全部看成 adapter：

- React hook
- canvas renderer
- DOM overlay renderer
- devtools inspector
- testing harness

但其中具体 `store` 边界必须再收紧一层：

- concrete store/source runtime 只允许在 `whiteboard-editor`
- `whiteboard-react` / renderer / devtools 只消费 `whiteboard-editor` 暴露的 source 或 snapshot
- 不允许每个 adapter 各自再建一套 store 真源

这些 adapter 的共同原则：

- 只读 published snapshot
- 不自行定义业务语义
- 不碰 working state
- 不保留兼容性旧接口

---

## 10. 可高复用的底层模式

whiteboard 真正值得沉淀为通用基础设施的，不是 node / mindmap / scene 这些业务语义，而是下面这些 runtime patterns。

### 10.1 Revisioned Snapshot Runtime

通用能力：

- 维护 `previousSnapshot / nextSnapshot`
- 管理 revision
- 统一 publish
- 对外提供 snapshot read

可抽成通用包，例如：

- `@shared/projection-runtime`

### 10.2 Phase Orchestrator

通用能力：

- phase 注册
- phase 依赖图
- run order
- `reuse / sync / rebuild` 行为
- trace 聚合

这是 dataview、whiteboard、graph view 都会用到的共性。

### 10.3 Impact Planner / Dirty Planner

通用能力：

- 输入变化分类
- dirty 集合维护
- phase 扩散规则
- changed set 汇总

领域逻辑不同，但 planner 框架本身高度可复用。

### 10.4 Stable Reference Publisher

通用能力：

- entity family publish
- previous/next 引用复用
- changed id 维护
- snapshot 切片复用计数

这也是典型复用点。

### 10.5 Sink-local Source Sync

通用能力：

- `previousSnapshot / nextSnapshot` 同步
- entity list patch
- keyed store sync
- renderer runtime sync

source 的领域内容不同，但“snapshot 同步到 sink”的框架是共性的。

### 10.6 Runtime Trace / Perf Contract

通用能力：

- phase trace
- action: `reuse | sync | rebuild`
- changed metrics
- publish metrics
- end-to-end timing

这是复杂 projection engine 必备能力，不应每个产品各写一套。

### 10.7 Deterministic Test Harness

通用能力：

- 输入变更驱动 runtime
- capture snapshot
- assert changed set
- assert reference reuse
- assert phase trace

这是最应该复用的测试基础设施之一。

---

## 11. 哪些东西应该复用，哪些不应该

### 11.1 应该复用的

- runtime shell
- phase runner
- dirty planner framework
- publish/reuse utilities
- entity family snapshot utilities
- source sync utilities
- trace / perf schema
- testing harness

### 11.2 不应该强行复用的

- whiteboard 的 owner / tree / edge / scene 语义
- dataview 的 query / membership / summary 语义
- 具体布局算法
- 具体 measurement 语义
- 具体 UI/chrome 规则

判断标准很简单：

- 只要是“投影引擎的共同运行时问题”，应该抽象复用。
- 只要是“某个产品的业务语义”，就应该留在 domain runtime。

---

## 12. 建议的代码组织

如果完全按长期最优来落地，建议拆成下面这些边界。

### 12.1 通用 runtime 层

```text
shared/projection-runtime/
  src/contracts/
  src/runtime/
  src/phase/
  src/publish/
  src/source/
  src/testing/
  src/perf/
```

职责：

- staged runtime primitives
- publish/reuse primitives
- source sync primitives
- trace / perf primitives
- testing harness

### 12.2 `whiteboard-engine` 文档引擎层

```text
whiteboard/packages/whiteboard-engine/
  src/contracts/
  src/document/
  src/normalize/
  src/facts/
  src/impact/
  src/write/
  src/runtime/
  src/testing/
```

职责：

- committed document truth
- canonical graph facts
- command / transaction / history-facing write result
- committed change set

必须明确删除：

- `src/read/store/`
- engine 内部 projection runtime
- engine 对 editor geometry / scene / mindmap layout 的公开 read

### 12.3 whiteboard projection runtime

```text
whiteboard/packages/whiteboard-editor-graph/
  src/contracts/
  src/input/
  src/impact/
  src/phases/
    inputNormalize/
    graphAssemble/
    measure/
    ownerStructure/
    treeProjection/
    elementProjection/
    selectionProjection/
    chromeProjection/
    sceneProjection/
    publish/
  src/runtime/
  src/testing/
```

职责：

- whiteboard graph 语义
- layout / render / scene 语义
- whiteboard snapshot schema
- store-agnostic projection publish discipline

### 12.4 `whiteboard-editor` 宿主编排层

```text
whiteboard/packages/whiteboard-editor/
  src/session/
  src/input/
  src/actions/
  src/source/
  src/runtime/
  src/testing/
```

职责：

- 接入 `DocumentEngine`
- 接入 `EditorGraphRuntime`
- 编排 session / input / history / actions
- 持有 concrete store/source runtime
- 把 published snapshot/change 同步给宿主 source
- 不承载 authoritative projection 逻辑

### 12.5 adapter 层

```text
whiteboard/packages/whiteboard-react/
whiteboard/packages/whiteboard-renderer/
whiteboard/packages/whiteboard-devtools/
```

职责：

- 订阅 published snapshot
- 做 sink-local sync
- 提供 React / renderer / inspector 适配

---

## 13. 对 dataview / 其他系统的复用意义

这套方案不是只为 whiteboard 写的。

如果抽象得当，它天然适用于：

- dataview active snapshot runtime
- graph/database explorer
- kanban/table/gallery 投影引擎
- diagram editor
- timeline / mind map / org chart

共性都在这里：

- 输入不是最终显示
- 中间需要多阶段投影
- 必须有一致发布边界
- 需要增量复用
- 需要 sink-local 发布

差异只在 domain phase 内容，不在 runtime contract。

可以这样理解：

- dataview 的 `query -> membership -> summary -> publish -> source`
- whiteboard 的 `graph -> measure -> structure -> tree -> element -> scene -> publish -> source`

它们属于同一个 runtime family，只是 phase 内容不同。

### 13.1 dataview runtime boundary 对 whiteboard 的直接启发

详见 [DATAVIEW_ENGINE_RUNTIME_BOUNDARY_REWRITE.zh-CN.md](/Users/realrong/Rostack/DATAVIEW_ENGINE_RUNTIME_BOUNDARY_REWRITE.zh-CN.md)。

dataview 那份文档对 whiteboard 最重要的启发，不是“dataview 也有 runtime”，而是它把边界切法说得足够硬：

- `engine` 不应该知道 `store`
- `engine` 不应该暴露 `source`
- `runtime` 才拥有 `source adapter`
- 同步读 API 应建立在 published snapshot 上，而不是建立在 store/source 上
- adapter 只能 apply authoritative `change`，不能回头 diff `previousSnapshot / nextSnapshot`
- 发布热点优化必须留在 adapter，不允许反向污染 engine contract 或 runtime core

这几点对 whiteboard 的意义非常直接：

- `whiteboard-engine` 不能重新长出 node geometry / layout / scene / hit-test source
- `whiteboard-editor-graph` 必须是 projection runtime，而不是旧 `EngineRead` 的新 facade
- `whiteboard-editor` 才能持有 concrete store/source runtime，`whiteboard-react` 只能消费它
- 如果后续需要节点大表、scene 列表、spatial index 的专用 store，也只能放在 adapter，不得回流进 engine 或 runtime core

### 13.2 这组启发对白板后续实施的直接约束

因此，whiteboard 后续施工时必须额外坚持下面这些约束：

- `DocumentEngine` 只发布 committed `snapshot + change`
- `EditorGraphRuntime` 只发布 editor `snapshot + change + trace`
- draft / preview / measure / viewport 只作为 runtime 输入，不单独对外形成第二套 truth API
- `Read` 只允许做 snapshot facade，不允许重新组织派生链
- `Source` 只允许做 apply-only sync，不允许补语义
- concrete store/source runtime 只允许在 `whiteboard-editor`
- mindmap 文本编辑、测量变化、owner relayout、scene 更新，必须在同一轮 publish 中完成，不允许依赖 commit 后二次修正
- 不允许再把“发布层的方便接口”写成 engine/runtime 的公共合同

---

## 14. 最终实施顺序

这里说的不是“渐进兼容迁移顺序”，而是长期最优目标下的一次性统一重构顺序。

原则非常明确：

- 不做双轨运行
- 不保留 compatibility adapter
- 不让新 runtime 建立在旧 `EngineRead` 之上
- 不允许旧 editor query/layout 链继续存活

最优顺序建议如下。

### 14.1 第一步：先冻结目标 contract，再开始写代码

先一次性定死下面这些最终 contract：

- `DocumentEngineSnapshot`
- `DocumentChangeSet`
- `EditorSnapshot`
- `PublishedChangeSet`
- phase contract
- source sync contract

同时明确列出要删除的旧模型。

这一步的目标不是做兼容层，而是让整个重构从第一天起就只有一个终局。

### 14.2 第二步：重写 `whiteboard-engine`

直接把 `whiteboard-engine` 改造成 committed document engine：

- 保留 write / command / normalize / sanitize / facts / impact
- 删除 projection read/runtime
- 删除 mindmap layout/scene projection
- 删除 node geometry/scene read 对外接口

这一阶段结束时，engine 只提供 committed snapshot 和 commit change。

### 14.3 第三步：建设通用 projection runtime kit

详见 [WHITEBOARD_PROJECTION_RUNTIME_KIT_REWRITE.zh-CN.md](/Users/realrong/Rostack/WHITEBOARD_PROJECTION_RUNTIME_KIT_REWRITE.zh-CN.md)。

抽出可复用底层：

- phase orchestrator
- dirty planner
- stable reference publisher
- source sync primitives
- trace / perf contract
- deterministic test harness

这是后续 `whiteboard-editor-graph` 和 dataview 类系统的共同基础。

### 14.4 第四步：建设 `whiteboard-editor-graph`

详见 [WHITEBOARD_EDITOR_GRAPH_REWRITE.zh-CN.md](/Users/realrong/Rostack/WHITEBOARD_EDITOR_GRAPH_REWRITE.zh-CN.md)。

基于新的 engine snapshot 输入，实现完整 phase：

- input normalize
- graph assemble
- measure
- owner structure
- tree projection
- element projection
- selection projection
- chrome projection
- scene projection
- publish

这一阶段产出唯一 authoritative `EditorSnapshot`，但不持有 concrete store/source runtime。

### 14.5 第五步：重写 `whiteboard-editor`

把 `whiteboard-editor` 收口成宿主编排层：

- session / input / actions / history 接线
- 订阅 engine committed snapshot
- 驱动 `EditorGraphRuntime`
- 持有 concrete store/source runtime
- 负责把 `EditorSnapshot + EditorChange` apply 到宿主 source

同时删除旧的：

- `query/*`
- `layout/*`
- `editor/read.ts` 中建立在旧 projection 链上的模型
- 任何依赖旧 `EngineRead` projection 的路径

### 14.6 第六步：重写 `whiteboard-react` 与其他 adapter

统一改成只消费 `EditorSnapshot`：

- React hooks
- canvas scene
- overlay renderer
- devtools
- testing adapters

这一阶段不允许保留任何“为了兼容旧 API 暂时映射一下”的桥接层。

### 14.7 第七步：统一删除旧世界

在同一重构分支里，统一删除：

- 旧 `whiteboard-engine` projection read
- 旧 `whiteboard-editor` query/layout/store 派生链
- 旧 mindmap live preview 修补逻辑
- 旧 compatibility tests
- 旧 facade / shim / bridge

这里必须一次删干净。

如果旧模型还留下来，系统就会重新回到双 authoritative truth。

### 14.8 第八步：最后再重建测试与性能基线

最后才做：

- 新 runtime golden tests
- reference reuse tests
- changed set fanout tests
- scene consistency tests
- live edit relayout tests
- perf baseline

也就是说，测试体系要围绕新 contract 重建，而不是继续围绕旧 read API 兜底。

## 15. 实现时必须坚持的架构纪律

长期最优不仅是“结构对”，还要求长期不退化。

必须坚持下面这些纪律：

### 15.1 不允许中间态外泄

任何组件、hook、query、source 都不能直接读 working state。

### 15.2 不允许 phase 倒流

下游 phase 不能回头修改上游 phase 语义。

### 15.3 不允许 source 成为第二语义引擎

source 只能发布，不准重算业务。

### 15.4 不允许 adapter 自己补一致性

不允许 hook/store/render 层为了“看起来先能用”而再做一套兜底逻辑。

### 15.5 不允许把 dirty 判定分散到各层猜

dirty 由 runtime 明确维护，changed set 由 publish 明确声明。

### 15.6 不允许同时存在多份 authoritative geometry

对于 whiteboard：

- node 最终位置只有一份 authoritative geometry
- owner 最终布局只有一份 authoritative tree projection
- scene 最终列表只有一份 authoritative scene snapshot

任何“这边一份 rect，那边再拼一份 rect”的做法，长期都会回到脆弱状态。

### 15.7 不允许 `DocumentEngine` 重新认识 store/source

一旦 `whiteboard-engine` 再次暴露 store/source/public read projection：

- engine 与 runtime 的边界会重新塌掉
- editor projection bug 会重新污染 committed contract
- whiteboard 会重新回到双 authoritative truth

### 15.8 不允许把发布热点优化反向写进 runtime core contract

节点大表、scene fanout、spatial pick、renderer patch 这些热点优化都属于 adapter。

不允许为了优化这些路径：

- 修改 `DocumentEngine` contract
- 让 `EditorGraphRuntime` 暴露订阅模型
- 让 snapshot/change 反向携带 adapter 私有结构

### 15.9 不允许把 concrete store/source runtime 提前塞回 `whiteboard-editor-graph`

`whiteboard-editor-graph` 一旦重新持有 store/source runtime：

- 它就会重新退化成 query/store graph
- 第五步 `whiteboard-editor` 会重新失去宿主边界
- dataview 已经总结出来的 boundary 教训会在 whiteboard 再犯一次

长期最优必须固定成：

- `whiteboard-engine` 不持有 store
- `whiteboard-editor-graph` 不持有 store
- 只有 `whiteboard-editor` 持有 concrete store/source runtime

---

## 16. 最终推荐

长期最优方案可以压缩成下面几句话：

1. `whiteboard-engine` 和 editor 必须一起重构，不做单边修补。
2. `whiteboard-engine` 收敛为 committed document engine，删除现有 projection read 模型。
3. editor 建立新的 `EditorGraphRuntime`，采用 `working state + staged derivation + single publish snapshot` 模型。
4. 对外唯一真相是 `EditorSnapshot(revision)`。
5. source 只做 `previousSnapshot -> nextSnapshot` 的 sink-local sync。
6. phase 只允许单向依赖，不允许下游重定义上游语义。
7. dirty / changed set 是一等公民，不是附属优化。
8. 抽象复用的重点应是 runtime kit，而不是白板具体语义。
9. 所有旧模型、兼容层、双轨接口都应在统一重构中删除。

一句话的最终版本：

> whiteboard 的长期最优不是只在 editor 上修补 selector graph，而是把 engine 改成 committed truth，把 editor 改成 projection truth，并在一次统一重构中删掉旧模型，让整个系统收敛到唯一的一套“一致发布”契约。
