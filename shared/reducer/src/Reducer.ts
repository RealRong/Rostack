import type {
  ReducerHandler,
  ReducerContext,
  ReducerDraftAdapter,
  ReducerHandlerMap,
  ReducerIssue,
  ReducerIssueInput,
  ReducerResult,
  ReducerSpec
} from './contracts'
import * as historyFootprint from './historyFootprint'
import { defaultDraftAdapter } from './internalDraft'
import * as operationBuffer from './operationBuffer'

const REDUCER_ABORT = Symbol('shared.reducer.abort')
const MISSING_HANDLER_CODE = 'reducer.handler.missing'

const normalizeIssue = <Code extends string>(
  issue: ReducerIssueInput<Code>
): ReducerIssue<Code> => ({
  ...issue,
  level: issue.level ?? 'error'
})

const isReducerAbort = (
  value: unknown
): boolean => value === REDUCER_ABORT

const readHandler = <
  Ctx,
  Op extends { type: string }
>(
  handlers: ReducerHandlerMap<Ctx, Op> | undefined,
  op: Op
) => handlers
  ? (
  handlers as Record<string, unknown>
  )[op.type] as ReducerHandlerMap<Ctx, Op>[Op['type']] | undefined
  : undefined

export class Reducer<
  Doc extends object,
  Op extends { type: string },
  Key,
  Extra = void,
  DomainCtx = ReducerContext<Doc, Op, Key, string>,
  Code extends string = string
> {
  readonly #spec: ReducerSpec<Doc, Op, Key, Extra, DomainCtx, Code>

  constructor(input: {
    spec: ReducerSpec<Doc, Op, Key, Extra, DomainCtx, Code>
  }) {
    this.#spec = input.spec
  }

  reduce(input: {
    doc: Doc
    ops: readonly Op[]
    origin?: string
  }): ReducerResult<Doc, Op, Key, Extra, Code> {
    const origin = input.origin ?? 'user'
    const validateIssue = this.#spec.validate?.({
      doc: input.doc,
      ops: input.ops,
      origin
    })
    if (validateIssue && (validateIssue.level ?? 'error') !== 'warning') {
      const error = normalizeIssue(validateIssue)
      return {
        ok: false,
        doc: input.doc,
        forward: [],
        inverse: [],
        footprint: [],
        issues: [error],
        error
      }
    }

    const initialDoc = this.#spec.clone
      ? this.#spec.clone(input.doc)
      : input.doc
    const draftAdapter = (
      this.#spec.draft
      ?? (defaultDraftAdapter as ReducerDraftAdapter<Doc>)
    )
    let draft = draftAdapter.create(initialDoc)
    const inverse = operationBuffer.createInverseBuilder<Op>()
    const footprint = historyFootprint.createHistoryFootprintCollector<Key>(
      this.#spec.serializeKey
    )
    const issues: ReducerIssue<Code>[] = validateIssue
      ? [normalizeIssue(validateIssue)]
      : []
    const forward: Op[] = []
    let stopped = false
    let failure: ReducerIssue<Code> | undefined

    const recordIssue = (
      issue: ReducerIssueInput<Code>
    ) => {
      issues.push(normalizeIssue(issue))
    }

    const abortWith = (
      issue: ReducerIssueInput<Code>
    ): never => {
      failure = normalizeIssue(issue)
      issues.push(failure)
      throw REDUCER_ABORT
    }

    const baseCtx: ReducerContext<Doc, Op, Key, Code> = {
      base: input.doc,
      origin,
      doc: () => draft.doc(),
      write: () => draft.write(),
      replace: (doc) => {
        draft = draftAdapter.create(doc)
      },
      inverse: (op) => {
        inverse.prepend(op)
      },
      inverseMany: (ops) => {
        for (let index = ops.length - 1; index >= 0; index -= 1) {
          const op = ops[index]
          if (op !== undefined) {
            inverse.prepend(op)
          }
        }
      },
      footprint: (key) => {
        footprint.add(key)
      },
      footprintMany: (keys) => {
        footprint.addMany(keys)
      },
      issue: recordIssue,
      require: (value, issue) => {
        if (value !== undefined) {
          return value
        }
        recordIssue(issue)
        return undefined
      },
      stop: () => {
        stopped = true
        throw REDUCER_ABORT
      },
      fail: abortWith
    }

    const ctx = this.#spec.createContext
      ? this.#spec.createContext(baseCtx)
      : baseCtx as unknown as DomainCtx

    for (const op of input.ops) {
      if (stopped || failure) {
        break
      }

      let phase: 'before' | 'handler' = 'before'
      try {
        this.#spec.beforeEach?.(ctx, op)
        if (stopped || failure) {
          break
        }

        phase = 'handler'
        const handler = (
          this.#spec.handle as ReducerHandler<DomainCtx, Op> | undefined
        ) ?? readHandler(this.#spec.handlers, op)
        if (!handler) {
          abortWith({
            code: MISSING_HANDLER_CODE as Code,
            message: `Reducer handler for ${op.type} is not registered.`
          })
        }

        const handle = handler as NonNullable<typeof handler>
        handle(ctx, op as never)
        forward.push(op)
      } catch (error) {
        if (!isReducerAbort(error)) {
          throw error
        }
        if (stopped && !failure && phase === 'handler') {
          forward.push(op)
        }
      }
    }

    if (!stopped && !failure) {
      try {
        this.#spec.settle?.(ctx)
      } catch (error) {
        if (!isReducerAbort(error)) {
          throw error
        }
      }
    }

    if (failure) {
      return {
        ok: false,
        doc: input.doc,
        forward,
        inverse: inverse.finish(),
        footprint: footprint.finish(),
        issues,
        error: failure
      }
    }

    let extra: Extra
    try {
      extra = this.#spec.done
        ? this.#spec.done(ctx)
        : this.#spec.emptyExtra
          ? this.#spec.emptyExtra()
          : undefined as Extra
    } catch (error) {
      if (!isReducerAbort(error) || !failure) {
        throw error
      }
      return {
        ok: false,
        doc: input.doc,
        forward,
        inverse: inverse.finish(),
        footprint: footprint.finish(),
        issues,
        error: failure
      }
    }

    return {
      ok: true,
      doc: draft.done(),
      forward,
      inverse: inverse.finish(),
      footprint: footprint.finish(),
      extra,
      issues
    }
  }
}
