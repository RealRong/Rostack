# Whiteboard Editor Runtime 最终重构方案

## 1. 最终结论

这份文档直接给出 `whiteboard/packages/whiteboard-editor` 的最终运行时方案，不保留兼容层，不保留候选版本。

最终结论只有六条：

1. editor 内部只保留一套真正的依赖图：`EditorServices`。
2. `createEditor()` 只做两件事：创建 `EditorServices`，再把它投影为公开 `Editor`。
3. `local` 退回纯本地状态中心，只保留 `source + mutate`，不再依赖 `query/layout`。
4. `query` 只做只读推导，`commands` 只做持久写，`actions` 成为唯一高层编排层。
5. `input` 从 `actions` 中独立出来，变成单独的 `EditorInputHost`。
6. `facade` 作为业务装配概念彻底删除，`events` 只保留 `change` 和 `dispose`。

这就是最终抉择。

---

## 2. 当前根问题

现在的复杂度不是来自单个功能，而是同一批依赖被重复切了很多次。

当前代码里最明显的重复切片有：

- `createCommandRuntime(...)`
- `createEditorInput(...)`
- `createEditorFacade(...)`
- `createEditorState(...)`
- `createEditor.ts` 里手工拼的 `inputLocal` / `interactionContext`

它们围绕的其实始终是同一批东西：

- `engine`
- `local`
- `layout`
- `query`
- `snap`
- `command`

当前真正的根问题有四个：

### 2.1 `local` 职责混杂

`local` 现在既持有本地状态，又提供依赖 `query/layout` 的业务 action，于是不得不出现：

- `bindQuery(...)`
- `bindLayout(...)`
- `reconcileAfterCommit(...)`

这说明 `local` 已经不是纯状态中心。

### 2.2 `query` 和 `local` 形成隐式闭环

当前 `query` 依赖 `local`，而 `local.actions.*` 又依赖 `query/layout`，所以只能靠后绑定把环藏起来。

这不是“写法问题”，而是边界切错了。

### 2.3 public API 混了两种完全不同的东西

现在的 `editor.actions` 同时包含：

- 语义动作
- host 输入入口

典型例子是：

```ts
editor.actions.interaction.pointerDown(...)
```

这本质上不是 action，而是 host event dispatch。

### 2.4 facade 实际承载了业务

当前 `facade.ts` 不只是投影层，它还承担：

- edit commit/cancel 语义
- engine commit 订阅
- local reset/reconcile
- dispose listener
- public action 拼装

这意味着 facade 不是 facade，而是隐藏的运行时中轴。

最终必须把这些职责拆回真正该在的位置。

---

## 3. 最终目标

最终目标不是“把代码拆得更细”，而是把 editor 收敛成一条清楚的中轴：

```txt
engine
  -> local
  -> layout
  -> query
  -> commands

local + query + layout + commands + snap
  -> actions

services
  -> input deps projection
  -> store projection
  -> read projection
  -> events projection

input deps
  -> input host
```

严格规则如下：

- `local` 不能依赖 `query`
- `local` 不能依赖 `layout`
- `commands` 不能依赖 `local`
- `projection` 不能携带业务逻辑
- `input` 不能挂在 `actions` 里
- `selection/clipboard` 不能再留在 `commands`

---

## 4. 最终内部 API

## 4.1 `CreateEditorInput`

```ts
export type CreateEditorInput = {
  engine: Engine
  registry: NodeRegistry
  initialTool: Tool
  initialViewport: Viewport
  initialDrawState?: DrawState
  services?: {
    layout?: LayoutBackend
  }
}
```

这里不再继续扩散装配参数，`createEditor()` 的输入只保留真正外部依赖。

---

## 4.2 `EditorServices`

`EditorServices` 是内部唯一服务图，不对外公开。

```ts
export type EditorServices = {
  engine: Engine
  local: EditorLocal
  layout: EditorLayout
  query: EditorQuery
  snap: EditorSnap
  commands: EditorCommands
  actions: EditorActions
  lifecycle: EditorLifecycle
}
```

约束：

- editor 内部长期存在的服务，只允许挂在这里
- 不允许再出现第二套平行 runtime 聚合概念
- `EditorServices` 是内部 graph，不是 public API

---

## 4.3 `EditorLocal`

`local` 的最终职责只有两类：

1. 持有本地状态源
2. 提供纯本地 mutate

它不再负责：

- capability/read 判定
- layout 计算
- 选择语义编排
- edit commit/cancel 语义
- 任何依赖 `query/layout` 的动作

```ts
export type EditorLocal = {
  source: EditorLocalSource
  mutate: EditorLocalMutate
  viewport: ViewportRuntime
  interaction: InteractionRuntime
  hover: HoverStore
  feedback: EditorFeedbackRuntime
  reset: () => void
}
```

### `EditorLocalSource`

```ts
export type EditorLocalSource = {
  tool: ReadStore<Tool>
  draw: ReadStore<DrawState>
  selection: ReadStore<SelectionTarget>
  edit: ReadStore<EditSession | null>
  pointer: ReadStore<PointerSample | null>
  space: ReadStore<boolean>
}
```

### `EditorLocalMutate`

```ts
export type EditorLocalMutate = {
  tool: {
    set: (tool: Tool) => void
  }
  draw: {
    set: (state: DrawState) => void
    slot: (slot: DrawSlot) => void
    patch: (patch: BrushStylePatch) => void
  }
  selection: {
    replace: (input: SelectionInput) => boolean
    add: (input: SelectionInput) => boolean
    remove: (input: SelectionInput) => boolean
    toggle: (input: SelectionInput) => boolean
    clear: () => boolean
  }
  edit: {
    set: (session: EditSession) => void
    input: (text: string) => void
    layout: (patch: Partial<EditLayout>) => void
    caret: (caret: EditCaret) => void
    status: (status: EditStatus) => void
    clear: () => void
  }
  pointer: {
    set: (sample: PointerSample) => void
    clear: () => void
  }
  space: {
    set: (value: boolean) => void
  }
}
```

关键点：

- `local` 不再暴露 `state + stores` 双套接口
- `local.actions.*` 这个概念整体删除
- `bindQuery()` / `bindLayout()` 整体删除
- `reconcileAfterCommit()` 整体删除

commit 后的 reconcile 放到 `lifecycle` 里显式做，不再藏在 `local`。

---

## 4.4 `EditorQuery`

`query` 是只读推导层，只依赖：

- engine committed state
- local source
- layout

它不负责：

- 写入
- side effect
- orchestration

```ts
export type EditorQuery = {
  document: EngineRead['document']
  frame: EngineRead['frame']
  group: EngineRead['group']
  scene: EngineRead['scene']
  slice: EngineRead['slice']
  history: ReadStore<HistoryState>
  target: RuntimeTargetRead
  node: NodePresentationRead
  edge: EdgePresentationRead
  mindmap: MindmapPresentationRead
  selection: {
    model: SelectionModelRead
    presentation: SelectionRead
  }
  tool: ToolRead
  draw: ReadStore<DrawState>
  space: ReadStore<boolean>
  viewport: {
    get: () => Viewport
    subscribe: (listener: () => void) => Unsubscribe
    pointer: ViewportRuntime['read']['pointer']
    worldToScreen: ViewportRuntime['read']['worldToScreen']
    screenPoint: ViewportRuntime['input']['screenPoint']
    size: ViewportRuntime['input']['size']
  }
  feedback: {
    node: EditorFeedbackRuntime['selectors']['node']
    draw: EditorFeedbackRuntime['selectors']['draw']
    marquee: EditorFeedbackRuntime['selectors']['marquee']
    mindmapPreview: EditorFeedbackRuntime['selectors']['mindmapPreview']
    edgeGuide: EditorFeedbackRuntime['selectors']['edgeGuide']
    snap: EditorFeedbackRuntime['selectors']['snap']
  }
}
```

关键点：

- `QueryRuntime = { read, selectionModel }` 这种包一层再拆一层的结构删除
- `selectionModel` 直接收进 `query.selection.model`
- public `read` 只是 `query` 的投影，不再有额外业务

---

## 4.5 `EditorCommands`

`commands` 只负责持久写。

它可以做：

- 调 engine 写接口
- 做 layout-aware patch/create 修正
- 做 document 级持久写

它不可以做：

- selection side effect
- edit side effect
- local 状态更新
- clipboard 编排

```ts
export type EditorCommands = {
  document: DocumentCommands
  node: NodeCommands
  edge: EdgeCommands
  mindmap: MindmapCommands
  history: HistoryCommands
}
```

明确删除：

- `command.selection`
- `command.clipboard`

因为它们本质上不是“持久写中轴”，而是 editor 语义动作。

---

## 4.6 `EditorActions`

`actions` 是 editor 唯一的高层编排层。

它依赖：

- `local`
- `query`
- `layout`
- `commands`
- `snap`
- `engine` 的少量只读/配置能力

它负责所有“先读当前 editor 语义，再做本地变化或持久写”的事情。

```ts
export type EditorActions = {
  app: AppActions
  tool: ToolActions
  viewport: EditorViewportActions
  draw: DrawCommands
  selection: EditorSelectionActions
  edit: EditorEditActions
  node: EditorNodeActions
  edge: EditorEdgeActions
  mindmap: EditorMindmapActions
  clipboard: ClipboardActions
  history: EditorHistoryActions
}
```

### `EditorSelectionActions`

```ts
export type EditorSelectionActions = {
  replace: (input: SelectionInput) => void
  add: (input: SelectionInput) => void
  remove: (input: SelectionInput) => void
  toggle: (input: SelectionInput) => void
  clear: () => void
  selectAll: () => void
  frame: () => void
  order: (input: SelectionOrderInput) => void
  group: () => void
  ungroup: () => void
  delete: () => void
  duplicate: () => void
}
```

### `EditorEditActions`

```ts
export type EditorEditActions = {
  startNode: (
    nodeId: NodeId,
    field: EditField,
    options?: { caret?: EditCaret }
  ) => void
  startEdgeLabel: (
    edgeId: EdgeId,
    labelId: string,
    options?: { caret?: EditCaret }
  ) => void
  input: (text: string) => void
  layout: (patch: Partial<EditLayout>) => void
  caret: (caret: EditCaret) => void
  cancel: () => void
  commit: () => void
}
```

关键点：

- public `editor.actions` 直接来自 `services.actions`
- 不再在 `facade` 里临时拼装 edit/selection/clipboard 行为
- `selection`、`clipboard` 从 `commands` 迁到 `actions`
- `actions.interaction` 整体删除

---

## 4.7 `EditorLayout`

`layout` 继续保留为中轴，不散落到 feature。

最终只做三类事：

1. 测量
2. layout-aware patch
3. preview patch 修正

```ts
export type EditorLayout = {
  text: {
    measure: (input: TextMeasureInput) => Size | undefined
  }
  node: {
    patchCreate: (input: NodeCreateInput) => NodeCreateInput
    patchUpdate: (
      nodeId: NodeId,
      update: NodeUpdateInput,
      options?: { origin?: LayoutOrigin }
    ) => NodeUpdateInput
    edit: (input: {
      nodeId: NodeId
      field: EditField
      text: string
    }) => Partial<EditLayout> | undefined
  }
  preview: {
    resolveNodePatches: (
      patches: readonly TransformPreviewPatch[]
    ) => readonly TransformPreviewPatch[]
  }
}
```

关键点：

- `layout` 只给语义层提供能力，不自己做语义编排
- `transform` 不应该手动维护 text preview 语义，只应该提交 node transform patch，再由 layout 统一修正 preview

---

## 4.8 `InteractionDeps`

`InteractionDeps` 是 input 域专用的最小依赖投影。

它不是另一套 runtime，只是从 `EditorServices` 投影出来的一份“输入期最小可用依赖”。

```ts
export type InteractionDeps = {
  read: Pick<
    EditorQuery,
    'target' | 'node' | 'edge' | 'mindmap' | 'tool' | 'space' | 'viewport' | 'feedback'
  > & {
    selection: EditorQuery['selection']['model']
  }
  local: Pick<EditorLocal, 'mutate'>
  commands: Pick<EditorCommands, 'node' | 'edge' | 'mindmap'>
  layout: EditorLayout
  snap: EditorSnap
  config: Readonly<BoardConfig>
}
```

关键点：

- `InteractionContext` 改名为 `InteractionDeps`
- 它不属于 `EditorServices`
- 它不在 `createEditor()` 里手写长篇对象字面量
- 统一改成 `projectInteractionDeps(services)`

---

## 4.9 `EditorLifecycle`

生命周期层是内部服务，不再挂在 facade 中。

```ts
export type EditorLifecycle = {
  events: EditorEvents
  dispose: () => void
}
```

它负责：

- 订阅 engine commit
- replace commit 时 reset local
- normal commit 时做 local reconcile
- 管理 dispose listeners
- 暴露最终 public events

commit reconcile 的最终语义放在 lifecycle 中显式实现：

```ts
const reconcileLocalAfterCommit = (
  local: EditorLocal,
  query: Pick<EditorQuery, 'node' | 'edge'>
) => {
  const selection = local.source.selection.get()

  const nextNodeIds = selection.nodeIds.filter(id => !!query.node.item.get(id))
  const nextEdgeIds = selection.edgeIds.filter(id => !!query.edge.item.get(id))
  const nextSelection = {
    nodeIds: nextNodeIds,
    edgeIds: nextEdgeIds
  }

  const selectionChanged = (
    nextNodeIds.length !== selection.nodeIds.length
    || nextEdgeIds.length !== selection.edgeIds.length
    || nextNodeIds.some((id, index) => id !== selection.nodeIds[index])
    || nextEdgeIds.some((id, index) => id !== selection.edgeIds[index])
  )

  if (selectionChanged) {
    local.mutate.selection.replace(nextSelection)
  }

  const edit = local.source.edit.get()
  if (!edit) {
    return
  }

  if (edit.kind === 'node' && !query.node.item.get(edit.nodeId)) {
    local.mutate.edit.clear()
    return
  }

  if (edit.kind === 'edge-label' && !query.edge.item.get(edit.edgeId)) {
    local.mutate.edit.clear()
  }
}
```

核心意思只有一条：

- lifecycle 负责 commit 后的运行时修正
- local 只负责状态，不再自己做 commit-aware 业务

---

## 5. 最终公开 API

公开的 `Editor` 不是服务图原样暴露，而是稳定投影结果。

```ts
export type Editor = {
  store: EditorStore
  read: EditorRead
  actions: EditorActions
  input: EditorInputHost
  events: EditorEvents
}
```

---

## 5.1 `EditorStore`

`store` 只暴露本地状态订阅，不暴露业务。

```ts
export type EditorStore = {
  tool: ReadStore<Tool>
  draw: ReadStore<DrawState>
  edit: ReadStore<EditSession | null>
  selection: ReadStore<SelectionTarget>
  interaction: ReadStore<EditorInteractionState>
  viewport: ReadStore<Viewport>
}
```

它只依赖：

- `services.local.source`
- `services.local.interaction`
- `services.local.viewport`

不允许带业务逻辑。

---

## 5.2 `EditorRead`

`read` 是 public projection，不是第二套 query runtime。

```ts
export type EditorRead = {
  document: Pick<EditorQuery['document'], 'background' | 'bounds'>
  group: Pick<EditorQuery['group'], 'exactIds'>
  history: EditorQuery['history']
  mindmap: Pick<EditorQuery['mindmap'], 'render'>
  node: Pick<EditorQuery['node'], 'render'>
  edge: Pick<EditorQuery['edge'], 'render' | 'selectedChrome'>
  scene: Pick<EditorQuery['scene'], 'list'>
  selection: Pick<EditorQuery['selection']['presentation'], 'node' | 'box'>
  tool: EditorQuery['tool']
  viewport: EditorQuery['viewport']
  chrome: ReadStore<EditorChromePresentation>
  panel: ReadStore<EditorPanelPresentation>
}
```

它只依赖 `services.query`。

---

## 5.3 `EditorInputHost`

`input` 是 host 事件入口，不是 action。

```ts
export type EditorInputHost = {
  contextMenu: (input: ContextMenuInput) => ContextMenuIntent | null
  pointerDown: (input: PointerDownInput) => EditorPointerDispatchResult
  pointerMove: (input: PointerMoveInput) => boolean
  pointerUp: (input: PointerUpInput) => boolean
  pointerCancel: (input: { pointerId: number }) => boolean
  pointerLeave: () => void
  wheel: (input: WheelInput) => boolean
  cancel: () => void
  keyDown: (input: KeyboardInput) => boolean
  keyUp: (input: KeyboardInput) => boolean
  blur: () => void
}
```

最终公开调用方式必须是：

```ts
editor.input.pointerDown(...)
```

而不是：

```ts
editor.actions.interaction.pointerDown(...)
```

---

## 5.4 `EditorEvents`

最终只保留：

```ts
export type EditorEvents = {
  change: (
    listener: (document: Document, commit: Commit) => void
  ) => Unsubscribe
  dispose: (listener: () => void) => Unsubscribe
}
```

明确删除：

- `events.history`
- `events.selection`

因为这两个只是把现有 store/read 的订阅再转发一遍，没有独立价值。

---

## 6. 最终装配方式

## 6.1 `createEditorServices(...)`

```ts
export const createEditorServices = (
  input: CreateEditorInput
): EditorServices => {
  const local = createEditorLocal({
    initialTool: input.initialTool,
    initialDrawState: input.initialDrawState ?? DEFAULT_DRAW_STATE,
    initialViewport: input.initialViewport,
    registry: input.registry
  })

  const layout = createEditorLayout({
    committedNodeRead: input.engine.read.node.item,
    registry: input.registry,
    backend: input.services?.layout
  })

  const query = createEditorQuery({
    engineRead: input.engine.read,
    history: input.engine.history,
    registry: input.registry,
    local,
    layout
  })

  const snap = createEditorSnap({
    engineRead: input.engine.read,
    query,
    local
  })

  const commands = createEditorCommands({
    engine: input.engine,
    query,
    layout
  })

  const actions = createEditorActions({
    engine: input.engine,
    registry: input.registry,
    local,
    query,
    layout,
    snap,
    commands
  })

  const lifecycle = createEditorLifecycle({
    engine: input.engine,
    local,
    query
  })

  return {
    engine: input.engine,
    local,
    layout,
    query,
    snap,
    commands,
    actions,
    lifecycle
  }
}
```

这段装配里有三条硬约束：

1. 不再有 `bindQuery(...)`
2. 不再有 `bindLayout(...)`
3. 不再在 `createEditor()` 中手写输入期上下文对象

---

## 6.2 `projectEditor(...)`

projection 必须纯粹，不得混业务。

```ts
export const projectEditor = (
  services: EditorServices
): Editor => ({
  store: projectEditorStore(services),
  read: projectEditorRead(services),
  actions: services.actions,
  input: createEditorInputHost(
    projectInteractionDeps(services)
  ),
  events: services.lifecycle.events
})
```

这意味着 `projectEditor(...)` 中禁止出现：

- commit subscribe
- reset/reconcile
- edit action 拼装
- clipboard action 拼装
- dispose listener 管理

一律不允许。

---

## 6.3 `createEditor(...)`

```ts
export const createEditor = (
  input: CreateEditorInput
): Editor => {
  const services = createEditorServices(input)
  return projectEditor(services)
}
```

`createEditor()` 到这里就结束，不再承担任何别的运行时业务。

---

## 7. 文件结构

最终建议文件布局如下：

```txt
whiteboard/packages/whiteboard-editor/src/
  editor/
    createEditor.ts
    services.ts
    project.ts
    store.ts
    read.ts
    events.ts

  local/
    runtime.ts
    source.ts
    mutate.ts
    ...

  query/
    index.ts
    ...

  command/
    index.ts
    ...

  action/
    index.ts
    ...

  lifecycle/
    index.ts

  layout/
    runtime.ts
    policy.ts
    backend.ts

  input/
    ...
```

各文件职责固定为：

- `editor/services.ts`
  - 创建内部 `EditorServices`
- `editor/project.ts`
  - `EditorServices -> Editor`
- `editor/store.ts`
  - public store projection
- `editor/read.ts`
  - public read projection
- `editor/events.ts`
  - events projection type / helpers
- `lifecycle/index.ts`
  - commit subscribe / reconcile / dispose

明确删除：

- `editor/facade.ts`

---

## 8. 需要删除的概念

下面这些概念直接判定为多余，最终都应删除：

- `createEditorFacade(...)`
- `local.actions.*`
- `state + stores` 双接口
- `bindQuery(...)`
- `bindLayout(...)`
- `reconcileAfterCommit(...)`
- `QueryRuntime = { read, selectionModel }`
- `actions.interaction`
- `command.selection`
- `command.clipboard`
- `events.history`
- `events.selection`
- `InteractionContext` 这个命名

统一收敛后，只保留：

- `services`
- `local`
- `query`
- `commands`
- `actions`
- `input`
- `lifecycle`

---

## 9. 实施阶段

## 阶段 1：收纯 `local`

目标：

- 改成 `source + mutate`
- 去掉所有 `local.actions.*`
- 去掉 `bindQuery/bindLayout`

验收：

- `local` 对 `query/layout` 的直接依赖归零

---

## 阶段 2：收纯 `commands`

目标：

- `selection` 从 command 移出
- `clipboard` 从 command 移出
- node/edge/mindmap command 内的 local/session side effect 移出

验收：

- `commands` 成为纯持久写层

---

## 阶段 3：建立 `actions`

目标：

- 新增 `createEditorActions(...)`
- 所有需要“读当前 editor，再改 local 或写 engine”的语义集中到 actions

验收：

- public `editor.actions` 直接指向 `services.actions`

---

## 阶段 4：建立 `lifecycle`

目标：

- 把 commit subscribe / reconcile / dispose listener 全部移出 facade/projection

验收：

- projection 不再携带 side effect

---

## 阶段 5：改 public API

目标：

- 删除 `actions.interaction`
- 新增 `editor.input`
- 删除 `events.history/events.selection`

验收：

- 公开 API 只剩五块：`store/read/actions/input/events`

---

## 10. 最终验收标准

全部完成时，必须同时满足：

1. `createEditor()` 只负责创建 services 并投影 editor。
2. editor 内部只有一套服务图：`EditorServices`。
3. `facade` 完全删除。
4. `local` 只保留 `source + mutate`，不依赖 `query/layout`。
5. `query` 只做只读推导。
6. `commands` 只做持久写。
7. `actions` 成为唯一高层编排层。
8. `input` 从 `actions` 中独立。
9. `InteractionDeps` 只是 projection，不是 runtime。
10. `events` 只保留 `change` 和 `dispose`。

这就是最终长期最优方案，也是后续代码重构的唯一实施依据。
