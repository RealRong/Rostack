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

## 4. `GraphDelta / GraphChanges / UiDelta / RenderDelta` 可以保留，但只能作为 runtime 内部 phase delta

这几类 delta 不是持久化协议，它们是：

- graph phase 的内部产物
- spatial/items/ui/render phase 的内部判脏与 patch 结果
- hot-path patch 的局部加速层

所以它们可以保留，但必须满足两个前提：

- 不再从 `EngineDelta / DocumentDelta` 派生
- 不再作为 engine/scene 公共接缝出现

换句话说，`MutationDelta` 是唯一正式 document delta，`GraphDelta / UiDelta / RenderDelta` 只是 projection runtime 内部状态。

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
- 不再维护 `scope`
- 不再维护旧 `EditorPhaseScopeMap`

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
- 生成内部 `state.delta.graphChanges`

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

## 新的 dirty helper 设计

推荐新增：

- `whiteboard-editor-scene/src/runtime/mutation/dirty.ts`

只负责从 `MutationDelta` 读取 semantic dirty facts，例如：

- `readTouchedNodes(delta)`
- `readTouchedEdges(delta)`
- `readTouchedMindmaps(delta)`
- `readTouchedGroups(delta)`
- `hasCanvasOrderChange(delta)`
- `hasBackgroundChange(delta)`
- `hasNodeGeometryChanges(delta, ids?)`
- `hasEdgeRouteChanges(delta, ids?)`

这个文件的定位要和 dataview 的 [dirty.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/projection/dirty.ts) 一样：

- 只读 `MutationDelta`
- 不做 runtime patch
- 不输出兼容 delta

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

## Phase 1. 清掉 engine publish glue

必须完成：

- 删除 `whiteboard-engine/src/runtime/publish.ts`
- `engine.current()` 改成 `{ rev, doc }`
- `engine.subscribe()` 改成订阅 `{ rev, doc }`
- scene 或上层 source 在 document change 时改用 `engine.commits.subscribe()` 获取 `commit.delta`

验收：

- `rg "EnginePublish|EngineDelta|createEngineDelta|createEnginePublish|createInitialEnginePublish|createEnginePublishFromCommit" whiteboard/packages/whiteboard-engine -g '*.ts'` 无结果

## Phase 2. 重写 editor-scene source contract

必须完成：

- 删除 `document.publish`
- 删除 `EngineSnapshot / DocumentDelta`
- 新的 `EditorSceneSourceChange.document` 携带 `{ rev, delta, reset }`
- `sourceInput.ts` 不再从 publish 导出 document delta

验收：

- `rg "document\\.publish|EngineSnapshot|DocumentDelta|createDocumentInputDelta" whiteboard/packages/whiteboard-editor-scene -g '*.ts'` 无结果

## Phase 3. 把 scene input 切到 `MutationDelta + RuntimeInputDelta`

必须完成：

- `InputDelta` 删除 `document` 分支
- `Input.delta` 顶层不再混 document compatibility delta
- scene projection input 顶层 `delta` 直接是 `MutationDelta`
- 本地变化改名为 `RuntimeInputDelta`

验收：

- `rg "delta\\.document|InputDelta|DocumentDelta" whiteboard/packages/whiteboard-editor-scene/src -g '*.ts'` 只允许剩余新的 `RuntimeInputDelta` 定义，不允许旧 document delta 结构

## Phase 4. editor-scene 切到 `createProjection(...)`

必须完成：

- 删除 `createProjectionRuntime`
- 删除 `ProjectionSpec`
- 删除 `ScopeSchema / ScopeValue / ScopeInputValue`
- `runtime/model.ts` 改写成新的 `createProjection({...})` 单一 runtime
- phase 改成 `document -> graph -> spatial -> items -> ui -> render`

验收：

- `rg "createProjectionRuntime|ProjectionSpec|ScopeSchema|ScopeValue|ScopeInputValue" whiteboard/packages/whiteboard-editor-scene -g '*.ts'` 无结果

## Phase 5. 直接以 `MutationDelta` 驱动 graph phase

必须完成：

- 新增 `runtime/mutation/dirty.ts`
- graph phase 直接解析 `node.* / edge.* / mindmap.* / group.* / canvas.order / document.background`
- 删除 `EngineDelta -> GraphScopeInput` 这层兼容转换

验收：

- `rg "EngineDelta|delta\\.document\\.|createDocumentInputDelta" whiteboard/packages/whiteboard-editor-scene/src/runtime whiteboard/packages/whiteboard-editor-scene/src/model -g '*.ts'` 无结果

## Phase 6. 收口测试和内部 delta 边界

必须完成：

- scene 测试改为直接构造 `MutationDelta`
- engine 测试不再断言 `current().delta`
- `GraphDelta / GraphChanges / SpatialDelta / ItemsDelta / UiDelta / RenderDelta` 保留为 runtime 内部状态，不再作为公共接缝

验收：

- `rg "current\\(\\)\\.delta|publish\\.delta|EngineDelta" whiteboard/packages -g '*.ts'` 无结果

## 最终验收标准

全部完成后，必须同时满足：

1. `whiteboard-editor-scene` 的唯一正式 document delta 输入是 `MutationDelta`
2. `whiteboard-engine` 不再维护 `EnginePublish / EngineDelta`
3. `whiteboard-editor-scene` 不再维护 `DocumentDelta`
4. `whiteboard-editor-scene` 不再依赖 `createProjectionRuntime`
5. `whiteboard-editor-scene` 不再依赖旧 scope/emit projection 协议
6. `graph / spatial / items / ui / render` 只是单一 runtime 的内部 phases
7. 没有任何“新 MutationDelta + 旧 EngineDelta/DocumentDelta 并存”的过渡结构
8. edge statics / active / labels / masks 等 hot-path family 仍然由 phase 直接产出 patch，不退化成全量 diff

## 结论

如果目标是真正让 `whiteboard-editor-scene` “也吃 `MutationDelta`，并且全面不留兼容切到新模型”，那么最终方案只能是：

- `whiteboard-engine` 删除 publish glue
- scene source 删除 `publish`/`EngineDelta`/`DocumentDelta`
- scene projection 输入直接变成 `MutationDelta + RuntimeInputDelta`
- editor-scene 直接重写到 `createProjection(...)`
- graph/spatial/items/ui/render 全部成为单一 runtime 的内部 phases

任何“保留 `EngineDelta` 给 scene 用，再额外加 `MutationDelta`”的方案，或者“保留 `createProjectionRuntime` 先跑着”的方案，都不是最终态，只是旧架构继续续命。
