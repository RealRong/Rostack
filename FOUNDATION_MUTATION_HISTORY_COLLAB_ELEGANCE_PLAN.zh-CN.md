# Mutation / History / Collab 最终 API 设计与实施方案

本文只定义三件事：

1. 最终 API 应该长什么样
2. 为什么这样设计
3. 按什么顺序落地

不讨论兼容，不讨论过渡命名。

---

## 1. 设计目标

目标只有四条：

1. public API 简单清晰
2. internal API 只暴露语义，不暴露实现对象
3. domain 不重复定义 infra contract
4. collab 不重复 rebuild history runtime

一句话就是：

- `engine.history` 给 UI / editor
- `engine.mutation` 给 infra
- `mutation.internal.history` 给 collab 编排

---

## 2. 最终 API

## 2.1 Public engine API

领域 `engine` 只保留 product facade：

```ts
interface Engine {
  history: HistoryPort<Result>
  mutation: MutationPort<Doc, Op, Key, Result, Write>

  doc(): Doc
  current(): Current
  subscribe(listener: (current: Current) => void): () => void

  execute?(intent: Intent, options?: MutationOptions): Result
  apply(ops: readonly Op[], options?: MutationOptions): Result
  replace(doc: Doc, options?: MutationOptions): boolean
}
```

约束：

- `history` 是唯一 public history 入口
- `mutation` 是唯一 infra 入口
- public engine 不暴露 controller
- public engine 不暴露 sync 方法

## 2.2 Shared mutation infra API

`shared/mutation` 定义唯一正式 infra contract：

```ts
interface MutationPort<Doc, Op, Key, Result, Write> {
  history: HistoryPort<Result, Op, Key, Write>
  commits: CommitStream<CommitRecord<Doc, Op, Key, any>>

  doc(): Doc
  apply(ops: readonly Op[], options?: MutationOptions): Result
  replace(doc: Doc, options?: MutationOptions): boolean

  internal: {
    history: {
      observeRemote(changeId: string, footprint: readonly Key[]): void
      confirmPublished(input: {
        id: string
        footprint: readonly Key[]
      }): void
      cancelPending(mode: 'restore' | 'invalidate'): void
    }
  }
}
```

约束：

- `MutationPort` 放在 `shared/mutation`
- `CommandMutationEngine` 直接实现它
- domain 不再自己定义 `EngineMutationPort`

## 2.3 History API

`HistoryPort` 只保留 public 行为：

```ts
interface HistoryPort<Result, Op, Key, Write> extends ReadStore<HistoryState> {
  undo(): Result
  redo(): Result
  clear(): void

  withPolicy?(policy: HistoryPolicy<Result>): HistoryPort<Result, Op, Key, Write>
}
```

`HistoryPolicy` 只描述行为差异：

```ts
interface HistoryPolicy<Result> {
  canRun?(): boolean
  onUnavailable?(
    reason: 'history-missing' | 'cannot-apply' | 'empty',
    action: 'undo' | 'redo'
  ): Result
  onFailure?(result: Result): void
  onSuccess?(result: Result): void
}
```

约束：

- `HistoryPort` 不暴露 `controller`
- `HistoryPort` 不暴露 `sync`
- `collab` 只能装饰 `engine.history`
- `collab` 不再调用 `createHistoryPort(...)` 重新造一份 runtime

## 2.4 Collab API

`shared/collab` 直接吃 `MutationPort`：

```ts
const session = createMutationCollabSession(mutation, {
  actor,
  transport,
  document,
  change,
  policy
})
```

其中 `session.history` 来自：

```ts
const history = mutation.history.withPolicy({
  canRun,
  onUnavailable,
  onFailure
})
```

而不是：

- 读取 raw controller
- rebuild 第二个 history port
- 手动 sync 两份 state

---

## 3. 命名规则

命名只保留三层：

### 3.1 Public

- `engine`
- `engine.history`
- `engine.mutation`

### 3.2 Infra

- `MutationPort`
- `HistoryPort`
- `createMutationCollabSession`

### 3.3 Internal

- `mutation.internal.history.observeRemote`
- `mutation.internal.history.confirmPublished`
- `mutation.internal.history.cancelPending`

命名原则：

- public 用名词
- internal 用语义动词
- 不出现实现对象名

明确禁止的名字：

- `historyController`
- `syncHistory`
- `HistoryControllerCarrier`
- `readHistoryController`

因为这些名字都在暴露实现细节，而不是业务语义。

---

## 4. 为什么这是最终形态

### 4.1 `engine.history`

这是 UI / editor 真正关心的东西：

- 能不能 undo
- 能不能 redo
- 调 undo / redo / clear

这里不应该混入 collab 内部协调能力。

### 4.2 `engine.mutation`

这是 infra 真正关心的东西：

- 提交变更
- 接收 commit
- 参与 history / collab 编排

这里应该独立于领域 facade 存在。

### 4.3 `mutation.internal.history.*`

`collab` 真正需要的不是 controller，而是三类语义动作：

1. 观察 remote change
2. publish 成功后确认 pending history
3. publish 失败后取消 pending history

所以 internal history 应该暴露动作，不暴露对象。

### 4.4 `withPolicy(...)`

`collab` 需要的只是：

- 限制何时允许 undo/redo
- 自定义不可用错误
- 自定义失败后的处理

这本质上是对已有 `history` 的行为装饰，不是另造一个 history runtime。

所以最终抽象应该是：

- `withPolicy(...)`

而不是：

- `createHistoryPort(...)` 再包一层

---

## 5. 明确要删掉的东西

以下能力不进入最终设计：

### 5.1 删 raw controller 读取

删除：

- `historyController()`
- `readHistoryController(...)`
- 各类 controller carrier

替换为：

- `mutation.internal.history.observeRemote(...)`
- `mutation.internal.history.confirmPublished(...)`
- `mutation.internal.history.cancelPending(...)`

### 5.2 删显式 sync

删除：

- `syncHistory()`

原因：

- 它暴露了内部状态同步机制
- 这是结构副作用，不是正式语义

### 5.3 删 collab 重建 history runtime

删除：

- `collab` 内部再次 `createHistoryPort(...)`

替换为：

- `mutation.history.withPolicy(...)`

### 5.4 删 domain-local infra contract

删除：

- dataview 自己定义的 `EngineMutationPort`
- whiteboard 自己定义的 `EngineMutationPort`

替换为：

- `shared/mutation` 的唯一 `MutationPort`

---

## 6. 实施方案

## Phase 1：上提 shared contract

目标：

- 在 `shared/mutation` 定义唯一 `MutationPort`
- `shared/collab` 直接依赖它

完成标准：

- domain contract 中不再定义自己的 mutation infra port

## Phase 2：收口 internal history

目标：

- 在 `MutationPort.internal.history` 暴露语义动作

完成标准：

- 不再存在 `historyController()`
- 不再存在 raw controller 外露

## Phase 3：让 runtime 直接实现 `MutationPort`

目标：

- `CommandMutationEngine` 直接实现 `MutationPort`

完成标准：

- `engine.mutation = core`
- 不再手工构造 mutation adapter 对象

## Phase 4：把 collab 改成 history decorator

目标：

- `collab` 使用 `mutation.history.withPolicy(...)`

完成标准：

- `shared/collab` 不再 rebuild 第二个 history port
- 不再需要显式 sync history state

## Phase 5：清理类型断言

目标：

- 消掉主要结构性 cast

优先清理：

1. `history as Engine['history']`
2. `intent as never`
3. `as ExecuteResult<...>`
4. `as Omit<Engine, ...>`
5. `as unknown as Result`

完成标准：

- 核心边界不再依赖行为型断言

---

## 7. 最终状态示意

```ts
const core = new CommandMutationEngine(spec)

const engine = {
  history: core.history,
  mutation: core,
  doc: () => core.doc(),
  current: () => ...,
  subscribe: ...,
  execute: ...,
  apply: ...,
  replace: ...
}
```

```ts
const session = createMutationCollabSession(engine.mutation, {
  actor,
  transport,
  document,
  change,
  policy
})
```

```ts
const history = engine.history.withPolicy({
  canRun,
  onUnavailable,
  onFailure
})
```

```ts
mutation.internal.history.observeRemote(changeId, footprint)
mutation.internal.history.confirmPublished({ id, footprint })
mutation.internal.history.cancelPending('invalidate')
```

---

## 8. 一句话结论

最终 API 应该只保留：

- `engine.history`
- `engine.mutation`
- `mutation.internal.history.*`
- `history.withPolicy(...)`

最终必须删掉：

- raw controller 暴露
- 显式 sync 暴露
- collab 自己重建 history runtime
- domain 重复定义 infra contract

做到这一步，API 才算真正简单、清晰、稳定。 
