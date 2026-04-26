# 统一 History 与 Collab 的最终 API 设计与迁移方案

## 1. 结论

最终分层直接定为：

```text
shared/mutation = mutation kernel + history
shared/collab   = collab runtime
whiteboard/dataview = domain adapters
```

对应判断也直接固定：

1. `history` 留在 `shared/mutation`，不拆独立包。
2. `collab` 拆成 `shared/collab`，但必须明确依赖 `shared/mutation`。
3. `history` 和 `collab` 都直接吃 `mutation engine`。
4. 不再传 `doc/replace/apply/writes/history` 这类散装能力参数。
5. API 设计以**简单、稳定、命名成组**为目标，不做平铺和重复命名。

---

## 2. 最终包结构

### 2.1 `shared/mutation`

职责只保留：

- `CommandMutationEngine`
- `OperationMutationRuntime`
- `Write` / `WriteStream`
- `HistoryController`
- `createLocalMutationHistory(engine, options?)`

它不再承担：

- collab session lifecycle
- replay / resync runtime
- provider / store contract
- checkpoint orchestration
- 领域 codec / Yjs 细节

一句话概括：

```text
shared/mutation 只负责单机 mutation 内核，以及紧贴内核的 history
```

### 2.2 `shared/collab`

职责明确为：

- `createMutationCollabSession(engine, options)`
- replay plan
- sync cursor
- provider / store contract
- session status / diagnostics
- checkpoint orchestration

一句话概括：

```text
shared/collab 是建立在 mutation engine 之上的协作运行时
不是第二套 kernel
```

### 2.3 领域层

whiteboard / dataview 保留：

- `footprint` / history key schema
- `SharedChange` codec
- `Checkpoint` codec
- `Yjs` store shape
- `empty document` 构造
- live/change 分类规则
- 领域 adapter

一句话概括：

```text
shared 层统一 runtime
领域层保留语义
```

---

## 3. API 设计原则

### 3.1 直接吃 engine

所有 history / collab 的最终入口都直接接收 `engine`：

```ts
createLocalMutationHistory(engine, options?)
createMutationCollabSession(engine, options)
```

不再接受这种能力包：

```ts
createLocalMutationHistory({
  writes,
  history,
  apply
})

createMutationCollabSession({
  doc,
  replace,
  apply,
  writes,
  history
})
```

原因很简单：

- 这些能力本来就都属于 `engine`
- 拆成参数包只会制造额外抽象层
- 调用方更容易传出不一致状态

### 3.2 同类字段进入同一个命名空间

API 不再平铺这些名字：

- `actorId`
- `createId`
- `toCheckpoint`
- `toSharedChange`
- `canPublishWrite`
- `canObserveRemote`

而是收成有语义的命名空间：

- `actor.*`
- `document.*`
- `change.*`
- `transport.*`
- `policy.*`
- `apply.*`

这样有三个好处：

1. 调用点更短，更稳定。
2. 相似语义聚合，不会越长越散。
3. 后续扩展时不需要继续发明重复前缀。

### 3.3 选项对象只表达配置，不表达能力拼装

`options` 里应该放：

- policy
- actor
- transport
- document codec
- change codec

不应该放：

- 再包一层 engine facade
- 再包一层 runtime capability bag

---

## 4. `shared/mutation` 最终 API

### 4.1 History API

最终只保留一个正式入口：

```ts
type LocalHistoryState = {
  canUndo: boolean
  canRedo: boolean
  undoDepth: number
  redoDepth: number
  invalidatedDepth: number
  isApplying: boolean
  lastUpdatedAt?: number
}

type LocalHistoryApi<Result> = ReadStore<LocalHistoryState> & {
  undo(): Result
  redo(): Result
  clear(): void
}

type LocalHistoryOptions<Result> = {
  apply?: {
    origin?: Origin
    canRun?(): boolean
    onUnavailable?(
      reason: 'history-missing' | 'cannot-apply' | 'empty'
    ): Result
  }
}

declare function createLocalMutationHistory<Result>(
  engine: MutationEngineLike<any, any, any, any, Result>,
  options?: LocalHistoryOptions<Result>
): LocalHistoryApi<Result>
```

### 4.2 为什么这样分组

这里的可选项只和“history apply 行为”有关，所以统一进 `apply.*`：

- `apply.origin`
- `apply.canRun`
- `apply.onUnavailable`

而不是平铺成：

- `origin`
- `canApply`
- `onUnavailable`

原因是这几个字段都只描述一件事：**历史回放如何执行**。

---

## 5. `shared/collab` 最终 API

## 5.1 Engine 契约

`shared/collab` 不发明新的协作引擎抽象，只认 mutation engine 的正式公共接口：

```ts
type MutationEngineLike<Doc, Op, Key, Write, Result> = {
  current(): { doc: Doc }
  replace(doc: Doc, options?: { origin?: Origin }): boolean
  apply(ops: readonly Op[], options?: { origin?: Origin }): Result
  writes: WriteStream<Write>
  history?: HistoryController<Op, Key, Write>
}
```

这里最关键的是：

- 必须有正式 `replace(doc, options?)`
- 必须有稳定 `current().doc`
- collab runtime 不依赖领域 intent 名称

## 5.2 Store / Provider 契约

```ts
type CollabStore<Change, Checkpoint> = {
  read(): {
    checkpoint: Checkpoint | null
    changes: readonly Change[]
  }
  subscribe(listener: () => void): () => void
  append(change: Change): void
  checkpoint(checkpoint: Checkpoint): void
  clearChanges(): void
}

type CollabProvider = {
  connect?(): void
  disconnect?(): void
  destroy?(): void
  isSynced?(): boolean
  subscribeSync?(listener: (synced: boolean) => void): (() => void)
  awareness?: unknown
}
```

## 5.3 Session API

最终 API 不用平铺参数，而是按语义收成 5 个命名空间：

```ts
type MutationCollabSessionOptions<Doc, Op, Write, Change, Checkpoint> = {
  actor: {
    id: string
    createChangeId(): string
  }
  transport: {
    store: CollabStore<Change, Checkpoint>
    provider?: CollabProvider
  }
  document: {
    empty(): Doc
    checkpointEvery?: number
    checkpoint: {
      create(doc: Doc): Checkpoint
      read(checkpoint: Checkpoint): Doc
    }
  }
  change: {
    create(
      write: Write,
      meta: { actorId: string; changeId: string }
    ): Change | null
    read(
      change: Change
    ):
      | { kind: 'apply'; operations: readonly Op[] }
      | { kind: 'replace'; document: Doc }
  }
  policy?: {
    canPublish?(write: Write): boolean
    canObserve?(): boolean
  }
}

type MutationCollabSession<Result> = {
  status: ReadStore<CollabStatus>
  diagnostics: ReadStore<CollabDiagnostics>
  history: LocalHistoryApi<Result>
  connect(): void
  disconnect(): void
  resync(): void
  destroy(): void
}

declare function createMutationCollabSession<
  Doc,
  Op,
  Key,
  Write,
  Change,
  Checkpoint,
  Result
>(
  engine: MutationEngineLike<Doc, Op, Key, Write, Result>,
  options: MutationCollabSessionOptions<Doc, Op, Write, Change, Checkpoint>
): MutationCollabSession<Result>
```

## 5.4 为什么这样分组

### `actor.*`

只负责“这次会话是谁在写”：

- `actor.id`
- `actor.createChangeId`

### `transport.*`

只负责“变化存在哪里，怎么连”：

- `transport.store`
- `transport.provider`

### `document.*`

只负责“文档如何 checkpoint / restore”：

- `document.empty`
- `document.checkpointEvery`
- `document.checkpoint.create`
- `document.checkpoint.read`

### `change.*`

只负责“write 和 shared change 之间如何转换”：

- `change.create`
- `change.read`

### `policy.*`

只负责“当前会话允许做什么”：

- `policy.canPublish`
- `policy.canObserve`

这比下面这种平铺 API 更好：

```ts
createMutationCollabSession(engine, {
  actorId,
  createId,
  store,
  provider,
  empty,
  checkpointEvery,
  toCheckpoint,
  readCheckpoint,
  toSharedChange,
  readSharedChange,
  canPublishWrite,
  canObserveRemote
})
```

问题在于：

- 命名重复
- 语义散开
- 调用点越来越长
- 扩展时很难继续保持一致

---

## 6. 领域适配层应该保留什么

shared 层不会统一下面这些东西：

- history key schema / `footprint`
- `SharedChange` 具体结构
- `Checkpoint` 具体结构
- Yjs codec / store 内容
- live change 与 replace / checkpoint 的分类规则

所以 whiteboard / dataview 仍然要各自实现：

```ts
document.checkpoint.create
document.checkpoint.read
change.create
change.read
```

shared 统一的是 runtime，不是领域语义本身。

---

## 7. 迁移步骤

## 阶段 1：收敛 history

先做：

1. 在 `shared/mutation` 内提供 `createLocalMutationHistory(engine, options?)`
2. whiteboard 改用这套 history facade
3. dataview 改用这套 history facade

完成后：

- `whiteboard-history` 可以删除或退化成 re-export
- dataview UI 不再直接操作裸 `HistoryController`

## 阶段 2：拆出 `shared/collab`

再做：

1. 新建 `shared/collab`
2. 把 replay / status / diagnostics / provider contract 放进去
3. 定义 `createMutationCollabSession(engine, options)`
4. 把 whiteboard-collab 改成 `shared/collab + whiteboard adapter`

完成后：

- collab runtime 从领域包里剥离
- `shared/collab` 明确成为共享 runtime 包

## 阶段 3：补齐 engine 公共契约

必须补齐：

1. whiteboard engine 公开 `replace(doc, options?)`
2. dataview engine 公开 `replace(doc, options?)`
3. collab runtime 只调用 `engine.replace()`，不再依赖领域 intent

## 阶段 4：dataview 接入 collab

最后做：

1. 定义 dataview 的 checkpoint codec
2. 定义 dataview 的 change codec
3. 定义 dataview 的 collab adapter
4. 直接接入 `shared/collab`

约束很明确：

```text
dataview 接 shared/collab
不复制 whiteboard-collab
```

---

## 8. 最终禁止项

长期最优方案下，不再接受这些设计：

### 8.1 不再有散装能力包

```ts
{ doc, replace, apply, writes, history }
```

### 8.2 不再有额外协作引擎包装层

```ts
CollaborativeEngine
```

### 8.3 不再有平铺重复命名

```ts
actorId
createId
toCheckpoint
toSharedChange
canPublishWrite
canObserveRemote
```

### 8.4 不再让领域包自己长完整 collab runtime

```text
whiteboard-collab / dataview-collab 只做 adapter
不再各自维护一套 session framework
```

---

## 9. 最终判断

最终架构就是：

```text
shared/mutation = kernel + history
shared/collab   = collab runtime
whiteboard/dataview = adapters
```

最终 API 就是：

```ts
createLocalMutationHistory(engine, {
  apply: {
    origin,
    canRun,
    onUnavailable
  }
})

createMutationCollabSession(engine, {
  actor: { ... },
  transport: { ... },
  document: { ... },
  change: { ... },
  policy: { ... }
})
```

这个形态的优点是：

1. 边界清楚。
2. API 短且稳定。
3. 命名按语义成组，不会越演进越散。
4. whiteboard 和 dataview 可以共享 runtime，但保留自己的领域语义。

---

## 10. 实施清单

这一节只回答一个问题：

```text
如果现在开始落地，应该按什么顺序改，分别改什么
```

## 10.1 `shared/mutation`

目标：

```text
把 history 收成唯一正式入口
把 mutation engine 的公共契约补齐
```

实施项：

1. 提供 `createLocalMutationHistory(engine, options?)`
2. 统一 `LocalHistoryState` / `LocalHistoryApi` / `LocalHistoryOptions`
3. 让 history facade 内部自己完成：
   - `undo/redo`
   - `engine.apply(..., { origin })`
   - `history.confirm()`
   - `history.cancel()`
4. 删除或废弃 binding 形态，不再提供 `createHistoryBinding(...)`
5. 确认 mutation engine 稳定暴露：
   - `current().doc`
   - `apply(...)`
   - `replace(doc, options?)`
   - `writes`
   - `history`
6. 保证 history helper 只依赖上述公共接口，不依赖领域层 intent

完成标准：

- `shared/mutation` 内不再存在第二套 history facade
- 上层不再自己写 undo/redo apply/confirm/cancel 流程
- `replace(doc, options?)` 成为正式公共契约

## 10.2 `shared/collab`

目标：

```text
把 collab runtime 从领域包里剥离成共享层
但不发明第二套 engine 抽象
```

实施项：

1. 新建 `shared/collab`
2. 提供 `createMutationCollabSession(engine, options)`
3. 提供 replay 相关能力：
   - `createSyncCursor(...)`
   - `planReplay(...)`
4. 提供 session runtime 基础模型：
   - `CollabStatus`
   - `CollabDiagnostics`
5. 提供 transport 契约：
   - `CollabStore`
   - `CollabProvider`
6. 在 session 内部完成：
   - bootstrap
   - local publish
   - remote consume
   - checkpoint rotation
   - resync
   - provider lifecycle
   - local history integration
7. 保证 session 只通过 `engine` 使用 mutation 能力，不接收 `doc/replace/apply/writes/history` 参数包
8. 保证 API 只暴露命名空间化 options：
   - `actor.*`
   - `transport.*`
   - `document.*`
   - `change.*`
   - `policy.*`

完成标准：

- `shared/collab` 可以独立表达完整 collab runtime
- `shared/collab` 明确依赖 `shared/mutation`
- `shared/collab` 内不存在 `CollaborativeEngine` 包装层

## 10.3 `whiteboard`

目标：

```text
让 whiteboard 退回成 domain adapter
不再自己维护一套 history/collab runtime
```

实施项：

1. 用 `@shared/mutation.createLocalMutationHistory(...)` 替换本地 history 包装
2. 删除 `whiteboard-history` 内的 runtime 逻辑
3. 将 `whiteboard-history` 删除，或退化成极薄 re-export
4. 让 `whiteboard-engine` 正式暴露：
   - `replace(doc, options?)`
   - `current().doc`
5. 把 `whiteboard-collab` 改成：
   - 调用 `@shared/collab.createMutationCollabSession(...)`
   - 提供 whiteboard 的 `document.*` 适配
   - 提供 whiteboard 的 `change.*` 适配
   - 提供 whiteboard 的 `transport.*` 具体实现
6. 将 whiteboard 特有逻辑限制在 adapter 内：
   - checkpoint codec
   - change codec
   - Yjs store shape
   - live/change 分类规则
   - empty document 构造

完成标准：

- `whiteboard-history` 不再拥有独立产品逻辑
- `whiteboard-collab` 不再拥有完整 session framework
- `whiteboard` 只保留 adapter 与领域语义

## 10.4 `dataview`

目标：

```text
先对齐 history
再作为第二个 consumer 接入 shared/collab
```

实施项：

1. 用 `@shared/mutation.createLocalMutationHistory(...)` 替换 dataview UI 里手写的 history apply 流程
2. 禁止 dataview UI 继续直接操作裸 `HistoryController`
3. 让 `dataview-engine` 正式暴露：
   - `replace(doc, options?)`
   - `current().doc`
4. 定义 dataview 的 collab adapter：
   - `document.checkpoint.create`
   - `document.checkpoint.read`
   - `change.create`
   - `change.read`
5. 定义 dataview 的 transport/store/provider 组合方式
6. 直接接入 `@shared/collab.createMutationCollabSession(...)`
7. 不复制 whiteboard-collab，不再长第二套 dataview session runtime

完成标准：

- dataview history 与 whiteboard history 共享同一套 runtime
- dataview collab 直接建立在 `shared/collab` 之上
- dataview 只新增 adapter，不新增第二套框架

## 10.5 推荐落地顺序

按下面顺序推进，返工最少：

1. 先完成 `shared/mutation` 的 history 收口
2. 再补齐 whiteboard / dataview 的 `engine.replace(...)`
3. 再新建 `shared/collab`
4. 先让 whiteboard 接入 `shared/collab`
5. 最后让 dataview 作为第二个 consumer 接入

原因：

- history 比 collab 薄，先收口风险最低
- `replace(...)` 是 collab runtime 的硬前提
- whiteboard 已经有完整 collab 场景，最适合作为第一落地对象
- dataview 第二个接入，最能验证共享抽象是否真的成立

## 10.6 每块完成后的验收问题

### `shared/mutation`

- 上层是否还在手写 `undo -> apply -> confirm/cancel`？
- 是否还存在 binding 代理层？
- `replace(doc, options?)` 是否已经是正式公共接口？

### `shared/collab`

- session 是否还在接收散装能力包？
- 是否还存在额外 `CollaborativeEngine` 包装？
- options 是否已经按 `actor/transport/document/change/policy` 分组？

### `whiteboard`

- `whiteboard-history` 是否还保留实际 runtime？
- `whiteboard-collab` 是否还在自己做 replay / provider lifecycle / local history？
- whiteboard 特有逻辑是否已经收缩到 adapter？

### `dataview`

- UI 是否还直接依赖裸 `engine.history`？
- collab 是否直接复用了 `shared/collab`？
- dataview 是否只新增 adapter，而没有复制 session framework？
