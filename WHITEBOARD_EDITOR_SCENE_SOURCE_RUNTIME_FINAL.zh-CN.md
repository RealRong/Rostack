# WHITEBOARD_EDITOR_SCENE_SOURCE_RUNTIME_FINAL

## 结论

`whiteboard-editor` 组一份 `editor-scene InputDelta` 再传给 `editor-scene`，不是长期最优。

最终最优形态应该是：

1. `editor` 只拥有并暴露 source state
2. `editor-scene` 直接绑定 source，并在内部完成 source change -> phase scope / invalidation planning
3. 删除 `whiteboard-editor/src/projection/adapter.ts`
4. 删除 `whiteboard-editor/src/scene/orchestrator.ts`
5. 删除 `editor` 侧所有 scene-shaped delta assembly
6. `editor-scene` 不再接收 `InputDelta` 这种已经混入 scene 语义的输入

一句话：

- `editor` 负责“发生了什么”
- `editor-scene` 负责“这些变化影响 scene 哪里”

这才是职责最正确、重复最少、长期复杂度最低的设计。

---

## 当前问题

当前链路大致是：

1. `editor` 订阅 engine / session / interaction
2. `editor` 在 `projection/adapter.ts` 里把 source state 翻译成 scene input
3. `editor` 在 `scene/orchestrator.ts` 里把 source change 进一步翻译成 `InputDelta`
4. `editor-scene` 在 `runtime/model.ts` 里再把 `InputDelta` 翻译成 graph/view phase scope

也就是现在存在两层翻译：

1. `source -> scene input delta`
2. `scene input delta -> scene phase scope`

这会带来四个问题。

### 1. `editor` 已经知道太多 `editor-scene` 内部语义

例如当前 `sceneInputChangeSpec` 里的这些字段：

- `session.draft.edges`
- `session.preview.nodes`
- `session.preview.edges`
- `session.preview.mindmaps`
- `session.preview.edgeGuide`
- `clock.mindmaps`

这些已经不是纯 source change，而是明显带有 scene invalidation 意图的字段。

这意味着 `editor` 在替 `editor-scene` 做 planning。

### 2. `adapter.ts` 和 `orchestrator.ts` 都是中转层

它们没有独立领域价值，只是在做：

- source flatten
- scene input glue
- delta assembly
- microtask flush

这些都属于 `editor-scene runtime` 本身应该拥有的职责。

### 3. `editor-scene` 还要再次做 planning

`runtime/model.ts` 里的：

- `readGraphPlanScope`
- `readViewPatchScope`

实际上又把 `InputDelta` 翻译成真正的 phase scope。

这说明当前 `InputDelta` 不是最终语义，只是中间语义。

### 4. API 面不干净

当前 public surface 实际上暗含了两个错误方向：

1. `editor` 要懂 `editor-scene` 的脏区模型
2. `editor-scene` 要接受一个已经被上游“预编译”过的 delta

长期会导致：

- 无法继续收缩 scene contract
- source 变化与 render invalidation 混在一起
- 新增一种 scene render/hit/query 后，上游 `editor` 也要跟着改 delta 组装

这不是好边界。

---

## 最终原则

最终态固定为下面四条原则。

### 1. source contract 必须只表达 source 自己的变化

source change 只能表达：

- document 变了
- selection 变了
- hover 变了
- preview 变了
- edit 变了
- interaction mode 变了
- chrome flag 变了
- tool 变了
- viewport/view 变了
- clock tick 了

source change 不允许直接表达：

- 哪些 edge static 需要重算
- 哪些 label/mask/active 需要重算
- 哪些 render chunk 需要刷新

这些都属于 `editor-scene` 内部 planning。

### 2. `editor-scene` 必须拥有唯一的 invalidation planning

所有：

- graph dirty planning
- spatial dirty planning
- view dirty planning
- render dirty planning

都必须在 `editor-scene` 内部完成。

上游只能提供 source state 与 source change。

### 3. `editor` 不保留 scene orchestrator 层

`editor` 最终不应该维护：

- scene adapter
- scene orchestrator
- scene delta builder
- scene flush scheduler

这些都属于 `editor-scene runtime`。

### 4. `editor-scene` runtime 直接绑定 source

最终不是：

- `editor` 手工 `runtime.update(input)`

而是：

- `editor-scene runtime` 自己订阅 source
- 自己聚合 pending source change
- 自己 flush
- 自己调用 projection runtime

---

## 最终 API 设计

## 1. `editor-scene` 对外 runtime

最终 public API 收敛为：

```ts
createEditorSceneRuntime({
  measure?,
  nodeCapability?,
  source
}): EditorSceneRuntime
```

不再接收：

- `Input`
- `InputDelta`
- `mark(delta)`
- `flush()` 这类由 `editor` 主导的桥接输入

如果内部仍需要 flush / schedule，它属于 runtime 内部实现，不属于上游 contract。

---

## 2. `source` 最终 contract

最终只保留一个 source binding：

```ts
type EditorSceneSource = {
  get(): EditorSceneSourceSnapshot
  subscribe(listener: (change: EditorSceneSourceChange) => void): () => void
}
```

其中：

```ts
type EditorSceneSourceSnapshot = {
  document: {
    publish: EnginePublish
  }
  session: {
    tool: ToolState
    selection: SelectionTarget
    edit: EditSession | null
    preview: EditorInputPreviewState
  }
  interaction: {
    hover: EditorHoverState
    mode: EditorInteractionMode
    chrome: boolean
  }
  view: {
    zoom: number
    center: Point
    worldRect: Rect
  }
  clock: {
    now: number
  }
}
```

关键点：

1. `source.get()` 返回 source 自己的真实快照
2. `view` 并入 source，不再作为单独 `view: () => ...` 参数存在
3. `document` 直接使用 `EnginePublish`
4. `preview` 保持 editor 原生结构，不在上游预先翻译成 scene preview maps

这才是“最 source”的 contract。

---

## 3. `source change` 最终 contract

最终 `EditorSceneSourceChange` 只表达 source slice changed：

```ts
type EditorSceneSourceChange = {
  document?: true
  session?: {
    tool?: true
    selection?: true
    edit?: true
    preview?: true
  }
  interaction?: {
    hover?: true
    mode?: true
    chrome?: true
  }
  view?: true
  clock?: true
}
```

约束如下：

1. 不再传 `preview.nodes/edges/mindmaps`
2. 不再传 `draft.edges`
3. 不再传 `clock.mindmaps`
4. 不再传任何 touched id set
5. 不再传任何 render-layer 语义字段

如果 `editor-scene` 需要 touched ids，它应该在内部通过 `previous source snapshot + next source snapshot` 自己算。

---

## 4. `editor-scene` 内部输入模型

`editor-scene` 内部仍然可以保留一个 projection input，但它必须变成 runtime 私有模型，不再由 `editor` 构造。

例如：

```ts
type SceneSourceInput = {
  previous: EditorSceneSourceSnapshot | null
  current: EditorSceneSourceSnapshot
  change: EditorSceneSourceChange
}
```

这个结构只能存在于 `editor-scene` 内部。

它的职责是：

1. 作为 projection runtime 的真实输入
2. 让 planning 能同时看到 previous/current
3. 让 internal resolver 可以自己计算 touched ids / changed previews / changed edit targets

---

## 5. `editor-scene` 内部 planning

最终 planning 分两层。

### 5.1 source change -> source dirty facts

在 `editor-scene` 内部先统一得到 source dirty facts：

```ts
type SceneSourceDirty = {
  document?: EngineDelta
  selectionChanged: boolean
  toolChanged: boolean
  editChanged: boolean
  previewChanged: boolean
  hoverChanged: boolean
  interactionModeChanged: boolean
  chromeChanged: boolean
  viewChanged: boolean
  clockChanged: boolean
}
```

这是 source 语义，不是 render 语义。

### 5.2 source dirty facts -> phase scope

然后再由 `editor-scene` 内部把 source dirty facts 转成：

- graph scope
- spatial scope
- view scope

需要 touched ids 的地方，统一在这一层内部自己算。

例如：

- preview edge patch 改了哪些 edge
- edit 从哪个 node/edge 切到哪个 node/edge
- hover 从哪个 target 切到哪个 target
- mindmap enter animation 当前 tick 影响哪些 node

这些都不应该由 `editor` 提前算好。

---

## 6. preview / edit / hover 的最终下沉原则

### 6.1 preview

最终：

- `editor` 只提供 `EditorInputPreviewState`
- `editor-scene` 自己解析：
  - node preview patch
  - edge preview patch
  - draw preview
  - marquee
  - guides
  - mindmap preview

所以当前 `projection/adapter.ts` 里的：

- `readNodePreviews`
- `readEdgePreviews`
- `readDrawPreview`
- `readMindmapPreview`
- `readPreviewNodeIds`
- `readPreviewEdgeIds`
- `readPreviewMindmapIds`
- `readChangedPreviewEdgeIds`

都不应该留在 `editor`。

### 6.2 edit

最终：

- `editor` 只提供 `EditSession | null`
- `editor-scene` 自己决定 edit 改动影响哪些 graph/view entities

所以当前：

- `readEditedNodeIds`
- `readEditedEdgeIds`

也不应该留在 `editor`。

### 6.3 hover / interaction

最终：

- `editor` 只提供原始 hover / mode / chrome
- `editor-scene` 自己解析 scene hover / drag / editing-edge state

所以当前 `readInteractionHover`、`readDragState`、`readInteractionEditingEdge` 也应该下沉到 `editor-scene`。

---

## 最终模块边界

## 1. `whiteboard-editor`

最终只保留 source owner 与 source binding：

- engine
- session
- interaction
- viewport
- measure
- node capability

以及：

- `createEditorSceneSource(...)`

最终不再保留：

- `projection/adapter.ts`
- `scene/orchestrator.ts`

---

## 2. `whiteboard-editor-scene`

最终新增并固定：

- `contracts/source.ts`
  - `EditorSceneSource`
  - `EditorSceneSourceSnapshot`
  - `EditorSceneSourceChange`
- `runtime/source.ts`
  - runtime 内部 source subscription / pending aggregation / flush
- `model/source/*`
  - source parsing / source diff / touched-id derivation
- `model/plan/*`
  - source dirty -> graph/view/spatial scope

最终 `editor-scene` 才是唯一合法的 source -> scene planner。

---

## 删除清单

以下旧实现最终必须删除。

### 1. `whiteboard-editor`

删除：

- `whiteboard/packages/whiteboard-editor/src/projection/adapter.ts`
- `whiteboard/packages/whiteboard-editor/src/scene/orchestrator.ts`

删除原因：

- 它们只是 source -> scene 中转层
- 不是 editor 领域能力

### 2. `whiteboard-editor-scene`

删除：

- `whiteboard/packages/whiteboard-editor-scene/src/contracts/change.ts`

删除原因：

- 当前 `sceneInputChangeSpec` 是 scene-shaped delta contract
- 最终不再由上游传 scene delta

如果内部仍需要 change spec，应改为 runtime 私有 `sourceChangeSpec`，不作为 public contract 暴露。

### 3. `editor-scene` public input types

删除或改为 internal：

- `Input`
- `InputDelta`
- `DocumentInput`
- `SessionInput`
- `InteractionInput`
- `ClockInput`

原因：

- 这些类型当前是“给 editor 用来喂 scene”的桥接输入
- 最终 runtime 直接绑定 source，不再暴露手工喂 input 的 public API

---

## 最终实施方案

## 阶段 1：建立 source contract

新增：

- `whiteboard/packages/whiteboard-editor-scene/src/contracts/source.ts`

定义最终 public contract：

- `EditorSceneSource`
- `EditorSceneSourceSnapshot`
- `EditorSceneSourceChange`

要求：

- 只允许 source slice change
- 不允许 touched ids
- 不允许 render invalidation 字段

---

## 阶段 2：在 editor 内只保留 source binding

新增：

- `whiteboard/packages/whiteboard-editor/src/scene/source.ts`

固定导出：

```ts
createEditorSceneSource({
  engine,
  session
}): EditorSceneSource
```

这个模块只做两件事：

1. `get()` 读取当前 source snapshot
2. `subscribe()` 发送 source slice changed

严格禁止：

- 组 touched ids
- 组 preview node/edge/mindmap delta
- 组 scene graph/view/render dirty flags

---

## 阶段 3：`editor-scene runtime` 接管 orchestrator

修改：

- `whiteboard/packages/whiteboard-editor-scene/src/runtime/createEditorSceneRuntime.ts`

改为：

```ts
createEditorSceneRuntime({
  measure?,
  nodeCapability?,
  source
})
```

在 runtime 内部完成：

1. 订阅 `source.subscribe`
2. 聚合 pending source change
3. 读取 previous/current source snapshot
4. 构造 internal projection input
5. schedule + flush

完成后删除 `editor` 侧 orchestrator。

---

## 阶段 4：source parsing 全部下沉到 editor-scene

把下面这些能力从 `whiteboard-editor` 迁移到 `whiteboard-editor-scene`：

- preview parsing
- hover parsing
- drag parsing
- edited target parsing
- preview touched id derivation
- active mindmap tick id derivation
- scene preview model materialization

对应删除：

- `whiteboard/packages/whiteboard-editor/src/projection/adapter.ts`

---

## 阶段 5：改写 planning

修改：

- `whiteboard/packages/whiteboard-editor-scene/src/runtime/model.ts`

要求：

1. `readGraphPlanScope` 输入改为 source snapshots + source change
2. `readViewPatchScope` 输入改为 source snapshots + source change
3. touched ids 全部在内部自己解析
4. 任何 render invalidation 都不得由上游直接传入

---

## 阶段 6：清理 public API

从 `whiteboard-editor-scene` public export 删除：

- `Input`
- `InputDelta`
- `sceneInputChangeSpec`

保留：

- `createEditorSceneRuntime`
- `EditorSceneSource`
- query / surface / runtime read contract

---

## 最终验收标准

完成后必须同时满足：

1. `whiteboard-editor` 不再 import `InputDelta`
2. `whiteboard-editor` 不再 import `sceneInputChangeSpec`
3. `whiteboard-editor` 不再存在 scene delta assembly
4. `whiteboard-editor` 不再存在 scene orchestrator
5. `whiteboard-editor` 不再存在 projection adapter
6. `editor-scene` public API 不再要求手工 `update(input)`
7. `editor-scene` 自己持有 source -> phase scope planning
8. preview / edit / hover / mindmap tick 的 touched-id derivation 全部下沉到 `editor-scene`
9. source contract 里不再出现 `preview.nodes/edges/mindmaps` 这类 scene-shaped 字段
10. source contract 里不再出现 `draft.edges`、`clock.mindmaps` 这类 render-oriented dirty 字段

---

## 最终判断

对 `editor-scene` 来说，最优设计不是“editor 组 scene delta 再传进来”，而是：

1. `editor` 只暴露 source
2. `editor-scene` 直接绑定 source
3. `editor-scene` 内部独占 planning / invalidation / flush

这条线比当前方案更好，原因只有一个：

- 它把 source state 与 scene dirty planning 的职责彻底分开了

这就是最终态。
