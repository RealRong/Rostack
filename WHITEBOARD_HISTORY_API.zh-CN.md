# Whiteboard History API

本文定义 whiteboard 的长期最优 history 架构。

本文覆盖：

- `engine.write` 的最终模型
- 单机 history 与协作 local history 的正式边界
- 独立 history 包的最终 API
- editor / react 的 history 注入方式

本文不重复交互提交原子化设计。相关内容见：

- [`WHITEBOARD_WRITE_CLOSURE.zh-CN.md`](/Users/realrong/Rostack/WHITEBOARD_WRITE_CLOSURE.zh-CN.md)
- [`WHITEBOARD_YJS_SYNC_API.zh-CN.md`](/Users/realrong/Rostack/WHITEBOARD_YJS_SYNC_API.zh-CN.md)

---

## 1. 固定结论

长期最优下，whiteboard 的 history 架构固定为：

1. `history` 不是 `engine` 的内建字段。
2. `engine` 只负责产生统一的语义写入事件。
3. 单机 history 与协作 local history 分别实现，但共享同一套 `HistoryApi` contract。
4. 只共享薄底座，不做一个 `mode/config` 驱动的巨型统一 history 状态机。
5. `editor` / `react` 只依赖注入的 `HistoryApi`，不再直接依赖 `engine.history`。

一句话：

- `engine` 提供写入真相源
- `history` 消费写入真相源
- `editor` 只消费 history 接口

---

## 2. 为什么 `writeRecord` 不对

当前模型里，一次成功写入会暴露两份公开对象：

- `commit`
- `writeRecord`

它们分别承载不同信息：

- `commit` 承载 `doc / changes`
- `writeRecord` 承载 `forward / inverse / footprint`

这不是长期最优，因为它把“一次语义写入”拆成了两条并行公开通道。

结果就是：

- editor 监听 `commit`
- collab 监听 `writeRecord`
- history 又依赖 `inverse`
- 不同层读的是不同事件对象

这说明模型没有收束。

长期最优下，`commit` 和 `writeRecord` 都应该消失，统一成一个正式事件：

```ts
type EngineWrite = {
  rev: number
  at: number
  origin: Origin
  doc: Document
  changes: ChangeSet
  forward: readonly Operation[]
  inverse: readonly Operation[]
  footprint: HistoryFootprint
}
```

约束：

- 一次成功写入只产出一个 `EngineWrite`
- editor、history、collab 都只读这一个上游对象
- 不再出现 `commit + writeRecord` 双轨

---

## 3. 最终边界

### 3.1 `core`

`core` 继续负责：

- reducer
- inverse
- footprint
- dirty / invalidation

`core` 不负责：

- history stack
- undo / redo policy
- collab local history

### 3.2 `engine`

`engine` 继续负责：

- command -> operation compile
- reduce
- materialize document
- 产出统一 `EngineWrite`

`engine` 不再负责：

- 内建单机 history stack
- undo / redo UI 能力
- history config

也就是说，`engine` 的职责是：

- 产生写入事件

不是：

- 自带一个默认 history 驱动

### 3.3 `history`

history 是围绕 engine 的独立 capability。

它消费：

- `engine.write`

它负责：

- capture policy
- undo / redo stack
- clear
- invalidated state

### 3.4 `collab`

协作 local history 仍然属于 `collab` 领域。

因为它依赖：

- published `SharedChange`
- remote change observe seq
- footprint invalidation
- pending transition

这些都不是通用本地 history 底座应该理解的东西。

因此长期最优下：

- `session.localHistory` 继续由 `@whiteboard/collab` 持有
- 但它必须满足统一 `HistoryApi`

### 3.5 `editor`

`editor` 不应该再依赖：

- `engine.history`

`editor` 只依赖：

- 注入的 `HistoryApi`

因此：

- 单机 editor 可接本地 history driver
- 协作 editor 可接 `session.localHistory`
- editor 本身不关心底层实现来自哪里

---

## 4. 为什么不是一个统一 `createHistory(config)`

表面上看，单机 history 和协作 local history 都有：

- undo
- redo
- clear
- state store

但它们的正式语义不同。

单机 history 只需要：

- capture 本地 write
- stack replay
- capacity / clear

协作 local history 还需要：

- published change capture
- remote footprint invalidation
- observed change clock
- invalidated state
- pending undo/redo transition

这已经不是同一种 runtime。

如果强行做：

```ts
createHistory({
  mode: 'local' | 'collab',
  ...
})
```

最后一定会变成：

- option soup
- 分支状态机
- 一个抽象层同时理解 engine 与 collab 语义

这不是最低复杂度。

长期最优应该是：

- 统一接口
- 统一上游写入事件
- 分开的 driver
- 很薄的共享底座

不要做一个大而全的可配置 history runtime。

---

## 5. 独立包设计

长期最优下，新增独立包：

- `@whiteboard/history`

它只承载：

- 通用 contract
- 单机 history driver
- history binding

它不承载：

- collab local history runtime
- Yjs / SharedChange 语义

建议目录：

- `whiteboard/packages/whiteboard-history/src/types.ts`
- `whiteboard/packages/whiteboard-history/src/localEngineHistory.ts`
- `whiteboard/packages/whiteboard-history/src/binding.ts`
- `whiteboard/packages/whiteboard-history/src/index.ts`

---

## 6. 最终 API

### 6.1 `@whiteboard/engine`

```ts
type EngineWrite = {
  rev: number
  at: number
  origin: Origin
  doc: Document
  changes: ChangeSet
  forward: readonly Operation[]
  inverse: readonly Operation[]
  footprint: HistoryFootprint
}
```

```ts
type Engine = {
  config: Readonly<BoardConfig>
  document: {
    get: () => Document
  }
  read: EngineRead
  write: ReadStore<EngineWrite | null>
  execute: <C extends Command>(
    command: C,
    options?: ExecuteOptions
  ) => ExecuteResult<C>
  apply: (
    ops: readonly Operation[],
    options?: BatchApplyOptions
  ) => CommandResult
  configure: (config: EngineRuntimeOptions) => void
  dispose: () => void
}
```

约束：

- 删除 `engine.history`
- 删除 `engine.commit`
- 删除 `engine.writeRecord`
- `configure.history` 不再存在

`engine.write` 是唯一正式写入事件。

### 6.2 `@whiteboard/history`

```ts
type HistoryState = {
  canUndo: boolean
  canRedo: boolean
  undoDepth: number
  redoDepth: number
  invalidatedDepth: number
  isApplying: boolean
  lastUpdatedAt?: number
}
```

```ts
type HistoryApi = ReadStore<HistoryState> & {
  undo: () => CommandResult
  redo: () => CommandResult
  clear: () => void
}
```

```ts
type LocalEngineHistoryConfig = {
  enabled: boolean
  capacity: number
  captureSystem: boolean
  captureRemote: boolean
}
```

```ts
const createLocalEngineHistory: (
  engine: Engine,
  config?: Partial<LocalEngineHistoryConfig>
) => HistoryApi
```

语义：

- 消费 `engine.write`
- 使用 `forward / inverse / origin`
- `invalidatedDepth` 固定为 `0`

### 6.3 history binding

因为协作 session 可能晚于 editor 创建，所以还需要一个可切换绑定层。

```ts
type HistoryBinding = HistoryApi & {
  set: (next: HistoryApi) => void
  reset: () => void
}
```

```ts
const createHistoryBinding: (
  initial: HistoryApi
) => HistoryBinding
```

规则：

- `get/subscribe/undo/redo/clear` 始终代理当前绑定源
- `set(next)` 切换到新的 history 源
- `reset()` 回退到初始 history 源

注意：

- `HistoryBinding` 自己也是 `HistoryApi`
- 因此 editor 不需要知道“它拿到的是直接 history 还是 binding”

### 6.4 `@whiteboard/collab`

```ts
type CollabSession = {
  localHistory: HistoryApi
  // existing fields ...
}
```

约束：

- `session.localHistory` 必须满足统一 `HistoryApi`
- 允许它有更强内部状态
- 但 editor 只消费 `HistoryApi`

### 6.5 `@whiteboard/editor`

```ts
type CreateEditorOptions = {
  engine: Engine
  history: HistoryApi
  // existing fields ...
}
```

```ts
type EditorRead = {
  history: HistoryApi
  // existing fields ...
}
```

```ts
type EditorActions = {
  history: Pick<HistoryApi, 'undo' | 'redo' | 'clear'>
  // existing fields ...
}
```

约束：

- editor 不再依赖 `Engine.history`
- editor 不再暴露“默认走 engine history”的假设

---

## 7. 推荐组合方式

### 7.1 单机模式

```ts
const engine = createEngine(...)
const history = createLocalEngineHistory(engine)

const editor = createEditor({
  engine,
  history
})
```

### 7.2 协作模式

```ts
const engine = createEngine(...)
const baseHistory = createLocalEngineHistory(engine)
const history = createHistoryBinding(baseHistory)

const editor = createEditor({
  engine,
  history
})

const session = createYjsSession({
  engine,
  ...
})

history.set(session.localHistory)
```

session 销毁后：

```ts
history.reset()
```

这样：

- editor 无需重建
- react UI 无需改消费面
- 单机与协作都走同一 history 接口

---

## 8. 为什么不是 `withHistory(createEditor)`

Slate 的关键思想是对的：

- history 不是核心对象的本体

但在 whiteboard 里，真正的语义核心不是 editor，而是 engine。

因为：

- undo / redo replay 的单位是 semantic operations
- inverse 来源于 engine 写入线
- collab local history 也依赖 engine 写入事件

因此 whiteboard 的长期最优语义更接近：

- `withHistory(createEngine)`

而不是：

- `withHistory(createEditor)`

但这里也不建议真的用对象 augmentation。

长期最优还是显式组合：

```ts
const engine = createEngine(...)
const history = createLocalEngineHistory(engine)
```

这样比动态给 engine/editor 挂字段更清楚。

---

## 9. 实施方案

### Phase 1

目标：统一 engine 写入事件。

实施：

- 引入 `EngineWrite`
- `engine` 只公开 `write`
- 删除 `commit`
- 删除 `writeRecord`
- 把依赖 `commit` / `writeRecord` 的下游全部切到 `engine.write`

完成标准：

- 一次成功写入只有一个正式公开事件
- editor / history / collab 都只读 `engine.write`

### Phase 2

目标：拆出独立 history 包。

实施：

- 新增 `@whiteboard/history`
- 把 `HistoryState` / `HistoryApi` 从 `core/kernel` 移出
- 新增 `createLocalEngineHistory(engine)`
- 新增 `createHistoryBinding(initial)`

完成标准：

- `engine` 不再自带 history
- 单机 history 通过外部组合获得

### Phase 3

目标：editor / react 切换到 history 注入。

实施：

- `createEditor({ engine, history })`
- editor query / read / actions 改读注入的 history
- react wrapper 在单机模式下注入本地 history
- collab session 建立后切换到 `session.localHistory`

完成标准：

- editor / react 不再直接访问 `engine.history`
- undo / redo / history panel 全部通过注入接口工作

### Phase 4

目标：清理旧残留。

实施：

- 删除 engine history 相关类型
- 删除 `configure.history`
- 删除 editor 中对 engine history 的适配残留
- 清理相关测试与文档

完成标准：

- history 架构只剩一套正式模型

---

## 10. 非目标

本文明确不做：

- 一个 `mode/config` 驱动 local 与 collab 的统一巨型 history runtime
- editor 自己从 raw ops 反推 inverse
- collab local history 下沉到通用 history 包
- `withHistory(createEditor)` 风格的 editor augmentation
- 保留 `commit + writeRecord + history` 三轨并存

这些都会增加复杂度，而不会让模型更清楚。

---

## 11. 最终原则

最后把长期原则压缩成五句：

- `engine` 只负责产生统一写入事件，不负责内建 history。
- `commit` 与 `writeRecord` 都不是长期最优模型，最终应合并成 `EngineWrite`。
- 单机 history 与协作 local history 分别实现，但必须满足同一 `HistoryApi`。
- 共享的是 contract 与薄 binding，不是一个巨型配置化 runtime。
- editor / react 只依赖注入的 history 接口，不能再绑死 `engine.history`。
