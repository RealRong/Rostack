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
import type {
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

export interface MutationEngineSpec<
  Doc extends object,
  Table extends MutationIntentTable,
  Op,
  Key,
  Publish,
  Cache = void,
  Extra = void
> {
  clone(doc: Doc): Doc
  normalize?(doc: Doc): Doc
  compile?(input: {
    doc: Doc
    intents: readonly MutationIntentOf<Table>[]
  }): MutationPlan<Op, MutationOutputOf<Table>>
  apply(input: {
    doc: Doc
    ops: readonly Op[]
    origin: Origin
  }): MutationApplyResult<Doc, Op, Key, Extra>
  publish?: MutationPublishSpec<Doc, Op, Key, Extra, Publish, Cache>
  history?: MutationHistorySpec<Doc, Op, Key, Extra>
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

const COMPILE_MISSING_CODE = 'mutation_engine.compile.missing'
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

const success = <T, W>(
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

const readFirstOutput = <Output>(
  outputs?: readonly Output[]
): Output | undefined => outputs?.[0]

export class MutationEngine<
  Doc extends object,
  Table extends MutationIntentTable,
  Op,
  Key,
  Publish,
  Cache = void,
  Extra = void
> {
  readonly writes: WriteStream<Write<Doc, Op, Key, Extra>>
  readonly history?: HistoryController<
    Op,
    Key,
    Write<Doc, Op, Key, Extra>
  >

  readonly #spec: MutationEngineSpec<Doc, Table, Op, Key, Publish, Cache, Extra>
  #state: MutationInternalState<Doc, Publish, Cache>
  readonly #listeners = new Set<(current: MutationCurrent<Doc, Publish>) => void>()
  readonly #writeListeners = new Set<(write: Write<Doc, Op, Key, Extra>) => void>()

  constructor(input: {
    doc: Doc
    spec: MutationEngineSpec<Doc, Table, Op, Key, Publish, Cache, Extra>
  }) {
    this.#spec = input.spec

    const initialDoc = this.#prepareExternalDoc(input.doc)
    this.#state = this.#createInitialState(initialDoc)

    if (this.#spec.history) {
      this.history = historyRuntime.create<
        Op,
        Key,
        Write<Doc, Op, Key, Extra>
      >({
        capacity: this.#spec.history.capacity,
        track: (write) => this.#spec.history!.track(write),
        conflicts: (left, right) => left.some(
          (leftKey) => right.some(
            (rightKey) => this.#spec.history!.conflicts(leftKey, rightKey)
          )
        )
      })
    }

    this.writes = {
      subscribe: (listener) => {
        this.#writeListeners.add(listener)
        return () => {
          this.#writeListeners.delete(listener)
        }
      }
    }
  }

  doc(): Doc {
    return this.#spec.clone(this.#state.doc)
  }

  current(): MutationCurrent<Doc, Publish> {
    return this.#readCurrent()
  }

  #readCurrent(): MutationCurrent<Doc, Publish> {
    return {
      rev: this.#state.rev,
      doc: this.#state.doc,
      ...(this.#state.publish !== undefined
        ? {
            publish: this.#state.publish
          }
        : {})
    }
  }

  subscribe(
    listener: (current: MutationCurrent<Doc, Publish>) => void
  ): () => void {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
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
        'MutationEngine.execute requires at least one intent.'
      ) as MutationExecuteResultOfInput<
        Table,
        Write<Doc, Op, Key, Extra>,
        Input
      >
    }

    if (!this.#spec.compile) {
      return mutationFailure(
        COMPILE_MISSING_CODE,
        'MutationEngine.execute requires spec.compile.'
      ) as MutationExecuteResultOfInput<
        Table,
        Write<Doc, Op, Key, Extra>,
        Input
      >
    }

    const plan = this.#spec.compile({
      doc: this.#state.doc,
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
        'MutationEngine.execute was blocked by compile issues.',
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
        'MutationEngine.execute produced no operations.',
        {
          issues
        }
      ) as MutationExecuteResultOfInput<
        Table,
        Write<Doc, Op, Key, Extra>,
        Input
      >
    }

    return this.#commit({
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
        'MutationEngine.apply requires at least one operation.'
      )
    }

    return this.#commit({
      ops,
      data: undefined,
      origin: options?.origin ?? 'user'
    })
  }

  load(
    doc: Doc
  ): void {
    const nextDoc = this.#prepareExternalDoc(doc)
    this.#state = this.#createInitialState(nextDoc, this.#state.rev + 1)

    this.history?.clear()
    this.#emitCurrent()
  }

  #prepareExternalDoc(
    doc: Doc
  ): Doc {
    const cloned = this.#spec.clone(doc)
    return this.#prepareCommittedDoc(cloned)
  }

  #prepareCommittedDoc(
    doc: Doc
  ): Doc {
    return this.#spec.normalize?.(doc) ?? doc
  }

  #createInitialState(
    doc: Doc,
    rev = 0
  ): MutationInternalState<Doc, Publish, Cache> {
    const runtime = this.#spec.publish?.init(doc)

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

  #commit<TData>(input: {
    ops: readonly Op[]
    data: TData
    origin: Origin
  }): MutationResult<
    TData,
    Write<Doc, Op, Key, Extra>
  > {
    const applied = this.#spec.apply({
      doc: this.#state.doc,
      ops: input.ops,
      origin: input.origin
    })
    if (!applied.ok) {
      return applied
    }

    const commit = applied.data
    const nextDoc = this.#prepareCommittedDoc(commit.doc)
    const nextRev = this.#state.rev + 1
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
    const nextRuntime = this.#spec.publish
      ? (
          this.#state.publish !== undefined
            ? this.#spec.publish.reduce({
                prev: {
                  doc: this.#state.doc,
                  publish: this.#state.publish,
                  cache: this.#state.cache as Cache
                },
                doc: nextDoc,
                write
              })
            : this.#spec.publish.init(nextDoc)
        )
      : undefined

    this.#state = {
      rev: nextRev,
      doc: nextDoc,
      ...(nextRuntime
        ? {
            publish: nextRuntime.publish,
            cache: nextRuntime.cache
          }
        : {})
    }

    if (input.origin !== 'history' && this.history) {
      if (this.#spec.history?.clear?.(write)) {
        this.history.clear()
      } else {
        this.history.capture(write)
      }
    }

    this.#emitCurrent()
    this.#emitWrite(write)

    return success(input.data, write)
  }

  #emitCurrent() {
    const current = this.#readCurrent()
    this.#listeners.forEach((listener) => {
      listener(current)
    })
  }

  #emitWrite(
    write: Write<Doc, Op, Key, Extra>
  ) {
    this.#writeListeners.forEach((listener) => {
      listener(write)
    })
  }
}

export const applyResult = {
  success: applySuccess,
  failure: applyFailure
} as const
