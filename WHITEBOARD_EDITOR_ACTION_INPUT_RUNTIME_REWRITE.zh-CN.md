# `whiteboard-editor` actions / input / runtime 最终重写方案

## 1. 最终一句话

`whiteboard-editor` 这一层只保留 5 个概念：

1. `public api`
2. `boundary runtime`
3. `service`
4. `primitive`
5. `infrastructure`

最终结构是一条单向依赖图：

```txt
public api
  -> boundary runtime
    -> service
      -> primitive
    -> primitive
      -> infrastructure
```

其中：

- `public api` 只有 `editor.actions` 和 `editor.input`
- `boundary runtime` 只负责统一 flush 和少量 staged procedure 调度
- `service` 只保留两类：`interaction/*` 和 `tool`
- `primitive` 只有两类：`session mutation` 和 `write/*`
- `infrastructure` 是 `query/*`、`projection/*`、`layout/*`、`snap/*`、`history`、`engine adapter` 等底层设施

这就是最终模型。

不是：

- `actions tree -> command tree -> bind tree`
- `input host -> input command tree -> bind tree`
- 一个覆盖全局的 `ops` 总线层
- “所有叶子默认都是 generator”

---

## 2. 设计目标

这次重写只追求 4 件事：

- 上下游清晰
- 依赖单向
- 概念尽量少
- 不做重复抽象

这里的“上下游”定义很简单：

- 上游表达意图
- 下游执行能力
- 上游可以依赖下游
- 下游不能反向知道上游

所以：

- `actions` 和 `input` 是同层 public boundary，不是彼此上下游
- `service` 和 `primitive` 都在 `public api` 的下游
- 当存在独立 policy 时，走 `public api -> boundary -> service -> primitive`
- 当只是直接写入或直接 session mutation 时，走 `public api -> boundary -> primitive`
- `infrastructure` 在最底层，只提供读能力、运行时能力、适配能力
- editor core 内部优先使用同步 `query`
- reactive `read/store` 尽量留在 public / react side

---

## 3. 最终分层

### 3.1 `public api`

这一层只有两个出口：

- `editor.actions`
- `editor.input`

它的职责只有两个：

- 对外暴露稳定 API shape
- 把调用交给 `boundary runtime`

它不负责：

- 业务状态机
- 文档写入细节
- session 细节
- projection flush 细节

### 3.2 `boundary runtime`

这一层只负责：

- 一次 public 调用结束前统一 `projection.flush()`
- 执行极少数 staged procedure

它不负责：

- 业务规则
- tool policy
- interaction session
- document write

`boundary runtime` 必须是薄层。

它不能变成：

- 新的业务总线
- 新的通用 `invoke(...)` 机制
- 一个被 feature 到处显式依赖的“底层词汇”

### 3.3 `service`

这一层只保留两类 service。

#### 3.3.1 `interaction/*`

`interaction/*` 是 editor 里绝大多数 service。

它负责：

- pointer / keyboard / blur / cancel
- press-drag session
- auto-pan
- 长生命周期 gesture / interaction 状态机

它有独立状态机价值，因此是 service。

#### 3.3.2 `tool`

`tool` 是另一个明确的 service。

因为 `tool.set(...)` 不是简单的 `session.mutate.tool.set(...)`，它还包含 policy：

- 是否真的切换了 tool
- 切换时是否要清 `edit`
- 切换时是否要清 `selection`
- draw tool 重入时是否也要清理临时状态

这类规则不该散落在 `actions` 和 `input feature` 两边各写一份。

所以 `tool` 是 service。

### 3.4 `primitive`

这一层只保留两类 primitive。

#### 3.4.1 `session mutation`

包括：

- `session.mutate.tool`
- `session.mutate.selection`
- `session.mutate.edit`
- `session.mutate.draw`
- `session.viewport.commands`

它们是 UI / session 原语。

它们只做最小状态变更，不承担上层 policy。

#### 3.4.2 `write/*`

包括：

- `write.document`
- `write.canvas`
- `write.node`
- `write.group`
- `write.edge`
- `write.mindmap`
- `write.history`

它们是 document mutation 原语。

它们负责真正的写入，不负责上层 boundary、service、interaction policy。

### 3.5 `infrastructure`

这一层是底层设施，不是 service。

包括：

- `engine.query`
- `editor-graph.query`
- `projection/controller`
- `layout/*`
- `snap/*`
- `history binding`
- `engine`
- scheduler / task runtime
- hover / preview 等底层状态容器

它们提供：

- 读取
- 推导
- 发布
- 调度
- 适配

但不表达 editor 业务 policy。

### 3.6 core query / public read

这一层再补一条硬边界：

- editor core 用同步 `query`
- public / react side 用 `read/store`

也就是：

- action / input / service / procedure 内部读状态，优先走同步 `get/current/query`
- 不在 editor 业务层依赖 `store.read(...)` 形成隐式 reactive 链
- committed query 应由 `engine` 直接提供
- published query 应由 `editor-graph` / `projection` 直接提供
- `editor` 不再自己拼一层 query facade
- `editor.read` 和 `editor.store` 仍然可以存在，但它们是 public facade，不是 core 主要依赖

最终希望的时序是：

```txt
action / input
  -> mutate / write
  -> publish / flush
  -> sync query latest state
```

而不是：

```txt
action / input
  -> store.read(...)
  -> derived store graph
  -> 隐式依赖链
```

允许的情况只有一个：

- store 可以作为底层实现细节存在

但不允许：

- editor core 把 store/derived-store 当成主要读模型

---

## 4. 什么不再作为架构概念存在

下面这些不再是独立架构概念：

- `EditorCommandTree`
- `EditorActionCommands`
- `EditorInputCommands`
- `bindEditorActions`
- `bindEditorInputHost`
- `createEditorInputOps`
- giant `EditorCommandContext`
- “所有同步逻辑先下沉到一个统一 `ops/`”

原因只有一个：

它们都在重复解释 public API，或者重复包裹本来就足够直接的同步调用。

这类东西会制造：

- 多一层 naming
- 多一层 wiring
- 多一层类型镜像
- 多一层“到底谁才是真正入口”的歧义

这次重写的原则是：

- 能直接调 primitive，就直接调 primitive
- 只有真的存在独立 policy，才抽 service
- 只有真的需要 staged continuation，才写 procedure

---

## 5. 依赖规则

这是必须写死的硬规则。

### 5.1 允许的依赖方向

```txt
public api -> boundary runtime -> primitive -> infrastructure
public api -> boundary runtime -> service -> primitive -> infrastructure
```

### 5.2 禁止的依赖方向

- `primitive -> service`
- `service -> public api`
- `service -> boundary runtime`
- `input feature -> editor.actions.*`
- `actions -> input`
- `input -> actions`
- `write/* -> session`
- `session primitive -> write/*`

### 5.3 辅助规则

- `boundary runtime` 只能知道 flush / publish / task，不知道业务
- `service` 可以读 infra、调 primitive，但不能知道 public API 形状
- `primitive` 只能做原子能力，不能夹带上层联动 policy
- `infrastructure` 只提供能力，不表达业务意图

---

## 6. 什么才叫 service，什么不叫

这是这次文档最关键的边界。

### 6.1 是 service 的

- `interaction/*`
- `tool`

### 6.2 不是 service 的

- `write/*`
- `session.mutate.*`
- `session.viewport.commands`
- `engine.query`
- `editor-graph.query`
- `public read/store`
- `projection/*`
- `layout/*`
- `snap/*`
- `history`

### 6.3 共享同步逻辑怎么处理

确实会存在一些可复用的同步逻辑，比如：

- `selection.replace` 会联动清 `edit`
- `edit.startNode` 要先通过 `engine.query.node(...)` 读 committed node 和 registry capability
- `edge.route.removePoint` 要先通过 `editorGraph.query.edge(...)` 读 projected edge，再算 patch，再写回
- `clipboard.paste` 要写文档，再更新 selection

但这些不需要被抬升成新的架构层。

处理原则是：

- 如果它只在一个 API 叶子里用，就写在本地
- 如果它被多处复用，就做一个小 helper
- helper 只是实现细节，不是新的系统层

换句话说：

- `interaction` 和 `tool` 是 service
- 其他大多数“共享同步逻辑”只是 helper，不是 service

这能把概念数压到最低。

### 6.4 editor core 的读规则

这一条单独写死：

- core 只依赖同步 query
- react / public side 才依赖 read/store

也就是：

- `documentQuery.node(id)`
- `publishedQuery.edge(id)`
- `session.state.tool.get()`

这类显式同步读取是允许的。

而下面这种 editor core 读法不应该成为默认：

- `store.read(...)`
- `createDerivedStore(...)`
- `createKeyedDerivedStore(...)`
- 基于隐式 reactive chain 的业务逻辑

原因不是 store 不能用，而是：

- 它可以作为底层实现
- 但不能成为 editor 业务层的主要语义

---

## 7. 最终 API 设计

这一节给出最终 API 形状。

### 7.1 `EditorBoundaryRuntime`

最终只保留两个入口：

- `atomic`
- `procedure`

```ts
export interface EditorBoundaryRuntime {
  atomic<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => TResult
  ): (...args: TArgs) => TResult

  procedure<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => EditorProcedure<TResult>
  ): (...args: TArgs) => TResult

  dispose(): void
}
```

语义如下：

- `atomic(...)`：执行同步调用，并在返回前保证 projection 已 flush
- `procedure(...)`：执行少量 staged procedure，并在每次 `publish()` / 结束点保证 projection 一致

这里不再暴露：

- `bind(...)`
- `invoke(...)`
- `command tree`

### 7.2 `EditorProcedure`

generator 只保留给真正 staged 的流程。

```ts
export type EditorProcedure<TResult = void> = Generator<
  EditorProcedureSignal,
  TResult,
  EditorPublished
>

export type EditorProcedureSignal =
  | EditorPublishRequest
  | EditorTaskRequest

export type EditorPublishRequest = {
  kind: 'publish'
  delta?: InputDelta
}

export type EditorTaskRequest =
  | {
      kind: 'task'
      lane: 'microtask'
      procedure: EditorProcedure<void>
    }
  | {
      kind: 'task'
      lane: 'frame'
      procedure: EditorProcedure<void>
    }
  | {
      kind: 'task'
      lane: 'delay'
      delayMs: number
      procedure: EditorProcedure<void>
    }
```

`EditorProcedure` 只允许表达两件事：

- 要 fresh published snapshot
- 要 continuation

除此之外，一律不用 generator。

### 7.3 `EditorProcedureContext`

procedure 上下文必须缩小到只剩运行时控制信号：

```ts
export interface EditorProcedureContext {
  publish(delta?: InputDelta): EditorPublishRequest
  task: {
    microtask(procedure: EditorProcedure<void>): EditorTaskRequest
    frame(procedure: EditorProcedure<void>): EditorTaskRequest
    delay(ms: number, procedure: EditorProcedure<void>): EditorTaskRequest
  }
}
```

不要再把这些直接塞进 procedure context：

- `document`
- `graph`
- `session`
- `sessionRead`
- `layout`
- `write`
- `engine`

这些业务依赖应该通过 closure 注入进具体 procedure 工厂。

也就是：

- runtime control 走 `ctx`
- business deps 走 closure

### 7.4 `ToolService`

最终 `tool` 明确成为一个 service。

```ts
export interface ToolService {
  set(tool: Tool): void
  select(): void
  draw(mode: DrawMode): void
  edge(template: EdgeTemplate): void
  insert(template: InsertTemplate): void
  hand(): void
}
```

`ToolService` 内部可以依赖：

- `session.state.tool`
- `session.mutate.tool`
- `session.mutate.selection`
- `session.mutate.edit`

但它不能依赖：

- `actions`
- `input`
- `boundary runtime`

### 7.5 upstream-owned query API

editor 内部不再默认依赖 `DocumentRead / GraphRead` 这种 reactive read facade，
也不再自己定义 `EditorDocumentQuery` / `EditorPublishedQuery` 这种二次命名。

同步 query 应由状态 owner 直接暴露：

- `engine.query`
- `editor-graph.query`

建议接口如下：

```ts
export interface EngineQuery {
  document(): Document
  background(): Document['background'] | undefined
  bounds(): Rect
  node(id: NodeId): NodeItem | undefined
  edge(id: EdgeId): EdgeItem | undefined
  nodeIds(): readonly NodeId[]
  edgeIds(): readonly EdgeId[]
  groupTarget(groupId: GroupId): SelectionTarget | undefined
  relatedEdges(nodeIds: Iterable<NodeId>): readonly EdgeId[]
  mindmap(id: MindmapId): MindmapStructureItem | undefined
}

export interface Engine {
  readonly config: BoardConfig
  readonly query: EngineQuery
  current(): EnginePublish
  subscribe(listener: (publish: EnginePublish) => void): () => void
  execute(...): CommandResult
  apply(...): CommandResult
}

export interface EditorGraphQuery {
  snapshot(): EditorPublished
  scene(): SceneSnapshot
  selection(): SelectionView
  node(id: NodeId): NodeView | undefined
  edge(id: EdgeId): EdgeView | undefined
  mindmap(id: MindmapId): MindmapView | undefined
  chrome(): ChromeView
}

export interface ProjectionController {
  readonly query: EditorGraphQuery
  mark(delta: InputDelta): void
  flush(): Result | null
  dispose(): void
}
```

它们的语义非常直接：

- `engine.query` 读 committed / authoritative state
- `projection.query` 直接暴露 `editor-graph` 的 published query
- `editor` 只是消费 query，不再自己从 `snapshot` / `sources` 二次拼装

对 editor core 来说，允许的就是这种同步 query：

- `engine.query.node(id)`
- `projection.query.edge(id)`
- `projection.query.snapshot()`

而不是 reactive read graph。

实现细节上：

- query 内部可以缓存
- query 内部可以复用 store
- 但对 editor core 暴露的语义必须是同步函数，不是 store
- `snap candidates`、`slice export` 这类纯 authoritative 派生，也应归到 `engine.query`

### 7.6 `EditorActions`

public actions shape 可以基本保持现在的分类，但实现方式要变。

最终形态：

```ts
export interface EditorActions {
  app: AppActions
  tool: ToolActions
  viewport: ViewportActions
  draw: DrawActions
  selection: SelectionActions
  edit: EditActions
  node: NodeActions
  edge: EdgeActions
  mindmap: MindmapActions
  clipboard: ClipboardActions
  history: HistoryActions
}
```

但它的装配方式不再是：

```txt
EditorActions
  -> EditorActionCommands
  -> bindEditorActions(...)
```

而是：

```ts
export type CreateEditorActionsApiDeps = {
  boundary: EditorBoundaryRuntime
  tool: ToolService
  session: EditorSession
  document: EngineQuery
  published: EditorGraphQuery
  layout: EditorLayout
  write: EditorWrite
  registry: NodeRegistry
  defaults: EditorDefaults['templates']
}

export declare const createEditorActionsApi: (
  deps: CreateEditorActionsApiDeps
) => EditorActions
```

这里要特别注意一件事：

- `boundary` 包裹的是最终 public action
- 不是业务 action core 自己内部再包一层
- 也不是默认先造一个同形状的 `*ActionsCore`

也就是：

- 薄 action 直接绑定下游能力
- 厚 action 才写局部实现函数
- `createEditorActionsApi(...)` 在导出 `editor.actions` 时统一做一次 `atomic(...)` / `procedure(...)`

不允许变成：

- helper 里包一层 `boundary`
- service 里包一层 `boundary`
- primitive 里包一层 `boundary`
- 默认先造一棵和 `EditorActions` 平行的 `*ActionsCore`

这里的“薄 / 厚”定义如下：

- 薄 action：public 语义和下游能力是 `1:1`，直接绑定
- 厚 action：public 语义不等于单个下游能力，需要编排、预处理或 staged flow

薄 action 的默认写法：

```ts
const a = boundary.atomic
const p = boundary.procedure

return {
  tool: {
    set: a(tool.set),
    select: a(tool.select),
    draw: a(tool.draw),
    edge: a(tool.edge)
  },
  viewport: {
    set: a(session.viewport.commands.set),
    panBy: a(session.viewport.commands.panBy),
    zoomTo: a(session.viewport.commands.zoomTo),
    reset: a(session.viewport.commands.reset),
    setRect: a(session.viewport.setRect)
  },
  node: {
    create: a(write.node.create),
    move: a(write.node.move),
    delete: a(write.node.delete)
  }
}
```

这里没有 `toolActionsCore`、`viewportActionsCore`、`nodeActionsCore`。

因为这些 action 只是 public export，不值得再镜像一份同形状对象。

只有厚 action 才写局部实现函数：

```ts
const insertMindmap = (
  id: MindmapId,
  input: MindmapInsertInput,
  options?: MindmapInsertOptions
) => insertMindmapProcedure(
  {
    document,
    published,
    session,
    write,
    registry
  },
  {
    id,
    input,
    options
  }
)

return {
  mindmap: {
    insert: p(insertMindmap)
  }
}
```

厚 action 的典型例子：

- `selection.*`
- `edit.*`
- `clipboard.*`
- `mindmap.insert`
- 部分 `edge.label.*`

### 7.7 `EditorInputHost`

public input shape 继续保持 imperative host。

```ts
export interface EditorInputHost {
  contextMenu(input: ContextMenuInput): ContextMenuIntent | null
  pointerDown(input: PointerDownInput): EditorPointerDispatchResult
  pointerMove(input: PointerMoveInput): boolean
  pointerUp(input: PointerUpInput): boolean
  pointerCancel(input: { pointerId: number }): boolean
  pointerLeave(): void
  wheel(input: WheelInput): boolean
  cancel(): void
  keyDown(input: KeyboardInput): boolean
  keyUp(input: KeyboardInput): boolean
  blur(): void
}
```

但 `input` 最终不再经过：

- `EditorInputCommands`
- `createEditorInputCommands`
- `bindEditorInputHost`

最终装配形态应该是：

```ts
export type CreateEditorInputApiDeps = {
  boundary: EditorBoundaryRuntime
  interaction: EditorInputHost
}

export declare const createEditorInputApi: (
  deps: CreateEditorInputApiDeps
) => EditorInputHost
```

这里的意思是：

- `createInteractionRuntime(...)` 产出的已经是内部完整 input 实现
- `createEditorInputApi(...)` 只负责在 public 导出处统一接入 `boundary`

也就是说，不再额外保留一个独立 `input host` 装配层去转发：

- `interaction` 负责 input 语义
- `input api` 负责 public boundary
- 两层足够

默认不要让 `input api` 再拿：

- `session`
- `document`
- `tool`

因为这些应该已经被 `interaction` 内聚掉。

默认写法是：

```ts
pointerDown: boundary.atomic(interaction.pointerDown),
pointerMove: boundary.atomic(interaction.pointerMove),
pointerUp: boundary.atomic(interaction.pointerUp)
```

也就是说：

- `input` 仍然是 imperative host
- 但不再镜像成 command tree
- `boundary` 只在 API 装配处出现一次

### 7.8 `createEditor`

`createEditor` 最终只做 wiring。

```ts
export const createEditor = ({
  engine,
  history,
  initialTool,
  initialDrawState,
  initialViewport,
  registry,
  services
}: CreateEditorOptions): Editor => {
  const session = createEditorSession(...)
  const document = engine.query
  const layout = createEditorLayout(...)
  const projection = createProjectionController(...)
  const published = projection.query
  const write = createEditorWrite(...)
  const defaults = services?.defaults ?? DEFAULT_EDITOR_DEFAULTS
  const nodeType = createNodeTypeSupport(registry)
  const editorStore = createEditorStore(session)

  const boundary = createEditorBoundaryRuntime({
    projection,
    tasks: createEditorTaskRuntime(...)
  })

  const tool = createToolService({
    session
  })

  const interaction = createInteractionRuntime({
    engine,
    document,
    published,
    session,
    layout,
    write,
    tool
  })

  const actions = createEditorActionsApi({
    boundary,
    tool,
    session,
    document,
    published,
    layout,
    write,
    registry,
    defaults: defaults.templates
  })

  const input = createEditorInputApi({
    boundary,
    interaction
  })

  return {
    store: editorStore,
    read: createEditorRead({
      document,
      published,
      session,
      store: editorStore,
      history,
      nodeType,
      defaults: defaults.selection
    }),
    actions,
    input,
    events: createEditorEvents(...),
    dispose: () => {
      boundary.dispose()
      projection.dispose()
      interaction.cancel()
      session.reset()
      layout.text.clear()
    }
  }
}
```

关键点只有两个：

- `createEditor` 不解释业务
- `boundary` 只在装配层接入一次

另外再补一条：

- `sessionRead` 不在 `createEditor` 装配
- `createEditorRead(...)` 如果需要 reactive read facade，就在内部从 `session + query` 自行构造
- `engine.query` 服务 editor core 的 committed 读取
- `projection.query` 直接承接 `editor-graph.query`，服务 editor core 的 published 读取
- `createEditorRead(...)` / `createEditorStore(...)` 服务 public / react side

### 7.9 public read / store facade

public side 仍然可以保留：

- `editor.store`
- `editor.read`

但它们的定位必须收窄成：

- UI / framework adapter 使用
- React side 主要消费
- 不作为 editor core 的主要依赖

建议接口形态如下：

```ts
export type CreateEditorReadDeps = {
  document: EngineQuery
  published: EditorGraphQuery
  session: EditorSession
  store: EditorStore
  history: HistoryApi
  nodeType: NodeTypeSupport
  defaults: EditorDefaults['selection']
}

export declare const createEditorRead: (
  deps: CreateEditorReadDeps
) => EditorRead
```

这里允许：

- `createEditorRead(...)` 内部为了 public facade 自行构造 `sessionRead`
- `createEditorRead(...)` 内部使用 store / derived-store

但只允许发生在这一层：

- public read facade
- public store facade

不允许 editor core 业务逻辑再反向依赖这些 reactive 语义。

---

## 8. `actions` 和 `input` 的最终写法

### 8.1 `actions` 的写法

最终 `actions` 只有三种导出方式：

#### A. 直接 primitive

```ts
const a = boundary.atomic

history: {
  undo: a(write.history.undo),
  redo: a(write.history.redo)
}
```

#### B. 调 service

```ts
const a = boundary.atomic

tool: {
  set: a(tool.set)
}
```

#### C. 调 procedure

```ts
const insertMindmap = (
  id: MindmapId,
  input: MindmapInsertInput,
  options?: MindmapInsertOptions
) => insertMindmapProcedure(deps, { id, input, options })

mindmap: {
  insert: boundary.procedure(insertMindmap)
}
```

除此之外没有第四种。

补一条硬规则：

- 不要默认先写 `historyActionsCore`
- 不要默认先写 `toolActionsCore`
- 不要默认先写 `nodeActionsCore`

只有当某个 action 真的是厚 action 时，才给它单独起局部函数名。

### 8.2 `input` 的写法

最终 `input` 也只有两种叶子：

#### A. 交给 interaction service

```ts
pointerDown: boundary.atomic(interaction.pointerDown)
keyDown: boundary.atomic(interaction.keyDown)
blur: boundary.atomic(interaction.blur)
```

#### B. 直接 primitive

比如 wheel fallback：

```ts
wheel: boundary.atomic((input) => {
  if (interaction.wheel(input)) {
    return true
  }

  session.viewport.input.wheel(...)
  return true
})
```

最终 `input feature` 允许调用：

- `interaction`
- `tool service`
- `session mutation`
- `write/*`
- 同步 query

但不允许调用：

- `editor.actions.*`

---

## 9. procedure 的边界

generator 只允许出现在下面两种场景。

### 9.1 需要 fresh published snapshot

例如：

- mindmap insert 后基于 publish 后 graph 读取新 layout
- 写后必须等待 projection 更新，才能决定下一步

### 9.2 需要 continuation

例如：

- frame tick
- delay remove
- enter animation

除此之外都必须回到 plain sync function。

这意味着下面这些默认都不应该是 generator：

- `tool.*`
- `viewport.*`
- `draw.*`
- 大多数 `selection.*`
- 大多数 `edit.*`
- 大多数 `node.*`
- 大多数 `edge.*`
- `history.*`
- `input.*`

---

## 10. 文件组织

最终建议的组织如下：

```txt
whiteboard-engine/
  src/query/*

whiteboard-editor-graph/
  src/query/*

whiteboard-editor/
  src/api/*
  src/boundary/*
  src/services/*
  src/procedures/*
  src/public/*
  src/session/*
  src/write/*
  src/projection/*
  src/layout/*
```

注意：

- 不再保留固定 `ops/`
- 不再保留 `command/` 作为 public API 的镜像执行系统
- 小型同步 helper 放在最接近调用方的模块里，不单独升格成系统层
- `whiteboard-editor` 内部不再保留 `query/*`

也就是：

- committed query 归 `whiteboard-engine`
- published query 归 `whiteboard-editor-graph`
- 有独立 policy，才进 `services/`
- 有 staged continuation，才进 `procedures/`
- reactive facade 进 `whiteboard-editor/src/public/*`
- 否则直接留在 API 叶子或本地 helper

---

## 11. 对现有代码的收敛结论

### 11.1 保留

- `session/runtime.ts`
- `session/*`
- `write/*`
- `input/core/runtime.ts`
- `projection/controller.ts`
- `layout/*`
- `editor/store.ts`

### 11.2 改名或重定位

- `document/read.ts`
  应从 `whiteboard-editor` 移出，authoritative query 收敛到 `whiteboard-engine` 的 `engine.query`
- `read/graph.ts`
  应从 `whiteboard-editor` 移出，published query 收敛到 `whiteboard-editor-graph`，由 `projection/controller.ts` 直接暴露 `query`
- `read/public.ts`
  应定位为 `public/read.ts`，主要服务 public / react side
- `projection/controller.ts`
  应直接暴露 `query`，不要再要求 editor 从 `projection.sources` 拼 `GraphRead`
- `action/selection.ts`
  不是 action command，应该是 selection helper
- `action/clipboard.ts`
  不是 action command，应该是 clipboard helper
- `action/index.ts` 里的 `tool.set` policy
  应抽到 `services/tool.ts`
- `action/index.ts` 里的 mindmap enter animation
  应抽到 `procedures/mindmap.ts`

### 11.3 删除

- `EditorCommandTree`
- `EditorActionCommands`
- `EditorInputCommands`
- `createEditorActionCommands`
- `createEditorInputCommands`
- `bindEditorActions`
- `bindEditorInputHost`
- `createEditorInputOps`
- giant `EditorCommandContext`
- editor core 对 `store.read(...)` / `createDerivedStore(...)` 的直接业务依赖

---

## 12. 实施顺序

### 第一步

先引入新的 `EditorBoundaryRuntime`：

- `atomic`
- `procedure`
- `dispose`

并让它内部接管：

- projection flush
- publish/task 解释

### 第二步

把 core query 上移到 owner：

- 在 `engine` 引入 `query`
- 在 `editor-graph` 把现有同步 read 收敛为正式 `query`
- `projection/controller.ts` 直接暴露 `query`
- action / input / service / procedure 内部改用 `engine.query` 和 `projection.query`
- 不再让 editor core 直接依赖 reactive read facade

### 第三步

删除 `input` 的 command/bind 链：

- 删除 `createEditorInputCommands`
- 删除 `bindEditorInputHost`

因为这是最确定的纯重复层。

### 第四步

抽出 `ToolService`，让下面这些逻辑只保留一份：

- `tool.set`
- `tool.select`
- `tool.draw`
- `tool.edge`
- `tool.insert`
- `tool.hand`

### 第五步

把 `action/index.ts` 中真正 staged 的逻辑迁入 `procedures/*`：

- mindmap insert publish-after-read
- enter animation tick
- delay remove

### 第六步

把大部分同步 action 改成：

- `boundary.atomic(() => primitive(...))`
- `boundary.atomic(() => service(...))`

### 第七步

把 `createEditorRead(...)` 和 `createEditorStore(...)` 明确收敛为 public facade：

- `createEditorRead(...)` 内部如果需要 reactive read，可以自行从 `session + query` 构造
- `createEditorStore(...)` 继续只服务 public / react side
- editor core 不直接依赖它们的 reactive 语义

### 第八步

把零散共享同步逻辑下沉为本地 helper，不再保留固定 `ops` 层。

### 第九步

把 `createEditor` 收敛成纯 wiring。

---

## 13. 最终判断

这次重写后的最终架构不是：

- action command system
- input command system
- 一个覆盖全局的 `ops` 系统
- 默认 generator 化的业务叶子

最终只应该是：

```txt
public api
  -> boundary runtime
    -> service
      - interaction/*
      - tool
      -> primitive
    -> primitive
      - session mutation
      - write/*
      -> infrastructure
        - engine.query
        - editor-graph.query
        - projection / layout / snap / history / engine

public / react side
  -> read/store facade
```

并且必须满足：

- 上下游清晰
- 单向依赖
- service 只有 `interaction` 和 `tool`
- 其他绝大多数东西都是 primitive 或 infrastructure
- editor core 用同步 query，不用 reactive read chain
- public / react side 才消费 read/store facade
- 没有重复抽象
- 没有镜像型 command tree
- 没有固定 `ops` 层
- generator 只服务于少量 staged procedure

这就是最终方案。
