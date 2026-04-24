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

export type MutationBatchData<
  T extends MutationIntentTable,
  BatchValue = void
> = [BatchValue] extends [void]
  ? readonly MutationOutputOf<T>[]
  : BatchValue

export interface MutationOptions {
  origin?: Origin
}

export interface MutationPlan<
  Op,
  Output = void,
  BatchValue = void
> {
  ops: readonly Op[]
  issues?: readonly Issue[]
  canApply?: boolean
  outputs?: readonly Output[]
  value?: BatchValue
}

export interface MutationPublishSpec<Doc, Op, Key, Extra, Publish> {
  init(doc: Doc): Publish
  reduce(input: {
    prev: Publish
    doc: Doc
    write: Write<Doc, Op, Key, Extra>
  }): Publish
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
  BatchValue = void,
  Extra = void
> {
  clone(doc: Doc): Doc
  normalize?(doc: Doc): Doc
  compile?(input: {
    doc: Doc
    intents: readonly MutationIntentOf<Table>[]
  }): MutationPlan<Op, MutationOutputOf<Table>, BatchValue>
  apply(input: {
    doc: Doc
    ops: readonly Op[]
    origin: Origin
  }): MutationApplyResult<Doc, Op, Key, Extra>
  publish?: MutationPublishSpec<Doc, Op, Key, Extra, Publish>
  history?: MutationHistorySpec<Doc, Op, Key, Extra>
}

export interface MutationCurrent<Doc, Publish> {
  rev: number
  doc: Doc
  publish?: Publish
}

const COMPILE_MISSING_CODE = 'mutation_engine.compile.missing'
const COMPILE_BLOCKED_CODE = 'mutation_engine.compile.blocked'
const COMPILE_EMPTY_CODE = 'mutation_engine.compile.empty'
const APPLY_EMPTY_CODE = 'mutation_engine.apply.empty'
const EXECUTE_MANY_EMPTY_CODE = 'mutation_engine.execute_many.empty'

const hasBlockingIssue = (
  issues: readonly Issue[]
): boolean => issues.some((issue) => (issue.level ?? 'error') !== 'warning')

const toIssues = (
  issues?: readonly Issue[]
): readonly Issue[] => issues ?? []

const failure = <Code extends string>(
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

const readFirstOutput = <Output>(
  outputs?: readonly Output[]
): Output | undefined => outputs?.[0]

const readBatchData = <
  Table extends MutationIntentTable,
  BatchValue
>(
  plan: MutationPlan<unknown, MutationOutputOf<Table>, BatchValue>
): MutationBatchData<Table, BatchValue> => (
  plan.value !== undefined
    ? plan.value
    : (plan.outputs ?? [])
) as MutationBatchData<Table, BatchValue>

type State<Doc, Publish> = {
  rev: number
  doc: Doc
  publish?: Publish
}

export class MutationEngine<
  Doc extends object,
  Table extends MutationIntentTable,
  Op,
  Key,
  Publish,
  BatchValue = void,
  Extra = void
> {
  readonly writes: WriteStream<Write<Doc, Op, Key, Extra>>
  readonly history?: HistoryController<
    Op,
    Key,
    Write<Doc, Op, Key, Extra>
  >

  readonly #spec: MutationEngineSpec<Doc, Table, Op, Key, Publish, BatchValue, Extra>
  #state: State<Doc, Publish>
  readonly #listeners = new Set<(current: MutationCurrent<Doc, Publish>) => void>()
  readonly #writeListeners = new Set<(write: Write<Doc, Op, Key, Extra>) => void>()

  constructor(input: {
    doc: Doc
    spec: MutationEngineSpec<Doc, Table, Op, Key, Publish, BatchValue, Extra>
  }) {
    this.#spec = input.spec

    const initialDoc = this.#prepareExternalDoc(input.doc)
    const initialPublish = this.#spec.publish?.init(initialDoc)
    this.#state = {
      rev: 0,
      doc: initialDoc,
      ...(initialPublish !== undefined
        ? {
            publish: initialPublish
          }
        : {})
    }

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
    return {
      rev: this.#state.rev,
      doc: this.#spec.clone(this.#state.doc),
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
  > {
    if (!this.#spec.compile) {
      return failure(
        COMPILE_MISSING_CODE,
        'MutationEngine.execute requires spec.compile.'
      ) as MutationExecuteResult<
        Table,
        Write<Doc, Op, Key, Extra>,
        K
      >
    }

    const plan = this.#spec.compile({
      doc: this.#state.doc,
      intents: [intent]
    })
    const issues = toIssues(plan.issues)
    const canApply = plan.canApply ?? (
      plan.ops.length > 0
      && !hasBlockingIssue(issues)
    )

    if (!canApply) {
      return failure(
        COMPILE_BLOCKED_CODE,
        'MutationEngine.execute was blocked by compile issues.',
        {
          issues
        }
      ) as MutationExecuteResult<
        Table,
        Write<Doc, Op, Key, Extra>,
        K
      >
    }

    if (!plan.ops.length) {
      return failure(
        COMPILE_EMPTY_CODE,
        'MutationEngine.execute produced no operations.',
        {
          issues
        }
      ) as MutationExecuteResult<
        Table,
        Write<Doc, Op, Key, Extra>,
        K
      >
    }

    return this.#commit({
      ops: plan.ops,
      data: readFirstOutput(plan.outputs) as MutationOutputOf<Table, K>,
      origin: options?.origin ?? 'user'
    }) as MutationExecuteResult<
      Table,
      Write<Doc, Op, Key, Extra>,
      K
    >
  }

  executeMany(
    intents: readonly MutationIntentOf<Table>[],
    options?: MutationOptions
  ): MutationResult<
    MutationBatchData<Table, BatchValue>,
    Write<Doc, Op, Key, Extra>
  > {
    if (intents.length === 0) {
      return failure(
        EXECUTE_MANY_EMPTY_CODE,
        'MutationEngine.executeMany requires at least one intent.'
      )
    }

    if (!this.#spec.compile) {
      return failure(
        COMPILE_MISSING_CODE,
        'MutationEngine.executeMany requires spec.compile.'
      )
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
      return failure(
        COMPILE_BLOCKED_CODE,
        'MutationEngine.executeMany was blocked by compile issues.',
        {
          issues
        }
      )
    }

    if (!plan.ops.length) {
      return failure(
        COMPILE_EMPTY_CODE,
        'MutationEngine.executeMany produced no operations.',
        {
          issues
        }
      )
    }

    return this.#commit({
      ops: plan.ops,
      data: readBatchData<Table, BatchValue>(plan),
      origin: options?.origin ?? 'user'
    })
  }

  apply(
    ops: readonly Op[],
    options?: MutationOptions
  ): MutationResult<
    void,
    Write<Doc, Op, Key, Extra>
  > {
    if (ops.length === 0) {
      return failure(
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
    const nextPublish = this.#spec.publish?.init(nextDoc)

    this.#state = {
      rev: this.#state.rev + 1,
      doc: nextDoc,
      ...(nextPublish !== undefined
        ? {
            publish: nextPublish
          }
        : {})
    }

    this.history?.clear()
    this.#emitCurrent()
  }

  #prepareExternalDoc(
    doc: Doc
  ): Doc {
    return this.#normalizeDoc(this.#spec.clone(doc))
  }

  #normalizeDoc(
    doc: Doc
  ): Doc {
    return this.#spec.normalize
      ? this.#spec.normalize(doc)
      : doc
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
    const nextDoc = this.#normalizeDoc(commit.doc)
    const nextRev = this.#state.rev + 1
    const write: Write<Doc, Op, Key, Extra> = {
      rev: nextRev,
      at: Date.now(),
      origin: input.origin,
      doc: this.#spec.clone(nextDoc),
      forward: commit.forward,
      inverse: commit.inverse,
      footprint: commit.footprint,
      extra: commit.extra
    }
    const nextPublish = this.#state.publish !== undefined && this.#spec.publish
      ? this.#spec.publish.reduce({
          prev: this.#state.publish,
          doc: nextDoc,
          write
        })
      : this.#spec.publish?.init(nextDoc)

    this.#state = {
      rev: nextRev,
      doc: nextDoc,
      ...(nextPublish !== undefined
        ? {
            publish: nextPublish
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
    this.#listeners.forEach((listener) => {
      listener(this.current())
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

export const mutationApply = {
  success: applySuccess
} as const
