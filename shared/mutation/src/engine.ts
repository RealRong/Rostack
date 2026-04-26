import type {
  ReducerResult
} from '@shared/reducer'
import type {
  Issue
} from './compiler'
import {
  history as historyRuntime,
  type HistoryController
} from './history'
import {
  createHistoryPort,
  readHistoryPortRuntime,
  type HistoryPort
} from './localHistory'
import type { MutationPort } from './port'
import type {
  ApplyCommit,
  CommitRecord,
  CommitStream,
  Origin,
  Write,
  WriteStream
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

export interface MutationHistorySpec<Doc, Op, Key, Extra> {
  capacity?: number
  track(write: Write<Doc, Op, Key, Extra>): boolean
  clear?(write: Write<Doc, Op, Key, Extra>): boolean
  conflicts(left: Key, right: Key): boolean
}

export interface MutationRuntimeSpec<
  Doc extends object,
  Op,
  Key,
  Publish,
  Cache = void,
  Extra = void
> {
  clone(doc: Doc): Doc
  normalize?(doc: Doc): Doc
  apply(input: {
    doc: Doc
    ops: readonly Op[]
    origin: Origin
  }): MutationApplyResult<Doc, Op, Key, Extra>
  publish?: MutationPublishSpec<Doc, Op, Key, Extra, Publish, Cache>
  history?: MutationHistorySpec<Doc, Op, Key, Extra>
}

export interface CommandMutationSpec<
  Doc extends object,
  Table extends MutationIntentTable,
  Op,
  Key,
  Publish,
  Cache = void,
  Extra = void
> extends MutationRuntimeSpec<Doc, Op, Key, Publish, Cache, Extra> {
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

const mutationSuccess = <T, W>(
  data: T,
  write: W
): MutationResult<T, W> => ({
  ok: true,
  data,
  write
})

const applySuccess = <Doc, Op, Key, Extra>(
  data: Extract<ReducerResult<Doc, Op, Key, Extra>, { ok: true }>
): MutationApplyResult<Doc, Op, Key, Extra> => ({
  ok: true,
  data
})

const applyFailure = <Code extends string>(
  error: MutationError<Code>
): MutationFailure<Code> => ({
  ok: false,
  error
})

export const mutationResult = {
  success: mutationSuccess,
  failure: mutationFailure
} as const

const applyCommitResult = {
  success: applySuccess,
  failure: applyFailure
} as const

const readFirstOutput = <Output>(
  outputs?: readonly Output[]
): Output | undefined => outputs?.[0]

export class OperationMutationRuntime<
  Doc extends object,
  Op,
  Key,
  Publish,
  Cache = void,
  Extra = void
> implements MutationPort<
  Doc,
  Op,
  Key,
  MutationResult<void, Write<Doc, Op, Key, Extra>>,
  Write<Doc, Op, Key, Extra>
> {
  readonly writes: WriteStream<Write<Doc, Op, Key, Extra>>
  readonly commits: CommitStream<CommitRecord<Doc, Op, Key, Extra>>
  readonly history: HistoryPort<
    MutationResult<void, Write<Doc, Op, Key, Extra>>,
    Op,
    Key,
    Write<Doc, Op, Key, Extra>
  >
  readonly internal: MutationPort<
    Doc,
    Op,
    Key,
    MutationResult<void, Write<Doc, Op, Key, Extra>>,
    Write<Doc, Op, Key, Extra>
  >['internal']

  protected readonly spec: MutationRuntimeSpec<Doc, Op, Key, Publish, Cache, Extra>
  private state: MutationInternalState<Doc, Publish, Cache>
  private readonly historyControllerRef?: HistoryController<
    Op,
    Key,
    Write<Doc, Op, Key, Extra>
  >
  private readonly listeners = new Set<(current: MutationCurrent<Doc, Publish>) => void>()
  private readonly writeListeners = new Set<(write: Write<Doc, Op, Key, Extra>) => void>()
  private readonly commitListeners = new Set<(
    commit: CommitRecord<Doc, Op, Key, Extra>
  ) => void>()

  constructor(input: {
    doc: Doc
    spec: MutationRuntimeSpec<Doc, Op, Key, Publish, Cache, Extra>
  }) {
    this.spec = input.spec

    const initialDoc = this.prepareExternalDoc(input.doc)
    this.state = this.createInitialState(initialDoc)

    if (this.spec.history) {
      this.historyControllerRef = historyRuntime.create<
        Op,
        Key,
        Write<Doc, Op, Key, Extra>
      >({
        capacity: this.spec.history.capacity,
        track: (write: Write<Doc, Op, Key, Extra>) => this.spec.history!.track(write),
        conflicts: (left: readonly Key[], right: readonly Key[]) => left.some(
          (leftKey: Key) => right.some(
            (rightKey: Key) => this.spec.history!.conflicts(leftKey, rightKey)
          )
        )
      })
    }

    this.writes = {
      subscribe: (listener) => {
        this.writeListeners.add(listener)
        return () => {
          this.writeListeners.delete(listener)
        }
      }
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
    return this.spec.clone(this.state.doc)
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
    Write<Doc, Op, Key, Extra>
  > {
    if (ops.length === 0) {
      return mutationFailure(
        APPLY_EMPTY_CODE,
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

  load(
    doc: Doc
  ): void {
    this.replace(doc, {
      origin: 'load'
    })
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
    Write<Doc, Op, Key, Extra>
  > {
    const applied = this.spec.apply({
      doc: this.state.doc,
      ops: input.ops,
      origin: input.origin
    })
    if (!applied.ok) {
      return applied
    }

    const commit = applied.data
    const nextDoc = this.prepareCommittedDoc(commit.doc)
    const nextRev = this.state.rev + 1
    const write: Write<Doc, Op, Key, Extra> = {
      rev: nextRev,
      at: Date.now(),
      origin: input.origin,
      doc: nextDoc,
      forward: input.ops.slice(),
      inverse: commit.inverse,
      footprint: commit.footprint,
      extra: commit.extra
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
      if (this.spec.history?.clear?.(write)) {
        this.historyControllerRef.clear()
      } else {
        this.historyControllerRef.capture(write)
      }
    }

    this.emitCurrent()
    this.emitWrite(write)
    this.emitCommit(appliedCommit)

    return mutationSuccess(input.data, write)
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
    const cloned = this.spec.clone(doc)
    return this.prepareCommittedDoc(cloned)
  }

  private prepareCommittedDoc(
    doc: Doc
  ): Doc {
    return this.spec.normalize?.(doc) ?? doc
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

  private emitWrite(
    write: Write<Doc, Op, Key, Extra>
  ) {
    this.writeListeners.forEach((listener) => {
      listener(write)
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
  Op,
  Key,
  Publish,
  Cache = void,
  Extra = void
> extends OperationMutationRuntime<Doc, Op, Key, Publish, Cache, Extra> {
  protected readonly commandSpec: CommandMutationSpec<
    Doc,
    Table,
    Op,
    Key,
    Publish,
    Cache,
    Extra
  >

  constructor(input: {
    doc: Doc
    spec: CommandMutationSpec<Doc, Table, Op, Key, Publish, Cache, Extra>
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
    K
  >
  execute(
    intents: readonly MutationIntentOf<Table>[],
    options?: MutationOptions
  ): MutationResult<
    readonly MutationOutputOf<Table>[],
    Write<Doc, Op, Key, Extra>
  >
  execute<Input extends MutationExecuteInput<Table>>(
    input: Input,
    options?: MutationOptions
  ): MutationExecuteResultOfInput<
    Table,
    Write<Doc, Op, Key, Extra>,
    Input
  > {
    const batch = Array.isArray(input)
    const intents: readonly MutationIntentOf<Table>[] = batch
      ? input as readonly MutationIntentOf<Table>[]
      : [input as MutationIntentOf<Table>]

    if (intents.length === 0) {
      return mutationFailure(
        EXECUTE_EMPTY_CODE,
        'CommandMutationEngine.execute requires at least one intent.'
      ) as MutationExecuteResultOfInput<
        Table,
        Write<Doc, Op, Key, Extra>,
        Input
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
        COMPILE_BLOCKED_CODE,
        'CommandMutationEngine.execute was blocked by compile issues.',
        {
          issues
        }
      ) as MutationExecuteResultOfInput<
        Table,
        Write<Doc, Op, Key, Extra>,
        Input
      >
    }

    if (!plan.ops.length) {
      return mutationFailure(
        COMPILE_EMPTY_CODE,
        'CommandMutationEngine.execute produced no operations.',
        {
          issues
        }
      ) as MutationExecuteResultOfInput<
        Table,
        Write<Doc, Op, Key, Extra>,
        Input
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
        Input
      > extends MutationResult<infer Data, Write<Doc, Op, Key, Extra>>
        ? Data
        : never,
      origin: options?.origin ?? 'user'
    }) as MutationExecuteResultOfInput<
      Table,
      Write<Doc, Op, Key, Extra>,
      Input
    >
  }
}

export const applyResult = applyCommitResult
