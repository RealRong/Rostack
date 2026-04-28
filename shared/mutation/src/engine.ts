import {
  Reducer,
  type ReducerContext,
  type ReducerError,
  type ReducerResult,
  type ReducerSpec
} from '@shared/reducer'
import {
  history as historyRuntime,
  type HistoryController
} from './history'
import {
  createHistoryPort,
  type HistoryPort
} from './localHistory'
import type {
  ApplyCommit,
  CommitRecord,
  CommitStream,
  Origin,
} from './write'

export interface MutationCompileIssue<
  Code extends string = string,
  TType extends string = string
> {
  code: Code
  message: string
  path?: string
  severity?: 'error' | 'warning'
  details?: unknown
  source?: MutationCompileSource<TType>
}

export interface MutationCompileSource<
  TType extends string = string
> {
  index: number
  type: TType
}

export interface MutationCompileCtx<
  Doc,
  Op,
  Code extends string = string
> {
  doc(): Doc
  emit(op: Op): void
  emitMany(...ops: readonly Op[]): void
  issue(issue: MutationCompileIssue<Code>): void
  stop(): {
    kind: 'stop'
  }
  block(issue: MutationCompileIssue<Code>): {
    kind: 'block'
    issue: MutationCompileIssue<Code>
  }
  require<T>(
    value: T | undefined,
    issue: MutationCompileIssue<Code>
  ): T | undefined
}

export interface MutationCompileInput<
  Doc,
  Intent
> {
  doc: Doc
  intents: readonly Intent[]
}

export interface MutationCompileResult<
  Op,
  Output = void,
  Code extends string = string
> {
  ops: readonly Op[]
  outputs: readonly Output[]
  issues?: readonly MutationCompileIssue<Code>[]
  canApply?: boolean
}

export type MutationCompileControl<Code extends string = string> =
  | {
      kind: 'stop'
    }
  | {
      kind: 'block'
      issue: MutationCompileIssue<Code>
    }

export interface MutationError<Code extends string = string> {
  code: Code
  message: string
  details?: unknown
}

export type MutationFailure<Code extends string = string> = {
  ok: false
  error: MutationError<Code>
}

export type MutationResult<T, Commit, Code extends string = string> =
  | {
      ok: true
      data: T
      commit: Commit
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

type MutationIntentTableKey<T extends MutationIntentTable> = ({
  [K in keyof T]: string extends K
    ? never
    : number extends K
      ? never
      : symbol extends K
        ? never
        : K
})[keyof T] & string

export type MutationIntentKind<T extends MutationIntentTable> =
  MutationIntentTableKey<T>

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

export type MutationCompileHandler<
  Intent,
  Output,
  Ctx,
  Code extends string = string
> = (
  intent: Intent,
  ctx: Ctx
) => Output | void | MutationCompileControl<Code>

export type MutationCompileHandlerTable<
  Table extends MutationIntentTable,
  Ctx,
  Code extends string = string
> = {
  [K in MutationIntentKind<Table>]: MutationCompileHandler<
    MutationIntentOf<Table, K>,
    MutationOutputOf<Table, K>,
    Ctx,
    Code
  >
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
  commit: ApplyCommit<Doc, Op, Key, Extra>
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

export interface MutationKeySpec<Key> {
  serialize(key: Key): string
  conflicts?(left: Key, right: Key): boolean
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
> {
  family: string
  sync?: 'live' | 'checkpoint'
  history?: boolean
  footprint?(
    ctx: FootprintCtx,
    op: Extract<Op, { type: TType }>
  ): void
  apply(
    ctx: ApplyCtx,
    op: Extract<Op, { type: TType }>
  ): void
}

type MutationOperationExecutor<
  Doc extends object,
  Op extends {
    type: string
  },
  Key,
  Ctx
> = {
  family: string
  sync?: 'live' | 'checkpoint'
  history?: boolean
  footprint?(ctx: Ctx, op: Op): void
  apply(ctx: Ctx, op: Op): void
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

export interface MutationReduceSpec<
  Doc extends object,
  Op extends {
    type: string
  },
  Key,
  Extra,
  DomainCtx = ReducerContext<Doc, Op, Key, string>,
  Code extends string = string
> {
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

export interface MutationCompileSpec<
  Doc,
  Table extends MutationIntentTable,
  Op,
  Ctx,
  Code extends string = string
> {
  handlers: MutationCompileHandlerTable<Table, Ctx, Code>
  createContext(entry: {
    ctx: MutationCompileCtx<Doc, Op, Code>
    doc: Doc
    intent: MutationIntentOf<Table>
    index: number
  }): Ctx
  apply(entry: {
    doc: Doc
    ops: readonly Op[]
  }): MutationCompileApplyResult<Doc, Code>
}

type MutationCompilePlanFn<
  Doc,
  Intent,
  Op,
  Output,
  Code extends string
> = {
  bivarianceHack(
    input: MutationCompileInput<Doc, Intent>
  ): MutationCompileResult<Op, Output, Code>
}['bivarianceHack']

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
    commit: ApplyCommit<Doc, Op, Key, Extra>
  }): boolean
  clear?(input: {
    origin: Origin
    ops: readonly Op[]
    commit: ApplyCommit<Doc, Op, Key, Extra>
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

export interface MutationEngineSpec<
  Doc extends object,
  Table extends MutationIntentTable,
  Op extends {
    type: string
  },
  Key,
  Publish,
  Cache = void,
  Extra = void,
  Services = void,
  DomainCtx = ReducerContext<Doc, Op, Key, string>,
  CompileCtx = void,
  Code extends string = string
> {
  document: Doc
  normalize(doc: Doc): Doc
  services?: Services
  key: MutationKeySpec<Key>
  operations: MutationOperationTable<Doc, Op, Key, DomainCtx>
  reduce: MutationReduceSpec<Doc, Op, Key, Extra, DomainCtx, Code>
  compile?: MutationCompilePlanFn<
    Doc,
    MutationIntentOf<Table>,
    Op,
    MutationOutputOf<Table>,
    Code
  > | MutationCompileSpec<Doc, Table, Op, CompileCtx, Code>
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
  compile(
    input: MutationCompileInput<Doc, MutationIntentOf<Table>>
  ): MutationCompileResult<
    Op,
    MutationOutputOf<Table>,
    Code
  >
}

export type MutationCurrent<Doc, Publish = never> = {
  rev: number
  doc: Doc
} & ([Publish] extends [never]
  ? {}
  : {
      publish: Publish
    })

export type MutationInternalState<Doc, Publish = never, Cache = never> = {
  rev: number
  doc: Doc
} & ([Publish] extends [never]
  ? {}
  : {
      publish: Publish
    }) & ([Cache] extends [never]
  ? {}
  : {
      cache: Cache
    })

type MutationPublishedState<Doc, Publish, Cache> = MutationInternalState<
  Doc,
  Publish,
  Cache
> & {
  publish: Publish
  cache: Cache
}

const COMPILE_BLOCKED_CODE = 'mutation_engine.compile.blocked'
const COMPILE_EMPTY_CODE = 'mutation_engine.compile.empty'
const APPLY_EMPTY_CODE = 'mutation_engine.apply.empty'
const EXECUTE_EMPTY_CODE = 'mutation_engine.execute.empty'

export const hasCompileErrors = (
  issues: readonly MutationCompileIssue[]
): boolean => issues.some((issue) => (issue.severity ?? 'error') === 'error')

const hasBlockingIssue = (
  issues: readonly MutationCompileIssue[]
): boolean => hasCompileErrors(issues)

const toIssues = (
  issues?: readonly MutationCompileIssue[]
): readonly MutationCompileIssue[] => issues ?? []

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

const mutationSuccess = <T, Commit, Code extends string = string>(
  data: T,
  commit: Commit
): MutationResult<T, Commit, Code> => ({
  ok: true,
  data,
  commit
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

const dispatchOperation = <
  Doc extends object,
  Op extends {
    type: string
  },
  Key,
  Ctx
>(
  table: MutationOperationTable<Doc, Op, Key, Ctx>,
  ctx: Ctx,
  op: Op
): void => {
  const entry: MutationOperationExecutor<Doc, Op, Key, Ctx> = readOperation(
    table,
    op
  )
  entry.footprint?.(ctx, op)
  entry.apply(ctx, op)
}

const dispatchCompileHandler = <
  Table extends MutationIntentTable,
  Ctx,
  Code extends string,
  TKind extends MutationIntentKind<Table>
>(
  handlers: MutationCompileHandlerTable<Table, Ctx, Code>,
  intent: MutationIntentOf<Table, TKind>,
  ctx: Ctx
): MutationOutputOf<Table, TKind> | void | MutationCompileControl<Code> => {
  const handler = handlers[intent.type as TKind]
  return handler(intent, ctx)
}

export const normalizeCompileIssue = <Code extends string>(
  issue: MutationCompileIssue<Code>
): Required<Pick<MutationCompileIssue<Code>, 'code' | 'message' | 'severity'>> & Omit<
  MutationCompileIssue<Code>,
  'severity'
> => ({
  ...issue,
  severity: issue.severity ?? 'error'
})

export const createCompileIssue = <
  Code extends string,
  TType extends string = string
>(
  source: MutationCompileSource<TType>,
  severity: 'error' | 'warning',
  code: Code,
  message: string,
  path?: string,
  details?: unknown
): MutationCompileIssue<Code, TType> => ({
  code,
  message,
  ...(path === undefined
    ? {}
    : {
        path
      }),
  ...(details === undefined
    ? {}
    : {
        details
      }),
  severity,
  source
})

const isCompileControl = <Code extends string>(
  value: unknown
): value is MutationCompileControl<Code> => (
  typeof value === 'object'
  && value !== null
  && 'kind' in value
  && (
    value.kind === 'stop'
    || value.kind === 'block'
  )
)

const COMPILE_APPLY_FAILED_CODE = 'mutation_engine.compile.apply_failed'

type MutationCompileApplyResult<
  Doc,
  Code extends string = string
> =
  | {
      ok: true
      doc: Doc
    }
  | {
      ok: false
      issue: MutationCompileIssue<Code>
    }

const compileMutationIntents = <
  Doc,
  Table extends MutationIntentTable,
  Op,
  Ctx,
  Code extends string = string
>(input: {
  doc: Doc
  intents: readonly MutationIntentOf<Table>[]
  handlers: MutationCompileHandlerTable<Table, Ctx, Code>
  createContext: (entry: {
    ctx: MutationCompileCtx<Doc, Op, Code>
    doc: Doc
    intent: MutationIntentOf<Table>
    index: number
  }) => Ctx
  apply: (entry: {
    doc: Doc
    ops: readonly Op[]
  }) => MutationCompileApplyResult<Doc, Code>
}): MutationCompileResult<Op, MutationOutputOf<Table>, Code> => {
  const ops: Op[] = []
  const outputs: MutationOutputOf<Table>[] = []
  const issues: MutationCompileIssue<Code>[] = []
  let workingDoc = input.doc

  for (const [index, intent] of input.intents.entries()) {
    const pendingOps: Op[] = []
    const pendingIssues: MutationCompileIssue<Code>[] = []
    let shouldStop = false
    let blocked = false

    const ctx: MutationCompileCtx<Doc, Op, Code> = {
      doc: () => workingDoc,
      emit: (op) => {
        pendingOps.push(op)
      },
      emitMany: (...nextOps) => {
        pendingOps.push(...nextOps)
      },
      issue: (issue) => {
        const normalized = normalizeCompileIssue(issue)
        pendingIssues.push(normalized)
        if (normalized.severity !== 'warning') {
          blocked = true
        }
      },
      stop: () => {
        shouldStop = true
        return {
          kind: 'stop'
        }
      },
      block: (issue) => {
        const normalized = normalizeCompileIssue(issue)
        pendingIssues.push(normalized)
        blocked = true
        return {
          kind: 'block',
          issue: normalized
        }
      },
      require: (value, issue) => {
        if (value !== undefined) {
          return value
        }

        ctx.issue(issue)
        return undefined
      }
    }

    const compileContext = input.createContext({
      ctx,
      doc: workingDoc,
      intent,
      index
    })
    const output = dispatchCompileHandler(input.handlers, intent, compileContext)

    if (isCompileControl(output)) {
      if (output.kind === 'stop') {
        shouldStop = true
      } else {
        blocked = true
      }
    } else if (output !== undefined) {
      outputs.push(output)
    }

    issues.push(...pendingIssues)
    if (shouldStop || blocked) {
      break
    }
    if (pendingOps.length === 0) {
      continue
    }

    const applied = input.apply({
      doc: workingDoc,
      ops: pendingOps
    })
    if (!applied.ok) {
      issues.push(normalizeCompileIssue(applied.issue))
      break
    }

    ops.push(...pendingOps)
    workingDoc = applied.doc
  }

  return {
    ops,
    outputs,
    ...(issues.length
      ? {
          issues
        }
      : {})
  }
}

const createOperationsSpec = <
  Doc extends object,
  Op extends {
    type: string
  },
  Key,
  Extra,
  DomainCtx,
  Code extends string
>(input: {
  operations: MutationOperationTable<Doc, Op, Key, DomainCtx>
  key: MutationKeySpec<Key>
  reduce: MutationReduceSpec<Doc, Op, Key, Extra, DomainCtx, Code>
}): MutationOperationsSpec<Doc, Op, Key, Extra, DomainCtx, Code> => ({
  table: input.operations,
  serializeKey: input.key.serialize,
  ...(input.reduce.createContext
    ? {
        createContext: input.reduce.createContext
      }
    : {}),
  ...(input.reduce.validate
    ? {
        validate: input.reduce.validate
      }
    : {}),
  ...(input.reduce.settle
    ? {
        settle: input.reduce.settle
      }
    : {}),
  done: input.reduce.done,
  ...(input.key.conflicts
    ? {
        conflicts: input.key.conflicts
      }
    : {})
})

const createCompilePlan = <
  Doc,
  Table extends MutationIntentTable,
  Op,
  Ctx,
  Code extends string
>(
  compile: MutationCompileSpec<Doc, Table, Op, Ctx, Code>,
  input: MutationCompileInput<Doc, MutationIntentOf<Table>>
): MutationCompileResult<
  Op,
  MutationOutputOf<Table>,
  Code
> => compileMutationIntents<
  Doc,
  Table,
  Op,
  Ctx,
  Code
>({
  doc: input.doc,
  intents: input.intents,
  handlers: compile.handlers,
  createContext: compile.createContext,
  apply: compile.apply
})

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
    dispatchOperation(operations.table, ctx, op)
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

const REDUCER_BY_OPERATIONS = new WeakMap<object, Reducer<any, any, any, any, any, any>>()

const readReducerFromOperations = <
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
): Reducer<Doc, Op, Key, Extra, DomainCtx, Code> => {
  const current = REDUCER_BY_OPERATIONS.get(operations as object)
  if (current) {
    return current as Reducer<Doc, Op, Key, Extra, DomainCtx, Code>
  }

  const created = createReducerFromOperations(operations)
  REDUCER_BY_OPERATIONS.set(operations as object, created)
  return created
}

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

class OperationMutationRuntime<
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
  readonly commits: CommitStream<CommitRecord<Doc, Op, Key, Extra>>
  readonly history: HistoryPort<
    MutationResult<void, ApplyCommit<Doc, Op, Key, Extra>, Code>,
    Op,
    Key,
    ApplyCommit<Doc, Op, Key, Extra>
  >

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
    ApplyCommit<Doc, Op, Key, Extra>
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
        ApplyCommit<Doc, Op, Key, Extra>
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
    ApplyCommit<Doc, Op, Key, Extra>,
    Code
  > {
    if (ops.length === 0) {
      return mutationFailure(
        APPLY_EMPTY_CODE as Code,
        'MutationEngine.apply requires at least one operation.'
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
    ApplyCommit<Doc, Op, Key, Extra>,
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
    const commit: ApplyCommit<Doc, Op, Key, Extra> = {
      kind: 'apply',
      rev: nextRev,
      at: Date.now(),
      origin: input.origin,
      doc: nextDoc,
      forward: input.ops.slice(),
      inverse: reduced.inverse,
      footprint: reduced.footprint,
      extra: reduced.extra
    }
    const nextRuntime = this.spec.publish
      ? this.spec.publish.reduce({
          prev: {
            doc: this.state.doc,
            publish: this.readPublishedState().publish,
            cache: this.readPublishedState().cache
          },
          doc: nextDoc,
          commit
        })
      : undefined

    this.state = nextRuntime
      ? ({
          rev: nextRev,
          doc: nextDoc,
          publish: nextRuntime.publish,
          cache: nextRuntime.cache
        } as MutationInternalState<Doc, Publish, Cache>)
      : ({
          rev: nextRev,
          doc: nextDoc
        } as MutationInternalState<Doc, Publish, Cache>)

    if (input.origin !== 'history' && this.historyControllerRef) {
      const historySpec = this.spec.history === false
        ? undefined
        : this.spec.history
      const shouldClear = historySpec?.clear?.({
        origin: input.origin,
        ops: input.ops,
        commit
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
          commit
        }) ?? defaultTracksHistory(
          this.spec.operations.table,
          input.origin,
          input.ops
        )

        if (shouldTrack) {
          this.historyControllerRef.capture(commit)
        }
      }
    }

    this.emitCurrent()
    this.emitCommit(commit)

    return mutationSuccess<TData, ApplyCommit<Doc, Op, Key, Extra>, Code>(
      input.data,
      commit
    )
  }

  private readCurrent(): MutationCurrent<Doc, Publish> {
    return this.spec.publish
      ? ({
          rev: this.state.rev,
          doc: this.state.doc,
          publish: this.readPublishedState().publish
        } as MutationCurrent<Doc, Publish>)
      : ({
          rev: this.state.rev,
          doc: this.state.doc
        } as MutationCurrent<Doc, Publish>)
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

    return runtime
      ? ({
          rev,
          doc,
          publish: runtime.publish,
          cache: runtime.cache
        } as MutationInternalState<Doc, Publish, Cache>)
      : ({
          rev,
          doc
        } as MutationInternalState<Doc, Publish, Cache>)
  }

  private readPublishedState(): MutationPublishedState<Doc, Publish, Cache> {
    return this.state as MutationPublishedState<Doc, Publish, Cache>
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

export class MutationEngine<
  Doc extends object,
  Table extends MutationIntentTable,
  Op extends {
    type: string
  },
  Key,
  Publish,
  Cache = void,
  Extra = void,
  DomainCtx = ReducerContext<Doc, Op, Key, string>,
  CompileCtx = unknown,
  Code extends string = string
> extends OperationMutationRuntime<Doc, Op, Key, Publish, Cache, Extra, Code> {
  private readonly compilePlan?: MutationEngineSpec<
    Doc,
    Table,
    Op,
    Key,
    Publish,
    Cache,
    Extra,
    void,
    DomainCtx,
    CompileCtx,
    Code
  >['compile']

  constructor(input: {
    document: Doc
    normalize: (doc: Doc) => Doc
    key: MutationKeySpec<Key>
    operations: MutationOperationTable<
      Doc,
      Op,
      Key,
      DomainCtx
    >
    reduce: MutationReduceSpec<
      Doc,
      Op,
      Key,
      Extra,
      DomainCtx,
      Code
    >
    compile?: MutationCompilePlanFn<
      Doc,
      MutationIntentOf<Table>,
      Op,
      MutationOutputOf<Table>,
      Code
    > | MutationCompileSpec<Doc, Table, Op, CompileCtx, Code>
    publish?: MutationPublishSpec<Doc, Op, Key, Extra, Publish, Cache>
    history?: MutationHistorySpec<Doc, Op, Key, Extra> | false
  }) {
    super({
      doc: input.document,
      spec: {
        normalize: input.normalize,
        operations: createOperationsSpec({
          operations: input.operations,
          key: input.key,
          reduce: input.reduce
        }),
        ...(input.publish
          ? {
              publish: input.publish
            }
          : {}),
        ...(input.history !== undefined
          ? {
              history: input.history
            }
          : {})
      }
    })
    this.compilePlan = input.compile
  }

  static reduce<
    Doc extends object,
    Op extends {
      type: string
    },
    Key,
    Extra,
    DomainCtx,
    Code extends string = string
  >(input: {
    document: Doc
    ops: readonly Op[]
    origin?: Origin
    operations: MutationOperationsSpec<Doc, Op, Key, Extra, DomainCtx, Code>
  }): ReducerResult<Doc, Op, Key, Extra, Code> {
    const validationError = input.operations.validate?.({
      doc: input.document,
      ops: input.ops,
      origin: input.origin ?? 'user'
    })
    if (validationError) {
      return {
        ok: false,
        error: validationError
      }
    }

    return readReducerFromOperations(input.operations).reduce({
      doc: input.document,
      ops: input.ops,
      origin: input.origin
    })
  }

  static compile<
    Doc,
    Table extends MutationIntentTable,
    Op,
    Ctx,
    Code extends string = string
  >(input: {
    doc: Doc
    intents: readonly MutationIntentOf<Table>[]
    handlers: MutationCompileHandlerTable<Table, Ctx, Code>
    createContext: (entry: {
      ctx: MutationCompileCtx<Doc, Op, Code>
      doc: Doc
      intent: MutationIntentOf<Table>
      index: number
    }) => Ctx
    apply: (entry: {
      doc: Doc
      ops: readonly Op[]
    }) => MutationCompileApplyResult<Doc, Code>
  }): MutationCompileResult<Op, MutationOutputOf<Table>, Code> {
    return compileMutationIntents(input)
  }

  execute<K extends MutationIntentKind<Table>>(
    intent: MutationIntentOf<Table, K>,
    options?: MutationOptions
  ): MutationExecuteResult<
    Table,
    ApplyCommit<Doc, Op, Key, Extra>,
    K,
    Code
  >
  execute(
    intents: readonly MutationIntentOf<Table>[],
    options?: MutationOptions
  ): MutationResult<
    readonly MutationOutputOf<Table>[],
    ApplyCommit<Doc, Op, Key, Extra>,
    Code
  >
  execute<Input extends MutationExecuteInput<Table>>(
    input: Input,
    options?: MutationOptions
  ): MutationExecuteResultOfInput<
    Table,
    ApplyCommit<Doc, Op, Key, Extra>,
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
        'MutationEngine.execute requires at least one intent.'
      ) as MutationExecuteResultOfInput<
        Table,
        ApplyCommit<Doc, Op, Key, Extra>,
        Input,
        Code
      >
    }

    if (!this.compilePlan) {
      return mutationFailure(
        COMPILE_EMPTY_CODE as Code,
        'MutationEngine.execute requires compile handlers.'
      ) as MutationExecuteResultOfInput<
        Table,
        ApplyCommit<Doc, Op, Key, Extra>,
        Input,
        Code
      >
    }

    const plan = typeof this.compilePlan === 'function'
      ? this.compilePlan({
          doc: this.readCommittedDoc(),
          intents
        })
      : createCompilePlan(
          this.compilePlan,
          {
            doc: this.readCommittedDoc(),
            intents
          }
        )
    const issues = toIssues(plan.issues)
    const canApply = plan.canApply ?? (
      plan.ops.length > 0
      && !hasBlockingIssue(issues)
    )

    if (!canApply) {
      return mutationFailure(
        COMPILE_BLOCKED_CODE as Code,
        'MutationEngine.execute was blocked by compile issues.',
        {
          issues
        }
      ) as MutationExecuteResultOfInput<
        Table,
        ApplyCommit<Doc, Op, Key, Extra>,
        Input,
        Code
      >
    }

    if (!plan.ops.length) {
      return mutationFailure(
        COMPILE_EMPTY_CODE as Code,
        'MutationEngine.execute produced no operations.',
        {
          issues
        }
      ) as MutationExecuteResultOfInput<
        Table,
        ApplyCommit<Doc, Op, Key, Extra>,
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
        ApplyCommit<Doc, Op, Key, Extra>,
        Input,
        Code
      > extends MutationResult<infer Data, ApplyCommit<Doc, Op, Key, Extra>, Code>
        ? Data
        : never,
      origin: options?.origin ?? 'user'
    }) as MutationExecuteResultOfInput<
      Table,
      ApplyCommit<Doc, Op, Key, Extra>,
      Input,
      Code
    >
  }
}
