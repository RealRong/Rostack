# Whiteboard 核心包 Shared 利用度审查与精简实施方案

## 约束

- 不保留兼容层。
- 不保留两套 mutation / projection / execution 语义。
- 不为了抽象而抽象，优先删除重复解释链。
- 能下沉到 shared 的能力尽量下沉；不能下沉的只保留领域算法。
- 精准增量通知能力不能退化。

## 范围

- `whiteboard/packages/whiteboard-core`
- `whiteboard/packages/whiteboard-engine`
- `whiteboard/packages/whiteboard-editor/src/editor`
- `whiteboard/packages/whiteboard-editor-scene`

---

## 1. 总体结论

这四个核心包里，真正还存在“在 shared 基础上重新包一层第二套实现”的问题，主要集中在两处：

- `whiteboard-core/src/operations/custom.ts`
- `whiteboard-editor-scene` 的 `MutationDelta / source delta -> execution -> graph facts / queue / store change` 这一整条链

相对而言：

- `whiteboard-engine` 已经比较薄，基本是正确的 shared adapter。
- `whiteboard-editor` 主要是 UI / selection 规则厚，不是 shared 重复实现。
- `whiteboard-editor-scene/src/runtime/read.ts` 很长，但更像 query surface 组织问题，不是 shared duplication 核心问题。

因此，后续优化优先级应当是：

1. 先砍 `whiteboard-core` 的 custom mutation 二次实现层。
2. 再压平 `whiteboard-editor-scene` 的 delta / execution / publish glue。
3. 最后再做 editor / read 层的代码组织精简。

---

## 2. 必须优化的问题

## 2.1 `whiteboard-core/src/operations/custom.ts` 过厚，且承担了第二套 mutation 语义编排

当前问题：

- 一个文件同时承担：
  - custom op reduce
  - document 写入
  - inverse history 构造
  - `MutationDeltaInput` 编译
  - `MutationFootprint` 编译
  - ordered collection 操作
  - edge label / edge route point / mindmap custom 语义
- `buildCustomDelta(...)` 手工对 `before/after` 做语义比较，再拼 `node.geometry`、`edge.route`、`mindmap.layout` 等 change channel。
- 各 reducer 经常手工拼 `footprint`，重复把领域 patch 翻译成 mutation footprint。
- custom reducer 虽然挂在 shared mutation engine 上，但在 whiteboard-core 内部又重建了一层 mutation output builder。

这说明的问题：

- 这里不只是“领域算法长”，也不只是 whiteboard-core 自己写厚了。
- 一个根本原因是 `shared/mutation` 当前 custom contract 太高层，custom op 只能直接返回：
  - `document`
  - `delta`
  - `footprint`
  - `history.inverse/forward`
- 这导致 shared 无法像 canonical entity op 一样，基于结构化写入自动编译：
  - footprint
  - 大部分 inverse
  - semantic delta
- 因此 whiteboard-core 只能在 custom reducer 里手工补一整套 mutation output builder。

### 2.1.1 哪些厚度是 shared contract 逼出来的

- 手工拼 `MutationDeltaInput`
- 手工拼 `MutationFootprint[]`
- 手工为 custom op 提供 `history.inverse`
- 先算 `before/after`，再做一次 semantic diff

这些并不是 whiteboard 领域本身必须这么写，而是 shared custom API 没把“结构化写入意图”作为一等输出。

### 2.1.2 哪些厚度不是 shared 问题

- mindmap relayout
- canvas order move
- edge route point / edge label 的领域校验
- 某些 op 的 replayable `forward` 规范化

这些属于 whiteboard 真正的领域 reducer 逻辑，即使 shared 升级后也仍然存在。

因此最终判断是：

- `custom.ts` 现在的厚度，确实有相当一部分是 shared 侧 custom contract 不够低层导致的。
- 但不能把全部问题都归因给 shared；whiteboard 仍然需要保留自己的领域 reducer。

最终优化目标：

- `custom.ts` 不再是 monolith。
- custom reducer 只负责领域变换，不再手工散落地编译 delta / footprint / history。
- delta / footprint / history 的组装入口统一。
- shared 能自动承担尽量多的通用 mutation output 编译。

最终结构：

```ts
whiteboard-core/src/operations/custom/
  index.ts
  shared.ts
  canvasOrder.ts
  edgeLabel.ts
  edgeRoutePoint.ts
  mindmap.ts
```

其中：

- `shared.ts` 只保留 custom reducer 公共输出构造器。
- 每个 op 域文件只保留领域读写和 inverse 生成。
- `index.ts` 只负责导出 `whiteboardCustom` 表。

最终 API 方向：

```ts
interface WhiteboardCustomMutationResult {
  document?: Document
  writes?: WhiteboardCustomWritePlan
  history?: {
    inverse?: readonly Operation[]
    forward?: readonly Operation[]
  } | false
  effects?: {
    canvasOrder?: true
    nodes?: {
      created?: readonly NodeId[]
      deleted?: readonly NodeId[]
      touched?: readonly NodeId[]
    }
    edges?: {
      created?: readonly EdgeId[]
      deleted?: readonly EdgeId[]
      touched?: readonly EdgeId[]
    }
    mindmaps?: {
      created?: readonly MindmapId[]
      deleted?: readonly MindmapId[]
      touched?: readonly MindmapId[]
    }
    groups?: {
      created?: readonly GroupId[]
      deleted?: readonly GroupId[]
      touched?: readonly GroupId[]
    }
  }
  footprint?: WhiteboardFootprintIntent
}
```

shared / whiteboard 统一走：

```ts
createWhiteboardCustomResult(result): {
  document
  delta
  footprint
  history
}
```

约束：

- reducer 不再直接手工写 `delta.changes[key] = ...`
- reducer 不再直接在各处散落 `entityKey/fieldKey/recordKey/...`
- `buildCustomDelta`、`buildCustomFootprint`、`buildCustomInverse` 之类的编译逻辑只能有唯一入口

### 2.1.3 shared 长期最优 contract

shared 最优方向不是让 custom op 返回最终 commit 级结果，而是返回更低层、可编译的写入计划：

```ts
interface MutationCustomWritePlan {
  entity?: readonly {
    family: string
    id?: string
    kind: 'create' | 'delete' | 'patch'
    patch?: unknown
    value?: unknown
  }[]
  record?: readonly {
    path: string
    write: Record<string, unknown>
  }[]
}
```

然后 shared 统一负责编译：

- document apply
- semantic delta
- footprint
- write-based inverse

只有以下内容继续由领域层手工提供：

- truly domain-specific inverse
- replayable forward normalization
- 领域校验 / relayout / 衍生实体决策

这意味着：

- `footprint` 应尽量自动化
- `inverse` 应做到“大部分自动，少数手工补充”
- whiteboard custom reducer 只保留领域决策，不再承担完整 mutation output 拼装

---

## 2.2 `whiteboard-editor-scene` 还保留了一条本地 execution 语义链，重复解释 delta 太多次

当前链路大致是：

```ts
MutationDelta
  -> createWhiteboardMutationDelta()
  -> graph.targets() / graph.affects.*()
  -> createWhiteboardExecution()
  -> createGraphContext()
  -> queue / fanout / facts
  -> phase patch
  -> runtime stores change
```

另一边 runtime session/source 还有：

```ts
source snapshot diff
  -> WhiteboardRuntimeDelta
  -> createWhiteboardExecution()
  -> same downstream phases
```

当前问题：

- document delta 和 runtime delta 是两条不同语义模型，最后再合流。
- `WhiteboardMutationDelta` 不只是 typed delta view，还附带了 `graph.targets()`、`graph.affects.*()` 这种下游 planner 语义。
- `WhiteboardExecution` 同时有：
  - `target`
  - `runtime`
  - `graph`
  - `items`
  - `ui`
- 这些字段之间存在明显派生关系，重复表达同一事实。
- `graph/context.ts`、`graph/queue.ts`、`graph/facts.ts` 又把 scope resolve、fanout、facts compile 分散到多个小层里。

这说明的问题：

- shared/projection 没问题，问题在 whiteboard-editor-scene 在 shared projection 之前又搭了一层本地 projection planner。

最终优化目标：

- delta 只解释一次。
- scene 只保留一个 canonical plan。
- phases 直接吃 plan，不再沿途构造多套 facts / targets / affects 视图。

最终结构：

```ts
MutationDelta + RuntimeInputDelta
  -> createEditorScenePlan(input)
  -> phases consume plan
  -> state.delta.* drives publish
```

最终 API：

```ts
interface EditorScenePlan {
  reset: boolean
  order: boolean
  graph: {
    node: SceneScope<NodeId>
    edge: SceneScope<EdgeId>
    mindmap: SceneScope<MindmapId>
    group: SceneScope<GroupId>
  }
  spatial: {
    node: SceneScope<NodeId>
    edge: SceneScope<EdgeId>
    mindmap: SceneScope<MindmapId>
    group: SceneScope<GroupId>
    order: boolean
  }
  items: SceneScope<SceneItemKey>
  ui: {
    node: SceneScope<NodeId>
    edge: SceneScope<EdgeId>
    chrome: boolean
  }
  render: {
    node: SceneScope<NodeId>
    edgeStatics: SceneScope<EdgeId>
    edgeActive: SceneScope<EdgeId>
    edgeLabels: SceneScope<EdgeId>
    edgeMasks: SceneScope<EdgeId>
    chromeScene: boolean
    chromeEdge: boolean
  }
}
```

约束：

- `plan` 是唯一 phase 输入语义。
- phase 内部不再自己 union 各类 delta bucket 推导执行范围。
- `graph.targets()`、`graph.affects.*()` 这种 planner helper 最终删除。
- `WhiteboardExecution.graph/ui/items/runtime/target` 这种多层派生结构最终删除。

说明：

- 这不是要删掉 phases。
- phases 保留。
- 要删的是 phases 前面那条重复解释链。

---

## 2.3 `whiteboard-editor-scene/src/runtime/stores.ts` 仍然是本地 publish glue，shared 利用不够深

当前问题：

- `toValueChange(...)` / `toFamilyChange(...)` 本质上是在把 `state + delta` 二次翻译成 shared projection store change。
- `graph.node`、`graph.edge`、`render.edge.*`、`items` 都在重复同一套 family publish 模板。
- 这类 helper 说明 shared store spec 仍然没有被“按 spec 直接映射”使用。

最终优化目标：

- store spec 直接读 phase-owned snapshot + phase-owned change。
- 不保留 projection-local glue helper 工厂。

最终形态：

```ts
const editorSceneStores = {
  graph: {
    node: {
      kind: 'family',
      read: state => state.graph.nodes,
      change: state => state.delta.graph.node
    }
  },
  render: {
    node: {
      kind: 'family',
      read: state => state.render.node,
      change: state => state.delta.render.node
    }
  }
}
```

要求：

- phase patch 直接写 store-ready change。
- `runtime/stores.ts` 只保留 spec 声明，不再保留 `toFamilyChange(...)` 这类适配函数。
- `WorkingState['delta']` 的每个 bucket 都必须直接对应 publish spec。

---

## 2.4 `whiteboard-editor-scene/src/mutation/delta.ts` 仍然偏厚，typed delta 和 downstream facts 混在一起

当前问题：

- 这个文件同时承担：
  - delta schema
  - typed `changed/touchedIds`
  - graph-level targets
  - downstream affects
- `WhiteboardMutationDelta` 不是“typed semantic view”，而是“typed delta + planner helpers”。

最终优化目标：

- `WhiteboardMutationDelta` 只保留 typed semantic change 能力。
- downstream planning 不放在 delta view 里。

最终 API 方向：

```ts
interface WhiteboardMutationDelta {
  raw: MutationDelta
  change(path: WhiteboardMutationPath): WhiteboardSemanticChange
  has(path: WhiteboardMutationPath): boolean
}
```

或者等价地保留字段式访问：

```ts
delta.node.geometry.changed(id)
delta.edge.route.touchedIds()
delta.mindmap.structure.changed(id)
```

但不再允许：

- `delta.graph.targets()`
- `delta.graph.affects.*()`
- 任何 planner / fanout / phase-specific helper

---

## 2.5 `whiteboard-editor-scene/src/runtime/sourceInput.ts` 是另一条平行 delta 编译链，需要并入同一 plan 入口

当前问题：

- `sourceInput.ts` 把 session/source snapshot diff 编成 `WhiteboardRuntimeDelta`。
- 再由 `runtime/execution.ts` 和 document delta 合并。
- 结果是 document 变化和 runtime 变化各有一套 delta 解释协议。

最终优化目标：

- 保留 runtime diff，但不保留独立 execution 语义层。
- runtime diff 直接进入 `createEditorScenePlan(...)`。

最终边界：

```ts
type EditorSceneInput = {
  document: {
    rev: number
    doc: Document
    delta: WhiteboardMutationDelta
  }
  runtime: {
    snapshot: RuntimeSnapshot
    delta: RuntimeInputDelta
  }
}
```

然后：

```ts
createEditorScenePlan(input)
```

直接生成 phase plan。

删除方向：

- `WhiteboardExecution`
- `WhiteboardGraphFacts`
- `WhiteboardUiFacts`
- `executionScope*` 大部分 helpers

保留方向：

- runtime snapshot diff 本身
- 精准 id scope 本身

---

## 2.6 `whiteboard-editor-scene/src/runtime/read.ts` 不是 shared duplication 核心问题，但文件组织仍然过厚

当前判断：

- 这个文件长，主要因为把 `document/frame/selection/hit/view/chrome/bounds` query surface 全部堆在一起。
- 它没有明显重建 shared runtime。
- 它的问题是文件组织厚，不是 shared 利用度不足。

可优化项：

- 按 query domain 拆文件：
  - `read/document.ts`
  - `read/frame.ts`
  - `read/selection.ts`
  - `read/hit.ts`
  - `read/view.ts`
  - `read/chrome.ts`
  - `read/bounds.ts`
- `runtime/read.ts` 只保留组合入口。

约束：

- 这里只做代码组织优化。
- 不要引入新的 read helper framework。

---

## 3. 可以优化但不是首要矛盾的问题

## 3.1 `whiteboard-editor/src/editor/derived/selection-policy.ts`

当前判断：

- 厚，但主要是 selection toolbar / overlay / style aggregation 领域规则。
- 不是 shared duplication 主问题。

可优化项：

- 拆成：
  - `selection-node-scope.ts`
  - `selection-edge-scope.ts`
  - `selection-toolbar.ts`
  - `selection-overlay.ts`
- 把 `readString/readNumber/readNumberArray` 这类 style read helper 收到单独文件。

不建议做的事：

- 不要为了“薄”把这些 UI 规则下沉到 shared。
- 不要把 editor policy 和 scene projection 混回一层。

## 3.2 `whiteboard-editor/src/editor/derived/policy.ts`

当前判断：

- 这是 scene query + editor state 的组合层，职责基本合理。
- 可优化但不是架构问题。

可优化项：

- `nodeStats/edgeStats/nodeScope/edgeScope/toolbar/overlay` 拆成独立 builder。
- `createEditorPolicyDerived(...)` 只保留 wiring。

## 3.3 `whiteboard-editor/src/editor/createEditor.ts`

当前判断：

- 这是 composition root。
- 当前厚度基本合理。

可优化项：

- 仅可做装配块分段，例如：
  - session/state
  - scene/runtime
  - write/action
  - host/input/events

不建议引入额外 abstraction。

---

## 4. 当前已经相对合理、不建议投入重构的部分

## 4.1 `whiteboard-engine`

当前判断：

- 这个包已经比较薄。
- `runtime/engine.ts` 基本只是 shared `MutationEngine` 的 whiteboard adapter。

结论：

- 不作为本轮重点。
- 除非未来 shared mutation engine API 有变化，否则不建议继续重构。

## 4.2 `whiteboard-core` 的大部分几何 / layout / path / transform 文件

包括但不限于：

- `node/shape.ts`
- `node/transform.ts`
- `edge/path.ts`
- `layout/index.ts`
- `edge/connect.ts`

当前判断：

- 这些文件长，主要因为领域算法本身重。
- 不是 shared duplication 问题。

结论：

- 可以做文件内局部整理。
- 不是这轮 shared 利用度优化的核心目标。

---

## 5. 最终 API 目标

## 5.1 `whiteboard-core`

```ts
export const whiteboardCustom: MutationCustomTable<...>
```

但内部必须变成：

```ts
custom reducer
  -> WhiteboardCustomMutationResult
  -> createWhiteboardCustomResult(...)
  -> shared mutation engine consume
```

## 5.2 `whiteboard-editor-scene`

```ts
createEditorSceneRuntime({
  source,
  layout,
  nodeCapability
})
```

内部必须变成：

```ts
MutationDelta + RuntimeInputDelta
  -> createEditorScenePlan(...)
  -> phases(document/graph/spatial/items/ui/render)
  -> phase-owned state.delta.*
  -> stores spec direct map
```

不允许内部长期保留：

- `typed delta -> execution -> context -> facts -> store glue` 多轮解释链
- 多套 phase input 语义
- planner helper 混入 delta view

## 5.3 `whiteboard-editor`

```ts
createEditor({
  engine,
  history,
  initialTool,
  initialViewport,
  nodes,
  services
})
```

继续只做 orchestration / state / interaction / actions。

不承担：

- mutation delta 解释
- projection downstream planning
- scene graph dirty model

---

## 6. 实施顺序

## Phase 1

- 先改 shared，再动 whiteboard。
- 拆 `shared/mutation/src/engine.ts`
- 把 custom contract、canonical entity apply、delta/footprint/inverse 编译逻辑从单文件中拆开
- 在 shared 层引入 custom write-plan / custom result compiler 方向
- 建立 shared 侧统一 custom output 编译入口
- 同步拆 `whiteboard-core/src/operations/custom.ts`
- 建立统一 `createWhiteboardCustomResult(...)`
- whiteboard custom reducer 改成优先返回领域结果 / write plan，不再散落手工拼 commit 结果

完成标准：

- `shared/mutation/src/engine.ts` 不再维持当前超大单文件结构
- custom contract、canonical entity apply、history capture、delta merge、footprint compile 有清晰分文件边界
- reducer 文件不再直接手工拼 raw `MutationDeltaInput`
- reducer 文件不再散落手工拼 `MutationFootprint[]`

建议拆分方向：

```ts
shared/mutation/src/
  engine/
    index.ts
    contracts.ts
    custom.ts
    canonical.ts
    delta.ts
    footprint.ts
    history.ts
    runtime.ts
```

要求：

- `engine.ts` 最终只保留对外导出和顶层装配，或者直接收敛为 `engine/index.ts`
- 不能继续把 custom contract 演进建立在一个 2000+ 行巨型文件上
- whiteboard Phase 1 落地必须和 shared contract 调整一起完成，不能等 whiteboard 先继续包胶水

## Phase 2

- 精简 `whiteboard-editor-scene/src/mutation/delta.ts`
- 让 typed delta 只保留 semantic change access
- 删除 `graph.targets()` / `graph.affects.*()`

完成标准：

- downstream planning 不再挂在 delta view 上

## Phase 3

- 删除 `WhiteboardExecution` 这套中间语义
- 新建唯一 `EditorScenePlan`
- document delta 和 runtime delta 统一编译到 `createEditorScenePlan(...)`

完成标准：

- phases 只吃 `plan`
- 不再经过 `execution -> facts` 双层派生

## Phase 4

- phase patch 直接产出 store-ready change
- 精简 `runtime/stores.ts` 为纯 spec 声明

完成标准：

- 删除 `toValueChange(...)`
- 删除 `toFamilyChange(...)`

## Phase 5

- 按 query domain 拆 `runtime/read.ts`
- 拆 `editor/derived/selection-policy.ts`
- 拆 `editor/derived/policy.ts`

完成标准：

- 只做组织瘦身
- 不新增新的本地 runtime/framework

---

## 7. 最终判断

这次审查里，真正要动的是“重复解释 shared 语义”的层，而不是所有长文件。

必须优先处理的是：

- `whiteboard-core` 的 custom mutation monolith
- `whiteboard-editor-scene` 的 delta / execution / store glue 链

不应误判为核心问题的是：

- `whiteboard-engine`
- `whiteboard-editor` 的 composition root
- `whiteboard-core` 的几何 / layout 算法文件
- `whiteboard-editor-scene/runtime/read.ts` 这类 query surface 聚合文件

长期最优目标很明确：

- shared 继续负责 mutation / delta / projection 骨架
- whiteboard-core 只保留领域 reducer
- whiteboard-editor-scene 只保留 phase patch 和 query surface
- 不再在 shared 之上重复搭一层本地 mutation/projector/execution 框架
