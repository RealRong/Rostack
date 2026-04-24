# Shared Mutation Final API

本文只做两件事：

1. 定义 **最终 API**
2. 给出 **实施方案**

不讨论过渡，不讨论兼容，不保留旧设计包袱。

这份文档是最终实现时应直接对齐的 API 基线。

---

## 1. 目标

Dataview 和 Whiteboard 最终都要迁到同一套 write-side foundation。

这套 foundation 只覆盖写入主轴：

```text
Intent[]
  -> compile
  -> Operation[]
  -> apply
  -> Write
  -> history / collab
```

只保留最必要的 shared 模块：

```text
shared/mutation
  - path
  - meta
  - compiler
  - draft
  - apply
  - write
  - history
  - collab
```

不再单独做：

- `engine` 模块
- `projector` 模块
- `kernelSpec` 多钩子配置模块
- 复杂 runtime facade

这些都属于过度设计。

---

## 2. 设计原则

### 2.1 命名直接

最终命名只用最短、最稳定的词：

- `Intent`
- `Operation`
- `Path`
- `Write`
- `History`
- `Collab`

不要再引入：

- `Action` / `Command` 作为 shared 术语
- `DocumentMutationKernelSpec`
- `ReducerTx`
- `DocumentMutationContext`
- `WriteRecordEffectEnvelope`

这些名字要么领域化，要么过长。

### 2.2 API 少字段

shared API 只放真正跨项目复用的信息。

例如：

- `Write` 不嵌套 `history.effect.extra`
- `Apply` 不暴露 `beforeEach / afterEach / shortCircuit / finalize` 一整套钩子树
- `Meta` 不同时保留 `namespace / reducer / family` 三套近义字段

### 2.3 只支持一种 mutation 风格

最终只支持：

- mutable draft
- lazy copy-on-write

不兼容：

- immutable replace per op
- deep clone
- overlay 作为 shared 抽象

### 2.4 Operation 继续语义化

最终 operation 仍然是：

1. `typed lifecycle / relation / order`
2. `typed field`
3. `path-based record`

不做：

- `document.path.set`
- `document.path.unset`

这种全 generic mega-op。

---

## 3. 最终包结构

最终目录应收敛为：

```text
shared/mutation/
  src/
    index.ts
    path.ts
    meta.ts
    compiler.ts
    draft.ts
    apply.ts
    write.ts
    history.ts
    collab.ts
```

`shared/core` 继续保留低层原语：

- `planningContext`
- `mutationContext`
- `mutationTx`
- `operationBuffer`
- `historyFootprint`
- `changeSet`
- `entityDelta`

`shared/mutation` 只负责把这些低层原语组织成一条完整写入主轴。

---

## 4. 最终 API

## 4.1 `path.ts`

```ts
export type PathKey = string | number
export type Path = readonly PathKey[]

export const path: {
  root(): Path
  of(...keys: readonly PathKey[]): Path
  eq(a: Path, b: Path): boolean
  startsWith(path: Path, prefix: Path): boolean
  overlaps(a: Path, b: Path): boolean
  append(path: Path, ...keys: readonly PathKey[]): Path
  parent(path: Path): Path | undefined
  toString(path: Path): string
}
```

说明：

- root 永远是 `[]`
- 不再使用字符串 path
- `toString()` 只用于 debug / key serialization，不用于业务逻辑

---

## 4.2 `meta.ts`

这里只保留 operation 真正需要的 shared metadata。

```ts
export type OpSync =
  | 'live'
  | 'checkpoint'

export interface OpMeta {
  family: string
  sync?: OpSync
  history?: boolean
}

export type OpMetaTable<Op extends { type: string }> =
  Record<Op['type'], OpMeta>

export const meta: {
  create<Op extends { type: string }>(
    table: Record<Op['type'], OpMeta>
  ): OpMetaTable<Op>

  get<Op extends { type: string }>(
    table: OpMetaTable<Op>,
    input: Op | Op['type']
  ): OpMeta

  isLive<Op extends { type: string }>(
    table: OpMetaTable<Op>,
    input: Op | Op['type']
  ): boolean

  tracksHistory<Op extends { type: string }>(
    table: OpMetaTable<Op>,
    input: Op | Op['type']
  ): boolean
}
```

字段解释：

- `family`：只保留一份分发/分组维度
- `sync`：collab 只需要知道是不是 live
- `history`：history 只需要知道应不应该 capture

明确删除：

- `namespace`
- `reducer`
- `OperationHistoryMode = 'track' | 'skip'`

这些都没必要单独存在。

---

## 4.3 `compiler.ts`

shared compiler 只做三件事：

- 读 document
- 收集 issue
- emit operations

```ts
export interface Issue {
  code: string
  message: string
  path?: string
  level?: 'error' | 'warning'
}

export interface CompileCtx<Doc, Op> {
  doc(): Doc
  emit(op: Op): void
  emitMany(...ops: readonly Op[]): void
  issue(issue: Issue): void
  require<T>(
    value: T | undefined,
    code: string,
    message: string,
    path?: string
  ): T | undefined
}

export type CompileOne<Doc, Intent, Op, Output = void> = (
  ctx: CompileCtx<Doc, Op>,
  intent: Intent,
  index: number
) => Output | void

export interface CompileResult<Doc, Op, Output = void> {
  doc: Doc
  ops: readonly Op[]
  issues: readonly Issue[]
  outputs: readonly Output[]
}

export const compile: <
  Doc,
  Intent,
  Op,
  Output = void
>(input: {
  doc: Doc
  intents: readonly Intent[]
  run: CompileOne<Doc, Intent, Op, Output>
  previewApply(doc: Doc, ops: readonly Op[]): Doc
  stopOnError?: boolean
}) => CompileResult<Doc, Op, Output>
```

说明：

- `previewApply()` 是唯一编译期推进 working doc 的入口
- 不再暴露 `CompilerRuntimeSpec` / `SessionFactory` / `SourceFactory`
- `Issue` 直接统一，不再在 shared 层加更多包装

Dataview / Whiteboard 都直接实现 `run(ctx, intent, index)` 即可。

---

## 4.4 `draft.ts`

shared draft API 必须非常小。

```ts
export interface Draft<Doc> {
  readonly base: Doc
  doc(): Doc
  write(): Doc
  done(): Doc
}

export type DraftFactory<Doc> = (
  doc: Doc
) => Draft<Doc>

export const cowDraft: {
  create<Doc extends object>(): DraftFactory<Doc>
}

export const draftPath: {
  get(root: unknown, path: Path): unknown
  has(root: unknown, path: Path): boolean
  set(root: unknown, path: Path, value: unknown): void
  unset(root: unknown, path: Path): void
}

export const draftList: {
  insertAt<T>(list: T[], index: number, value: T): void
  remove<T>(list: T[], index: number): void
  move<T>(list: T[], from: number, to: number): void
}
```

说明：

- `write()` 返回当前事务唯一可写 root
- 不再把 ordered collection、path writer 拆成更多层
- `draftPath` 和 `draftList` 就够了

---

## 4.5 `apply.ts`

这里直接取代之前过度设计的 `DocumentMutationKernelSpec`。

最终只保留一个简单模型：`Model`。

```ts
import type { InverseBuilder, HistoryFootprintCollector } from '@shared/core'

export interface ApplyCtx<Doc, Op, Key, State = void> {
  readonly base: Doc
  doc(): Doc
  write(): Doc
  replace(doc: Doc): void
  readonly state: State
  readonly inverse: InverseBuilder<Op>
  readonly footprint: HistoryFootprintCollector<Key>
}

export interface Model<Doc, Op, Key, State = void, Extra = void> {
  init(doc: Doc): State
  step(ctx: ApplyCtx<Doc, Op, Key, State>, op: Op): void
  settle?(ctx: ApplyCtx<Doc, Op, Key, State>): void
  done?(ctx: ApplyCtx<Doc, Op, Key, State>): Extra
}

export interface ApplyResult<Doc, Op, Key, Extra = void> {
  doc: Doc
  forward: readonly Op[]
  inverse: readonly Op[]
  footprint: readonly Key[]
  extra: Extra
}

export const apply: <
  Doc extends object,
  Op,
  Key,
  State = void,
  Extra = void
>(input: {
  doc: Doc
  ops: readonly Op[]
  model: Model<Doc, Op, Key, State, Extra>
  draft?: DraftFactory<Doc>
  serializeKey(key: Key): string
}) => ApplyResult<Doc, Op, Key, Extra>
```

设计说明：

- `init`：初始化领域状态
- `step`：逐条处理 op
- `settle`：批次后补收敛
- `done`：生成附加结果

这就足够覆盖：

- Dataview 的 impact
- Whiteboard 的 changes / invalidation / reconcile

不再需要：

- `createRuntime`
- `createTx`
- `beforeEach`
- `afterEach`
- `shortCircuit`
- `finalize`

如果某个领域需要“提前终止”，直接在 `state` 里记录一个 `stopped` 标记，后续 `step` 变成 no-op。

shared API 不为少数场景暴露一整套 hook 体系。

---

## 4.6 `write.ts`

`Write` 是整条链的中心对象，但结构必须简单。

```ts
export type Origin =
  | 'user'
  | 'remote'
  | 'system'
  | 'load'
  | 'history'

export interface Write<
  Doc,
  Op,
  Key,
  Extra = void
> {
  rev: number
  at: number
  origin: Origin
  doc: Doc
  forward: readonly Op[]
  inverse: readonly Op[]
  footprint: readonly Key[]
  extra: Extra
}

export interface WriteStream<W> {
  subscribe(listener: (write: W) => void): () => void
}
```

说明：

- `extra` 是领域附加信息槽
- Dataview 可以放 `{ impact, output }`
- Whiteboard 可以放 `{ changes, invalidation, output }`

不再在 shared 层固定：

- `effect`
- `history`
- `result`
- `output`

多层嵌套只会让 API 变重。

---

## 4.7 `history.ts`

history API 只保留最核心的几件事：

- capture local write
- observe remote footprint
- 产出 undo/redo operations

```ts
export interface HistoryState {
  canUndo: boolean
  canRedo: boolean
  undoDepth: number
  redoDepth: number
  invalidDepth: number
  busy: boolean
}

export interface HistoryController<Op, Key, W extends Write<any, Op, Key, any>> {
  state(): HistoryState
  capture(write: W): void
  remote(changeId: string, footprint: readonly Key[]): void
  undo(): readonly Op[] | undefined
  redo(): readonly Op[] | undefined
  clear(): void
}

export const history: {
  create<Op, Key, W extends Write<any, Op, Key, any>>(input: {
    conflicts(
      a: readonly Key[],
      b: readonly Key[]
    ): boolean
    track?(write: W): boolean
  }): HistoryController<Op, Key, W>
}
```

说明：

- `track()` 用来过滤不应入 history 的 write
- 协作态 local history 和单机 history 最终共用这一套底层

不再分裂成：

- engine.history runtime
- collab.localHistory runtime

---

## 4.8 `collab.ts`

collab 只定义 shared log 和 session skeleton。

```ts
export interface Change<Op, Key> {
  id: string
  actor: string
  ops: readonly Op[]
  footprint: readonly Key[]
}

export interface Checkpoint<Doc> {
  id: string
  doc: Doc
}

export interface Store<Doc, Op, Key> {
  read(): {
    checkpoint: Checkpoint<Doc> | null
    changes: readonly Change<Op, Key>[]
  }
  subscribe(listener: () => void): () => void
  append(change: Change<Op, Key>): void
  checkpoint(checkpoint: Checkpoint<Doc>): void
  clearChanges(): void
}

export interface CollabAdapter<Doc, Op, Key, W extends Write<Doc, Op, Key, any>> {
  doc(): Doc
  replace(doc: Doc, origin?: Origin): boolean
  apply(ops: readonly Op[], origin?: Origin): boolean
  writes: WriteStream<W>
}

export interface CollabSession {
  start(): void
  stop(): void
  resync(): void
}

export const collab: {
  create<Doc, Op extends { type: string }, Key, W extends Write<Doc, Op, Key, any>>(input: {
    actor: string
    engine: CollabAdapter<Doc, Op, Key, W>
    store: Store<Doc, Op, Key>
    meta: OpMetaTable<Op>
    history: HistoryController<Op, Key, W>
    empty(): Doc
    createId(): string
    checkpointEvery?: number
  }): CollabSession
}
```

说明：

- `meta` 用来过滤 live ops
- `history` 用来做 remote footprint invalidation
- `createId()` 同时生成 change / checkpoint id，没必要拆两个 factory

不再单独暴露：

- diagnostics 模型
- replay cursor 类型
- provider 适配层接口

这些都属于具体实现，不是核心 API。

---

## 5. 实施方案

## Phase 1：建包与基础类型

先落地：

- `path.ts`
- `meta.ts`
- `write.ts`

同时确定：

- path 统一为 `Path`
- live/checkpoint 统一为 `OpSync`
- 所有 write 统一为 `Write`

### 结果标准

- Whiteboard `path: string` 不再是目标模型
- Dataview / Whiteboard 新设计文档统一引用这些名字

---

## Phase 2：统一 compile

落地：

- `compiler.ts`

然后直接迁移：

- Dataview planner batch loop
- Whiteboard compiler runtime

### 结果标准

- Dataview 不再维护私有 planner orchestration
- Whiteboard 不再维护私有 compiler tx runtime
- 两边 compile 都只剩领域 handler

---

## Phase 3：统一 draft

落地：

- `draft.ts`

然后直接迁移：

- Dataview document mutation 风格切到 mutable draft + lazy COW
- Whiteboard path mutation helper 切到 `draftPath`

### 结果标准

- Dataview immutable apply 风格删除
- Whiteboard overlay 不再是 shared foundation 目标

---

## Phase 4：统一 apply

落地：

- `apply.ts`

然后直接迁移：

- Dataview apply loop
- Whiteboard reduce batch loop

### 结果标准

- Dataview / Whiteboard 顶层 batch apply 都走 `apply(...)`
- 两边只保留各自 `Model.step()`

---

## Phase 5：统一 write

Dataview 和 Whiteboard 都必须改成：

- 成功写入后产出 `Write`
- engine 暴露 `writes.subscribe(...)`
- engine 同时暴露 `execute(intents)` 与 `apply(ops)`

### 结果标准

- Dataview 不再只有 `dispatch(actions)`
- Whiteboard 不再只有自己私有 `EngineWrite`

---

## Phase 6：统一 history

落地：

- `history.ts`

然后迁移：

- Dataview 单机 history
- Whiteboard 单机 history
- Whiteboard collab local history

### 结果标准

- 三套 history runtime 合一
- 领域差异只剩 footprint conflict 规则

---

## Phase 7：统一 collab

落地：

- `collab.ts`

然后迁移：

- Whiteboard collab session skeleton
- 未来 Dataview collab

### 前提

Dataview 只有满足以下条件后，才允许进入这一步：

1. 已有 `apply(ops)`
2. 已有 `writes.subscribe`
3. 已有 footprint
4. 已切到 shared history runtime

---

## 6. Dataview 与 Whiteboard 的最终接入面

## 6.1 Dataview 保留什么

只保留：

- `DataviewIntent`
- `DataviewOperation`
- Dataview compile handlers
- Dataview apply `Model`
- Dataview footprint 规则
- Dataview read-side active/index/view projector

删除：

- 私有 planner runtime
- 私有 immutable apply runtime
- 私有 history stack runtime

## 6.2 Whiteboard 保留什么

只保留：

- `WhiteboardIntent`
- `WhiteboardOperation`
- Whiteboard compile handlers
- Whiteboard apply `Model`
- Whiteboard footprint 规则
- Whiteboard facts/query/publish

删除：

- 私有 compiler runtime
- 私有 apply orchestration
- 私有 `EngineWrite`
- 私有 localHistory runtime
- 私有 collab session skeleton

---

## 7. 最终建议

最终真正应该交付的 shared foundation，不是“大而全抽象体系”，而是一套非常直接的 API：

- `Path`
- `OpMeta`
- `compile`
- `Draft`
- `apply`
- `Write`
- `History`
- `Collab`

如果一个字段不是 Dataview 和 Whiteboard 都必需的，就不要放进 shared API。

一句话总结：

> 最终 API 的标准不是抽象能力强，  
> 而是字段少、名字直、两边都能真的迁进去。
