import type {
  ReducerContext,
  ReducerError,
  ReducerResult,
  ReducerSpec
} from './contracts'

const REDUCER_ABORT = Symbol('shared.reducer.abort')

const isReducerAbort = (
  value: unknown
): boolean => value === REDUCER_ABORT

const createInverseCollector = <Op,>() => {
  const prefix: Op[] = []

  return {
    prependMany: (ops: readonly Op[]) => {
      for (let index = ops.length - 1; index >= 0; index -= 1) {
        const op = ops[index]
        if (op !== undefined) {
          prefix.push(op)
        }
      }
    },
    finish: (): readonly Op[] => prefix.slice().reverse()
  }
}

const createFootprintCollector = <Key>(
  serialize: (key: Key) => string
) => {
  const byKey = new Map<string, Key>()

  return {
    add: (key: Key) => {
      byKey.set(serialize(key), key)
    },
    finish: (): readonly Key[] => [...byKey.values()]
  }
}

export class Reducer<
  Doc extends object,
  Op,
  Key,
  Extra,
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
    let currentDoc = input.doc
    const inverse = createInverseCollector<Op>()
    const footprint = createFootprintCollector<Key>(
      this.#spec.serializeKey
    )
    let failure: ReducerError<Code> | undefined

    const abortWith = (
      error: ReducerError<Code>
    ): never => {
      failure = error
      throw REDUCER_ABORT
    }

    const baseCtx: ReducerContext<Doc, Op, Key, Code> = {
      origin,
      doc: () => currentDoc,
      replace: (doc) => {
        currentDoc = doc
      },
      inverseMany: (ops) => {
        inverse.prependMany(ops)
      },
      footprint: (key) => {
        footprint.add(key)
      },
      fail: abortWith
    }

    try {
      const ctx = this.#spec.createContext
        ? this.#spec.createContext(baseCtx)
        : baseCtx as unknown as DomainCtx

      for (const op of input.ops) {
        this.#spec.beforeEach?.(ctx, op)
        this.#spec.handle(ctx, op)
      }

      this.#spec.settle?.(ctx)
      const extra = this.#spec.done(ctx)

      return {
        ok: true,
        doc: currentDoc,
        inverse: inverse.finish(),
        footprint: footprint.finish(),
        extra
      }
    } catch (error) {
      if (!isReducerAbort(error)) {
        throw error
      }
      if (!failure) {
        throw new Error('Reducer aborted without failure.')
      }
      return {
        ok: false,
        error: failure
      }
    }
  }
}
