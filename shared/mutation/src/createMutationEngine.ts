import { createEntryHistoryPort } from './createHistoryPort'

type MutationMeta = {
  family: string
  sync?: 'live' | 'checkpoint'
  history?: boolean
}

type MutationPublishSpec<TDoc, TOp, TPublish> = {
  init(document: TDoc): TPublish
  reduce(input: {
    document: TDoc
    previous?: TPublish
    operations: readonly TOp[]
  }): TPublish | undefined
}

type MutationContext<TDoc> = {
  read(): TDoc
  replace(next: TDoc): void
  touch(target: string): void
  fail(message: string): never
}

type MutationOperation<TDoc, TOp> = {
  targets(op: TOp): readonly string[]
  apply(ctx: MutationContext<TDoc>, op: TOp): void
  footprint?(ctx: MutationContext<TDoc>, op: TOp): void
}

export const createMutationEngine = <
  TDoc,
  TOp extends {
    type: string
  },
  TPublish
>(input: {
  document: TDoc
  meta: Record<string, MutationMeta>
  operations: Record<string, MutationOperation<TDoc, TOp>>
  conflicts(left: string, right: string): boolean
  publish: MutationPublishSpec<TDoc, TOp, TPublish>
  history?: {
    limit?: number
    mergeWindowMs?: number
  }
}) => {
  let document = input.document
  let published = input.publish.init(document)
  const history = input.history
    ? createEntryHistoryPort<{
        at: number
        operations: readonly TOp[]
        targets: readonly string[]
        families: readonly string[]
      }>(input.history)
    : undefined

  const readOperation = (
    op: TOp
  ): MutationOperation<TDoc, TOp> => {
    const operation = input.operations[op.type]
    if (!operation) {
      throw new Error(`Unknown mutation operation: ${op.type}`)
    }

    return operation
  }

  const readMeta = (
    op: TOp
  ): MutationMeta => {
    const meta = input.meta[op.type]
    if (!meta) {
      throw new Error(`Unknown mutation meta: ${op.type}`)
    }

    return meta
  }

  const reduceOperations = (
    operations: readonly TOp[]
  ): TPublish | undefined => {
    let nextDocument = document
    const touched = new Set<string>()

    const context: MutationContext<TDoc> = {
      read: () => nextDocument,
      replace: (next) => {
        nextDocument = next
      },
      touch: (target) => {
        touched.add(target)
      },
      fail: (message) => {
        throw new Error(message)
      }
    }

    for (const op of operations) {
      const operation = readOperation(op)
      for (const target of operation.targets(op)) {
        touched.add(target)
      }
      operation.footprint?.(context, op)
      operation.apply(context, op)
    }

    document = nextDocument
    const nextPublished = input.publish.reduce({
      document,
      previous: published,
      operations
    })

    if (nextPublished !== undefined) {
      published = nextPublished
    }

    if (history) {
      const tracked = operations.filter((op) => readMeta(op).history !== false)
      if (tracked.length > 0) {
        history.push({
          at: Date.now(),
          operations: tracked,
          targets: [...touched],
          families: [...new Set(tracked.map((op) => readMeta(op).family))]
        })
      }
    }

    return nextPublished
  }

  return {
    apply: (
      op: TOp
    ): TPublish | undefined => reduceOperations([op]),
    batch: (
      operations: readonly TOp[]
    ): TPublish | undefined => {
      if (operations.length === 0) {
        return undefined
      }

      return reduceOperations(operations)
    },
    read: (): TDoc => document,
    publish: (): TPublish => published,
    history: (): readonly {
      at: number
      operations: readonly TOp[]
      targets: readonly string[]
      families: readonly string[]
    }[] => history?.read() ?? []
  } as const
}
