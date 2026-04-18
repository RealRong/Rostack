# Whiteboard Editor 运行时与 Input 中轴最终重构方案

这份文档给出 `whiteboard/packages/whiteboard-editor` 的最终运行时方案。

它直接覆盖此前关于 runtime decycle、input simplification、input centralization 的讨论，作为后续一次性重构的唯一依据。

结论只有一个版本，不保留兼容，不保留候选设计。

## 1. 最终结论

最终结构固定为九个内部中轴：

1. `engine`
2. `local`
3. `input`
4. `preview`
5. `layout`
6. `query`
7. `commands`
8. `actions`
9. `lifecycle`

公开 `Editor` 只保留五个出口：

1. `store`
2. `read`
3. `actions`
4. `input`
5. `events`

最终必须同时满足下面九条规则：

1. `local` 只保留编辑器本地语义状态，不再持有 interaction runtime、hover、pointer、space。
2. `input` 负责全部 host event dispatch、session 生命周期、hover 与 pointer 输入态。
3. `preview` 从 `local.feedback` 提升为独立服务，统一组合 base preview、active gesture、hover preview。
4. `query` 只读 `engine + local + input.state + preview + layout`，不再读 `local.interaction`。
5. `projectEditor()` 只能做投影，不能再创建 `edgeHover`、`input host` 或任何 runtime。
6. `projectInteractionDeps()` 整体删除，不再为 input 再造一层上下文翻译。
7. `local.bindInteractions()` 整体删除，interaction binding 不再挂到 `local` 上。
8. `input/core/context.ts` 删除，feature 直接消费 `EditorServices` 或文件内局部 `Pick<EditorServices, ...>`。
9. `createEditor()` 的装配顺序固定，不再靠后绑定和 mutable slot 绕循环依赖。

这就是最终抉择。

## 2. 当前根问题

现在最怪的地方不是某一个函数命名，而是依赖图本身被切错了。

当前代码的核心问题有五个。

### 2.1 `local` 被塞进了不属于它的东西

当前 `EditorLocal` 里有：

- `interaction`
- `hover`
- `feedback`
- `bindInteractions()`
- `pointer`
- `space`

这里至少混了三类完全不同的职责：

- 编辑器本地语义状态
- 输入运行时状态
- 输入预览组合状态

这会直接导致 `local` 既像 state store，又像 input runtime container，还像 preview service container。

这是第一个根错误。

### 2.2 `query` 和 `interaction` 形成了真环

当前依赖链实际上是：

```txt
query -> interaction.mode / interaction.chrome
interaction bindings -> query
```

于是代码只能走下面这种旁路：

```ts
local.bindInteractions(
  createEditorInteractions(
    projectInteractionDeps(servicesRuntime)
  )
)
```

这不是实现细节问题，而是依赖图本身错误。

只要 `query` 读取 interaction，而 interaction 又依赖 query，就不能靠“继续优化 helper”解决。

### 2.3 `projectInteractionDeps()` 没有独立语义

它当前做的事情本质上只是把：

- `services.actions.tool.set`
- `services.actions.selection.replace`
- `services.actions.edit.startNode`
- `services.local.viewport.input.panScreenBy`

重新包成一个 `InteractionDeps.local`。

这只是翻译层，不是边界。

它不消除复杂度，只把复杂度藏起来。

### 2.4 `projectEditor()` 已经不是 projection

当前 `projectEditor()` 里还在创建：

- `interactionDeps`
- `edgeHover`
- `createEditorInputHost(...)`

这说明 `project` 层已经不只是 “services -> public editor” 的投影，而是在继续承担运行时装配。

这也是职责泄漏。

### 2.5 `local.feedback` 实际上不是 local state

现在的 `feedback` 同时依赖：

- active gesture
- hover state
- viewport
- command 写入的 mindmap preview

它本质上是 preview composition service，不是 local source/mutate 的一部分。

把它继续塞在 `local` 里，只会让 `local` 的定义越来越不纯。

## 3. 最终依赖图

最终依赖图固定如下：

```txt
engine
  -> local
  -> input.state
  -> preview
  -> layout
  -> query
  -> snap
  -> commands
  -> actions
  -> lifecycle
  -> input.host
  -> projectEditor()
```

更精确一点：

```txt
engine
local
input.state
preview
layout
  -> query

query
  -> snap

engine + query + layout + local + preview
  -> commands

engine + query + layout + commands + local + preview
  -> actions

engine + local + query + input.state + preview
  -> lifecycle

engine + local + input.state + preview + layout + query + snap + commands + actions
  -> input.host

all services
  -> projectEditor()
```

这里最关键的断环动作有两个：

1. `query` 改为依赖 `input.state`，不再依赖 interaction runtime。
2. `input.host` 最后创建，并直接消费 `EditorServices`，不再通过 `projectInteractionDeps()` 适配。

## 4. 最终职责切分

## 4.1 `engine`

`engine` 是唯一持久态来源。

它负责：

- document
- committed node/edge/mindmap 数据
- history
- scene/index read
- persistent commit

它不负责：

- selection
- edit session
- tool
- viewport
- input state
- preview

## 4.2 `local`

`local` 最终退回纯编辑器本地语义状态中心。

它只保留：

- `tool`
- `draw`
- `selection`
- `edit`
- `viewport`

它不再保留：

- `interaction`
- `hover`
- `feedback`
- `pointer`
- `space`
- `bindInteractions`

也就是说，`local` 的定义必须重新变成：

```ts
export type EditorLocal = {
  source: EditorLocalSource
  mutate: EditorLocalMutate
  viewport: ViewportRuntime
  reset: () => void
}
```

其中：

```ts
export type EditorLocalSource = {
  tool: ReadStore<Tool>
  draw: ReadStore<DrawState>
  selection: ReadStore<SelectionTarget>
  edit: ReadStore<EditSession | null>
}
```

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
    caret: (caret: EditCaret) => void
    layout: (patch: Partial<EditLayout>) => void
    status: (status: EditStatus) => void
    clear: () => void
  }
}
```

`local.reset()` 只负责清理：

- selection
- edit

它不再顺手清 `hover`、`interaction`、`preview`。

## 4.3 `input`

`input` 是一个独立服务，不再挂在 `local` 名下。

它内部再固定拆成两部分：

1. `input.state`
2. `input.host`

### `input.state`

`input.state` 是 query/store/presentation 可以读取的只读输入态。

```ts
export type EditorInputState = {
  mode: ReadStore<InputMode>
  busy: ReadStore<boolean>
  chrome: ReadStore<boolean>
  gesture: ReadStore<ActiveGesture | null>
  pointer: ReadStore<PointerSample | null>
  space: ReadStore<boolean>
  hover: Pick<HoverStore, 'get' | 'subscribe'>
}
```

它只负责“当前输入生命周期的只读快照”。

它不负责：

- host event API
- context menu 语义
- wheel fallback

这里的 `hover` 指的是只读 hover 状态面，不是 hover 逻辑本身。

hover 计算与写入仍然属于 `input.host` 内部。

### `input.host`

`input.host` 是公开给 React/host 的输入入口。

它继续实现当前的 `EditorInputHost`：

```ts
export type EditorInput = {
  state: EditorInputState
  host: EditorInputHost
}
```

`host` 负责：

- pointer down/move/up/cancel/leave
- key down/up
- wheel
- blur
- contextMenu
- cancel

但 `host` 本身不再被 `projectEditor()` 创建，它必须在 `createEditorServices()` 内部装配完成。

### `input` 内部还负责两件事

1. active session runtime
2. hover service

也就是说，当前这些东西都属于 `input` 自己：

- `createInteractionRuntime(...)`
- `createEdgeHoverService(...)`
- pointer/space 写入
- bindings 列表

不再属于 `local` 或 `project`。

## 4.4 `preview`

`preview` 是从当前 `local.feedback` 正式提升出来的独立服务。

最终不再叫 `feedback runtime`，直接统一叫 `preview`。

原因很简单：

- 它不是 local source
- 它不是 input host
- 它不是 query
- 它不是 command

它的职责只有一个：

组合并投影 editor 的临时预览状态。

最终形态：

```ts
export type EditorPreview = {
  get: () => EditorPreviewState
  subscribe: (listener: (state: EditorPreviewState) => void) => Unsubscribe
  write: {
    set: (
      next:
        | PreviewBaseState
        | ((current: PreviewBaseState) => PreviewBaseState)
    ) => void
    reset: () => void
  }
  selectors: EditorPreviewSelectors
}
```

其中组合来源固定为三类：

1. `base preview`
2. `input.state.gesture`
3. `hover preview`

也就是：

```txt
final preview = compose(base preview, gesture draft, hover draft)
```

所以当前的：

- `local.feedback`
- `local.hover`

都应该退出 `local`。

`commands` 如果需要写入 mindmap insert preview，也只能写 `preview.write.*`，不再写 `local.feedback.set(...)`。

## 4.5 `layout`

`layout` 继续是 editor 对 registry/backend 的布局适配层。

它负责：

- edit layout
- preview patch resolve
- feature layout helper

它不负责：

- host input
- selection state
- preview 组合

`layout` 不需要知道 interaction runtime，只接纯数据。

## 4.6 `query`

`query` 是唯一只读聚合层。

最终它依赖：

- `engine.read`
- `registry`
- `history`
- `local`
- `input.state`
- `preview`
- `layout`

最终签名应当收敛成：

```ts
export const createEditorQuery = ({
  engineRead,
  registry,
  history,
  local,
  input,
  preview,
  layout
}: {
  engineRead: EngineRead
  registry: NodeRegistry
  history: ReadStore<HistoryState>
  local: Pick<EditorLocal, 'source' | 'viewport'>
  input: EditorInputState
  preview: EditorPreview
  layout: EditorLayout
}): EditorQuery
```

注意这里的关键点：

- `query` 不再读取 `local.interaction`
- `query` 不再读取 `local.feedback`
- `query.space` 改为读取 `input.state.space`
- selection/edge presentation 里的 mode/chrome 改为读取 `input.state.mode/chrome`

## 4.7 `commands`

`commands` 继续只做持久写。

但它可以读取：

- `engine`
- `query`
- `layout`
- `preview.write`
- `commandSession`

`commandSession` 继续保留，负责：

- selection 本地切换时顺手清 edit
- 启动 node/edge label 编辑
- edit input/layout/caret/clear

这是 editor 的局部语义编排，不属于 input。

最终：

- `commands` 不能持有 `input`
- `commands` 不能持有 host dispatch
- `commands` 不能直接依赖完整 `preview`，只应拿窄写接口

## 4.8 `actions`

`actions` 继续是唯一高层语义编排层。

它负责：

- tool
- viewport
- selection
- edit commit/cancel
- clipboard
- app

它可以依赖：

- `engine`
- `local`
- `query`
- `layout`
- `commands`
- `registry`
- `lifecycle.dispose`

但它不再承担 host 输入分发。

换句话说：

- `editor.actions` 是语义动作
- `editor.input` 是宿主输入

两者保持彻底分离。

## 4.9 `lifecycle`

`lifecycle` 只保留：

- engine commit change event
- editor dispose event
- engine commit 后的本地清理策略

它不负责：

- input bindings
- host event dispatch
- public projection

## 4.10 `project`

`projectEditor()` 的职责必须收缩成“纯投影”。

最终它只能做：

```ts
export const projectEditor = (
  services: EditorServices
): Editor => ({
  store: projectEditorStore({
    local: services.local,
    input: services.input.state
  }),
  read: projectEditorRead(services.query),
  actions: services.actions,
  input: services.input.host,
  events: services.lifecycle.events
})
```

它不能再做：

- create edge hover
- create input host
- create interaction deps
- 任何 runtime 初始化

## 5. 最终内部 API

## 5.1 `CreateEditorInput`

外部创建参数不需要继续扩散，保留当前这组即可：

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

## 5.2 `EditorServices`

`EditorServices` 是 editor 内部唯一服务图。

```ts
export type EditorServices = {
  engine: Engine
  local: EditorLocal
  input: EditorInput
  preview: EditorPreview
  layout: EditorLayout
  query: EditorQuery
  snap: SnapRuntime
  commands: EditorCommands
  actions: EditorActions
  lifecycle: EditorLifecycle
}
```

这里不再允许第二套平行 runtime graph。

不再允许：

- `facade`
- `interaction deps projection`
- `local.bindXxx(...)`

## 5.3 `createEditorServices()`

最终装配顺序固定如下：

```ts
export const createEditorServices = (
  input: CreateEditorInput
): EditorServices => {
  const local = createEditorLocal({
    initialTool: input.initialTool,
    initialDrawState: input.initialDrawState ?? DEFAULT_DRAW_STATE,
    initialViewport: input.initialViewport
  })

  const inputState = createEditorInputState()

const preview = createEditorPreview({
  viewport: local.viewport.read,
  gesture: inputState.gesture,
  hover: inputState.hover
})

  const layout = createEditorLayout({
    read: {
      node: {
        committed: input.engine.read.node.item
      }
    },
    registry: input.registry,
    backend: input.services?.layout
  })

  const query = createEditorQuery({
    engineRead: input.engine.read,
    registry: input.registry,
    history: input.engine.history,
    local,
    input: inputState,
    preview,
    layout
  })

  const snap = createSnapRuntime({
    readZoom: () => local.viewport.read.get().zoom,
    node: {
      config: input.engine.config.node,
      query: input.engine.read.index.snap.inRect
    },
    edge: {
      config: input.engine.config.edge,
      nodeSize: input.engine.config.nodeSize,
      query: query.edge.connectCandidates
    }
  })

  const commands = createEditorCommands({
    engine: input.engine,
    query,
    layout,
    preview: preview.write,
    session: createCommandSession({
      local,
      query,
      registry: input.registry,
      layout
    })
  })

  const lifecycle = createEditorLifecycle({
    engine: input.engine,
    local,
    input: inputState,
    preview,
    query
  })

  const actions = createEditorActions({
    engine: input.engine,
    local,
    query,
    layout,
    commands,
    registry: input.registry,
    dispose: lifecycle.dispose
  })

  const servicesBase = {
    engine: input.engine,
    local,
    preview,
    layout,
    query,
    snap,
    commands,
    actions,
    lifecycle
  }

  const editorInput = createEditorInput({
    ...servicesBase,
    state: inputState
  })

  return {
    ...servicesBase,
    input: editorInput
  }
}
```

这里最重要的不是语法，而是顺序：

1. 先建 `local`
2. 再建 `inputState`
3. 再建 `preview`
4. 再建 `layout`
5. 再建 `query`
6. 再建 `snap`
7. 再建 `commands`
8. 再建 `lifecycle`
9. 再建 `actions`
10. 最后建 `input.host`

顺序固定后，不再需要任何 `bindInteractions()`。

## 5.4 `createEditorInput()`

`createEditorInput()` 是 `input` 域自己的总装配函数。

它直接消费 `EditorServices` 级别的信息，不再引入 `InteractionDeps`。

```ts
export const createEditorInput = ({
  engine,
  local,
  state,
  preview,
  layout,
  query,
  snap,
  commands,
  actions
}: Omit<EditorServices, 'input'> & {
  state: ReturnType<typeof createEditorInputState>
}): EditorInput
```

内部负责：

- create input runtime
- create edge hover service
- create host
- 构建 binding 列表

这里不再需要：

- `createEditorInteractions(...)`
- `projectInteractionDeps(...)`
- `InputLocal`
- `InteractionDeps`

## 5.5 input feature API

input feature 的最终入口统一为：

```ts
export type InputBinding = {
  key: string
  start?: (input: PointerDownInput) => InputStartResult
}
```

但 binding factory 不再吃一层专门的 interaction context，而是直接吃 `EditorServices`，或在文件内就地声明窄依赖：

```ts
type SelectionInputServices = Pick<
  EditorServices,
  'engine' | 'local' | 'layout' | 'query' | 'snap' | 'commands' | 'actions'
>

export const createSelectionBinding = (
  services: SelectionInputServices
): InputBinding => { ... }
```

这样做的原则是：

- 不为 input 再造一套共享上下文类型
- 如果某个 feature 只需要一部分服务，就在本文件本地 `Pick`
- 删除 `input/core/context.ts`

## 5.6 `projectEditorStore()`

最终 store projection 改为读：

- `local.source`
- `input.state`
- `local.viewport.read`

也就是：

```ts
export const projectEditorStore = ({
  local,
  input,
  viewport
}: {
  local: Pick<EditorLocal, 'source'>
  input: EditorInputState
  viewport: ViewportRuntime['read']
}): EditorStore
```

`space` 不再从 `local.source.space` 读取，而是从 `input.state.space` 读取。

## 6. 明确删除的概念

下面这些概念在最终方案里必须删除：

- `local.bindInteractions(...)`
- `projectInteractionDeps(...)`
- `createEditorInteractions(...)`
- `InteractionDeps`
- `InputLocal`
- `local.interaction`
- `local.hover`
- `local.feedback`
- `local.pointer`
- `local.space`

如果某处还在使用这些名字，说明还没有真正完成重构。

## 7. 最终文件结构

建议最终结构收敛为：

```txt
whiteboard-editor/src/
  editor/
    createEditor.ts
    services.ts
    project.ts
    store.ts
    read.ts
    events.ts

  local/
    runtime.ts
    draw/
    session/
    viewport/

  input/
    state.ts
    runtime.ts
    host.ts
    hover/
      edge.ts
      store.ts
    features/
      draw.ts
      transform.ts
      viewport.ts
      edge/
      selection/
      mindmap/

  preview/
    runtime.ts
    selectors.ts
    state.ts
    update.ts

  query/
  command/
  action/
  layout/
  lifecycle/
  types/
```

这里的关键不是文件数，而是 ownership：

- input runtime 只在 `input/`
- preview 只在 `preview/`
- local 不再混入这两者

## 8. 最终重构顺序

真正落地时，推荐按下面顺序一次完成。

### 阶段 1

先抽出 `input.state`，把：

- `interaction`
- `pointer`
- `space`

从 `local` 挪走。

同时把 `query` 和 `store` 改为读取 `input.state`。

### 阶段 2

把 `local.feedback` 改名并提升为 `preview` 服务。

同时把：

- `hover`
- `gesture`
- command 写入 preview

统一改到 `preview` 上。

### 阶段 3

把 `createEdgeHoverService` 和 `createEditorInputHost` 收进 `input` 域。

删掉：

- `projectInteractionDeps`
- `createEditorInteractions`
- `local.bindInteractions`

让 binding 直接消费 `EditorServices`。

### 阶段 4

最后把 `projectEditor()` 清成纯投影。

同时清理：

- `input/core/context.ts`
- 所有 `InteractionDeps` 引用
- 所有 `local.interaction` / `local.feedback` / `local.hover` 引用

## 9. 最终判断标准

重构完成后，必须能同时满足下面这些检查。

1. `local/runtime.ts` 里不再出现 `bindInteractions`。
2. `query/index.ts` 里不再出现 `local.interaction`。
3. `project.ts` 里不再创建任何 runtime 对象。
4. `input` feature 不再依赖 `InteractionDeps`。
5. `projectEditorStore()` 的 interaction 来源是 `input.state`，不是 `local`。
6. `preview` 不再挂在 `local` 名下。
7. `createEditorServices()` 不再依赖后绑定。

如果这七条没有全部成立，就说明重构还没真正到位。
