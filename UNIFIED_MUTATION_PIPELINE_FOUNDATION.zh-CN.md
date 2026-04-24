# Unified Mutation Pipeline Foundation

本文定义 Dataview 与 Whiteboard 未来共同迁移到的一套**最终态 mutation 基础设施**。

这不是过渡方案，不保留兼容层，不考虑平滑迁移成本，不为旧 API 妥协。

目标只有一个：

- 把 `intent -> operation -> apply -> write record -> history -> collab` 这整条写入链，沉成一套长期稳定、边界清晰、领域可插拔的 shared foundation。

本文是总设计文档。

此前几份文档分别讨论了局部问题：

- `SHARED_DOCUMENT_MUTATION_KERNEL.zh-CN.md`
- `SHARED_MUTATION_DELTA_FOUNDATION.zh-CN.md`

而本文定义的是更高一层的统一主轴：

- 不只统一 apply loop
- 不只统一 delta 原语
- 而是统一整个语义写入 pipeline

---

## 1. 最终结论

长期最优方案不是：

- Dataview 继续保留一套 `action planner + immutable apply + engine.history`
- Whiteboard 继续保留一套 `command compiler + reducer tx + writeRecord + collab`
- 然后在局部下沉几个 utility

长期最优方案是：

1. 两边统一采用同一套 **Intent Compiler Runtime**
2. 两边统一采用同一套 **Operation Meta Contract**
3. 两边统一采用同一套 **Document Mutation Kernel**
4. 两边统一采用同一套 **Mutation Write Record**
5. 两边统一采用同一套 **Local History Runtime**
6. 两边统一采用同一套 **Semantic Collab Session Skeleton**

领域层只保留：

- 自己的 intent union
- 自己的 operation union
- 自己的领域 reducer handler
- 自己的 history footprint key 与 conflict 规则
- 自己的 read model / delta / publish projector

一句话：

> Dataview 与 Whiteboard 不需要共用领域语义，  
> 但必须共用语义写入主轴。

---

## 2. 设计原则

## 2.1 不做兼容

这套 foundation 的目标是最终态，不是过渡层。

因此明确约束如下：

- 不保留旧命名双轨
- 不保留旧入口别名
- 不保留旧 runtime 结构
- 不保留旧 history 栈模型
- 不保留“新旧并存”的 engine facade

如果 Dataview 现有 `Action`、Whiteboard 现有 `Command` 与目标模型冲突，直接重命名或删除。

## 2.2 不做 document diff 驱动

共享主轴必须建立在 semantic operation 上，而不是 snapshot diff 上。

因此以下方向全部排除：

- deep diff -> patch
- document mirror -> diff publish
- collab 直接同步 document tree
- history 基于 snapshot 差异推断

## 2.3 不做全 generic path

operation 可以收敛，但不能退化成一个通用 `path.set/path.unset` 覆盖一切。

最终 primitive 分层固定为：

1. `typed lifecycle / relation / order`
2. `typed field`
3. `path-based record`

## 2.4 不做 deep clone

统一 mutation runtime 的 document mutation 风格固定为：

- **事务期可变 draft**
- **懒复制（lazy copy-on-write）**

排除：

- deep clone per commit
- immutable replace per op
- overlay/tombstone 作为统一模型

## 2.5 write record 是唯一中轴

整个系统里，真正可供 history、collab、trace、publish、replay 共用的对象，不是 `operation[]` 本身，而是：

- **MutationWriteRecord**

所有写入下游能力都应以它为中心组织。

---

## 3. 统一术语

以后统一使用下列词汇：

### 3.1 Intent

表示用户意图层输入。

它替代当前两边不统一的命名：

- Dataview `Action`
- Whiteboard `Command`

foundation 只使用 `Intent` 一词。

领域包可以定义：

- `DataviewIntent`
- `WhiteboardIntent`

但不再引入 `Action/Command` 作为基础设施术语。

### 3.2 Operation

表示语义可回放、可 inverse、可 history、可 collab 的最小 mutation primitive。

### 3.3 Write Record

表示一次成功写入的 canonical 结果。

它是：

- history capture 输入
- collab publish 输入
- delta / publish projector 输入
- trace / perf / audit 输入

### 3.4 Footprint

表示一次写入的语义冲突足迹。

shared 只提供：

- collector
- local history runtime
- conflict scan skeleton

领域包提供：

- key taxonomy
- key conflict predicate

### 3.5 Draft

表示一次 mutation session 内的可变工作文档。

不是 overlay table，不是 immutable current chain。

---

## 4. 最终主轴

统一后的写入链固定为：

```text
intent[]
  -> compile intents
  -> operation[]
  -> run document mutation
  -> mutation write record
  -> engine publish / history / delta / collab
```

更具体地说：

```text
Intent[]
  -> MutationCompiler
  -> Operation[]
  -> DocumentMutationKernel
  -> MutationApplyResult
  -> MutationWriteRecord
  -> {
       LocalHistoryController,
       ProjectionProjector,
       SemanticCollabSession,
       Trace/Perf,
       Replay
     }
```

这条链路是唯一正式主轴。

以下做法全部删除：

- Dataview 只暴露 `dispatch(actions)`，不暴露 `apply(ops)`
- Whiteboard 才有 `writeRecord`，Dataview 没有
- 单机 history 与协作 history 使用两种完全不同的 capture 模型
- collab 直接依赖 engine 内部实现细节而不是 write record

---

## 5. 包结构

建议把基础设施分成两层：

### 5.1 `shared/core`

保留小而纯的代数/容器原语：

- `planningContext`
- `operationBuffer`
- `mutationContext`
- `mutationTx`
- `historyFootprint`
- `changeSet`
- `entityDelta`
- `store`

### 5.2 `shared/mutation`

新增真正的 pipeline-level foundation：

```text
shared/mutation/
  src/path.ts
  src/operationMeta.ts
  src/compiler.ts
  src/draft.ts
  src/kernel.ts
  src/writeRecord.ts
  src/history.ts
  src/collab.ts
  src/projector.ts
  src/engine.ts
  src/index.ts
```

原因很直接：

- 这些能力已经不是“小工具”
- 也不只是 `shared/core` 的细碎原语
- 它们合起来是一套完整 runtime foundation

如果继续全塞进 `shared/core`，包职责会变浑。

因此建议：

- `shared/core`：低层原语
- `shared/mutation`：完整主轴

---

## 6. Operation 基础模型

## 6.1 路径表示

路径统一采用 path segments：

```ts
export type MutationPathSegment = string | number
export type MutationPath = readonly MutationPathSegment[]
```

不再使用：

```ts
path: 'foo.bar.0.baz'
```

统一改为：

```ts
path: ['foo', 'bar', 0, 'baz']
```

根路径用：

```ts
[]
```

不再允许：

- `path?: string`
- `''` 表示 root
- 点号字符串路径

## 6.2 Operation Meta

每个 operation type 都必须挂 metadata。

```ts
export type OperationSyncMode =
  | 'live'
  | 'checkpoint-only'

export type OperationHistoryMode =
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
  sync: OperationSyncMode
  history: OperationHistoryMode
}

export interface MutationOperationMetaTable<
  TOperation extends { type: string },
  TMeta extends MutationOperationMeta = MutationOperationMeta
> {
  get(type: TOperation['type']): TMeta
}
```

`sync` 用于：

- collab live publish
- checkpoint-only filtering

`history` 用于：

- 本地 history 是否 capture

例如：

- `document.replace` -> `checkpoint-only + skip`
- 普通 field/record/lifecycle op -> `live + track`

## 6.3 统一 primitive 分层

最终 operation primitive 必须收敛为三层。

### 第一层：结构 primitive

```ts
type LifecycleOperation =
  | { type: 'node.create'; node: Node }
  | { type: 'edge.delete'; id: EdgeId }
  | { type: 'canvas.order.move'; refs: readonly CanvasItemRef[]; to: OrderAnchor }
```

### 第二层：field primitive

```ts
type FieldOperation<TId extends string, TField extends string, TValue> =
  | {
      type: 'entity.field.set'
      id: TId
      field: TField
      value: TValue
    }
  | {
      type: 'entity.field.unset'
      id: TId
      field: TField
    }
```

### 第三层：record primitive

```ts
type RecordOperation<TId extends string, TScope extends string> =
  | {
      type: 'entity.record.set'
      id: TId
      scope: TScope
      path: MutationPath
      value: unknown
    }
  | {
      type: 'entity.record.unset'
      id: TId
      scope: TScope
      path: MutationPath
    }
```

这套模型强制两点：

1. 结构语义必须显式
2. 开放 payload 才允许 path-based

## 6.4 两边的最终 operation 约束

### Dataview

Dataview 必须朝下列方向收敛：

- `document.record.patch` 删除
- `document.record.fields.writeMany` 退为 batch convenience API，不再做核心 primitive
- `document.view.put` 拆成更小的 typed family
- `meta/values` 这类开放子树走 record op

### Whiteboard

Whiteboard 必须继续保持三层模型，但要升级：

- 所有 `path: string` 改为 `path: MutationPath`
- 所有历史 key 中的 path 同步升级
- reducer helper 基于 shared path writer，而不是自己 split/join path

---

## 7. Intent Compiler Foundation

## 7.1 目标

这层负责：

- 读取当前 document
- 校验 intent
- 产出 operation[]
- 在 batch compile 时推进 working document

它不负责：

- 真正写入 document
- 生成 inverse
- history collect
- collab publish

## 7.2 核心接口

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

export interface MutationCompileResult<
  TOperation,
  TCode extends string,
  TSource,
  TOutput = unknown
> {
  operations: readonly TOperation[]
  issues: readonly MutationCompileIssue<TCode, TSource>[]
  output?: TOutput
}
```

```ts
export interface MutationCompilerRead<TDocument> {
  document(): TDocument
}

export interface MutationCompilerSession<
  TDocument,
  TIntent,
  TOperation,
  TCode extends string,
  TSource
> {
  readonly read: MutationCompilerRead<TDocument>
  readonly source: TSource

  emit(operation: TOperation): void
  emitMany(...operations: readonly TOperation[]): void

  issue(issue: MutationCompileIssue<TCode, TSource>): void
  require<T>(
    value: T | undefined,
    issue: MutationCompileIssue<TCode, TSource>
  ): T | undefined
}
```

```ts
export interface MutationCompilerSpec<
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
```

## 7.3 Batch Compiler Runner

foundation 统一提供 batch compile runner：

```ts
export interface MutationCompilerRuntimeSpec<
  TDocument,
  TIntent,
  TOperation,
  TCode extends string,
  TSource,
  TOutput = unknown
> {
  spec: MutationCompilerSpec<
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

export const compileIntents = <
  TDocument,
  TIntent,
  TOperation,
  TCode extends string,
  TSource,
  TOutput = unknown
>(input: {
  document: TDocument
  intents: readonly TIntent[]
  runtime: MutationCompilerRuntimeSpec<
    TDocument,
    TIntent,
    TOperation,
    TCode,
    TSource,
    TOutput
  >
}): {
  document: TDocument
  operations: readonly TOperation[]
  issues: readonly MutationCompileIssue<TCode, TSource>[]
  outputs: readonly TOutput[]
}
```

这层本质上统一：

- Dataview `planActions(...)`
- Whiteboard `compileCommand(...)`

差异只保留在领域 compile handler 内。

## 7.4 强制要求

最终态下：

- Dataview 不再维护自定义 planner lifecycle
- Whiteboard 不再维护自定义 compiler lifecycle
- 两边都必须使用 shared compiler runtime

---

## 8. Draft Foundation

## 8.1 统一 mutation 风格

最终态只允许一种 draft 模型：

- mutable draft
- lazy copy-on-write
- stable references for untouched branches

这意味着：

- Dataview 现有 immutable current replace 模型必须删除
- Whiteboard overlay draft 不作为 shared foundation 暴露

## 8.2 Draft API

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
```

`writable()` 返回事务期唯一 draft root。

shared 同时提供 path-based helper：

```ts
export interface DraftPathWriter {
  get(root: unknown, path: MutationPath): unknown
  set(root: unknown, path: MutationPath, value: unknown): void
  unset(root: unknown, path: MutationPath): void
  has(root: unknown, path: MutationPath): boolean
}
```

这里的 `root` 是 draft 中某棵开放子树的 root，不是整个 document 必须 path 化。

## 8.3 为什么不继续兼容 immutable reducer

因为兼容 immutable reducer 会把整个 foundation 拉回到最低公分母：

- reducer helper 无法直接原地更新 draft
- path writer 需要额外回填 replace 链
- ordered collection helper 需要反复返回新数组
- compile preview 和 apply runtime 无法共用同一套 mutation primitives

所以最终态里不做双风格兼容。

---

## 9. Document Mutation Kernel

## 9.1 目标

统一以下事情：

- apply loop
- per-op hook
- short-circuit
- reconcile
- finalize
- collector lifecycle

## 9.2 统一 apply 结果

```ts
export interface MutationApplyResult<
  TDocument,
  TOperation,
  TFootprint,
  TImpact,
  TChangeSet,
  TInvalidation,
  TResult = unknown
> {
  document: TDocument
  forward: readonly TOperation[]
  inverse: readonly TOperation[]
  history: {
    footprint: readonly TFootprint[]
  }
  effect: {
    impact?: TImpact
    changes?: TChangeSet
    invalidation?: TInvalidation
  }
  result?: TResult
}
```

## 9.3 Kernel 接口

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
```

```ts
export const runDocumentMutation = <
  TDocument,
  TOperation,
  TRuntime,
  TTx,
  TResult
>(input: {
  document: TDocument
  operations: readonly TOperation[]
  spec: DocumentMutationKernelSpec<
    TDocument,
    TOperation,
    TRuntime,
    TTx,
    TResult
  >
}): TResult
```

## 9.4 Runtime 结构

最终态 shared runtime 至少包含：

```ts
export interface MutationRuntime<
  TDocument,
  TOperation,
  TFootprint,
  TWorking extends object = object
> {
  draft: MutationDraft<TDocument>
  inverse: InverseBuilder<TOperation>
  history: {
    footprint: HistoryFootprintCollector<TFootprint>
  }
  working: TWorking
  shortCircuit?: unknown
}
```

这里的 `working` 是领域附加状态槽：

- Dataview 放 `impact`
- Whiteboard 放 `changes / invalidation / reconcile tasks / trace`

## 9.5 统一要求

最终态下：

- Dataview 的 apply 不再走 immutable `context.replaceDocument(nextDocument)`
- Whiteboard 的 apply 也不再暴露自己的一套独立 runtime lifecycle
- 两边都必须通过 shared kernel 跑 batch mutation

---

## 10. History Footprint Foundation

## 10.1 shared 提供什么

shared 只提供这三样：

```ts
export interface HistoryKeySpec<TKey> {
  serialize(key: TKey): string
  conflicts(left: TKey, right: TKey): boolean
  assert?(value: unknown): readonly TKey[]
}

export interface HistoryCollectorSpec<
  TDocument,
  TOperation,
  TKey,
  TRead,
  TDraft
> {
  collect(input: {
    read: TRead
    draft: TDraft
    add(key: TKey): void
    addMany(keys: readonly TKey[]): void
  }, operation: TOperation): void
}
```

以及 generic runtime：

```ts
export const createHistoryFootprintCollector<TKey>(
  serialize: (key: TKey) => string
): HistoryFootprintCollector<TKey>

export const historyFootprintConflicts<TKey>(
  left: readonly TKey[],
  right: readonly TKey[],
  conflicts: (left: TKey, right: TKey) => boolean
): boolean
```

## 10.2 领域必须提供什么

领域包必须自己提供：

- `HistoryKey` union
- `serializeHistoryKey`
- `historyKeyConflicts`
- `collectHistoryForOperation`

因此：

- shared 不统一 Dataview/Whiteboard 的 footprint key
- 但统一 footprint runtime 与 local history skeleton

## 10.3 Dataview 的硬性要求

Dataview 必须补齐：

- history key taxonomy
- footprint collector
- footprint conflict rules

否则无法进入统一 history / collab foundation。

---

## 11. Mutation Write Record

## 11.1 这是整条链的中心对象

统一后的 engine 内部和对外 write stream 都必须围绕同一个对象：

```ts
export type MutationOrigin =
  | 'user'
  | 'remote'
  | 'system'
  | 'load'
  | 'history'

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

  effect: {
    impact?: TImpact
    changes?: TChangeSet
    invalidation?: TInvalidation
  }

  output?: TOutput
}
```

## 11.2 统一要求

最终态下：

- Dataview 必须生成 `MutationWriteRecord`
- Dataview engine 必须暴露 `writes.subscribe(...)`
- Whiteboard 当前 `EngineWrite` 迁移为 shared `MutationWriteRecord`

## 11.3 为什么这是主轴

因为所有下游都只需要它：

- 单机 history
- 协作 history
- collab publish
- delta/projector
- trace/perf
- replay

不再允许下游直接依赖 engine 内部状态树。

---

## 12. Engine Foundation

## 12.1 统一 engine 外观

最终态 engine 必须统一提供两类写入口：

```ts
export interface MutationEngine<
  TDocument,
  TIntent,
  TOperation,
  TWriteRecord,
  TResult
> {
  current(): {
    rev: number
    document: TDocument
  }

  execute(
    intent: TIntent | readonly TIntent[],
    options?: {
      origin?: MutationOrigin
    }
  ): TResult

  apply(
    operations: readonly TOperation[],
    options?: {
      origin?: MutationOrigin
    }
  ): TResult

  writes: {
    subscribe(listener: (write: TWriteRecord) => void): () => void
  }
}
```

## 12.2 强制要求

最终态里：

- Dataview 不再只有 `dispatch(actions)`
- Whiteboard 不再只有 `execute(command)` 是主入口

两边都必须具备：

- `execute(intent)`
- `apply(operations)`
- `writes.subscribe`

这样 history 和 collab 才能基于统一契约工作。

---

## 13. Local History Foundation

## 13.1 统一目标

单机 history 和协作态 local history，本质上都应该基于同一个 runtime。

差别只在于：

- 单机场景没有 remote invalidation
- 协作场景会 observe remote shared change

因此不应再维护：

- Dataview 一套 engine.history
- Whiteboard 一套 engine.history
- Whiteboard-collab 再一套 localHistory controller

最终态应该统一成一个 shared runtime。

## 13.2 统一接口

```ts
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

  observeRemote?(input: {
    changeId: string
    footprint: readonly TFootprint[]
  }): void

  undo(): readonly TOperation[] | undefined
  redo(): readonly TOperation[] | undefined
  clear(): void
}
```

shared runtime 只关心：

- forward
- inverse
- footprint
- remote conflict invalidation

真正执行 undo/redo replay 的是 engine。

## 13.3 Dataview 的变化

Dataview 当前 `runtime/history.ts` 必须删除其专有栈模型，改为 shared local history controller。

## 13.4 Whiteboard 的变化

Whiteboard 当前单机 history 与 `whiteboard-collab` 的 `localHistory` 最终应合流为同一底层 runtime。

---

## 14. Semantic Collab Foundation

## 14.1 总原则

collab 永远不直接同步 document diff，不直接同步领域状态树。

collab 的共享协议只允许两类持久对象：

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
```

## 14.2 Shared Log Store

```ts
export interface SharedLogStore<
  TDocument,
  TOperation,
  TFootprint
> {
  readCheckpoint(): SharedCheckpoint<TDocument> | null
  readChanges(): readonly SharedChange<TOperation, TFootprint>[]

  appendChange(change: SharedChange<TOperation, TFootprint>): void
  replaceCheckpoint(checkpoint: SharedCheckpoint<TDocument>): void
  clearChanges(): void
}
```

## 14.3 Collab Engine Adapter

```ts
export interface SemanticCollabEngineAdapter<
  TDocument,
  TOperation,
  TFootprint,
  TWriteRecord extends MutationWriteRecord<TDocument, TOperation, TFootprint>
> {
  currentDocument(): TDocument

  replace(
    document: TDocument,
    options?: { origin?: MutationOrigin }
  ): { ok: boolean }

  apply(
    operations: readonly TOperation[],
    options?: { origin?: MutationOrigin }
  ): { ok: boolean }

  writes: {
    subscribe(listener: (write: TWriteRecord) => void): () => void
  }
}
```

## 14.4 Session Skeleton

```ts
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

```ts
export interface SemanticCollabSpec<
  TDocument,
  TOperation extends { type: string },
  TFootprint,
  TWriteRecord extends MutationWriteRecord<TDocument, TOperation, TFootprint>
> {
  engine: SemanticCollabEngineAdapter<
    TDocument,
    TOperation,
    TFootprint,
    TWriteRecord
  >

  operationMeta: MutationOperationMetaTable<TOperation>
  history: {
    conflicts(
      left: readonly TFootprint[],
      right: readonly TFootprint[]
    ): boolean
  }

  localHistory: LocalHistoryController<
    TOperation,
    TFootprint,
    TWriteRecord
  >

  store: SharedLogStore<TDocument, TOperation, TFootprint>
  emptyDocument(): TDocument
  createChangeId(): string
  createCheckpointId(): string
}
```

## 14.5 Session 规则固定化

统一 session skeleton 固定使用以下规则：

1. local write -> publish live operations
2. `checkpoint-only` write -> rotate checkpoint
3. remote consume -> `append` 或 `reset`
4. remote change -> observeRemote footprint invalidation
5. undo/redo -> 作为新的普通 local write append

这正是 Whiteboard 当前 collab 架构已经验证过的主轴，但应该被 shared 化，而不是继续留在 whiteboard 私有包中。

## 14.6 Dataview 的前提条件

Dataview 想进入统一 collab foundation，必须先补齐：

1. `apply(operations)`
2. `writes.subscribe`
3. operation meta
4. history footprint

少任何一项都不应开始做 collab。

---

## 15. Projector / Delta Foundation

## 15.1 原则

delta / publish 不是 mutation kernel 的一部分。

它们是 `MutationWriteRecord` 的下游 projector。

## 15.2 统一接口

```ts
export interface MutationProjector<TWriteRecord, TProjection> {
  project(write: TWriteRecord): TProjection | undefined
}
```

例如：

- Dataview `DocumentDeltaProjector`
- Dataview `ActiveDeltaProjector`
- Whiteboard `GraphDeltaProjector`
- Whiteboard `UiPublishDeltaProjector`

shared 不统一领域 delta shape，但统一 projector contract。

## 15.3 要求

所有 delta / publish 计算应尽量从 `write record.effect` 与 `write record.document` 投影。

不再允许：

- projector 直接依赖 engine 内部私有 runtime
- collab/session/history 私自拼接 change 语义

---

## 16. Dataview 与 Whiteboard 的最终形态

## 16.1 Dataview 最终形态

Dataview 最终必须满足：

1. `Action` 内部术语删除，统一改为 `Intent`
2. operation contract 重构为 `typed lifecycle + typed field + path-based record`
3. path 升级为 `MutationPath`
4. compile 使用 shared compiler runtime
5. apply 使用 shared mutation kernel
6. document mutation 风格切到 mutable draft + lazy COW
7. engine 暴露 `execute(intent)`、`apply(operations)`、`writes.subscribe`
8. history 切到 shared local history runtime
9. 补齐 footprint 与 conflict 规则
10. 未来 collab 直接接 shared semantic collab session

## 16.2 Whiteboard 最终形态

Whiteboard 最终必须满足：

1. `Command` 内部术语删除，统一改为 `Intent`
2. compiler 使用 shared compiler runtime
3. operation path 改为 `MutationPath`
4. reducer 批处理使用 shared mutation kernel
5. write record 切到 shared `MutationWriteRecord`
6. 单机 history 与 collab local history 合流到 shared runtime
7. collab session skeleton 从私有实现迁到 shared foundation
8. 只保留领域 compile/reducer/history-key/projector 代码

---

## 17. 明确不做的事

以下方向明确排除：

### 17.1 不做旧 API 双轨

不保留：

- Dataview `dispatch(actions)` 与新 `execute(intents)` 并存
- Whiteboard `execute(command)` 与新 `execute(intents)` 并存

### 17.2 不做多种 mutation 风格兼容

不兼容：

- immutable current replace
- overlay table 统一抽象
- deep clone runtime

### 17.3 不做 shared undo stack

协作态仍然坚持：

- local history
- remote footprint invalidation
- undo/redo as new shared change append

### 17.4 不做 document CRDT 主模型

shared protocol 不直接保存领域 document tree 的 CRDT 版本。

### 17.5 不做 generic mega-operation

不引入：

- `document.path.set`
- `document.path.unset`

作为覆盖一切的总操作。

---

## 18. 最终建议

最终态下，Dataview 与 Whiteboard 应共同迁移到以下 shared foundation：

1. `shared/core`
   - 小型代数与容器原语
2. `shared/mutation`
   - `operationMeta`
   - `compiler`
   - `draft`
   - `kernel`
   - `writeRecord`
   - `history`
   - `collab`
   - `projector`
   - `engine`

最终权责边界固定为：

- shared foundation 负责主轴
- 领域包负责语义

一句话总结：

> 长期最优不是让 Dataview 和 Whiteboard 共用一套 reducer handler，  
> 而是让它们共用同一条语义写入生命线。
>
> 这条生命线的中心对象不是 command，不是 operation，也不是 delta，  
> 而是 `MutationWriteRecord`。
