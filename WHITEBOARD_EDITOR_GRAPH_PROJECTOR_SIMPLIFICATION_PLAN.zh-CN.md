# Whiteboard Editor Graph Projector 降复杂度方案

## 1. 目标与原则

`whiteboard/packages/whiteboard-editor-graph` 已经接入 `@shared/projector`，方向没有问题。下一步要做的不是继续抽 Whiteboard 的领域 projection 算法，而是把 projector 装配层收敛到长期最优形态。

本方案采用以下原则：

1. 不做兼容层，不保留双轨，不引入“先本地过渡、以后再收敛”的中间形态。
2. 重构过程中允许阶段性跑不通，目标只看最终结构是否干净。
3. 能直接成为最终 shared 能力的东西，直接进 `shared/projector`。
4. 仍然带有 Whiteboard 领域语义的东西，继续留在 `whiteboard-editor-graph`。
5. 不为了“抽象统一”而引入更大的 runtime 契约；清晰边界优先于抽象数量。

---

## 2. 结论

这件事能做，而且值得做。

真正应该收敛的点有四类：

1. `spec / phase` 的泛型样板。
2. `planner` 与 `ui phase` 重复推导 dirty scope。
3. `publisher` 与 phase 共同维护 mutable publish delta 的生命周期混乱。
4. editor 层把 projector result 同步到 store sources 的通用 patch 逻辑重复。

但这份收敛不应该扩展成“大规模重写 shared/projector runtime”。长期最优边界应当是：

```txt
shared/projector
  负责：
  - projector orchestration
  - phase/spec 定义 helper
  - 通用 publish primitive
  - 通用 source sync primitive

whiteboard-editor-graph
  负责：
  - graph / spatial / ui / items 的领域 projection
  - graphPatch / spatial / query / ui view 语义
  - Whiteboard 专属 dirty scope 规则
```

---

## 3. 不进入 shared 的部分

这些内容继续留在 Whiteboard：

- `runtime/projection.ts` 中的节点/边 projection。
- `runtime/graphPatch/*` 中的 graph patch 与 fanout 逻辑。
- `runtime/spatial/*` 中的空间索引与查询。
- `runtime/ui.ts` 中的 node/edge/chrome UI view 构造。
- mindmap、edge route、node geometry、selection、hover、draft、preview、draw 的具体语义。
- `createEditorGraphQuery(...)` 这类对外 query adapter。

原因很简单：这些都是 Whiteboard 编辑器领域逻辑，不是 projector 通用设施。

---

## 4. 当前真正的问题

当前不是“没有 projector”，而是仍有较多 projector 装配胶水散落在领域包里：

1. `createSpec.ts` 与 `phases/shared.ts` 有重复的泛型样板。
2. `planner.ts` 负责 graph dirty，`phases/ui.ts` 又再次从 input 全量推导 UI dirty。
3. `publisher.ts` 同时做 reset、sync、publish，`ui phase` 还会自己 reset `publish delta`。
4. `whiteboard-editor/src/projection/sources.ts` 手写了一套通用的 family patch 流程。

需要明确的是，性能收益最大的点不是“再多抽一点 helper”，而是：

- 让 `UiPatchScope` 成为唯一 UI dirty 入口。
- 让 `ui phase` 停止全量重建 `nodes / edges` UI map。
- 让 `publisher` 变成纯 publish，不再管理 phase 输出生命周期。

---

## 5. Spec 与 Phase 样板的最终形态

### 5.1 问题

当前：

- `runtime/createSpec.ts` 基本只是拼 `createWorking / createSnapshot / plan / publish / phases`。
- `phases/shared.ts` 里存在一组 Whiteboard 专用的 `ProjectorContext / ProjectorPhase` 泛型别名。

这类样板在 Dataview active projector 中也出现了，因此这不是 Whiteboard 独有问题。

### 5.2 最终方案

直接在 `shared/projector` 增加两个零运行时成本的定义 helper：

```ts
export const defineProjectorSpec = <T,>(value: T): T => value
export const definePhase = <T,>(value: T): T => value
```

Whiteboard 与 Dataview 一起切到这套写法：

```ts
export const editorGraphProjectorSpec = defineProjectorSpec({
  createWorking,
  createSnapshot,
  plan,
  publish,
  phases: [
    graphPhase,
    spatialPhase,
    uiPhase,
    itemsPhase
  ]
})
```

```ts
export const graphPhase = definePhase({
  name: 'graph',
  deps: [],
  mergeScope,
  run: (context) => { ... }
})
```

同时：

- `createEditorGraphProjectorSpec()` 改为稳定常量导出，不再保留无意义 factory。
- `phases/shared.ts` 收敛为少量公共类型，不再为每个 phase 手写一组别名。
- `toMetric` 和 phase metric 类型统一为单一命名。

### 5.3 边界

这里直接进 `shared/projector` 是合理的，因为它已经有至少两个真实消费者：Whiteboard 和 Dataview。  
这里不需要先做 Whiteboard 本地 helper，再考虑上收。

---

## 6. `UiPatchScope` 与 UI 增量 patch 的最终形态

### 6.1 问题

当前 `planner.ts` 已经在做 graph 相关 dirty 推导，但 `phases/ui.ts` 仍然：

- 从 `graphDelta` 再次推导 node/edge touched。
- 从 selection / hover / draft / preview / edit / draw / mindmap tick 再推一遍 touched。
- 每次运行都全量重建 `working.ui.nodes` 与 `working.ui.edges`。

这导致两个问题同时存在：

1. dirty 规则分散，难审计。
2. 即使只有少量 UI 变化，也会做全量 map rebuild。

### 6.2 最终方案

在 `contracts/delta.ts` 中引入最终版 `UiPatchScope`：

```ts
export interface UiPatchScope {
  reset: boolean
  chrome: boolean
  nodes: KeySet<NodeId>
  edges: KeySet<EdgeId>
}
```

并将 `EditorPhaseScopeMap` 明确为：

```ts
export interface EditorPhaseScopeMap {
  graph: GraphPatchScope
  spatial: SpatialPatchScope
  ui: UiPatchScope
  items: undefined
}
```

新增统一的 UI scope builder：

```ts
export const createUiPatchScope = (input: {
  input: Input
  previous: Snapshot
  graphDelta?: GraphDelta
  mindmapNodeIndex: ReadonlyMap<MindmapId, readonly NodeId[]>
}): UiPatchScope
```

规则收敛为：

- `planner` 负责为纯 UI 变化创建 `ui` scope。
- `graph phase` 在 graph 变化后 `emit.ui`。
- `ui phase` 只消费 `context.scope`，不再自己从 input 全量推导 dirty。

流向固定为：

```txt
Input delta
  -> planner creates GraphPatchScope / UiPatchScope
  -> graph phase emits UiPatchScope when graph changes
  -> ui phase patches only scope.reset / scope.chrome / scope.nodes / scope.edges
```

### 6.3 UI phase 的最终职责

`ui phase` 必须改成增量 patch，而不是全量重建。

最终形态：

```ts
if (scope.reset) {
  rebuildAllUi()
} else {
  patchChrome(scope)
  patchTouchedNodes(scope.nodes)
  patchTouchedEdges(scope.edges)
}
```

即：

- bootstrap 或 reset 时重建全部 UI。
- 普通更新只重建受影响的 node / edge / chrome。
- 删除旧的 UI dirty 推导逻辑，不保留双份规则。

### 6.4 结果

这一步完成后，`UiPatchScope` 会成为 Whiteboard UI 更新的唯一入口。  
这是这份方案里最重要、也最值得优先落地的一步。

---

## 7. Publish 生命周期的最终形态

### 7.1 问题

当前 `working.delta.publish` 同时被 phase 和 publisher 修改：

- publisher reset graph publish delta
- publisher sync graph delta -> publish delta
- publisher 计算 items changed
- ui phase reset ui publish delta
- ui phase 写 ui publish delta
- publisher 最后再 reset 全部 publish delta

这导致：

1. 生命周期分散。
2. ownership 不清楚。
3. publisher 不是纯 publish，而是半个调度器。

### 7.2 最终方案

最终形态不再保留 `working.delta.publish`。

`working` 收敛为：

```ts
working = {
  delta: {
    graph,
    spatial
  },
  publish: {
    graph: GraphPublishDelta
    ui: UiPublishDelta
    items: boolean
  }
}
```

其中：

- `working.delta` 只放运行期 patch delta。
- `working.publish` 只放 publish 阶段要消费的最终 phase 输出。

ownership 固定为：

- `graph phase` 覆盖写入 `working.publish.graph`
- `ui phase` 覆盖写入 `working.publish.ui`
- `items phase` 覆盖写入 `working.publish.items`
- `publisher` 只读取，不 reset，不 sync，不推导

### 7.3 Publisher 的最终职责

`publisher` 只做三件事：

1. 根据 `working.publish.graph` patch graph snapshot。
2. 根据 `working.publish.ui` patch ui snapshot。
3. 根据 `working.publish.items` 决定是否复用 items 引用。

换句话说，`publisher.ts` 要变成纯函数式的 snapshot patcher。  
它不再承担 phase 输出的生成、同步或生命周期管理。

### 7.4 明确不做的事

这次重构**不**扩展 `shared/projector` 去做“phase change 聚合后再传给 publisher”。

原因：

- 当前 `shared/projector` runtime 并没有这个发布契约。
- 这会扩大 shared runtime 的抽象边界。
- 对 Whiteboard 当前问题来说，phase-owned publish state 已经足够干净。

所以长期最优不是“为了去掉 working 通信而重写 shared runtime”，而是“让 working 中的 publish ownership 明确且单向”。

---

## 8. Publish helper 的边界

当前 `publish/graph.ts`、`publish/ui.ts` 已经建立在 `publishEntityFamily(...)` 之上。  
这里确实还有少量重复，但它不是主复杂度来源。

长期最优做法是：

- 保留 `publishEntityFamily` 作为核心 primitive。
- 仅在 graph / ui publish 中出现明确的重复结构时，补一个小型通用 helper。
- 不引入“大而全的 declarative publisher DSL”。

也就是说，这里追求的是**薄收敛**，不是再造一层抽象语言。

---

## 9. Source Sync 的最终形态

### 9.1 问题

`whiteboard/packages/whiteboard-editor/src/projection/sources.ts` 当前手写了：

- `createFamilyRead`
- `toSetEntries`
- `toRemoveIds`
- `applyFamilyChange`
- 六组 family sync 调用

这不是 Whiteboard 领域逻辑，而是通用的 projector source patch 逻辑。

### 9.2 现状判断

`shared/projector` 其实已经有 source sync primitive：

- `createValueSync`
- `createFamilySync`
- `createEntityDeltaSync`
- `composeSync`

所以这里不是“以后再设计一套 source sync”，而是**直接把 Whiteboard 接到 shared 的 source sync 体系上**。

### 9.3 最终方案

由于 Whiteboard 当前 change 形态是 `IdDelta`，最终方案是在 `shared/projector` 补一个直接面向 `IdDelta` 的 family sync helper，例如：

```ts
createIdDeltaFamilySync({
  delta: change => change.graph.nodes,
  list: snapshot => snapshot.graph.nodes.ids,
  read: (snapshot, key) => snapshot.graph.nodes.byId.get(key),
  apply: (patch, sink) => sink.nodeGraph.write.apply(patch)
})
```

然后在 editor 层用 `composeSync(...)` 组合：

- `snapshot` value sync
- `items` value sync
- `chrome` value sync
- `nodeGraph / edgeGraph / mindmap / group / nodeUi / edgeUi` family sync

最终要求是：

- `projection/sources.ts` 不再保留 Whiteboard 自己的 `IdDelta -> Store patch` 实现。
- 所有通用 source patch 逻辑统一进入 `shared/projector`。
- Whiteboard 只保留 source wiring，不保留 patch 算法。

### 9.4 结果

这样做以后：

- `IdDelta` 的语义在 publish 与 source sync 两侧统一。
- Dataview 可以继续使用 `EntityDelta` 路径，Whiteboard 使用 `IdDelta` 路径。
- 两者共享同一套 source sync 架构，而不是各自手写。

---

## 10. 明确不做的部分

以下内容不属于这次方案目标：

1. 不抽象 `createEditorGraphRuntime.ts` 这种很薄的 runtime wrapper。
2. 不把 Whiteboard 的 graph / spatial / ui 领域算法搬进 `shared/projector`。
3. 不为了 publisher 改造去重写 `shared/projector` 的 phase change 聚合契约。
4. 不引入为过渡而存在的本地 helper，再假设“以后再上收”。

如果某个抽象不能直接成为最终形态，就不进入这份方案。

---

## 11. 实施顺序

### 阶段 1：`UiPatchScope` 与 UI 增量 patch

1. 引入 `UiPatchScope`。
2. 提取 `createUiPatchScope(...)`。
3. planner 为纯 UI 更新生成 `ui` scope。
4. graph phase emit `ui` scope。
5. ui phase 改为 reset-or-patch 模式，删除旧的全量 dirty 推导与全量 rebuild。

验收：

- selection / hover / draft / preview / edit / draw / mindmap tick 行为不回退。
- 普通 UI 更新不再全量遍历所有 node / edge。

### 阶段 2：publish ownership 收敛

1. 删除 `working.delta.publish`。
2. 引入 `working.publish`。
3. graph / ui / items phase 各自覆盖写自己的 publish 输出。
4. publisher 改成纯 patcher。

验收：

- `publisher.ts` 中不再有 reset / sync / 推导 publish delta 的逻辑。
- snapshot 引用复用策略保持正确。

### 阶段 3：source sync 收敛到 shared

1. 在 `shared/projector` 增加 `IdDelta` family sync helper。
2. `whiteboard-editor/src/projection/sources.ts` 改为基于 shared sync primitive 组合。
3. 删除 Whiteboard 自己的 family patch 实现。

验收：

- React keyed subscription 粒度不变。
- `nodeGraph / edgeGraph / nodeUi / edgeUi / mindmap / group` 的 source 行为保持一致。

### 阶段 4：spec / phase 样板清理

1. `shared/projector` 提供 `defineProjectorSpec` / `definePhase`。
2. Whiteboard 和 Dataview 一起切到统一写法。
3. `createEditorGraphProjectorSpec()` 改为稳定常量。

验收：

- `phases/shared.ts` 显著变薄。
- 不再存在无意义 factory 与重复泛型别名。

---

## 12. 最终目标结构

目标结构收敛为：

```txt
whiteboard-editor-graph/src/
  contracts/
    editor.ts
    delta.ts
    working.ts

  projector/
    spec.ts
    planner.ts
    publisher.ts
    scopes/
      graphScope.ts
      uiScope.ts
      spatialScope.ts

  phases/
    graph.ts
    spatial.ts
    ui.ts
    items.ts

  domain/
    projection.ts
    ui.ts
    items.ts
    graphPatch/*
    spatial/*

  runtime/
    createEditorGraphRuntime.ts
    query.ts
```

其中：

- `projector/*` 只负责装配。
- `phases/*` 是阶段入口。
- `domain/*` 是 Whiteboard 领域 projection 算法。
- `runtime/*` 只保留对外 runtime 与 query。

---

## 13. 验收标准

### 13.1 复杂度验收

- `phases/shared.ts` 不再充满重复泛型 alias。
- `ui phase` 不再同时承担 dirty 推导与全量 rebuild。
- `publisher.ts` 不再负责 reset / sync publish delta。
- `projection/sources.ts` 不再手写通用 family patch。

### 13.2 行为验收

- 文档节点/边/group/mindmap 变化后 graph / spatial / ui / items 正确更新。
- selection / hover / edit / draft / preview / draw 变化后 UI 正确更新。
- mindmap root / subtree / enter preview 与 tick 仍正确触发相关节点 UI。
- spatial query 与 graph query 读取最新 working state。
- source store 的 keyed subscription 粒度不变。

### 13.3 边界验收

- `shared/projector` 只承接 generic projector helper 与 generic source sync helper。
- Whiteboard 领域 projection 逻辑不进入 shared。
- 不保留兼容层、过渡 helper、双轨实现。

---

## 14. 最终判断

这份方案可以做，而且应该做。

优先级最高的不是 runtime wrapper，也不是再造一层 shared runtime 契约，而是两件事：

1. 用 `UiPatchScope` 统一 UI dirty，并把 UI phase 改成真正的增量 patch。
2. 把 publish ownership 从 `publisher + phase` 混合维护，收敛成 phase 单向写入、publisher 只读。

做完这两件事后，再把 editor source sync 彻底并入 `shared/projector` 的通用设施，整个 projector 装配层就会明显收敛，而且边界保持干净。
