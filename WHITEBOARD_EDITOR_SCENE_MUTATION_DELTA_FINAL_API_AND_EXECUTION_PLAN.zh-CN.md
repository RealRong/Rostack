# Whiteboard Editor Scene 接入 `MutationDelta` 的最终 API 与实施方案

## 目标

本文档只定义 `whiteboard-editor-scene` 切到新模型后的最终态，目标固定为：

- 不保留兼容。
- 不保留 `EnginePublish / EngineDelta / DocumentDelta` 这类中间协议。
- 不保留 `createProjectionRuntime / ProjectionSpec / ScopeSchema / ScopeValue` 这套旧 projection API。
- `whiteboard-editor-scene` 的唯一持久化文档变更输入必须变成 `MutationDelta`。
- `session / interaction / view / clock / measure` 继续作为 scene runtime 的非持久化本地输入存在，但不再和 document delta 混成一套兼容协议。

这不是“再包一层 adapter 让旧代码继续跑”，而是把：

- `whiteboard-engine`
- `whiteboard-editor-scene`
- `shared/projection`

三者之间的接缝一次性收敛到最终模型。

## 现状结论

## 1. `whiteboard-engine` 已经有 raw `MutationDelta`，但又额外降成了 `EngineDelta`

当前主链路：

- `MutationEngine` 已经在 commit 上暴露 normalized `MutationDelta`
- 但 [whiteboard/packages/whiteboard-engine/src/runtime/publish.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/runtime/publish.ts) 又把它降成了 `EngineDelta`
- [whiteboard/packages/whiteboard-engine/src/runtime/engine.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/runtime/engine.ts) 通过 `createEnginePublishFromCommit(...)` 维护 `EnginePublish`

这导致：

- engine `current()` 不是最终的 `{ rev, doc }`
- scene 想拿 mutation semantic key 时拿不到 raw `MutationDelta`
- `publish.ts` 成了纯 glue runtime

## 2. `whiteboard-editor-scene` 仍然吃的是 `EnginePublish -> DocumentDelta -> GraphDelta`

当前 scene 输入链路：

- [whiteboard/packages/whiteboard-editor-scene/src/contracts/source.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor-scene/src/contracts/source.ts) 的 `document.publish` 仍然依赖 `EnginePublish`
- [whiteboard/packages/whiteboard-editor-scene/src/runtime/sourceInput.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor-scene/src/runtime/sourceInput.ts) 用 `createDocumentInputDelta(...)` 把 `EngineDelta` 再转成 scene 的 `DocumentDelta`
- [whiteboard/packages/whiteboard-editor-scene/src/contracts/editor.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor-scene/src/contracts/editor.ts) 里重复定义了 `EngineSnapshot / EngineDelta / DocumentDelta / InputDelta`

这意味着 scene 现在实际依赖的是三层中间协议：

```text
MutationDelta
  -> EngineDelta
  -> DocumentDelta
  -> GraphDelta / UiDelta / RenderDelta / ...
```

这不是最终态。

## 3. `whiteboard-editor-scene` 仍然建立在旧 `shared/projection` API 之上

当前：

- [whiteboard/packages/whiteboard-editor-scene/src/runtime/createEditorSceneProjectionRuntime.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor-scene/src/runtime/createEditorSceneProjectionRuntime.ts) 仍然 import `createProjectionRuntime`
- [whiteboard/packages/whiteboard-editor-scene/src/runtime/model.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor-scene/src/runtime/model.ts) 仍然使用旧 `ProjectionSpec`
- [whiteboard/packages/whiteboard-editor-scene/src/contracts/delta.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor-scene/src/contracts/delta.ts) 仍然依赖 `ScopeInputValue / ScopeSchema / ScopeValue`

而 `shared/projection` 根出口现在已经只保留 `createProjection(...)` 这套 final API。

这说明 editor-scene 不能继续围绕旧 scope/emit/plan runtime 修补，必须直接重写到新的 `createProjection(...)` 模型。

## 4. `GraphDelta / SpatialDelta / ItemsDelta / UiDelta / RenderDelta` 可以保留，但只能作为 runtime 内部 phase delta

这几类 delta 不是持久化协议，它们是：

- graph phase 的内部产物
- spatial/items/ui/render phase 的内部判脏与 patch 结果
- hot-path patch 的局部加速层

所以它们可以保留，但必须满足两个前提：

- 不再从 `EngineDelta / DocumentDelta` 派生
- 不再作为 engine/scene 公共接缝出现

同时需要明确：

- `graphChanges` 这类更细粒度的 touched/invalidation 信息如果仍然需要，最终应收敛到 `state.dirty.graph`
- 不应再把它建模成与 `state.delta.graph` 并列的第二个 graph delta

换句话说，`MutationDelta` 是唯一正式 document delta，`GraphDelta / SpatialDelta / ItemsDelta / UiDelta / RenderDelta` 只是 projection runtime 内部状态；render 所需的更细粒度 graph invalidation 仍可存在，但它属于 `dirty`，不属于第二套 `delta`。

## 最终架构决策

## 1. `whiteboard-engine` 对外收敛到 dataview 同型接口

最终：

```ts
type EngineCurrent = {
  rev: number
  doc: Document
}
```

`whiteboard-engine` 的最终规则：

- `current()` 只返回 `{ rev, doc }`
- `subscribe()` 只订阅 `{ rev, doc }`
- `commits.subscribe()` 才是 raw commit / raw `MutationDelta` 的正式出口
- 删除 `EnginePublish`
- 删除 `EngineDelta`
- 删除 `Snapshot`
- 删除 `runtime/publish.ts`

也就是：

```text
engine.current()
  -> 当前文档事实

engine.commits.subscribe()
  -> commit.delta / commit.document / commit.rev
```

不再允许：

```text
engine.current().delta
engine.current().snapshot
```

## 2. editor-scene 的 source contract 不再存 `publish`

最终 source snapshot 推荐改成：

```ts
interface EditorSceneSourceSnapshot {
  document: {
    rev: Revision
    doc: WhiteboardDocument
  }
  session: ...
  interaction: ...
  view: SceneViewSnapshot
  clock: ClockInput
}
```

`document` change 不再只是布尔值，而要直接携带本次 commit 的 delta 事实：

```ts
interface EditorSceneSourceChange {
  document?: {
    rev: Revision
    delta: MutationDelta
    reset: boolean
  }
  session?: ...
  interaction?: ...
  view?: true
  clock?: true
}
```

这里有两个关键点：

- `snapshot` 只负责表达“当前事实”
- `change.document` 只负责表达“本次 commit 的变更事实”

不要再把 `delta` 混进 snapshot 本体，也不要再维护 `publish` 对象。

## 3. scene projection 的最终输入模型

最终 scene runtime 输入应当固定为：

```ts
interface EditorSceneProjectionInput {
  document: {
    rev: Revision
    doc: WhiteboardDocument
  }
  runtime: {
    session: SessionInput
    interaction: InteractionInput
    view: SceneViewSnapshot
    clock: ClockInput
    delta: RuntimeInputDelta
  }
  delta: MutationDelta
}
```

说明：

- 顶层 `delta` 就是 raw `MutationDelta`
- `document` 提供当前 committed document
- `runtime.delta` 只描述本地输入变化，不再包含 document delta

最终必须删除：

- `DocumentDelta`
- `EngineDelta`
- `InputDelta.document`
- `createDocumentInputDelta(...)`

保留并重命名：

- `InputDelta` -> `RuntimeInputDelta`
- `SessionInputDelta / ClockInputDelta` 可以继续存在

因为它们描述的是非持久化 scene 本地状态，不是 mutation 协议。

## 3.1 `shared/mutation` 必须提供最终读模型，scene 不再自建 helper

whiteboard 这里真正缺的不是 `readTouchedNodes(...)` 这类 scene helper，而是 `MutationDelta` 自身的读取能力。

当前问题有两个：

- `MutationDelta.changes` 只是裸 `Record<string, MutationChange>`
- `MutationChange` 还是 `true | string[] | object` 的 union 形态

这会直接导致上层每次都要先发明一层 helper 去解释：

- key 是否存在
- ids 怎么取
- paths 怎么取
- payload 怎么取

这不是最终态。

最终设计应当是：

- `MutationDeltaInput` 继续允许写入侧使用轻量输入形态
- engine commit 暴露出来的 normalized `MutationDelta` 必须是稳定、直接可读的读模型
- scene / dataview / projection runtime 直接读取 `MutationDelta`
- 不再为 whiteboard 单独发明 `readTouchedNodes(...) / hasEdgeRouteChanges(...)` 之类 helper 文件

推荐最终 API：

```ts
type MutationChangeInput =
  | true
  | readonly string[]
  | {
      ids?: readonly string[] | 'all'
      paths?: Record<string, readonly string[] | 'all'> | 'all'
      order?: true
      [payload: string]: unknown
    }

interface MutationChange {
  ids?: readonly string[] | 'all'
  paths?: Readonly<Record<string, readonly string[] | 'all'>> | 'all'
  order?: true
  [payload: string]: unknown
}

interface MutationChangeMap {
  readonly size: number
  has(key: string): boolean
  get(key: string): MutationChange | undefined
  keys(): Iterable<string>
  entries(): Iterable<[string, MutationChange]>
}

interface MutationDelta {
  reset?: true
  changes: MutationChangeMap
}
```

几个明确约束：

- projection/runtime 读取的一律是 normalized `MutationDelta`，不是 `MutationDeltaInput`
- normalized `MutationDelta.changes` 必须始终存在，哪怕是空 map，也不能再是可选裸对象
- `MutationChange` 在读模型里不再暴露 `true | string[]` 这类 union 简写，统一归一化成 object 形态

这样 phase 里就可以直接内联读取，而不是再包 helper：

```ts
const changes = delta.changes

const canvasOrderChanged =
  delta.reset === true
  || changes.has('canvas.order')

const nodeGeometryIds =
  changes.get('node.geometry')?.ids

const edgeRouteIds =
  changes.get('edge.route')?.ids

const backgroundChanged =
  delta.reset === true
  || changes.has('document.background')
```

这才是最终态：

- 语义 key 直接可读
- phase 判断可以直接内联
- 不需要 whiteboard 自己再维护 `dirty.ts`
- 不需要 dataview 自己再维护一层 `readMutationChange / readChangeIds / readChangePaths` 包装协议

## 4. editor-scene 必须直接切到 `createProjection(...)`

最终不允许再保留：

- `createProjectionRuntime`
- `ProjectionSpec`
- `ScopeSchema`
- `ScopeInputValue`
- `ScopeValue`
- `plan(...)+scope+emit` 这套旧 projection protocol

editor-scene 必须像 dataview 一样直接建立单一 runtime：

```ts
const projection = createProjection({
  createState,
  createRead,
  output,
  surface,
  phases
})
```

也就是说：

- scene runtime 不能再等待 shared/projection 重新提供旧 API
- 也不能在 editor-scene 内部自己再包一层假的 `createProjectionRuntime`
- 必须直接适配当前 `shared/projection/src/createProjection.ts`

## 5. phase 模型改成单一 runtime 内部 dirty 流，不再保留 scope/emit 协议

最终 phase 固定建议为：

- `document`
- `graph`
- `spatial`
- `items`
- `ui`
- `render`

推荐数据流：

```text
document
  -> graph
  -> spatial
  -> items
  -> ui
  -> render
```

这里 `graph / spatial / items / ui / render` 都只是单一 runtime 的内部 phase，不再暴露旧 scope contract。

具体规则：

- phase 直接修改 `context.state`
- phase 通过 `context.dirty.*` 传播内部脏信息
- phase 通过 `context.phase.*.changed` 标记 surface sync
- 不再返回 `emit`
- 不再维护对外的 `scope` 协议
- 不再维护旧 `EditorPhaseScopeMap`

这里要明确区分两个概念：

- 被删除的是旧 projection protocol 里的 `scope/emit/plan` 协议
- 最终实现里也不再保留显式 `workset` 层
- 各 phase 直接根据 `input.delta`、`state.delta.*`、`state.dirty.graph` 和当前 state 判定自己是否需要执行
- `context.dirty` 最终只保留极少数真正需要跨 phase 传递的事实，例如 previous document snapshot

这和当前 dataview 最终态一致，也符合“不能并存两套 runtime 协议”的要求。

## 最终 phase 设计

## 1. `document` phase

职责：

- 更新 `state.revision.document`
- 更新 `state.document.snapshot`
- 更新 `state.document.background`
- 记录 previous document / previous revision，供 graph/index diff 使用

判脏来源：

- `delta.reset`
- `document.background`
- 任意 node/edge/group/mindmap/canvas 相关 change key

它不产出公共 delta，只负责把 committed document 事实写入 working state。

## 2. `graph` phase

职责：

- patch graph node/edge/mindmap/group 视图
- patch indexes
- 生成内部 `state.delta.graph`
- 生成内部 `state.dirty.graph`

这里要严格区分两层含义：

- `state.delta.graph` 是 graph phase 的正式结果增量，供 `spatial / items / surface` 消费
- `state.dirty.graph` 是 render 等 hot-path phase 需要的细粒度 invalidation 集合，例如 `node.content / edge.route / edge.labels / edge.box / mindmap.connectors / group.membership`

最终态不应再保留：

- `state.delta.graphChanges`

因为它本质上不是第二个 graph 结果 delta，而是 graph phase 内部的 render invalidation bag。

最终不再读：

- `input.delta.document.nodes`
- `input.delta.document.edges`
- `input.delta.document.mindmaps`
- `input.delta.document.groups`
- `input.delta.document.order`

而是直接读 `MutationDelta` semantic key：

- `canvas.order`
- `node.create`
- `node.delete`
- `node.geometry`
- `node.owner`
- `node.content`
- `edge.create`
- `edge.delete`
- `edge.endpoints`
- `edge.route`
- `edge.style`
- `edge.labels`
- `edge.data`
- `group.create`
- `group.delete`
- `group.value`
- `mindmap.create`
- `mindmap.delete`
- `mindmap.structure`
- `mindmap.layout`

此外 graph phase 仍然要吸收本地 runtime 影响：

- `session.edit`
- `session.draft.edges`
- `session.preview.nodes`
- `session.preview.edges`
- `session.preview.mindmaps`
- `clock.mindmaps`

但这些影响只进入 graph phase 的内部 queue/fanout，不再污染 document delta contract。

## 3. `spatial` phase

职责：

- 仅根据 `state.delta.graph` 和当前 graph state 更新 spatial index
- 生成内部 `state.delta.spatial`

`spatial` 不直接读 `MutationDelta`，它只消费 `graph` phase 的内部结果。

## 4. `items` phase

职责：

- 根据 `document.canvas.order` + 当前 committed document 重建或增量更新 scene items
- 生成内部 `state.delta.items`

items phase 的正式 document 判脏来源只有：

- `canvas.order`
- `node.create`
- `node.delete`
- `edge.create`
- `edge.delete`
- `mindmap.create`
- `mindmap.delete`

它不应该再间接依赖 `EngineDelta.order`。
它也不应该再依赖“graph phase 变了，所以 items 跟着重跑”这类兼容链路；items 是否需要运行，应直接由 document semantic key 判定。

## 5. `ui` phase

职责：

- 只处理 selection / hover / edit / preview / tool / interaction 派生的 scene ui 状态
- 必要时吸收 graph phase 结果做 fanout
- 生成内部 `state.delta.ui`

`ui` phase 是纯 scene local phase，不应直接消费 document compatibility delta。

## 6. `render` phase

职责：

- 根据 graph/ui/items 内部 delta 更新 node render、edge statics、edge active、labels、masks、overlay、chrome
- 生成内部 `state.delta.render`

这层 delta 继续保留是合理的，因为：

- edge statics / labels / masks / active 都是 hot-path family
- 这些 family 需要 phase 直接产出 patch，不能退化成全量 diff

## `MutationDelta` 读取原则

最终不建议新增：

- `whiteboard-editor-scene/src/runtime/mutation/dirty.ts`
- `readTouchedNodes(...)`
- `readTouchedEdges(...)`
- `readTouchedMindmaps(...)`
- `readTouchedGroups(...)`
- `hasCanvasOrderChange(...)`
- `hasBackgroundChange(...)`
- `hasNodeGeometryChanges(...)`
- `hasEdgeRouteChanges(...)`

原因很明确：

- 如果 scene 要靠这类 helper 才能读懂 `MutationDelta`，说明读模型本身不够直观
- 这些 helper 一旦进入代码库，就会继续膨胀成第二层协议
- 最后会把 semantic key 又重新包回“本地兼容层”

最终原则应当固定为：

- `MutationDelta` 自身提供最终读取能力
- phase 默认直接内联读取 semantic key
- 只有极少数完全通用的能力，才允许下沉到 `shared/mutation`
- 不允许在 whiteboard-editor-scene 内部再发明一层 mutation helper 协议

scene runtime 内部仍然可以保留：

- `state.dirty.graph`

但它的职责只是承载 graph phase 产出的细粒度 invalidation facts，供 render phase 判脏和收集 touched ids 使用；它不是 document delta 读取层，也不是 `MutationDelta` 的解释器。

## 公共 API 最终形态

## `@whiteboard/engine`

最终：

```ts
type EngineCurrent = {
  rev: Revision
  doc: Document
}

interface Engine {
  current(): EngineCurrent
  subscribe(listener: (current: EngineCurrent) => void): () => void
  commits: {
    subscribe(listener: (commit: EngineCommit) => void): () => void
  }
}
```

## `@whiteboard/editor-scene`

最终 source snapshot：

```ts
interface EditorSceneSourceSnapshot {
  document: {
    rev: Revision
    doc: WhiteboardDocument
  }
  session: ...
  interaction: ...
  view: SceneViewSnapshot
  clock: ClockInput
}
```

最终 runtime 输入：

```ts
interface EditorSceneProjectionInput {
  document: {
    rev: Revision
    doc: WhiteboardDocument
  }
  runtime: {
    session: SessionInput
    interaction: InteractionInput
    view: SceneViewSnapshot
    clock: ClockInput
    delta: RuntimeInputDelta
  }
  delta: MutationDelta
}
```

## 必须删除的旧结构

以下内容不是最终态，必须全部删除：

- `whiteboard-engine/src/runtime/publish.ts`
- `whiteboard-engine/src/contracts/document.ts` 中的 `Snapshot / EngineDelta / EnginePublish`
- `whiteboard-editor-scene/src/contracts/editor.ts` 中的 `EngineSnapshot / EngineDelta / DocumentDelta`
- `whiteboard-editor-scene/src/runtime/sourceInput.ts` 中的 `createDocumentInputDelta(...)`
- `whiteboard-editor-scene/src/contracts/source.ts` 中的 `document.publish`
- `whiteboard-editor-scene/src/runtime/createEditorSceneProjectionRuntime.ts` 里对 `createProjectionRuntime` 的依赖
- `whiteboard-editor-scene/src/runtime/model.ts` 中旧 `ProjectionSpec` / scope / emit / plan 协议

## 实施顺序

## 当前状态（2026-04-29）

截至 2026-04-29，本文档定义的最终态已经在 `whiteboard-editor-scene` 主链路上完成，关键事实如下：

- `whiteboard-engine` 对 scene 的 document 变更输入已经收敛到 raw commit `MutationDelta`
- `whiteboard-editor-scene` 输入已经是：
  - `document: { rev, doc }`
  - `runtime: { session, interaction, view, clock, delta: RuntimeInputDelta }`
  - 顶层 `delta: MutationDelta`
- `createProjectionRuntime / ProjectionSpec / ScopeSchema / ScopeInputValue / ScopeValue` 已全部移除
- `document -> graph -> spatial -> items -> ui -> render` 已切到单一 `createProjection({...})` runtime
- `graphChanges` 已被删除，render 等 hot-path 的细粒度 invalidation 已统一收敛到 `state.dirty.graph`
- graph/document/items/ui/render 已直接基于 `delta.changes.has/get(...)`、`state.delta.*` 和 `state.dirty.graph` 运行
- package 内测试夹具也已完成迁移，不再写 `working.delta.graphChanges`

本次收口后，runtime 内部实际保留的边界是：

- `MutationDelta`：唯一正式 document delta 输入
- `state.delta.graph / spatial / items / ui / render`：runtime 内部 phase 结果 delta
- `state.dirty.graph`：graph phase 直接产出的细粒度 render invalidation facts

对应验证结果：

- `pnpm --filter @whiteboard/editor-scene run typecheck` 通过
- `pnpm --filter @whiteboard/editor run typecheck` 通过
- `pnpm --filter @whiteboard/editor-scene exec vitest run test/runtime.test.ts test/graphDelta.test.ts test/renderDelta.test.ts --config vitest.config.ts` 通过
- `rg "graphChanges|graphChange\\b|EngineDelta|delta\\.document\\.|createDocumentInputDelta|readTouchedNodes|readTouchedEdges|readTouchedMindmaps|readTouchedGroups|hasCanvasOrderChange|hasBackgroundChange|hasNodeGeometryChanges|hasEdgeRouteChanges|readGraphPlanScope|createGraphScope|readUiPatchScope|readRenderScopeFromGraph|readRenderScopeFromUi" whiteboard/packages/whiteboard-editor-scene -g '*.ts'` 无结果
- `rg "current\\(\\)\\.delta|publish\\.delta|EngineDelta|graphChanges" whiteboard/packages -g '*.ts'` 无结果

## Phase 1. 先收敛 `shared/mutation` 的最终读模型

必须完成：

- 区分写侧 `MutationDeltaInput` 和读侧 normalized `MutationDelta`
- normalized `MutationDelta` 改成稳定读模型：`delta.changes` 始终存在且提供 `has/get/keys/entries/size`
- normalized `MutationChange` 改成统一 object 形态，不再向读侧暴露 `true | string[] | object` union
- engine commit、projection input、runtime phase 读取的一律是新的 normalized `MutationDelta`
- 不保留 “旧裸对象 `changes` + 新读模型并存” 的双轨期

验收：

- `rg "changes\\?\\[|Object\\.keys\\(delta\\.changes|Object\\.entries\\(delta\\.changes|readMutationChange|readChangeIds|readChangePaths|readChangePayload|hasDeltaChange" dataview/packages/dataview-engine shared/projection whiteboard/packages/whiteboard-editor-scene -g '*.ts'` 无结果

## Phase 2. 迁移所有读侧消费者到 `delta.changes.has/get(...)`

必须完成：

- dataview 删除基于旧裸对象/旧 helper 的 delta 读取层，直接读取新的 `MutationDelta`
- `shared/projection` 删除内部 `readMutationChange / readChangeIds` 这类旧解释器，直接读取新的 `MutationDelta`
- whiteboard 后续 phase 代码统一按 `delta.changes.has/get(...)` 内联读取
- 不新增任何 dataview/whiteboard 本地 mutation helper 协议

验收：

- `rg "readMutationChange|readChangeIds|readChangePaths|readChangePayload|hasDeltaChange" dataview/packages/dataview-engine shared/projection whiteboard/packages/whiteboard-editor-scene -g '*.ts'` 无结果

## Phase 3. 清掉 engine publish glue

必须完成：

- 删除 `whiteboard-engine/src/runtime/publish.ts`
- `engine.current()` 改成 `{ rev, doc }`
- `engine.subscribe()` 改成订阅 `{ rev, doc }`
- scene 或上层 source 在 document change 时改用 `engine.commits.subscribe()` 获取 `commit.delta`

验收：

- `rg "EnginePublish|EngineDelta|createEngineDelta|createEnginePublish|createInitialEnginePublish|createEnginePublishFromCommit" whiteboard/packages/whiteboard-engine -g '*.ts'` 无结果

## Phase 4. 重写 editor-scene source contract

必须完成：

- 删除 `document.publish`
- 删除 `EngineSnapshot / DocumentDelta`
- 新的 `EditorSceneSourceChange.document` 携带 `{ rev, delta, reset }`
- `sourceInput.ts` 不再从 publish 导出 document delta

验收：

- `rg "document\\.publish|EngineSnapshot|DocumentDelta|createDocumentInputDelta" whiteboard/packages/whiteboard-editor-scene -g '*.ts'` 无结果

## Phase 5. 把 scene input 切到 `MutationDelta + RuntimeInputDelta`

必须完成：

- `InputDelta` 删除 `document` 分支
- `Input.delta` 顶层不再混 document compatibility delta
- scene projection input 顶层 `delta` 直接是 `MutationDelta`
- 本地变化改名为 `RuntimeInputDelta`

验收：

- `rg "delta\\.document|InputDelta|DocumentDelta" whiteboard/packages/whiteboard-editor-scene/src -g '*.ts'` 只允许剩余新的 `RuntimeInputDelta` 定义，不允许旧 document delta 结构

## Phase 6. editor-scene 切到 `createProjection(...)`

必须完成：

- 删除 `createProjectionRuntime`
- 删除 `ProjectionSpec`
- 删除 `ScopeSchema / ScopeValue / ScopeInputValue`
- `runtime/model.ts` 改写成新的 `createProjection({...})` 单一 runtime
- phase 改成 `document -> graph -> spatial -> items -> ui -> render`

验收：

- `rg "createProjectionRuntime|ProjectionSpec|ScopeSchema|ScopeValue|ScopeInputValue" whiteboard/packages/whiteboard-editor-scene -g '*.ts'` 无结果

## Phase 7. 直接以 `MutationDelta` 驱动 graph/runtime phases

必须完成：

- graph/document/items/ui/render phases 直接用 `delta.changes.has/get(...)` 读取 semantic key
- graph phase 直接解析 `node.* / edge.* / mindmap.* / group.* / canvas.order / document.background`
- 删除 `EngineDelta -> GraphScopeInput` 这层兼容转换
- `state.dirty.graph` 由 graph phase 直接产出，不再由 `state.delta.graph` 二次翻译成 `graphChanges`
- 不新增 whiteboard 本地 mutation helper 协议

验收：

- `rg "EngineDelta|delta\\.document\\.|createDocumentInputDelta" whiteboard/packages/whiteboard-editor-scene/src/runtime whiteboard/packages/whiteboard-editor-scene/src/model -g '*.ts'` 无结果
- `rg "readTouchedNodes|readTouchedEdges|readTouchedMindmaps|readTouchedGroups|hasCanvasOrderChange|hasBackgroundChange|hasNodeGeometryChanges|hasEdgeRouteChanges" whiteboard/packages/whiteboard-editor-scene -g '*.ts'` 无结果
- `rg "graphChanges" whiteboard/packages/whiteboard-editor-scene -g '*.ts'` 无结果

当前实现补充说明：

- graph phase 直接内联读取 `node.create / node.delete / node.geometry / node.owner / node.content / edge.create / edge.delete / edge.endpoints / edge.route / edge.style / edge.labels / edge.data / group.create / group.delete / group.value / mindmap.create / mindmap.delete / mindmap.structure / mindmap.layout / canvas.order`
- graph phase 会直接产出 `state.dirty.graph`
- render phase 直接消费 `state.dirty.graph`
- items phase 的运行触发已经直接收敛到 document semantic key，不再借道 graph phase compatibility signal

## Phase 8. 收口测试和内部 delta 边界

必须完成：

- scene 测试改为直接构造 `MutationDelta`
- dataview 测试改为直接断言新的 `MutationDelta` 读模型，而不是旧 helper/旧裸对象读取
- engine 测试不再断言 `current().delta`
- `GraphDelta / SpatialDelta / ItemsDelta / UiDelta / RenderDelta` 保留为 runtime 内部状态，不再作为公共接缝
- render 需要的细粒度 graph touched/invalidation 统一收敛到 `state.dirty.graph`

验收：

- `rg "current\\(\\)\\.delta|publish\\.delta|EngineDelta|graphChanges" whiteboard/packages -g '*.ts'` 无结果

当前实现补充说明：

- `test/runtime.test.ts`
- `test/graphDelta.test.ts`
- `test/renderDelta.test.ts`

都已经跑通，并且 `renderDelta` 测试已从 `working.delta.graphChanges` 迁移到 `working.dirty.graph`。

## 最终验收标准

全部完成后，必须同时满足：

1. `whiteboard-editor-scene` 的唯一正式 document delta 输入是 `MutationDelta`
2. `MutationDelta` 的读取能力由 `shared/mutation` 统一提供，读侧直接使用 `delta.changes.has/get(...)`
3. dataview / shared-projection / whiteboard-editor-scene 都不再维护自己的 mutation 解释层
4. `whiteboard-engine` 不再维护 `EnginePublish / EngineDelta`
5. `whiteboard-editor-scene` 不再维护 `DocumentDelta`
6. `whiteboard-editor-scene` 不再依赖 `createProjectionRuntime`
7. `whiteboard-editor-scene` 不再依赖旧 scope/emit projection 协议
8. `graph / spatial / items / ui / render` 只是单一 runtime 的内部 phases
9. 没有任何“新 MutationDelta + 旧 EngineDelta/DocumentDelta 并存”的过渡结构
10. edge statics / active / labels / masks 等 hot-path family 仍然由 phase 直接产出 patch，不退化成全量 diff
11. `state.delta.graphChanges` 被删除，细粒度 graph invalidation 统一收敛到 `state.dirty.graph`

## 结论

如果目标是真正让 `whiteboard-editor-scene` “也吃 `MutationDelta`，并且全面不留兼容切到新模型”，那么最终方案只能是：

- `whiteboard-engine` 删除 publish glue
- scene source 删除 `publish`/`EngineDelta`/`DocumentDelta`
- scene projection 输入直接变成 `MutationDelta + RuntimeInputDelta`
- `MutationDelta` 本身收敛到直接可读的最终读模型，phase 通过 `delta.changes.has/get(...)` 直接内联读取 semantic key
- editor-scene 直接重写到 `createProjection(...)`
- graph/spatial/items/ui/render 全部成为单一 runtime 的内部 phases

任何“保留 `EngineDelta` 给 scene 用，再额外加 `MutationDelta`”的方案，或者“保留 `createProjectionRuntime` 先跑着”的方案，或者“再在 scene 里包一层 `readTouchedNodes(...)` helper 才能消费 delta”的方案，都不是最终态，只是旧架构继续续命。
