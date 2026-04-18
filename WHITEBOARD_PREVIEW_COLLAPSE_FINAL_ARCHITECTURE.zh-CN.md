# Whiteboard Preview 收敛最终方案

这份文档只回答一个问题：

`whiteboard/packages/whiteboard-editor` 里的 `preview` 是否应该继续作为独立中轴存在，以及长期最优应当如何收敛。

结论只有一个版本，不保留候选设计。

## 1. 最终结论

最终结论如下：

1. `preview` 不应该并进 `query`。
2. `preview` 也不应该继续作为和 `input` 平级的 editor 顶层中轴。
3. 长期最优是把 `preview` 收进 `input`，成为 `input.preview`。
4. `query` 继续只读 `input.preview.selectors`，不拥有 preview 组合与写入职责。
5. editor 顶层服务图从 `local + input + preview + query + ...` 收敛为 `local + input + query + ...`。

一句话概括：

`preview` 不是 `query`，但它也不值得继续做 editor 顶层平级服务；它最合理的归宿是 `input` 的子域。

## 2. 为什么不能并进 `query`

`query` 的职责必须保持稳定：

- 只读
- 不持有本地写入口
- 不负责组合 transient source
- 不负责输入生命周期

而当前 `preview` 做的事情不是单纯投影，而是：

1. 接收 base preview 写入
2. 合成 active gesture draft
3. 合成 hover preview
4. 产出 selectors 给 `query/read/store` 消费

这说明 `preview` 本质上是一个 transient composition service，而不是 query projection。

如果把它并进 `query`，会立刻出现三个问题。

### 2.1 `query` 不再只读

只要保留：

- `set`
- `reset`

这样的入口，`query` 就不再是纯只读面。

这会让 `query` 从“读模型”变成“又读又写的 transient runtime”，边界直接变脏。

### 2.2 `query` 会开始依赖输入生命周期

当前 preview 组合直接依赖：

- gesture
- hover

也就是输入运行时状态。

如果并进 `query`，那 `query` 就会进一步吞入 input runtime 的组合逻辑，变成一个过大的总线。

### 2.3 `query` 会同时承担“组合”和“投影”

这两件事应该明确分开：

- 组合：把多个 transient source 合成一个 preview state
- 投影：把已有 state 投影为 render/read selectors

`query` 只该做后者，不该做前者。

所以，`preview` 绝对不能并进 `query`。

## 3. 为什么也不值得继续作为独立顶层中轴

虽然 `preview` 不该并进 `query`，但这不代表它一定值得和 `input`、`local`、`query` 平级。

当前真正的问题是：

`preview` 的大部分存在理由，其实都来自 `input`。

它的核心输入源是：

1. `input.state.gesture`
2. `input.state.hover`
3. 少量 base preview 写入

也就是说，`preview` 的绝大部分语义都属于“输入驱动的临时可视反馈”。

这说明它并不是 editor 的一条独立大轴，而更像 input 域内部的一个子运行时。

继续把它挂成顶层服务，会带来三个坏处。

### 3.1 顶层服务图被人为放大

当前顶层如果保留：

- `local`
- `input`
- `preview`
- `query`

那么 `preview` 会显得像和 `input`、`query` 同级的重要概念。

但实际上它只是：

- 输入反馈组合层
- 给 query 读的临时投影源

它没有必要占一个顶层概念位。

### 3.2 装配顺序被拆碎

现在服务装配里要写成：

```txt
input.state
  -> preview
  -> query
```

这在技术上没问题，但会让 editor services 看起来像多了一条独立 runtime 链。

如果收进 `input`，装配顺序会更顺：

```txt
input.state
  -> input.preview
  -> query
```

即 preview 只是 input 内部装配的一部分。

### 3.3 命名上会产生误导

只要它还叫独立 `preview` 服务，团队很容易继续往里塞：

- 非 input preview
- 非 transient presentation cache
- 各种临时旁路状态

最后又长成一个新的“大杂烩中轴”。

把它明确降级成 `input.preview`，反而能限制它的职责。

## 4. 长期最优的最终职责划分

最终 editor 内部只保留三条相关轴：

1. `local`
2. `input`
3. `query`

其中：

- `local` 负责编辑器语义本地状态
- `input` 负责 host input、session、hover、preview composition
- `query` 负责只读投影

也就是说，preview 的最终归属是：

```txt
input.preview
```

而不是：

```txt
editor.preview
```

## 5. 最终模型

## 5.1 `local`

`local` 保持不变，只保留语义本地状态：

- tool
- draw
- selection
- edit
- viewport

它不接触：

- gesture
- hover
- preview compose

## 5.2 `input`

`input` 变成完整的输入运行时域，内部固定拆成三块：

1. `input.state`
2. `input.preview`
3. `input.host`

### `input.state`

只保存输入生命周期状态：

- mode
- busy
- chrome
- gesture
- pointer
- space
- hover

### `input.preview`

只负责组合 preview：

- base preview write
- gesture draft
- hover draft
- selectors

### `input.host`

只负责 host dispatch：

- pointer
- key
- wheel
- blur
- contextMenu

## 5.3 `query`

`query` 最终只依赖：

- `engine.read`
- `local`
- `input.state`
- `input.preview`
- `layout`

它继续只读：

- `input.preview.selectors.*`

不拥有：

- `set/reset`
- compose logic
- hover logic

## 6. 最终 API

## 6.1 当前不理想的形态

当前大致相当于：

```ts
type EditorServices = {
  local: EditorLocal
  input: EditorInputRuntime
  preview: EditorPreview
  query: EditorQuery
  ...
}
```

这里的坏处是 `preview` 被提升成了顶层服务。

## 6.2 长期最优形态

最终应收敛成：

```ts
export type EditorInputRuntime = {
  state: EditorInputState
  preview: EditorInputPreview
  host: EditorInputHost
  reset: () => void
}
```

然后：

```ts
export type EditorInputPreview = {
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

注意这里有一个关键调整：

`set/reset` 最好进一步收成 `write.set/reset`，避免把 preview runtime 误当成普通 store。

然后 editor 顶层服务图变成：

```ts
export type EditorServices = {
  engine: Engine
  local: EditorLocal
  input: EditorInputRuntime
  layout: EditorLayout
  query: EditorQuery
  snap: SnapRuntime
  commands: EditorCommands
  actions: EditorActions
  lifecycle: EditorLifecycle
}
```

没有顶层 `preview`。

## 6.3 `query` 签名

最终 `query` 的输入应写成：

```ts
export const createEditorQuery = ({
  engineRead,
  registry,
  history,
  local,
  input,
  layout
}: {
  engineRead: EngineRead
  registry: NodeRegistry
  history: ReadStore<HistoryState>
  local: Pick<EditorLocal, 'source' | 'viewport'>
  input: Pick<EditorInputRuntime, 'state' | 'preview'>
  layout: EditorLayout
}): EditorQuery
```

这里最重要的一点是：

`query` 直接吃 `input.preview`，而不是 editor 顶层 `preview`。

## 6.4 `commands` 签名

如果 `commands` 需要写 preview，例如 mindmap enter preview，最终也不该拿完整 `preview runtime`，而是拿一个窄写接口：

```ts
type PreviewWrite = EditorInputRuntime['preview']['write']
```

也就是：

```ts
export const createEditorCommands = ({
  engine,
  query,
  layout,
  preview,
  session
}: {
  engine: Engine
  query: EditorQuery
  layout: EditorLayout
  preview: PreviewWrite
  session: EditorCommandSession
})
```

这能进一步防止 command 直接依赖整个 preview runtime。

## 7. 最终装配顺序

最终装配顺序建议固定为：

```txt
local
  -> input.state
  -> input.preview
  -> layout
  -> query
  -> snap
  -> commands
  -> lifecycle
  -> actions
  -> input.host
```

更具体一点：

```ts
const local = createEditorLocal(...)
const inputState = createEditorInputState()
const inputPreview = createEditorInputPreview({
  viewport: local.viewport.read,
  gesture: inputState.gesture,
  hover: inputState.hover
})
const layout = createEditorLayout(...)
const query = createEditorQuery({
  engineRead,
  registry,
  history,
  local,
  input: {
    state: inputState.state,
    preview: inputPreview
  },
  layout
})
const commands = createEditorCommands({
  engine,
  query,
  layout,
  preview: inputPreview.write,
  session
})
const input = createEditorInput({
  state: inputState,
  preview: inputPreview,
  host: ...
})
```

这样 `preview` 的位置就彻底被限定为 input 子域。

## 8. 文件结构建议

最终不建议继续保留：

- `preview/index.ts` 作为 editor 顶层入口

建议改成：

```txt
input/
  state.ts
  preview.ts
  host.ts
  runtime.ts
```

或者如果 preview 逻辑继续偏多：

```txt
input/
  state.ts
  host.ts
  runtime.ts
  preview/
    runtime.ts
    selectors.ts
    state.ts
    node.ts
    edge.ts
    selection.ts
    types.ts
```

我更倾向第二种，因为：

- 逻辑仍然不小
- 但 ownership 已经明确属于 `input`

也就是说，保留 preview 子目录可以，保留顶层 `editor/preview` 不推荐。

## 9. 不该做的事

下面这些都不是长期最优：

1. 把 `preview` 直接并进 `query`
2. 继续把 `preview` 作为和 `input` 平级的 editor 顶层服务
3. 让 `command` 直接依赖完整 `preview` runtime
4. 让 `query` 拥有 preview 的 `set/reset`

## 10. 最终判断标准

完成收敛后，必须满足下面这些条件：

1. `EditorServices` 里不再有顶层 `preview`。
2. `query` 的输入改成 `input.state + input.preview`。
3. `commands` 只拿 `input.preview.write`，不拿完整 preview runtime。
4. `preview/index.ts` 这种顶层胶水入口消失。
5. preview 的目录 ownership 从 `editor/preview` 收口到 `input/preview` 或 `input.preview.ts`。

如果这五条没有同时成立，就说明 preview 还没有真正收干净。
