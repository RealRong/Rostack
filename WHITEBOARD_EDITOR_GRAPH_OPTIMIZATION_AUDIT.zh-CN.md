# Whiteboard Editor Graph 优化审计

## 1. 总结论

`whiteboard/packages/whiteboard-editor-graph` 当前已经是一个方向正确的 editor read projection package：它用 `@shared/projector` 承载 `graph / spatial / ui` 三个阶段，并且大量复用 `whiteboard-core` 的 geometry、node、edge、mindmap、selection 能力。

因此这里不需要再发明新的外层架构。真正的问题是：**editor-graph 内部仍然沉淀了一批本地基础设施和重复装配模式**。这些模式包括：

- phase scope 的 create/normalize/merge/has/readKeys 重复。
- graph queue / key fanout 重复。
- entity patch 的 add/update/remove 重复。
- publish struct/family 复用逻辑重复。
- document relation index 中有一部分规则应下沉到 `whiteboard-core`。
- `projector/spec.ts` 同时承担 empty input、empty snapshot、working state、projector spec，文件职责偏重。

建议目标不是“让 editor-graph 变薄到没有领域逻辑”，而是让它只保留 **编辑态投影逻辑**：draft、preview、interaction、measure、spatial/ui read model。纯文档关系、通用 projector helper、通用 delta/publish primitive 应分别下沉到 `whiteboard-core` 或 `shared/projector`。

这里采用激进原则：

- 不做兼容层。
- 不保留旧 API 与新 API 双轨。
- 只接受最终形态，允许重构过程中短期不可运行。
- 如果 shared/projector 已经能承载某个模式，就不要在 editor-graph 再留一份本地版本。

## 2. 当前结构判断

当前源码大致分为：

```text
whiteboard-editor-graph/src
  contracts/
    editor.ts
    working.ts
    delta.ts

  projector/
    spec.ts
    impact.ts
    publish.ts

  phases/
    graph.ts
    spatial.ts
    ui.ts

  domain/
    node.ts
    edge.ts
    mindmap.ts
    group.ts
    ui.ts
    index/
    spatial/
    items.ts

  runtime/
    createEditorGraphRuntime.ts
    query.ts
```

这说明当前包已经具备清晰的 projector/read-model 方向：

- `projector/spec.ts` 注册 projector spec。
- `phases/graph.ts` 负责 graph projection。
- `phases/spatial.ts` 负责 spatial index projection。
- `phases/ui.ts` 负责 UI projection。
- `domain/*` 负责 graph/ui/spatial 的投影计算。
- `runtime/query.ts` 提供 editor graph read API。

主要问题是边界还不够收敛：一些通用能力落在 `projector/impact.ts`、`projector/publish.ts`、`domain/index/update.ts` 中。

## 3. 已经做对的地方

### 3.1 已使用 shared projector

`whiteboard/packages/whiteboard-editor-graph/src/projector/spec.ts:239` 定义 `editorGraphProjectorSpec`，并注册：

```text
graphPhase
spatialPhase
uiPhase
```

这说明 editor graph 已经是 projector-based read model，不需要再引入新的 projector 外壳。

### 3.2 graph/spatial/ui 阶段划分合理

- `whiteboard/packages/whiteboard-editor-graph/src/phases/graph.ts:308` 定义 graph phase。
- `whiteboard/packages/whiteboard-editor-graph/src/phases/spatial.ts:26` 定义 spatial phase。
- `whiteboard/packages/whiteboard-editor-graph/src/phases/ui.ts:301` 定义 ui phase。

这三个阶段的方向合理：

```text
graph   -> 从 document/session/preview 生成 graph view
spatial -> 从 graph view 生成 spatial index
ui      -> 从 graph view + interaction/session 生成 UI view
```

### 3.3 已复用 whiteboard-core

多个 domain 文件已经调用 core：

- `domain/node.ts` 使用 `@whiteboard/core/node`。
- `domain/edge.ts` 使用 `@whiteboard/core/edge` 与 `@whiteboard/core/geometry`。
- `domain/mindmap.ts` 使用 `@whiteboard/core/mindmap` 与 `@whiteboard/core/geometry`。
- `runtime/query.ts` 使用 `@whiteboard/core/node/frame`、`snap`、`selection` 等能力。

因此问题不是没有复用 core，而是仍有一些纯文档关系和通用 projector helper 没有继续下沉。

## 4. 问题一：`projector/impact.ts` 职责过重

`whiteboard/packages/whiteboard-editor-graph/src/projector/impact.ts` 当前承担了多类职责：

- scope key clone。
- selected node/edge 收集。
- graph planner scope 创建。
- graph/spatial/ui patch scope create/normalize/merge/has/read keys。
- `planEditorGraphPhases`。

典型位置：

- `whiteboard/packages/whiteboard-editor-graph/src/projector/impact.ts:34` `cloneScopeKeys`。
- `whiteboard/packages/whiteboard-editor-graph/src/projector/impact.ts:124` `createGraphPlannerScope`。
- `whiteboard/packages/whiteboard-editor-graph/src/projector/impact.ts:185` `createGraphPatchScope`。
- `whiteboard/packages/whiteboard-editor-graph/src/projector/impact.ts:207` `mergeGraphPatchScope`。
- `whiteboard/packages/whiteboard-editor-graph/src/projector/impact.ts:242` `createSpatialPatchScope`。
- `whiteboard/packages/whiteboard-editor-graph/src/projector/impact.ts:370` `createUiPatchScopeState`。
- `whiteboard/packages/whiteboard-editor-graph/src/projector/impact.ts:419` `planEditorGraphPhases`。

这导致 `impact.ts` 既像 scope runtime，又像 planner，又像 UI impact analyzer。

### 激进结论

这里不应该再在 editor-graph 内部继续拆成 `graphScope.ts / uiScope.ts / keyScope.ts` 之类的本地基础设施。这样只是把重复代码从一个文件拆成四个文件，复杂度没有消失。

应该直接改 `shared/projector`，把 **phase scope schema** 变成 phase spec 的内建能力，删除 editor-graph 本地这几类函数：

- `create*PatchScope`
- `normalize*PatchScope`
- `merge*PatchScope`
- `has*PatchScope`
- `read*PatchScopeKeys`

### 最终形态

`shared/projector` 的 phase spec 应直接声明 scope 结构，框架内部负责：

- 默认值填充。
- flag 合并。
- keyed set 合并。
- empty 检测。
- `Iterable` 到 `ReadonlySet` 的归一化。

形态应类似：

```ts
const graphPhase = defineProjectorPhase({
  name: 'graph',
  deps: [],
  scope: projector.scope<{
    reset: boolean
    order: boolean
    nodes: NodeId
    edges: EdgeId
    mindmaps: MindmapId
    groups: GroupId
  }>({
    flags: ['reset', 'order'],
    keys: ['nodes', 'edges', 'mindmaps', 'groups']
  }),
  run(context) {
    const { reset, order, nodes, edges, mindmaps, groups } = context.scope
  }
})
```

这里即使保留 helper，也只允许保留 **一个** `projector.scope(...)`，挂在 spec 的 `scope` 字段里。不能再把 scope 语义拆成：

- `defineKeyScope`
- `defineBooleanScope`
- `mergeScope`
- `hasScope`
- `readScopeKeys`

这些都应该成为框架内部实现细节，而不是上层 phase 的心智负担。

### Scope 数据形态也应收敛

`editor-graph` 当前 phase scope 使用 `KeySet`，但 graph/ui scope 明确不允许 `all`，而是要求“全量重建时用 `reset`”。既然如此，就不应该继续保留 `KeySet` 这种三态抽象。

最终应直接收敛为：

```ts
interface GraphPatchScope {
  reset: boolean
  order: boolean
  nodes: ReadonlySet<NodeId>
  edges: ReadonlySet<EdgeId>
  mindmaps: ReadonlySet<MindmapId>
  groups: ReadonlySet<GroupId>
}

interface SpatialPatchScope {
  reset: boolean
  graph: boolean
}

interface UiPatchScope {
  reset: boolean
  chrome: boolean
  nodes: ReadonlySet<NodeId>
  edges: ReadonlySet<EdgeId>
}
```

这样 phase 内可以直接读 `scope.nodes`，不再经过 `readScopeKeys(scope.nodes)`。

### 对 shared/projector 的具体要求

`shared/projector` 需要做以下无兼容替换：

- `contracts/phase.ts`：删 `mergeScope?`，改为 `scope?` schema。
- `projector/update.ts`：按 schema 做 normalize / merge / isEmpty，而不是调用 phase 自己的 `mergeScope`。
- `contracts/projector.ts`：`Context.scope` 在 phase 定义了 scope schema 时，始终是归一化后的最终形态，不再要求 phase 自己 normalize。
- `dirty/plan.ts`：仍可保留 `createPlan`，但 runtime 应忽略 empty scope，不再要求上层先 `hasScope(...)` 再决定是否 emit。

这样改完以后，`impact.ts` 只剩真正的 planner 逻辑：从 input / previous / delta 推导“哪些 phase 受影响，以及 scope 原始输入是什么”。scope 的结构性处理彻底退出 editor-graph。

## 5. 问题二：Graph queue 与 key fanout 是本地基础设施

`phases/graph.ts` 中有一套本地 queue/fanout 设施：

- `whiteboard/packages/whiteboard-editor-graph/src/phases/graph.ts:48` `GraphPatchQueue`。
- `whiteboard/packages/whiteboard-editor-graph/src/phases/graph.ts:55` `createGraphPatchQueue`。
- `whiteboard/packages/whiteboard-editor-graph/src/phases/graph.ts:62` `enqueueAll`。
- `whiteboard/packages/whiteboard-editor-graph/src/phases/graph.ts:71` `drainQueue`。
- `whiteboard/packages/whiteboard-editor-graph/src/phases/graph.ts:79` `seedGraphPatchQueue`。
- `whiteboard/packages/whiteboard-editor-graph/src/phases/graph.ts:132` `preFanoutSeeds`。

这些不是 whiteboard domain rule，而是 projector 增量执行中的 key queue / fanout pattern。

当前它和 `impact.ts` 中的 keySet append/merge/read 形成重复心智模型：

```text
impact.ts    KeySet scope
phases/graph Queue<Set>
```

### 建议

这里应按激进原则处理：

- 如果 queue/fanout 只是 graph phase 的局部执行细节，就把它留在 `phases/graph.ts` 内部，不要再抽一个 editor-graph 本地基础设施模块。
- 如果它已经是 projector 脏 key 传播的通用模式，就直接下沉到 `shared/projector/dirty`。

不建议在 `whiteboard-editor-graph/projector/keyQueue.ts` 再停留一层中间形态。

## 6. 问题三：entity patch add/update/remove 重复

多个地方都在写相同模式：

```text
previous undefined + next exists     -> add
previous exists + next undefined     -> remove
previous exists + next changed       -> update
previous === next                    -> no-op
```

典型例子：

- `whiteboard/packages/whiteboard-editor-graph/src/phases/ui.ts:45` `writeUiChange`。
- `whiteboard/packages/whiteboard-editor-graph/src/domain/group.ts:145` `patchGroup`。
- `whiteboard/packages/whiteboard-editor-graph/src/domain/mindmap.ts:400` `patchMindmap`。
- `domain/node.ts` 与 `domain/edge.ts` 也有类似 patch entity 模式。

这些重复不是业务复杂度，而是缺少通用 delta writer。

### 建议下沉到 shared/projector

建议在 `shared/projector/delta` 提供：

```ts
writeEntityChange({
  id,
  previous,
  next,
  delta,
  equal?
}) => {
  changed,
  kind: 'add' | 'update' | 'remove' | 'reuse'
}
```

或者更底层：

```ts
idDelta.writeChange(delta, id, previous, next)
```

这样 whiteboard 的 node/edge/group/mindmap/ui patch 与 dataview 的 publish/delta 都可以复用同一种模式。

## 7. 问题四：publish struct 复用仍然手写

`whiteboard/packages/whiteboard-editor-graph/src/projector/publish.ts` 已经使用了 `publishEntityFamily`，这是正确方向。

但它仍然手写了 graph/ui/items 的 struct reuse：

- `whiteboard/packages/whiteboard-editor-graph/src/projector/publish.ts:29` `patchPublishedValue`。
- `whiteboard/packages/whiteboard-editor-graph/src/projector/publish.ts:115` `patchPublishedGraph`。
- `whiteboard/packages/whiteboard-editor-graph/src/projector/publish.ts:183` `patchPublishedUi`。
- `whiteboard/packages/whiteboard-editor-graph/src/projector/publish.ts:231` `patchPublishedItems`。

这和 dataview active 审计里 `publish/runtime.ts` 的问题类似：struct snapshot reuse 是 projector publish 基础设施，不应该每个项目都手写。

### 建议下沉到 shared/projector/publish

建议提供：

```ts
publishStruct({
  previous,
  fields: {
    nodes,
    edges,
    owners
  }
})
```

或：

```ts
reuseStruct(previous, next, keys)
```

whiteboard 的 graph/ui snapshot、dataview 的 ViewState snapshot 都可以统一用它。

## 8. 问题五：`projector/spec.ts` 初始化职责过重

`whiteboard/packages/whiteboard-editor-graph/src/projector/spec.ts` 同时包含：

- `createEmptyDocumentSnapshot`。
- `createEmptyInputDelta`。
- `createEmptyInput`。
- `createEmptySnapshot`。
- `createWorking`。
- `editorGraphProjectorSpec`。

典型位置：

- `whiteboard/packages/whiteboard-editor-graph/src/projector/spec.ts:36` `createEmptyDocumentSnapshot`。
- `whiteboard/packages/whiteboard-editor-graph/src/projector/spec.ts:42` `createEmptyInputDelta`。
- `whiteboard/packages/whiteboard-editor-graph/src/projector/spec.ts:76` `createEmptyInput`。
- `whiteboard/packages/whiteboard-editor-graph/src/projector/spec.ts:115` `createEmptySnapshot`。
- `whiteboard/packages/whiteboard-editor-graph/src/projector/spec.ts:146` `createWorking`。
- `whiteboard/packages/whiteboard-editor-graph/src/projector/spec.ts:239` `editorGraphProjectorSpec`。

这使 spec 文件承担过多初始化细节。建议拆成：

```text
projector/createEmptyInput.ts
projector/createEmptySnapshot.ts
projector/createWorking.ts
projector/spec.ts
```

拆分后 `spec.ts` 应只剩：

```ts
export const editorGraphProjectorSpec = {
  createWorking,
  createSnapshot,
  plan,
  publish,
  phases
}
```

这也符合用户偏好的 “像 MutationEngine 一样，只 new / define 一个 spec”。

## 9. 可下沉到 whiteboard-core 的能力

### 9.1 Node owner 读取

`whiteboard/packages/whiteboard-editor-graph/src/domain/index/update.ts:60` 的 `readNodeOwner` 读取 node 的 mindmap/group owner。

这是 document model 关系，不是 editor graph 特有逻辑。建议下沉到：

```text
whiteboard-core/src/document/read.ts
```

或：

```text
whiteboard-core/src/node/relations.ts
```

例如：

```ts
document.read.nodeOwner(document, nodeId)
node.relations.owner(node)
```

### 9.2 Edge endpoints / edge-node relation

`whiteboard/packages/whiteboard-editor-graph/src/domain/index/update.ts:84` 的 `readEdgeNodes` 与 `whiteboard-core/src/edge/relations.ts` 的 `createEdgeRelations`、`collectRelatedEdgeIds` 能力重叠。

建议扩展 core：

```ts
edge.relations.readEndpointNodeIds(edge)
edge.relations.create(document.edges)
```

editor-graph index 不应自己理解 edge source/target 结构。

### 9.3 Group items 与 group signature

`whiteboard/packages/whiteboard-editor-graph/src/domain/index/update.ts:142` 的 `rebuildGroupItems` 与 `whiteboard-core/src/document/read.ts` 的 `listGroupCanvasItemRefs` 重叠。

`whiteboard/packages/whiteboard-editor-graph/src/domain/group.ts:55` 的 `readGroupSignatureFromTarget`、`whiteboard/packages/whiteboard-editor-graph/src/domain/group.ts:62` 的 `readGroupSignatureFromItems` 是 group 领域规则。

建议下沉到：

```text
whiteboard-core/src/group/index.ts
whiteboard-core/src/group/relations.ts
```

提供：

```ts
group.read.items(document, groupId)
group.read.target(items)
group.signature.fromTarget(target)
group.signature.fromItems(items)
```

这样 editor-graph 的 index 只维护缓存，不定义 group relation 语义。

### 9.4 Mindmap 纯结构/布局规则

`domain/mindmap.ts` 中一部分是 editor preview 叠加，不能下沉；但纯结构读取、nodeIds、layout patch、connector resolve 可以继续靠近 `whiteboard-core/mindmap`。

判断标准：

- 不依赖 `Input.session`、`Input.clock`、draft/preview 的，优先下沉 core。
- 依赖 editor preview、动画、hover、clock 的，保留 editor-graph。

## 10. 不建议下沉的能力

### 10.1 UI view 构建不应进 core

`whiteboard/packages/whiteboard-editor-graph/src/domain/ui.ts` 处理 chrome、hover、selection、edit、preview draw、guides 等 editor runtime 状态。

这些是 editor read model，不是 document model。应保留在 editor-graph。

### 10.2 Spatial index 暂不下沉 shared

`domain/spatial/*` 当前是 whiteboard editor 的空间索引和查询。虽然空间索引看起来通用，但它绑定 SceneItem、node/edge/mindmap/group view。

建议暂时保留在 editor-graph。只有当 dataview/whiteboard 或其他项目也需要同类空间索引时，再考虑抽象为 shared。

### 10.3 Runtime query 保留在 editor-graph

`whiteboard/packages/whiteboard-editor-graph/src/runtime/query.ts:134` 的 `createEditorGraphQuery` 是 editor graph 的 read facade。

它组合 snapshot、spatial、frame、snap、groupExact、relatedEdges 等能力，是 editor runtime API，不应下沉 core。但其中用到的 frame/group/edge relation primitive 应来自 core。

## 11. 推荐目标结构

建议目标结构：

```text
whiteboard-editor-graph/src
  contracts/
    editor.ts
    working.ts
    delta.ts

  projector/
    spec.ts
    createEmptyInput.ts
    createEmptySnapshot.ts
    createWorking.ts
    planner.ts
    publish.ts

  phases/
    graph.ts
    spatial.ts
    ui.ts

  domain/
    graph/
      node.ts
      edge.ts
      mindmap.ts
      group.ts
    index/
      read.ts
      update.ts
    spatial/
    ui.ts
    items.ts

  runtime/
    createEditorGraphRuntime.ts
    query.ts
```

同时 whiteboard-core 增加：

```text
whiteboard-core/src/document/read.ts
  nodeOwner
  edgeNodeIds
  groupItems

whiteboard-core/src/group/relations.ts
  targetFromItems
  signatureFromTarget
  signatureFromItems

whiteboard-core/src/edge/relations.ts
  readEndpointNodeIds
```

shared/projector 增加：

```text
shared/projector/delta
  writeEntityChange
  fromTouchedSet

shared/projector/publish
  publishStruct
  projectListChange

shared/projector/scope
  phase scope schema（flags + keyed sets，框架内建 merge/normalize/isEmpty）
```

## 12. 分阶段迁移方案

### 阶段一：先改 `shared/projector` 的 scope 语义

目标：删除 editor-graph 本地 scope 基础设施，而不是继续拆文件。

- 给 `phase spec` 增加 `scope` schema。
- 删除 `mergeScope?` 合同，改成框架内建 merge。
- framework 内建 flag OR、key set union、empty 检测、scope normalize。
- `Context.scope` 统一变成归一化结果。

验收标准：

- `shared/projector` 不再要求上层提供 `mergeScope`。
- planner / phase / emit 不再依赖 `hasScope`、`normalizeScope`、`readScopeKeys`。
- empty scoped emit 不会触发 phase 调度。

### 阶段二：editor-graph 切到新的 scope 框架

目标：一口气删除 editor-graph 本地 scope helper 和 `KeySet` phase scope。

- `GraphPatchScope` / `UiPatchScope` 切成 `ReadonlySet`。
- 删除 `projector/impact.ts` 中全部 `create/normalize/merge/has/read` scope helper。
- `graph.ts` / `ui.ts` 直接消费 `context.scope.nodes`、`context.scope.edges`。
- `planEditorGraphPhases` 与 phase emit 只构造原始 scope 数据，不再做 scope runtime 工作。

验收标准：

- `impact.ts` 只保留 planner 与 UI impact 收集。
- `phases/graph.ts` / `phases/ui.ts` 不再 import scope helper。
- `contracts/delta.ts` 不再依赖 `KeySet`。

### 阶段三：下沉 document relation 到 whiteboard-core

目标：editor-graph index 不再定义 core 文档关系。

- 下沉 `readNodeOwner`。
- 下沉 `readEdgeNodes` / endpoint node ids。
- 用 core 的 group item 读取替换本地 `rebuildGroupItems`。
- 下沉 group signature/target helpers。

验收标准：

- `domain/index/update.ts` 不再直接解释 node owner、edge endpoint、group signature。
- `domain/group.ts` 只负责构建 `GroupView` 与 patch，不负责 group signature 领域规则。

### 阶段四：补齐 shared/projector primitive

目标：减少 whiteboard/dataview 重复 projector 基础设施。

- 增加 `writeEntityChange`。
- 增加 `publishStruct`。
- 增加 `fromTouchedSet`。
- 替换 editor-graph 中本地 add/update/remove 与 struct reuse。

验收标准：

- `phases/ui.ts` 不再维护本地 `writeUiChange`。
- `projector/publish.ts` 不再手写 graph/ui struct reuse。
- node/edge/group/mindmap patch 的 idDelta 写入逻辑更统一。

### 阶段五：整理 editor-graph 文件边界

目标：在 scope/runtime 已收敛后，再处理 spec 与 planner 文件职责。

- 拆 `projector/spec.ts` 为 spec/input/snapshot/working。
- 让 `impact.ts` 只保留 planner。
- 对 queue/fanout 做二选一：要么内联回 `graph.ts`，要么下沉 `shared/projector/dirty`。

验收标准：

- `projector/spec.ts` 只负责 wiring。
- `impact.ts` 不再承担 scope runtime。
- editor-graph 不再保留“介于业务与 shared 之间”的半抽象层。

## 13. 不建议做的事

### 13.1 不建议把 editor preview 逻辑放进 whiteboard-core

draft、preview、interaction、hover、marquee、guides、edit、draw 都是 editor runtime 状态，不属于 core document model。

### 13.2 不建议为了文件短而拆散 domain 算法

`domain/mindmap.ts`、`domain/edge.ts`、`domain/node.ts` 文件较大，但其中有不少是高度内聚的 projection 算法。应按“纯 core 规则 / editor projection / shared primitive”拆，而不是按行数机械拆。

### 13.3 不建议在 editor-graph 再保留一层本地 scope 抽象

如果 scope 模式已经稳定为“flags + keyed sets + reset”，就应该直接进入 `shared/projector`。继续留在 editor-graph，只会让 whiteboard 自己维护一套 projector runtime 影子实现。

## 14. 最终目标

最终分层应是：

```text
shared/projector
  projector phase runtime + delta/publish/scope primitives

whiteboard-core
  document model + geometry + node/edge/group/mindmap/selection domain rules

whiteboard-editor-graph
  editor read projection engine：graph/spatial/ui + draft/preview/interaction composition

whiteboard-editor
  consume editor graph runtime + send intents
```

用一句话概括：

> editor-graph 应该是“编辑态 read model projector”，不是 whiteboard-core 的补充规则库，也不是 shared/projector 基础设施的临时落点。

## 15. 优先级排序

建议执行顺序：

1. 改 `shared/projector` 的 scope schema，删 `mergeScope` 合同：收益最大。
2. editor-graph 全量切到新 scope，删除本地 scope helper 与 `KeySet` phase scope：收益最大。
3. 下沉 `domain/index/update.ts` 的 document relation helpers 到 core：收益高。
4. 增加 `shared/projector` 的 `writeEntityChange` / `publishStruct`：收益高，可同时服务 dataview。
5. 最后再整理 `projector/spec.ts`、queue/fanout、mindmap 纯规则下沉：收益中高。
