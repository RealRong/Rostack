import {
  Reducer,
  type ReducerContext,
  type ReducerError,
  type ReducerResult,
  type ReducerSpec
} from '@shared/reducer'
import type { Issue } from './compiler'
import {
  history as historyRuntime,
  type HistoryController
} from './history'
import {
  createHistoryPort,
  readHistoryPortRuntime,
  type HistoryPort
} from './localHistory'
import type { OpMeta } from './meta'
import type { MutationPort } from './port'
import type {
  ApplyCommit,
  CommitRecord,
  CommitStream,
  Origin,
  Write
} from './write'

export interface MutationError<Code extends string = string> {
  code: Code
  message: string
  details?: unknown
}

export type MutationFailure<Code extends string = string> = {
  ok: false
  error: MutationError<Code>
}

export type MutationResult<T, W, Code extends string = string> =
  | {
      ok: true
      data: T
      write: W
    }
  | MutationFailure<Code>

export type MutationApplyResult<
  Doc,
  Op,
  Key,
  Extra,
  Code extends string = string
> =
  | {
      ok: true
      data: Extract<ReducerResult<Doc, Op, Key, Extra, Code>, { ok: true }>
    }
  | MutationFailure<Code>

export interface MutationIntentTable {
  [kind: string]: {
    intent: {
      type: string
    }
    output: unknown
  }
}

export type MutationIntentKind<T extends MutationIntentTable> =
  keyof T & string

export type MutationIntentOf<
  T extends MutationIntentTable,
  K extends MutationIntentKind<T> = MutationIntentKind<T>
> = T[K]['intent']

export type MutationOutputOf<
  T extends MutationIntentTable,
  K extends MutationIntentKind<T> = MutationIntentKind<T>
> = T[K]['output']

export type MutationExecuteResult<
  T extends MutationIntentTable,
  W,
  K extends MutationIntentKind<T>,
  Code extends string = string
> = MutationResult<MutationOutputOf<T, K>, W, Code>

export type MutationExecuteInput<T extends MutationIntentTable> =
  | MutationIntentOf<T>
  | readonly MutationIntentOf<T>[]

export type MutationExecuteResultOfInput<
  T extends MutationIntentTable,
  W,
  Input extends MutationExecuteInput<T>,
  Code extends string = string
> = Input extends readonly MutationIntentOf<T>[]
  ? MutationResult<readonly MutationOutputOf<T>[], W, Code>
  : Input extends MutationIntentOf<T, infer K>
    ? MutationExecuteResult<T, W, K, Code>
    : never

export interface MutationOptions {
  origin?: Origin
}

export interface MutationPlan<
  Op,
  Output = void
> {
  ops: readonly Op[]
  issues?: readonly Issue[]
  canApply?: boolean
  outputs?: readonly Output[]
}

export interface MutationPrevSnapshot<Doc, Publish, Cache> {
  doc: Doc
  publish: Publish
  cache: Cache
}

export interface MutationPublishInitResult<Publish, Cache> {
  publish: Publish
  cache: Cache
}

export interface MutationPublishReduceInput<
  Doc,
  Op,
  Key,
  Extra,
  Publish,
  Cache
> {
  prev: MutationPrevSnapshot<Doc, Publish, Cache>
  doc: Doc
  write: Write<Doc, Op, Key, Extra>
}

export interface MutationPublishReduceResult<Publish, Cache> {
  publish: Publish
  cache: Cache
}

export interface MutationPublishSpec<
  Doc,
  Op,
  Key,
  Extra,
  Publish,
  Cache = void
> {
  init(doc: Doc): MutationPublishInitResult<Publish, Cache>
  reduce(
    input: MutationPublishReduceInput<Doc, Op, Key, Extra, Publish, Cache>
  ): MutationPublishReduceResult<Publish, Cache>
}

export interface MutationOperationSpec<
  Doc extends object,
  Op extends {
    type: string
  },
  Key,
  ApplyCtx,
  FootprintCtx = ApplyCtx,
  TType extends Op['type'] = Op['type']
> extends OpMeta {
  footprint?(
    ctx: FootprintCtx,
    op: Extract<Op, { type: TType }>
  ): void
  apply(
    ctx: ApplyCtx,
    op: Extract<Op, { type: TType }>
  ): void
}

export type MutationOperationTable<
  Doc extends object,
  Op extends {
    type: string
  },
  Key,
  ApplyCtx,
  FootprintCtx = ApplyCtx
> = {
  [TType in Op['type']]: MutationOperationSpec<
    Doc,
    Op,
    Key,
    ApplyCtx,
    FootprintCtx,
    TType
  >
}

export interface MutationOperationsSpec<
  Doc extends object,
  Op extends {
    type: string
  },
  Key,
  Extra,
  DomainCtx = ReducerContext<Doc, Op, Key, string>,
  Code extends string = string
> {
  table: MutationOperationTable<Doc, Op, Key, DomainCtx>
  serializeKey(key: Key): string
  createContext?(
    ctx: ReducerContext<Doc, Op, Key, Code>
  ): DomainCtx
  validate?(input: {
    doc: Doc
    ops: readonly Op[]
    origin: Origin
  }): ReducerError<Code> | void
  settle?(ctx: DomainCtx): void
  done(ctx: DomainCtx): Extra
  conflicts?(left: Key, right: Key): boolean
}

export interface MutationHistorySpec<
  Doc,
  Op extends {
    type: string
  },
  Key,
  Extra
> {
  capacity?: number
  track?(input: {
    origin: Origin
    ops: readonly Op[]
    write: Write<Doc, Op, Key, Extra>
  }): boolean
  clear?(input: {
    origin: Origin
    ops: readonly Op[]
    write: Write<Doc, Op, Key, Extra>
  }): boolean
}

export interface MutationRuntimeSpec<
  Doc extends object,
  Op extends {
    type: string
  },
  Key,
  Publish,
  Cache = void,
  Extra = void,
  Code extends string = string
> {
  normalize(doc: Doc): Doc
  operations: MutationOperationsSpec<Doc, Op, Key, Extra, any, Code>
  publish?: MutationPublishSpec<Doc, Op, Key, Extra, Publish, Cache>
  history?: MutationHistorySpec<Doc, Op, Key, Extra> | false
}

export interface CommandMutationSpec<
  Doc extends object,
  Table extends MutationIntentTable,
  Op extends {
    type: string
  },
  Key,
  Publish,
  Cache = void,
  Extra = void,
  Code extends string = string
> extends MutationRuntimeSpec<Doc, Op, Key, Publish, Cache, Extra, Code> {
  compile(input: {
    doc: Doc
    intents: readonly MutationIntentOf<Table>[]
  }): MutationPlan<Op, MutationOutputOf<Table>>
}

export interface MutationCurrent<Doc, Publish> {
  rev: number
  doc: Doc
  publish?: Publish
}

export interface MutationInternalState<Doc, Publish, Cache> {
  rev: number
  doc: Doc
  publish?: Publish
  cache?: Cache
}

const COMPILE_BLOCKED_CODE = 'mutation_engine.compile.blocked'
const COMPILE_EMPTY_CODE = 'mutation_engine.compile.empty'
const APPLY_EMPTY_CODE = 'mutation_engine.apply.empty'
const EXECUTE_EMPTY_CODE = 'mutation_engine.execute.empty'

const hasBlockingIssue = (
  issues: readonly Issue[]
): boolean => issues.some((issue) => (issue.level ?? 'error') !== 'warning')

const toIssues = (
  issues?: readonly Issue[]
): readonly Issue[] => issues ?? []

const hasOwn = (
  value: object,
  key: PropertyKey
): boolean => Object.prototype.hasOwnProperty.call(value, key)

export const mutationFailure = <Code extends string>(
  code: Code,
  message: string,
  details?: unknown
): MutationFailure<Code> => ({
  ok: false,
  error: {
    code,
    message,
    ...(details === undefined
      ? {}
      : {
          details
        })
  }
})

const mutationSuccess = <T, W, Code extends string = string>(
  data: T,
  write: W
): MutationResult<T, W, Code> => ({
  ok: true,
  data,
  write
})

export const mutationResult = {
  success: mutationSuccess,
  failure: mutationFailure
} as const

const readFirstOutput = <Output>(
  outputs?: readonly Output[]
): Output | undefined => outputs?.[0]

const readOperation = <
  Doc extends object,
  Op extends {
    type: string
  },
  Key,
  ApplyCtx,
  FootprintCtx = ApplyCtx
>(
  table: MutationOperationTable<Doc, Op, Key, ApplyCtx, FootprintCtx>,
  op: Op
): MutationOperationSpec<Doc, Op, Key, ApplyCtx, FootprintCtx> => {
  if (!hasOwn(table, op.type)) {
    throw new Error(`Unknown mutation operation: ${op.type}`)
  }

  return table[op.type as Op['type']]
}

const createReducerSpecFromOperations = <
  Doc extends object,
  Op extends {
    type: string
  },
  Key,
  Extra,
  DomainCtx,
  Code extends string
>(
  operations: MutationOperationsSpec<Doc, Op, Key, Extra, DomainCtx, Code>
): ReducerSpec<Doc, Op, Key, Extra, DomainCtx, Code> => ({
  serializeKey: operations.serializeKey,
  ...(operations.createContext
    ? {
        createContext: operations.createContext
      }
    : {}),
  handle: (ctx, op) => {
    const entry = readOperation(operations.table, op)
    entry.footprint?.(ctx, op as never)
    entry.apply(ctx, op as never)
  },
  ...(operations.settle
    ? {
        settle: operations.settle
      }
    : {}),
  done: operations.done
})

const createReducerFromOperations = <
  Doc extends object,
  Op extends {
    type: string
  },
  Key,
  Extra,
  DomainCtx,
  Code extends string
>(
  operations: MutationOperationsSpec<Doc, Op, Key, Extra, DomainCtx, Code>
): Reducer<Doc, Op, Key, Extra, DomainCtx, Code> => new Reducer({
  spec: createReducerSpecFromOperations(operations)
})

const defaultTracksHistory = <
  Doc extends object,
  Op extends {
    type: string
  },
  Key,
  ApplyCtx,
  FootprintCtx = ApplyCtx
>(
  table: MutationOperationTable<Doc, Op, Key, ApplyCtx, FootprintCtx>,
  origin: Origin,
  ops: readonly Op[]
): boolean => (
  origin === 'user'
  && ops.every((op) => readOperation(table, op).history !== false)
)

const defaultClearsHistory = <
  Doc extends object,
  Op extends {
    type: string
  },
  Key,
  ApplyCtx,
  FootprintCtx = ApplyCtx
>(
  table: MutationOperationTable<Doc, Op, Key, ApplyCtx, FootprintCtx>,
  origin: Origin,
  ops: readonly Op[]
): boolean => (
  defaultTracksHistory(table, origin, ops)
  && ops.some((op) => readOperation(table, op).sync === 'checkpoint')
)

export class OperationMutationRuntime<
  Doc extends object,
  Op extends {
    type: string
  },
  Key,
  Publish,
  Cache = void,
  Extra = void,
  Code extends string = string
> implements MutationPort<
  Doc,
  Op,
  Key,
  MutationResult<void, Write<Doc, Op, Key, Extra>, Code>,
  Write<Doc, Op, Key, Extra>
> {
  readonly commits: CommitStream<CommitRecord<Doc, Op, Key, Extra>>
  readonly history: HistoryPort<
    MutationResult<void, Write<Doc, Op, Key, Extra>, Code>,
    Op,
    Key,
    Write<Doc, Op, Key, Extra>
  >
  readonly internal: MutationPort<
    Doc,
    Op,
    Key,
    MutationResult<void, Write<Doc, Op, Key, Extra>, Code>,
    Write<Doc, Op, Key, Extra>
  >['internal']

  protected readonly spec: MutationRuntimeSpec<
    Doc,
    Op,
    Key,
    Publish,
    Cache,
    Extra,
    Code
  >
  private state: MutationInternalState<Doc, Publish, Cache>
  private readonly reducer: Reducer<Doc, Op, Key, Extra, any, Code>
  private readonly historyControllerRef?: HistoryController<
    Op,
    Key,
    Write<Doc, Op, Key, Extra>
  >
  private readonly listeners = new Set<(current: MutationCurrent<Doc, Publish>) => void>()
  private readonly commitListeners = new Set<(
    commit: CommitRecord<Doc, Op, Key, Extra>
  ) => void>()

  constructor(input: {
    doc: Doc
    spec: MutationRuntimeSpec<Doc, Op, Key, Publish, Cache, Extra, Code>
  }) {
    this.spec = input.spec
    this.reducer = createReducerFromOperations(this.spec.operations)

    const initialDoc = this.prepareExternalDoc(input.doc)
    this.state = this.createInitialState(initialDoc)

    if (this.spec.history !== false) {
      this.historyControllerRef = historyRuntime.create<
        Op,
        Key,
        Write<Doc, Op, Key, Extra>
      >({
        capacity: this.spec.history?.capacity,
        conflicts: (left: readonly Key[], right: readonly Key[]) => left.some(
          (leftKey: Key) => right.some((rightKey: Key) => (
            this.spec.operations.conflicts?.(leftKey, rightKey)
            ?? Object.is(leftKey, rightKey)
          ))
        )
      })
    }

    this.commits = {
      subscribe: (listener) => {
        this.commitListeners.add(listener)
        return () => {
          this.commitListeners.delete(listener)
        }
      }
    }
    this.history = createHistoryPort({
      apply: (ops, options) => this.apply(ops, options),
      commits: this.commits,
      historyController: () => this.historyControllerRef
    })
    const portRuntime = readHistoryPortRuntime(this.history)
    this.internal = {
      history: {
        observeRemote: (changeId, footprint) => {
          portRuntime.observeRemote(changeId, footprint)
        },
        confirmPublished: (input) => {
          portRuntime.confirmPublished(input)
        },
        cancelPending: (mode) => {
          portRuntime.cancelPending(mode)
        }
      }
    }
  }

  doc(): Doc {
    return this.state.doc
  }

  current(): MutationCurrent<Doc, Publish> {
    return this.readCurrent()
  }

  subscribe(
    listener: (current: MutationCurrent<Doc, Publish>) => void
  ): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  apply(
    ops: readonly Op[],
    options?: MutationOptions
  ): MutationResult<
    void,
    Write<Doc, Op, Key, Extra>,
    Code
  > {
    if (ops.length === 0) {
      return mutationFailure(
        APPLY_EMPTY_CODE as Code,
        'OperationMutationRuntime.apply requires at least one operation.'
      )
    }

    return this.commit({
      ops,
      data: undefined,
      origin: options?.origin ?? 'user'
    })
  }

  replace(
    doc: Doc,
    options?: MutationOptions
  ): true {
    const nextDoc = this.prepareExternalDoc(doc)
    const commit: CommitRecord<Doc, Op, Key, Extra> = {
      kind: 'replace',
      rev: this.state.rev + 1,
      at: Date.now(),
      origin: options?.origin ?? 'system',
      doc: nextDoc
    }
    this.state = this.createInitialState(nextDoc, commit.rev)
    this.historyControllerRef?.clear()
    this.emitCurrent()
    this.emitCommit(commit)
    return true
  }

  protected readCommittedDoc(): Doc {
    return this.state.doc
  }

  protected commit<TData>(input: {
    ops: readonly Op[]
    data: TData
    origin: Origin
  }): MutationResult<
    TData,
    Write<Doc, Op, Key, Extra>,
    Code
  > {
    const validationError = this.spec.operations.validate?.({
      doc: this.state.doc,
      ops: input.ops,
      origin: input.origin
    })
    if (validationError) {
      return mutationFailure(
        validationError.code,
        validationError.message,
        validationError.details
      )
    }

    const reduced = this.reducer.reduce({
      doc: this.state.doc,
      ops: input.ops,
      origin: input.origin
    })
    if (!reduced.ok) {
      return mutationFailure(
        reduced.error.code,
        reduced.error.message,
        reduced.error.details
      )
    }

    const nextDoc = this.prepareCommittedDoc(reduced.doc)
    const nextRev = this.state.rev + 1
    const write: Write<Doc, Op, Key, Extra> = {
      rev: nextRev,
      at: Date.now(),
      origin: input.origin,
      doc: nextDoc,
      forward: input.ops.slice(),
      inverse: reduced.inverse,
      footprint: reduced.footprint,
      extra: reduced.extra
    }
    const appliedCommit: ApplyCommit<Doc, Op, Key, Extra> = {
      kind: 'apply',
      ...write
    }
    const nextRuntime = this.spec.publish
      ? (
          this.state.publish !== undefined
            ? this.spec.publish.reduce({
                prev: {
                  doc: this.state.doc,
                  publish: this.state.publish,
                  cache: this.state.cache as Cache
                },
                doc: nextDoc,
                write
              })
            : this.spec.publish.init(nextDoc)
        )
      : undefined

    this.state = {
      rev: nextRev,
      doc: nextDoc,
      ...(nextRuntime
        ? {
            publish: nextRuntime.publish,
            cache: nextRuntime.cache
          }
        : {})
    }

    if (input.origin !== 'history' && this.historyControllerRef) {
      const historySpec = this.spec.history === false
        ? undefined
        : this.spec.history
      const shouldClear = historySpec?.clear?.({
        origin: input.origin,
        ops: input.ops,
        write
      }) ?? defaultClearsHistory(
        this.spec.operations.table,
        input.origin,
        input.ops
      )

      if (shouldClear) {
        this.historyControllerRef.clear()
      } else {
        const shouldTrack = historySpec?.track?.({
          origin: input.origin,
          ops: input.ops,
          write
        }) ?? defaultTracksHistory(
          this.spec.operations.table,
          input.origin,
          input.ops
        )

        if (shouldTrack) {
          this.historyControllerRef.capture(write)
        }
      }
    }

    this.emitCurrent()
    this.emitCommit(appliedCommit)

    return mutationSuccess<TData, Write<Doc, Op, Key, Extra>, Code>(
      input.data,
      write
    )
  }

  private readCurrent(): MutationCurrent<Doc, Publish> {
    return {
      rev: this.state.rev,
      doc: this.state.doc,
      ...(this.state.publish !== undefined
        ? {
            publish: this.state.publish
          }
        : {})
    }
  }

  private prepareExternalDoc(
    doc: Doc
  ): Doc {
    return this.prepareCommittedDoc(doc)
  }

  private prepareCommittedDoc(
    doc: Doc
  ): Doc {
    return this.spec.normalize(doc)
  }

  private createInitialState(
    doc: Doc,
    rev = 0
  ): MutationInternalState<Doc, Publish, Cache> {
    const runtime = this.spec.publish?.init(doc)

    return {
      rev,
      doc,
      ...(runtime
        ? {
            publish: runtime.publish,
            cache: runtime.cache
          }
        : {})
    }
  }

  private emitCurrent() {
    const current = this.readCurrent()
    this.listeners.forEach((listener) => {
      listener(current)
    })
  }

  private emitCommit(
    commit: CommitRecord<Doc, Op, Key, Extra>
  ) {
    this.commitListeners.forEach((listener) => {
      listener(commit)
    })
  }
}

export class CommandMutationEngine<
  Doc extends object,
  Table extends MutationIntentTable,
  Op extends {
    type: string
  },
  Key,
  Publish,
  Cache = void,
  Extra = void,
  Code extends string = string
> extends OperationMutationRuntime<Doc, Op, Key, Publish, Cache, Extra, Code> {
  protected readonly commandSpec: CommandMutationSpec<
    Doc,
    Table,
    Op,
    Key,
    Publish,
    Cache,
    Extra,
    Code
  >

  constructor(input: {
    doc: Doc
    spec: CommandMutationSpec<Doc, Table, Op, Key, Publish, Cache, Extra, Code>
  }) {
    super(input)
    this.commandSpec = input.spec
  }

  execute<K extends MutationIntentKind<Table>>(
    intent: MutationIntentOf<Table, K>,
    options?: MutationOptions
  ): MutationExecuteResult<
    Table,
    Write<Doc, Op, Key, Extra>,
    K,
    Code
  >
  execute(
    intents: readonly MutationIntentOf<Table>[],
    options?: MutationOptions
  ): MutationResult<
    readonly MutationOutputOf<Table>[],
    Write<Doc, Op, Key, Extra>,
    Code
  >
  execute<Input extends MutationExecuteInput<Table>>(
    input: Input,
    options?: MutationOptions
  ): MutationExecuteResultOfInput<
    Table,
    Write<Doc, Op, Key, Extra>,
    Input,
    Code
  > {
    const batch = Array.isArray(input)
    const intents: readonly MutationIntentOf<Table>[] = batch
      ? input as readonly MutationIntentOf<Table>[]
      : [input as MutationIntentOf<Table>]

    if (intents.length === 0) {
      return mutationFailure(
        EXECUTE_EMPTY_CODE as Code,
        'CommandMutationEngine.execute requires at least one intent.'
      ) as MutationExecuteResultOfInput<
        Table,
        Write<Doc, Op, Key, Extra>,
        Input,
        Code
      >
    }

    const plan = this.commandSpec.compile({
      doc: this.readCommittedDoc(),
      intents
    })
    const issues = toIssues(plan.issues)
    const canApply = plan.canApply ?? (
      plan.ops.length > 0
      && !hasBlockingIssue(issues)
    )

    if (!canApply) {
      return mutationFailure(
        COMPILE_BLOCKED_CODE as Code,
        'CommandMutationEngine.execute was blocked by compile issues.',
        {
          issues
        }
      ) as MutationExecuteResultOfInput<
        Table,
        Write<Doc, Op, Key, Extra>,
        Input,
        Code
      >
    }

    if (!plan.ops.length) {
      return mutationFailure(
        COMPILE_EMPTY_CODE as Code,
        'CommandMutationEngine.execute produced no operations.',
        {
          issues
        }
      ) as MutationExecuteResultOfInput<
        Table,
        Write<Doc, Op, Key, Extra>,
        Input,
        Code
      >
    }

    return this.commit({
      ops: plan.ops,
      data: (
        batch
          ? (plan.outputs ?? [])
          : readFirstOutput(plan.outputs)
      ) as MutationExecuteResultOfInput<
        Table,
        Write<Doc, Op, Key, Extra>,
        Input,
        Code
      > extends MutationResult<infer Data, Write<Doc, Op, Key, Extra>, Code>
        ? Data
        : never,
      origin: options?.origin ?? 'user'
    }) as MutationExecuteResultOfInput<
      Table,
      Write<Doc, Op, Key, Extra>,
      Input,
      Code
    >
  }
}
