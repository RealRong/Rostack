# Whiteboard Editor Session 与 Host 最终架构方案

这份文档只回答一个问题：

为什么当前 `createEditorServices()` 里的这段装配有怪味，以及长期最优应该如何重构。

```ts
const local = createEditorLocal(...)
const inputState = createEditorInputState()
const inputPreview = createEditorInputPreview(...)
...
const baseServices = { ... }
const input = createEditorInput({
  ...baseServices,
  state: inputState,
  preview: inputPreview
})
```

结论只有一个版本，不保留候选设计，不保留兼容路径。

这份文档直接覆盖此前关于：

- `WHITEBOARD_EDITOR_RUNTIME_DECYCLE_FINAL_ARCHITECTURE.zh-CN.md`
- `WHITEBOARD_PREVIEW_COLLAPSE_FINAL_ARCHITECTURE.zh-CN.md`
- `WHITEBOARD_INPUT_RESPONSIBILITY_CENTRALIZATION_FINAL_ARCHITECTURE.zh-CN.md`

的相关运行时结论，作为后续一次性重构的唯一依据。

---

## 1. 最终结论

当前的怪味不是“构造顺序不漂亮”，而是运行时中轴切错了。

根因有三个：

1. 真正的一等本地中轴其实是 `local + inputState + inputPreview + viewport` 的组合，但当前没有被明确定义。
2. `input` 现在同时承担了：
   - interaction host
   - interaction state owner
   - preview owner
   
   这三种职责本来就不该绑在一个顶层 service 上。
3. `EditorServices` / `baseServices` 这种“大对象后期补洞”装配方式，本质上是在掩盖错误的依赖图。

长期最优的最终架构固定为六个内部对象：

1. `engine`
2. `session`
3. `layout`
4. `query`
5. `write`
6. `actions`
7. `host`

对外公开的 `Editor` 固定为：

1. `store`
2. `read`
3. `actions`
4. `input`
5. `events`
6. `dispose`

其中：

- `session` 是 editor 自己拥有的本地会话中轴
- `host` 是末端输入宿主，内部才有 interaction runtime
- `write` 是纯 document write 层，替代今天泄漏了 session/preview 职责的 `commands`
- `actions` 是唯一公开 imperative API

一句话概括：

`inputState` 和 `inputPreview` 之所以需要前置创建，不是因为实现顺序写得丑，而是因为它们本来就不该挂在 `input` 下面，它们应该被 `session` 拥有。

---

## 2. 当前代码真正的问题

当前实现最怪的地方，不是某个函数命名，而是依赖图本身不干净。

### 2.1 `input` 不是一个真正自洽的 service

当前 `createEditorInput()` 的签名是：

```ts
createEditorInput(
  Omit<EditorServices, 'input'> & {
    state: EditorInputStateController
    preview: EditorInputPreview
  }
)
```

这说明：

1. `input` 依赖几乎整个 editor runtime
2. 但它又不能自己创建自己的核心状态
3. 它必须吃两个“前置构造好的半成品”：`state` 和 `preview`

这不是正常的 service 边界。

一个真正健康的 service 只有两种情况：

1. 要么自己拥有自己的核心状态
2. 要么只消费上游稳定中轴

当前 `input` 两者都不是。

### 2.2 `baseServices` 只是补丁，不是架构

当前：

```ts
const baseServices = {
  engine,
  local,
  layout,
  query,
  snap,
  commands,
  actions,
  lifecycle
}
```

然后：

```ts
const input = createEditorInput({
  ...baseServices,
  state: inputState,
  preview: inputPreview
})
```

这本质上是在说：

- 顶层 service 图已经形成了
- 但 `input` 还缺自己真正需要拥有的状态
- 所以只能在外部先捏两个东西再灌进去

这是一种典型的“service graph 不是 DAG，只能靠 assembly patch”信号。

### 2.3 `commands` 已经不再是纯 write 层

当前 command 层还拿了：

- `preview.write`
- `session` 风格的 selection/edit 启动逻辑

这说明当前 `commands` 已经把：

- document write
- session side effect
- preview side effect

混在一起了。

一旦 command 层变脏，装配就一定变脏，因为：

- `input` 需要它
- `actions` 也需要它
- `query` 又要读 command 写出来的东西

### 2.4 `lifecycle` 不值得作为平级 service

当前的 `lifecycle` 只做三件事：

1. 订阅 engine commit
2. reconcile 本地 selection/edit
3. 提供 `events` 与 `dispose`

这不是一个值得单独占据平级 service 概念位的中轴。

它更像 editor facade 尾部的一层清理逻辑。

### 2.5 `preview` 放在 `input` 下只是阶段性正确，不是最终最优

此前把 `preview` 从顶层 editor service 收进 `input.preview` 是对的，因为它比顶层平级 `preview` 更合理。

但在引入更高一级的 `session` 中轴之后，长期最优不再是 `input.preview`，而是：

```ts
session.preview
```

原因很简单：

- preview 不是 DOM host
- preview 不是事件分发器
- preview 是 editor-owned transient visual state
- action 也可能写 preview，例如 mindmap enter preview

所以它最终属于 session，不属于 host。

---

## 3. 最终中轴划分

### 3.1 `engine`

唯一持久态来源。

负责：

- document
- history
- committed node/edge/mindmap read
- index/scene read
- persistent mutation

不负责：

- selection
- edit
- tool
- viewport
- interaction
- preview

### 3.2 `session`

`session` 是新的真正中轴。

它统一拥有 editor 的全部本地会话态。

最终固定包含七块：

1. `tool`
2. `draw`
3. `selection`
4. `edit`
5. `viewport`
6. `interaction`
7. `preview`

这七块里，前五块来自今天的 `local`，后两块来自今天的 `inputState + inputPreview`。

#### 最终 API

```ts
export type EditorSession = {
  state: {
    tool: ValueStore<Tool>
    draw: ReadStore<DrawState>
    selection: ReadStore<SelectionTarget>
    edit: ReadStore<EditSession>
  }
  mutate: {
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
    edit: Pick<EditMutate, 'set' | 'input' | 'caret' | 'layout' | 'status' | 'clear'>
  }
  viewport: ViewportRuntime
  interaction: {
    read: {
      mode: ReadStore<InteractionMode>
      busy: ReadStore<boolean>
      chrome: ReadStore<boolean>
      gesture: ReadStore<ActiveGesture | null>
      pointer: ReadStore<PointerSample | null>
      space: ReadStore<boolean>
      hover: HoverStoreRead
    }
    write: {
      setActive: (meta: SessionMeta | null) => void
      setGesture: (gesture: ActiveGesture | null) => void
      setPointer: (sample: PointerSample | null) => void
      setSpace: (value: boolean) => void
      setHover: (hover: HoverState) => void
      clearHover: () => void
      reset: () => void
    }
  }
  preview: {
    selectors: EditorPreviewSelectors
    write: EditorPreviewWrite
  }
  resetDocument: () => void
  resetInteraction: () => void
  reset: () => void
}
```

#### 三条硬规则

1. `session` 是 query 的唯一 editor-owned read source，`query` 不再分别接 `local` 和 `input.state`。
2. `preview` 固定属于 `session.preview`，不再做顶层 service，也不再做 `input.preview`。
3. `interaction runtime` 不属于 `session`，但 `interaction state` 属于 `session`。

也就是说：

- `session` 拥有 interaction 状态
- `host` 拥有 interaction runtime

这是最干净的分工。

### 3.3 `layout`

纯 layout/measure 适配器。

负责：

- text measure
- editNode layout
- preview patch resolve
- node create payload patch

依赖：

- engine committed read
- registry
- optional backend

不依赖：

- session
- host
- actions

### 3.4 `query`

纯 derived read 层。

最终固定签名：

```ts
createEditorQuery({
  engine,
  registry,
  layout,
  session
})
```

而不是：

```ts
createEditorQuery({
  engineRead,
  local,
  input,
  ...
})
```

`query` 只能读取：

- engine
- session
- layout
- registry

不能读取：

- host runtime
- write
- actions

### 3.5 `write`

`write` 是新的低层 document mutation 层。

它替代今天顶层概念上已经变脏的 `commands`。

#### `write` 的唯一职责

只做 document write。

允许做：

- `engine.execute(...)`
- patch 计算后的持久提交
- 基于 `query` / `layout` 的低层意图写入

禁止做：

- selection side effect
- edit side effect
- tool side effect
- preview side effect
- dispose
- event emit

#### 最终 API

```ts
export type EditorWrite = {
  document: DocumentWrite
  node: NodeWrite
  edge: EdgeWrite
  mindmap: MindmapWrite
  history: HistoryWrite
}
```

关键约束：

1. `EditorWrite` 不再接受 `session`
2. `EditorWrite` 不再接受 `preview.write`
3. `EditorWrite` 不再接受 `CommandSession`
4. 任何需要 focus/select/edit/preview 的流程，一律放到 `actions`

#### 对 mindmap 的明确要求

当前 `mindmap` 相关 preview 与 focus 逻辑不能继续放在 command 层。

正确做法是：

```ts
const result = write.mindmap.insert(...)
actions.mindmap.insert(...) // 包装 write + session side effects
```

也就是说：

- `write.mindmap.insert()` 只返回 document write 结果和必要 metadata
- `actions.mindmap.insert()` 再决定：
  - 是否选中新节点
  - 是否启动编辑
  - 是否写 enter preview

### 3.6 `actions`

`actions` 是唯一公开 imperative API。

最终签名固定为：

```ts
createEditorActions({
  engine,
  registry,
  layout,
  query,
  session,
  write
})
```

`actions` 负责：

- 调用 `write`
- 执行 session side effect
- 提供稳定公开 API

它是唯一允许同时碰：

- `write`
- `session`

的层。

#### 明确规则

1. `actions` 是公开 API
2. `write` 不是公开 API
3. `actions` 可以包装 `write`
4. `host` 可以同时依赖 `actions` 和 `write`

这里第四条是必须保留的。

原因：

- 有些 interaction commit 是稳定用户语义，适合走 `actions`
- 有些 interaction commit 是 solver 直接产出的 patch，适合走 `write`

不能为了“统一入口”强迫所有 interaction 都绕公开 action API。

### 3.7 `host`

`host` 是当前 `input` 的最终正确归宿。

它是末端消费者，不是上游 owner。

#### `host` 负责的事情

1. DOM/事件 host
2. interaction runtime
3. interaction binding dispatch
4. contextMenu 决策
5. hover runtime
6. snap runtime

#### `host` 不负责的事情

1. 拥有 `tool / selection / edit`
2. 拥有 interaction state
3. 拥有 preview state

这些都属于 `session`。

#### 最终签名

```ts
createEditorHost({
  engine,
  layout,
  query,
  session,
  write,
  actions
})
```

说明：

- `host` 内部创建 `interaction runtime`
- `host` 内部创建 `snap`
- `host` 内部创建 `edge hover`
- `host` 最终返回公开的 `EditorInputHost`

也就是说，公开 API 仍然可以保留：

```ts
editor.input
```

但内部概念必须叫：

```ts
host
```

不能继续让 “input 既像 host，又像 state owner”。

---

## 4. 最终依赖图

长期最优的依赖图固定为：

```txt
engine
  -> session
  -> layout

session + layout + engine + registry
  -> query

engine + query + layout
  -> write

engine + registry + layout + query + session + write
  -> actions

engine + layout + query + session + write + actions
  -> host

engine + session + query + actions + host
  -> editor facade
```

其中最关键的点有四个：

1. `session` 在最前面创建，并且内部吃掉今天的 `inputState` 与 `inputPreview`
2. `host` 永远最后创建，因为它是末端消费者
3. `write` 在 `actions` 之前创建，作为低层 mutation runtime
4. `EditorServices` 这种“大对象往下传”的模式整体删除

---

## 5. 最终装配方式

最终 `createEditor()` 固定写成下面这个顺序：

```ts
export const createEditor = ({
  engine,
  registry,
  initialTool,
  initialDrawState,
  initialViewport,
  services
}: CreateEditorInput): Editor => {
  const session = createEditorSession({
    initialTool,
    initialDrawState,
    initialViewport
  })

  const layout = createEditorLayout({
    engine,
    registry,
    backend: services?.layout
  })

  const query = createEditorQuery({
    engine,
    registry,
    layout,
    session
  })

  const write = createEditorWrite({
    engine,
    query,
    layout
  })

  const actions = createEditorActions({
    engine,
    registry,
    layout,
    query,
    session,
    write
  })

  const host = createEditorHost({
    engine,
    layout,
    query,
    session,
    write,
    actions
  })

  return {
    store: createEditorStore(session),
    read: createEditorRead(query),
    actions,
    input: host,
    events: createEditorEvents({
      engine,
      session,
      query
    }),
    dispose: () => {
      session.reset()
      engine.dispose()
    }
  }
}
```

这个顺序解决了当前所有装配怪味：

1. 不再需要 `baseServices`
2. 不再需要 `servicesRuntime` mutable slot
3. 不再需要把 `inputState` / `inputPreview` 在外面捏好再塞回 `input`
4. 不再需要 `lifecycle` service
5. 不再需要 `projectEditorEvents(services)`

---

## 6. 明确删除的概念

下面这些概念在长期最优里明确删除。

### 6.1 顶层运行时概念

- `EditorServices`
- `baseServices`
- `servicesRuntime`
- `EditorInputRuntime`
- `EditorLifecycle`

### 6.2 构造函数与 service

- `createEditorServices(...)`
- `createEditorInput(...)`
- `createEditorLifecycle(...)`
- `projectEditorEvents(...)`

### 6.3 旧中轴命名

- 顶层 `local`
- 顶层 `input.state`
- 顶层 `input.preview`
- 顶层 `commands`

它们分别替换为：

- `session`
- `session.interaction`
- `session.preview`
- `write`

### 6.4 command 层里的泄漏物

- `createCommandSession(...)`
- `EditorCommandSession`
- `preview.write` 注入 command
- command 内的 selection/edit 启动逻辑

### 6.5 facade 里的错位 API

- `actions.app.dispose`

长期最优只保留：

```ts
editor.dispose()
```

`dispose` 不是 action。

---

## 7. 文件与命名建议

最终建议的文件级中轴如下。

### 7.1 `src/session/*`

放所有 editor-owned local/transient session state：

- `session/runtime.ts`
- `session/interaction.ts`
- `session/preview.ts`
- `session/tool.ts`
- `session/draw.ts`
- `session/selection.ts`
- `session/edit.ts`

### 7.2 `src/write/*`

放低层 document mutation：

- `write/index.ts`
- `write/document.ts`
- `write/node.ts`
- `write/edge.ts`
- `write/mindmap.ts`
- `write/history.ts`

这里如果沿用当前 `command` 目录实现细节也可以，但顶层概念必须叫 `write`，不能再叫 `commands`。

### 7.3 `src/input/*`

只保留 host 与 interaction 实现：

- `input/host.ts`
- `input/runtime.ts`
- `input/core/*`
- `input/features/*`
- `input/hover/*`
- `input/snap/*`

说明：

- 目录名可以继续叫 `input`
- 但顶层 runtime 概念必须叫 `host`

### 7.4 `src/editor/*`

只保留 facade 组装与投影：

- `editor/createEditor.ts`
- `editor/read.ts`
- `editor/store.ts`
- `editor/events.ts`

这里不再保留 `editor/services.ts`。

---

## 8. 对现有几个关键问题的最终判断

### 8.1 `inputState` 和 `inputPreview` 前置创建是不是怪味

是，而且是结构性怪味，不是代码风格问题。

最终正确做法：

- 它们不应该在 `createEditor()` 外层被单独创建
- 它们应该在 `createEditorSession()` 内部被拥有

### 8.2 `baseServices` 要不要保留

不要。

它的存在只说明 service graph 没切好。

长期最优是：

- 每个 constructor 吃明确 deps
- 不再有一个 “先攒出大对象，再挑一部分补进去” 的模式

### 8.3 `EditorServices` 要不要保留

不要。

如果一个构造函数需要 `Omit<EditorServices, 'input'> & { ... }` 这种签名，说明边界已经坏了。

长期最优只允许：

- 小而明确的 deps object
- 或直接显式参数

不允许再有 mega service bag。

### 8.4 `preview` 最终应该在 `input` 还是 `session`

最终在 `session`。

原因：

1. 它是 editor-owned transient visual state
2. 它不只是 host 输入副产品
3. `actions` 也可能写它
4. `query` 长期稳定地读它

所以：

- `input.preview` 是阶段性正确
- `session.preview` 才是长期最优

### 8.5 `commands` 要不要保留

不作为顶层概念保留。

可以保留低层实现文件，但必须降级为：

```ts
write
```

而且严格限制为纯 document write。

### 8.6 `lifecycle` 要不要保留

不保留。

它应该被拆回：

- facade 内部的 event/dispose 逻辑
- 一个小的 commit reconcile helper

而不是继续占一层 service。

---

## 9. 实施顺序

为了保证可以一次性改到终态，实施顺序固定如下。

### 阶段 1：引入 `session`

1. 新建 `createEditorSession(...)`
2. 把当前 `local + inputState + inputPreview + viewport` 全部收进去
3. `projectEditorStore(...)` 改为只读 `session`
4. `query` 改签名为只吃 `session`

阶段结束标准：

- editor 内部已经没有 “local + input.state + input.preview” 三套上游依赖
- 只剩 `session`

### 阶段 2：把 `input` 缩成 `host`

1. `createEditorInput(...)` 改成 `createEditorHost(...)`
2. interaction runtime、snap、hover 都收进 host 内部
3. host 只读取 `session`，不拥有 state
4. 删除 `EditorInputRuntime`

阶段结束标准：

- `inputState` / `inputPreview` 不再出现在 `createEditor()` 顶层
- `host` 成为纯末端消费者

### 阶段 3：收掉顶层 `commands`

1. `createEditorCommands(...)` 降为 `createEditorWrite(...)`
2. 删除 `createCommandSession(...)`
3. 把 preview/select/focus/edit side effect 全部从 write 中移出，放到 actions
4. `actions` 成为唯一公开 imperative API

阶段结束标准：

- `write` 不再依赖 `session` 或 `preview`
- `actions` 明确成为唯一公开写入口

### 阶段 4：删掉 `lifecycle` 和 `EditorServices`

1. 删除 `editor/services.ts`
2. 删除 `EditorServices`
3. 删除 `createEditorLifecycle(...)`
4. `createEditor()` 直接装配 facade
5. `editor.dispose()` 直接成为公开 API

阶段结束标准：

- 顶层装配没有 `baseServices`
- 没有 `servicesRuntime`
- 没有 `lifecycle` service

---

## 10. 最终抉择

如果只保留一句话，最终抉择就是：

**不要继续修补 `createEditorServices()`；直接把真正的一等中轴定义成 `session`，再把今天的 `input` 缩成末端 `host`。**

具体就是：

1. `local + inputState + inputPreview + viewport` 收口为 `session`
2. `commands` 收口为纯 `write`
3. `input` 收口为 `host`
4. `lifecycle` 删除
5. `EditorServices / baseServices` 删除

这就是长期最优。
