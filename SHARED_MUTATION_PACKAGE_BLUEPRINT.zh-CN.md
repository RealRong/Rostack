# `shared/mutation` 包级蓝图

本文是 `UNIFIED_MUTATION_PIPELINE_FOUNDATION.zh-CN.md` 的落地补充版。

目标不是再讨论方向，而是把最终态的 `shared/mutation` 包直接拆到：

- 目录层级
- 文件职责
- public API
- internal API
- 与 Dataview / Whiteboard 的接入边界
- 迁移完成后应删除的旧层

本文同样遵循最终态原则：

- 不保留兼容层
- 不做双轨 API
- 不为现有 Dataview / Whiteboard 命名妥协
- 不在包内同时支持多套 mutation 风格

---

## 1. 包定位

`shared/mutation` 的定位非常明确：

- 它是**语义写入主轴包**
- 它不负责具体领域语义
- 它负责承载从 `Intent[]` 到 `WriteRecord` 再到 `History / Collab` 的统一骨架

它和其他 shared 包的边界固定如下：

### `shared/core`

保留低层原语：

- `planningContext`
- `mutationContext`
- `mutationTx`
- `operationBuffer`
- `historyFootprint`
- `changeSet`
- `entityDelta`
- `store`

### `shared/mutation`

承载写入主轴：

- path
- operation meta
- compiler runtime
- draft runtime
- document mutation kernel
- write record
- local history runtime
- semantic collab session skeleton
- projector contract
- engine write-side skeleton

### `shared/projection-runtime`

继续保留读侧 projection runtime：

- source sync
- publish family
- read-phase 局部刷新

它不应该反向吸收 write-side foundation。

换句话说：

- `shared/core` 负责原语
- `shared/mutation` 负责写入主轴
- `shared/projection-runtime` 负责读侧投影主轴

---

## 2. 包内分层

`shared/mutation` 内部固定分成三层：

### 2.1 Base Layer

只放通用模型和小型 helper：

- `path`
- `operationMeta`
- `writeRecord`

### 2.2 Runtime Layer

只放真正驱动 mutation 生命周期的 runtime：

- `compiler`
- `draft`
- `kernel`
- `history`

### 2.3 Integration Layer

只放把 runtime 串成完整系统的骨架：

- `collab`
- `projector`
- `engine`

依赖方向固定为：

```text
base <- runtime <- integration
```

不允许反向依赖。

---

## 3. 最终目录结构

建议目录固定为：

```text
shared/mutation/
  package.json
  tsconfig.json
  README.md
  src/
    index.ts
    path.ts
    operationMeta.ts
    writeRecord.ts
    compiler/
      index.ts
      types.ts
      session.ts
      batch.ts
    draft/
      index.ts
      types.ts
      cow.ts
      pathWriter.ts
      collection.ts
    kernel/
      index.ts
      types.ts
      runtime.ts
      run.ts
    history/
      index.ts
      types.ts
      local.ts
    collab/
      index.ts
      types.ts
      replay.ts
      session.ts
    projector/
      index.ts
      types.ts
    engine/
      index.ts
      types.ts
      createEngine.ts
  test/
    path.test.ts
    compiler.test.ts
    draft.test.ts
    kernel.test.ts
    history.test.ts
    collab.test.ts
    engine.test.ts
```

说明：

- 不建议一开始继续做“全平铺文件”
- 因为 `compiler / draft / kernel / history / collab / engine` 各自都已经是子系统
- 但也不建议切得过碎
- 上述层级已经足够稳定

---

## 4. `package.json` exports

最终态建议暴露以下 exports：

```json
{
  "name": "@shared/mutation",
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./path": "./src/path.ts",
    "./operationMeta": "./src/operationMeta.ts",
    "./writeRecord": "./src/writeRecord.ts",
    "./compiler": "./src/compiler/index.ts",
    "./draft": "./src/draft/index.ts",
    "./kernel": "./src/kernel/index.ts",
    "./history": "./src/history/index.ts",
    "./collab": "./src/collab/index.ts",
    "./projector": "./src/projector/index.ts",
    "./engine": "./src/engine/index.ts"
  }
}
```

原则：

- root export 给最终用户用
- 子路径 export 给底层组合器和领域包用
- 不暴露 `internal/` 目录
- 不做 `legacy` 子路径

---

## 5. 文件级职责

## 5.1 `src/path.ts`

职责：

- 定义统一 path 模型
- 提供 path 代数与比较 helper

public API：

```ts
export type MutationPathSegment = string | number
export type MutationPath = readonly MutationPathSegment[]

export const mutationPath: {
  root(): MutationPath
  from(input: readonly MutationPathSegment[]): MutationPath
  equal(left: MutationPath, right: MutationPath): boolean
  parent(path: MutationPath): MutationPath | undefined
  append(path: MutationPath, ...segments: readonly MutationPathSegment[]): MutationPath
  startsWith(path: MutationPath, prefix: MutationPath): boolean
  overlaps(left: MutationPath, right: MutationPath): boolean
  serialize(path: MutationPath): string
}
```

约束：

- `serialize()` 仅用于 debug / history key / diagnostics
- 业务逻辑不能重新回退到字符串 path

## 5.2 `src/operationMeta.ts`

职责：

- 定义 operation meta contract
- 提供 operation type 的统一策略查询

public API：

```ts
export type MutationOperationSyncMode =
  | 'live'
  | 'checkpoint-only'

export type MutationOperationHistoryMode =
  | 'track'
  | 'skip'

export interface MutationOperationMeta<
  TType extends string = string,
  TNamespace extends string = string,
  TReducer extends string = string
> {
  type: TType
  namespace: TNamespace
  reducer: TReducer
  sync: MutationOperationSyncMode
  history: MutationOperationHistoryMode
}

export interface MutationOperationMetaTable<
  TOperation extends { type: string },
  TMeta extends MutationOperationMeta = MutationOperationMeta
> {
  get(type: TOperation['type']): TMeta
}

export const createMutationOperationMetaTable: <
  TOperation extends { type: string },
  TMeta extends MutationOperationMeta
>(
  table: Record<TOperation['type'], TMeta>
) => MutationOperationMetaTable<TOperation, TMeta>

export const mutationOperationMeta: {
  isLive(meta: Pick<MutationOperationMeta, 'sync'>): boolean
  isCheckpointOnly(meta: Pick<MutationOperationMeta, 'sync'>): boolean
  tracksHistory(meta: Pick<MutationOperationMeta, 'history'>): boolean
}
```

## 5.3 `src/writeRecord.ts`

职责：

- 定义统一 write record 形状
- 提供 write stream 消费侧只依赖的公共 contract

public API：

```ts
export type MutationOrigin =
  | 'user'
  | 'remote'
  | 'system'
  | 'load'
  | 'history'

export interface MutationWriteEffect<
  TImpact = unknown,
  TChangeSet = unknown,
  TInvalidation = unknown
> {
  impact?: TImpact
  changes?: TChangeSet
  invalidation?: TInvalidation
}

export interface MutationWriteRecord<
  TDocument,
  TOperation,
  TFootprint,
  TImpact = unknown,
  TChangeSet = unknown,
  TInvalidation = unknown,
  TOutput = unknown
> {
  rev: number
  at: number
  origin: MutationOrigin
  document: TDocument
  forward: readonly TOperation[]
  inverse: readonly TOperation[]
  history: {
    footprint: readonly TFootprint[]
  }
  effect: MutationWriteEffect<TImpact, TChangeSet, TInvalidation>
  output?: TOutput
}

export interface MutationWriteStream<TWriteRecord> {
  subscribe(listener: (write: TWriteRecord) => void): () => void
}
```

---

## 6. `compiler/`

## 6.1 `compiler/types.ts`

职责：

- 定义 compiler runtime 的模型

public API：

```ts
export interface MutationCompileIssue<
  TCode extends string = string,
  TSource = unknown
> {
  code: TCode
  message: string
  severity: 'error' | 'warning'
  source?: TSource
  path?: string
  details?: unknown
}

export interface MutationCompilerSession<
  TDocument,
  TIntent,
  TOperation,
  TCode extends string,
  TSource
> {
  readonly source: TSource
  document(): TDocument
  emit(operation: TOperation): void
  emitMany(...operations: readonly TOperation[]): void
  issue(issue: MutationCompileIssue<TCode, TSource>): void
  require<T>(
    value: T | undefined,
    issue: MutationCompileIssue<TCode, TSource>
  ): T | undefined
}

export interface MutationIntentCompiler<
  TDocument,
  TIntent,
  TOperation,
  TCode extends string,
  TSource,
  TOutput = unknown
> {
  createSource(intent: TIntent, index: number): TSource
  compile(
    session: MutationCompilerSession<TDocument, TIntent, TOperation, TCode, TSource>,
    intent: TIntent
  ): TOutput | void
}

export interface MutationCompileBatchResult<
  TDocument,
  TOperation,
  TCode extends string,
  TSource,
  TOutput = unknown
> {
  document: TDocument
  operations: readonly TOperation[]
  issues: readonly MutationCompileIssue<TCode, TSource>[]
  outputs: readonly TOutput[]
}

export interface MutationCompilerRuntimeSpec<
  TDocument,
  TIntent,
  TOperation,
  TCode extends string,
  TSource,
  TOutput = unknown
> {
  compiler: MutationIntentCompiler<
    TDocument,
    TIntent,
    TOperation,
    TCode,
    TSource,
    TOutput
  >
  previewApply(
    document: TDocument,
    operations: readonly TOperation[]
  ): TDocument
  stopOnError?: boolean
}
```

## 6.2 `compiler/session.ts`

职责：

- 构造单条 intent compile session
- 基于 `shared/core/planningContext` 做薄封装

internal API：

```ts
export const createMutationCompilerSession: <...>(...) => MutationCompilerSession<...>
```

这里不直接暴露给最终用户。

## 6.3 `compiler/batch.ts`

职责：

- 批量编译 `Intent[]`
- 编译后推进 speculative working document

public API：

```ts
export const compileIntents: <...>(
  input: {
    document: TDocument
    intents: readonly TIntent[]
    runtime: MutationCompilerRuntimeSpec<...>
  }
) => MutationCompileBatchResult<...>
```

### 设计约束

- 这层必须统一替代 Dataview 现有 planner batch loop
- 也必须统一替代 Whiteboard 未来 multi-intent compile batch
- 不再保留两套 batch orchestration

---

## 7. `draft/`

## 7.1 `draft/types.ts`

职责：

- 定义统一 draft session contract

public API：

```ts
export interface MutationDraft<TDocument> {
  readonly base: TDocument
  current(): TDocument
  writable(): TDocument
  finish(): TDocument
}

export interface MutationDraftRuntime<TDocument> {
  create(document: TDocument): MutationDraft<TDocument>
}

export interface DraftPathWriter {
  get(root: unknown, path: MutationPath): unknown
  has(root: unknown, path: MutationPath): boolean
  set(root: unknown, path: MutationPath, value: unknown): void
  unset(root: unknown, path: MutationPath): void
}
```

## 7.2 `draft/cow.ts`

职责：

- 提供默认 lazy copy-on-write draft runtime

public API：

```ts
export const createCowMutationDraftRuntime: <TDocument extends object>() => MutationDraftRuntime<TDocument>
```

### 明确约束

- 这会成为 Dataview 与 Whiteboard 的统一默认 runtime
- Whiteboard 当前 overlay 不再作为 shared foundation 暴露
- Dataview 当前 immutable current replace 模式必须退出

## 7.3 `draft/pathWriter.ts`

职责：

- 提供基于 `MutationPath` 的 draft path writer
- 供 `record.set/unset` helper、history key helper、conflict helper 共用

public API：

```ts
export const createDraftPathWriter: () => DraftPathWriter
```

## 7.4 `draft/collection.ts`

职责：

- 提供 ordered collection / entity collection mutation helper

public API：

```ts
export interface OrderedCollectionAnchor<TKey> {
  kind: 'start' | 'end' | 'before' | 'after'
  ref?: TKey
}

export const orderedCollectionDraft: {
  moveMany<TKey>(list: TKey[], refs: readonly TKey[], to: OrderedCollectionAnchor<TKey>): boolean
  insertAt<TKey>(list: TKey[], value: TKey, to: OrderedCollectionAnchor<TKey>): boolean
  remove<TKey>(list: TKey[], value: TKey): boolean
}
```

说明：

- 这层只放纯结构 helper
- 不带 node/edge/view 等领域名字

---

## 8. `kernel/`

## 8.1 `kernel/types.ts`

职责：

- 定义统一 mutation kernel contract

public API：

```ts
export interface DocumentMutationKernelSpec<
  TDocument,
  TOperation,
  TRuntime,
  TTx,
  TResult
> {
  createRuntime(document: TDocument): TRuntime
  createTx(runtime: TRuntime): TTx

  beforeEach?(tx: TTx, operation: TOperation): TResult | void
  dispatch(tx: TTx, operation: TOperation): TResult | void
  afterEach?(tx: TTx, operation: TOperation): TResult | void

  shortCircuit?(tx: TTx): TResult | undefined
  reconcile?(tx: TTx): TResult | void
  finalize(tx: TTx): TResult
}

export interface MutationKernelRuntime<
  TDocument,
  TOperation,
  TFootprint,
  TWorking extends object = object
> {
  draft: MutationDraft<TDocument>
  inverse: import('@shared/core').InverseBuilder<TOperation>
  history: {
    footprint: import('@shared/core').HistoryFootprintCollector<TFootprint>
  }
  working: TWorking
  shortCircuit?: unknown
}
```

## 8.2 `kernel/runtime.ts`

职责：

- 用 shared 原语组装默认 runtime

public API：

```ts
export const createMutationKernelRuntime: <...>(input: {
  document: TDocument
  draft: MutationDraftRuntime<TDocument>
  history: {
    serialize(key: TFootprint): string
  }
  working: TWorking
}) => MutationKernelRuntime<TDocument, TOperation, TFootprint, TWorking>
```

## 8.3 `kernel/run.ts`

职责：

- 驱动统一 apply loop

public API：

```ts
export const runDocumentMutation: <...>(
  input: {
    document: TDocument
    operations: readonly TOperation[]
    spec: DocumentMutationKernelSpec<TDocument, TOperation, TRuntime, TTx, TResult>
  }
) => TResult
```

### 设计约束

- Dataview 与 Whiteboard 的 batch apply 都必须走这里
- 领域包只保留 dispatch / reconcile / finalize

---

## 9. `history/`

## 9.1 `history/types.ts`

职责：

- 定义 history key spec 与 local history contract

public API：

```ts
export interface MutationHistoryKeySpec<TKey> {
  serialize(key: TKey): string
  conflicts(left: TKey, right: TKey): boolean
}

export interface MutationHistoryCollector<
  TRead,
  TDraft,
  TOperation,
  TKey
> {
  collect(input: {
    read: TRead
    draft: TDraft
    add(key: TKey): void
    addMany(keys: readonly TKey[]): void
  }, operation: TOperation): void
}

export interface LocalHistoryState {
  canUndo: boolean
  canRedo: boolean
  undoDepth: number
  redoDepth: number
  invalidatedDepth: number
  isApplying: boolean
}

export interface LocalHistoryController<
  TOperation,
  TFootprint,
  TWriteRecord extends MutationWriteRecord<any, TOperation, TFootprint>
> {
  state(): LocalHistoryState
  capture(write: TWriteRecord): void
  observeRemote(input: {
    changeId: string
    footprint: readonly TFootprint[]
  }): void
  undo(): readonly TOperation[] | undefined
  redo(): readonly TOperation[] | undefined
  clear(): void
}
```

## 9.2 `history/local.ts`

职责：

- 提供统一 local history runtime

public API：

```ts
export const createLocalHistoryController: <
  TOperation,
  TFootprint,
  TWriteRecord extends MutationWriteRecord<any, TOperation, TFootprint>
>(input: {
  conflicts(
    left: readonly TFootprint[],
    right: readonly TFootprint[]
  ): boolean
  tracks(write: TWriteRecord): boolean
}) => LocalHistoryController<TOperation, TFootprint, TWriteRecord>
```

### 设计约束

- Dataview 单机 history 必须改用这个 runtime
- Whiteboard 单机 history 也必须改用这个 runtime
- Whiteboard-collab 的 `localHistory` 不再维护自己的私有底层状态机

---

## 10. `collab/`

## 10.1 `collab/types.ts`

职责：

- 定义 shared log / session 合同

public API：

```ts
export interface SharedChange<TOperation, TFootprint> {
  id: string
  actorId: string
  operations: readonly TOperation[]
  footprint: readonly TFootprint[]
}

export interface SharedCheckpoint<TDocument> {
  id: string
  document: TDocument
}

export interface SharedLogStore<TDocument, TOperation, TFootprint> {
  readCheckpoint(): SharedCheckpoint<TDocument> | null
  readChanges(): readonly SharedChange<TOperation, TFootprint>[]
  appendChange(change: SharedChange<TOperation, TFootprint>): void
  replaceCheckpoint(checkpoint: SharedCheckpoint<TDocument>): void
  clearChanges(): void
}

export interface SemanticCollabEngineAdapter<
  TDocument,
  TOperation,
  TFootprint,
  TWriteRecord extends MutationWriteRecord<TDocument, TOperation, TFootprint>
> {
  currentDocument(): TDocument
  replace(document: TDocument, options?: { origin?: MutationOrigin }): { ok: boolean }
  apply(operations: readonly TOperation[], options?: { origin?: MutationOrigin }): { ok: boolean }
  writes: MutationWriteStream<TWriteRecord>
}

export interface SemanticCollabSession<
  TDocument,
  TOperation,
  TFootprint
> {
  start(): void
  stop(): void
  resync(): void
}
```

## 10.2 `collab/replay.ts`

职责：

- 提供 shared log `append/reset` replay plan

public API：

```ts
export interface SharedReplayCursor {
  checkpointId: string | null
  changeIds: readonly string[]
}

export type SharedReplayPlan<TDocument, TOperation, TFootprint> =
  | {
      kind: 'append'
      changes: readonly SharedChange<TOperation, TFootprint>[]
    }
  | {
      kind: 'reset'
      checkpoint: SharedCheckpoint<TDocument> | null
      changes: readonly SharedChange<TOperation, TFootprint>[]
    }

export const createSharedReplayCursor: <...>(...) => SharedReplayCursor
export const planSharedReplay: <...>(...) => SharedReplayPlan<...>
```

## 10.3 `collab/session.ts`

职责：

- 实现统一 semantic collab session skeleton

public API：

```ts
export const createSemanticCollabSession: <
  TDocument,
  TOperation extends { type: string },
  TFootprint,
  TWriteRecord extends MutationWriteRecord<TDocument, TOperation, TFootprint>
>(input: {
  actorId: string
  engine: SemanticCollabEngineAdapter<TDocument, TOperation, TFootprint, TWriteRecord>
  operationMeta: MutationOperationMetaTable<TOperation>
  localHistory: LocalHistoryController<TOperation, TFootprint, TWriteRecord>
  store: SharedLogStore<TDocument, TOperation, TFootprint>
  emptyDocument(): TDocument
  createChangeId(): string
  createCheckpointId(): string
  checkpointThreshold?: number
  conflicts(
    left: readonly TFootprint[],
    right: readonly TFootprint[]
  ): boolean
}) => SemanticCollabSession<TDocument, TOperation, TFootprint>
```

### 设计约束

- `whiteboard-collab` 当前 session skeleton 最终应迁到这里
- Dataview 想做协作，必须直接接这套 skeleton，而不是再起一套私有 session runtime

---

## 11. `projector/`

## 11.1 `projector/types.ts`

职责：

- 只定义 write-side projector 契约

public API：

```ts
export interface MutationProjector<TWriteRecord, TProjection> {
  project(write: TWriteRecord): TProjection | undefined
}
```

说明：

- 这里只定义 contract
- 不在 `shared/mutation` 内承载 Dataview active publish 或 Whiteboard editor graph publish 的具体实现
- 具体 projector 仍留在领域包

---

## 12. `engine/`

## 12.1 `engine/types.ts`

职责：

- 定义统一 write-side engine facade

public API：

```ts
export interface MutationEngineState<TDocument> {
  rev: number
  document: TDocument
}

export interface MutationEngine<
  TDocument,
  TIntent,
  TOperation,
  TWriteRecord,
  TResult
> {
  current(): MutationEngineState<TDocument>
  execute(intent: TIntent | readonly TIntent[], options?: { origin?: MutationOrigin }): TResult
  apply(operations: readonly TOperation[], options?: { origin?: MutationOrigin }): TResult
  writes: MutationWriteStream<TWriteRecord>
}
```

## 12.2 `engine/createEngine.ts`

职责：

- 提供统一 write-side engine skeleton

public API：

```ts
export const createMutationEngine: <
  TDocument,
  TIntent,
  TOperation,
  TFootprint,
  TApplyResult,
  TWriteRecord extends MutationWriteRecord<TDocument, TOperation, TFootprint>,
  TResult
>(input: {
  initialDocument: TDocument
  compile(document: TDocument, intents: readonly TIntent[]): {
    operations: readonly TOperation[]
    issues?: readonly unknown[]
    output?: unknown
  }
  apply(document: TDocument, operations: readonly TOperation[], origin: MutationOrigin): TApplyResult
  toWriteRecord(input: {
    previousRev: number
    origin: MutationOrigin
    applyResult: TApplyResult
    output?: unknown
  }): TWriteRecord
  toResult(write: TWriteRecord): TResult
}) => MutationEngine<TDocument, TIntent, TOperation, TWriteRecord, TResult>
```

### 设计约束

- 这层只负责 write-side skeleton
- 不吸收 Dataview active runtime 或 Whiteboard facts/query runtime
- 读侧状态仍由各领域 engine 组合

---

## 13. `src/index.ts`

root export 只做薄汇总：

```ts
export * from './path'
export * from './operationMeta'
export * from './writeRecord'
export * from './compiler'
export * from './draft'
export * from './kernel'
export * from './history'
export * from './collab'
export * from './projector'
export * from './engine'
```

不在 root export 做 namespace 对象包装：

- 不导出 `mutation.path.xxx`
- 不导出 `mutation.kernel.xxx`

统一使用直接 named export。

---

## 14. Dataview 接入面

Dataview 最终只保留这些领域实现：

### 14.1 compile

- `DataviewIntent` union
- record / field / view / external 的 compile handler
- Dataview 自己的 validation code 与 issue source

删除：

- 私有 planner batch runtime
- 私有 planner scope lifecycle

### 14.2 apply

- Dataview reducer handler
- Dataview impact 规则
- Dataview footprint key 与 collect 规则

删除：

- immutable apply orchestration
- 只服务 Dataview 的 history 栈 runtime

### 14.3 engine

- Dataview active/index/view projector
- Dataview result shape adapter

新增硬要求：

- 必须暴露 `apply(operations)`
- 必须暴露 `writes.subscribe`
- 必须产出 shared `MutationWriteRecord`

---

## 15. Whiteboard 接入面

Whiteboard 最终只保留这些领域实现：

### 15.1 compile

- `WhiteboardIntent` union
- document / canvas / node / edge / group / mindmap compile handler
- registries / node size / id generator 的领域输入

删除：

- 私有 compiler runtime 生命周期

### 15.2 apply

- node / edge / group / mindmap reducer handler
- lock preflight policy
- reconcile 规则
- whiteboard 自己的 history key 与 collect 规则

删除：

- 私有 batch apply orchestration
- 私有 localHistory runtime
- 私有 collab session skeleton

### 15.3 engine

- facts / query / publish / editor graph projector

保留：

- 读侧 query / facts / publish

迁移：

- `EngineWrite` -> `MutationWriteRecord`
- collab -> shared session skeleton

---

## 16. 迁移完成后应删除的旧层

## 16.1 Dataview

最终迁移后，应删除以下“基础设施层”，只保留领域 handler：

- 自定义 planner batch orchestration
- immutable apply runtime 骨架
- Dataview 专有 history stack runtime
- engine 内缺失 write stream 的写入模型

## 16.2 Whiteboard

最终迁移后，应删除以下“基础设施层”，只保留领域 handler：

- `write/compile/tx` 这类私有 compiler runtime
- reducer 顶层 batch orchestration
- 当前私有 `EngineWrite` 类型
- `whiteboard-collab` 中通用 session/localHistory skeleton

---

## 17. 实施顺序

建议严格按下面顺序做，不要交叉：

### Phase 1

先建 `shared/mutation` 的 base layer：

- `path`
- `operationMeta`
- `writeRecord`

### Phase 2

建 compiler foundation：

- `compiler/types`
- `compiler/session`
- `compiler/batch`

然后先替换 Dataview planner 和 Whiteboard compiler runtime。

### Phase 3

建 draft foundation：

- `draft/types`
- `draft/cow`
- `draft/pathWriter`
- `draft/collection`

然后统一 operation path 和 record helper。

### Phase 4

建 kernel foundation：

- `kernel/types`
- `kernel/runtime`
- `kernel/run`

然后替换 Dataview / Whiteboard 顶层 apply loop。

### Phase 5

建 local history foundation：

- `history/types`
- `history/local`

然后先替换单机 history。

### Phase 6

建 collab foundation：

- `collab/types`
- `collab/replay`
- `collab/session`

然后把 Whiteboard collab skeleton 迁过去。

### Phase 7

最后决定是否让 Dataview 接入 collab。

这一步必须在以下条件全部满足后才开始：

- Dataview 已有 `apply(operations)`
- Dataview 已有 `writes.subscribe`
- Dataview 已有 footprint
- Dataview 已切到 shared local history runtime

---

## 18. 最终建议

`shared/mutation` 不应被理解成一堆 helper 文件。

它应被理解成：

- Dataview 与 Whiteboard 的**共同写入内核包**

它的最小成品标准不是“能放几个 type”：

- 而是 Dataview 和 Whiteboard 都能基于它完成
  - compile
  - apply
  - write record
  - local history
  - collab session

一句话总结：

> `shared/mutation` 的交付标准不是抽象得漂亮，  
> 而是它必须足够完整，能把 Dataview 和 Whiteboard 的写入主轴真的接管掉。
