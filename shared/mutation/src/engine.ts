import type {
  ApplyResult
} from './apply'
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

export interface MutationPlan<Op, Value = void> {
  ops: readonly Op[]
  issues?: readonly Issue[]
  canApply?: boolean
  value?: Value
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
  conflicts(left: Key, right: Key): boolean
}

export interface MutationEngineSpec<
  Doc extends object,
  Intent,
  Op,
  Key,
  Publish,
  Value = void,
  Extra = void
> {
  clone(doc: Doc): Doc
  normalize?(doc: Doc): Doc
  serializeKey(key: Key): string
  compile?(input: {
    doc: Doc
    intents: readonly Intent[]
  }): MutationPlan<Op, Value>
  apply(input: {
    doc: Doc
    ops: readonly Op[]
  }): ApplyResult<Doc, Op, Key, Extra>
  publish?: MutationPublishSpec<Doc, Op, Key, Extra, Publish>
  history?: MutationHistorySpec<Doc, Op, Key, Extra>
}

export interface MutationCurrent<Doc, Publish> {
  rev: number
  doc: Doc
  publish?: Publish
}

export interface MutationCommitResult<
  Doc,
  Op,
  Key,
  Extra,
  Value = void
> {
  applied: boolean
  issues: readonly Issue[]
  value?: Value
  write?: Write<Doc, Op, Key, Extra>
}

const hasBlockingIssue = (
  issues: readonly Issue[]
): boolean => issues.some((issue) => (issue.level ?? 'error') !== 'warning')

const toIssues = (
  issues?: readonly Issue[]
): readonly Issue[] => issues ?? []

const toIntentList = <Intent>(
  input: Intent | readonly Intent[]
): readonly Intent[] => Array.isArray(input)
  ? input as readonly Intent[]
  : [input] as readonly Intent[]

const withValue = <T extends object, TValue>(
  result: T,
  value: TValue | undefined
): T & { value?: TValue } => value === undefined
  ? result
  : {
      ...result,
      value
    }

type State<Doc, Publish> = {
  rev: number
  doc: Doc
  publish?: Publish
}

export class MutationEngine<
  Doc extends object,
  Intent,
  Op,
  Key,
  Publish,
  Value = void,
  Extra = void
> {
  readonly writes: WriteStream<Write<Doc, Op, Key, Extra>>
  readonly history?: HistoryController<Op, Key, Write<Doc, Op, Key, Extra>>

  readonly #spec: MutationEngineSpec<Doc, Intent, Op, Key, Publish, Value, Extra>
  #state: State<Doc, Publish>
  readonly #listeners = new Set<(current: MutationCurrent<Doc, Publish>) => void>()
  readonly #writeListeners = new Set<(write: Write<Doc, Op, Key, Extra>) => void>()

  constructor(input: {
    doc: Doc
    spec: MutationEngineSpec<Doc, Intent, Op, Key, Publish, Value, Extra>
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

  execute(
    intent: Intent | readonly Intent[],
    options?: {
      origin?: Origin
    }
  ): MutationCommitResult<Doc, Op, Key, Extra, Value> {
    if (!this.#spec.compile) {
      return {
        applied: false,
        issues: [{
          code: 'mutation_engine.compile.missing',
          message: 'MutationEngine.execute requires spec.compile.'
        }]
      }
    }

    const plan = this.#spec.compile({
      doc: this.#state.doc,
      intents: toIntentList(intent)
    })
    const issues = toIssues(plan.issues)
    const canApply = plan.canApply ?? (
      plan.ops.length > 0
      && !hasBlockingIssue(issues)
    )

    if (!canApply || plan.ops.length === 0) {
      return withValue({
        applied: false,
        issues
      }, plan.value)
    }

    return this.#commit({
      ops: plan.ops,
      issues,
      value: plan.value,
      origin: options?.origin ?? 'user'
    })
  }

  apply(
    ops: readonly Op[],
    options?: {
      origin?: Origin
    }
  ): MutationCommitResult<Doc, Op, Key, Extra> {
    if (ops.length === 0) {
      return {
        applied: false,
        issues: []
      }
    }

    return this.#commit({
      ops,
      issues: [],
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

  #commit<TValue>(input: {
    ops: readonly Op[]
    issues: readonly Issue[]
    origin: Origin
    value?: TValue
  }): MutationCommitResult<Doc, Op, Key, Extra, TValue> {
    const applied = this.#spec.apply({
      doc: this.#state.doc,
      ops: input.ops
    })
    const nextDoc = this.#normalizeDoc(applied.doc)
    const nextRev = this.#state.rev + 1
    const write: Write<Doc, Op, Key, Extra> = {
      rev: nextRev,
      at: Date.now(),
      origin: input.origin,
      doc: this.#spec.clone(nextDoc),
      forward: applied.forward,
      inverse: applied.inverse,
      footprint: applied.footprint,
      extra: applied.extra
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

    if (input.origin !== 'history') {
      this.history?.capture(write)
    }

    this.#emitCurrent()
    this.#emitWrite(write)

    return withValue({
      applied: true,
      issues: input.issues,
      write
    }, input.value)
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
