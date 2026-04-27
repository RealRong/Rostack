import { describe, expect, test } from 'vitest'
import {
  CommandMutationEngine,
  OperationMutationRuntime,
  type CommandMutationSpec,
  type MutationIntentTable,
  type MutationRuntimeSpec
} from '@shared/mutation'

type TestDoc = {
  count: number
}

type TestOp =
  | {
      type: 'count.add'
      value: number
    }
  | {
      type: 'count.reset'
      value: number
    }

type TestKey = 'count'

type TestPublish = {
  count: number
}

type TestCache = {
  previousCount: number
}

type TestExtra = {
  total: number
}

interface TestIntentTable extends MutationIntentTable {
  'count.add': {
    intent: {
      type: 'count.add'
      value: number
    }
    output: number
  }
}

const createSpec = (): CommandMutationSpec<
  TestDoc,
  TestIntentTable,
  TestOp,
  TestKey,
  TestPublish,
  TestCache,
  TestExtra
> => ({
  normalize: (doc) => doc,
  compile: ({
    intents
  }) => ({
    ops: intents.map((intent) => ({
      type: 'count.add' as const,
      value: intent.value
    })),
    outputs: intents.map((intent) => intent.value)
  }),
  operations: {
    table: {
      'count.add': {
        family: 'count',
        footprint: (ctx) => {
          ctx.footprint('count')
        },
        apply: (ctx, op) => {
          ctx.total += op.value
          ctx.inverseMany([{
            type: 'count.add',
            value: -op.value
          }])
          ctx.replace({
            count: ctx.doc().count + op.value
          })
        }
      },
      'count.reset': {
        family: 'count',
        sync: 'checkpoint',
        footprint: (ctx) => {
          ctx.footprint('count')
        },
        apply: (ctx, op) => {
          const previous = ctx.doc().count
          ctx.total = op.value
          ctx.inverseMany([{
            type: 'count.reset',
            value: previous
          }])
          ctx.replace({
            count: op.value
          })
        }
      }
    },
    serializeKey: (key) => key,
    createContext: (ctx) => ({
      ...ctx,
      total: 0
    }),
    validate: ({
      ops
    }) => {
      if (ops.some((op) => op.type === 'count.add' && op.value === 13)) {
        return {
          code: 'invalid',
          message: 'Cannot apply.'
        }
      }
      return undefined
    },
    done: (ctx) => ({
      total: ctx.doc().count
    }),
    conflicts: (left, right) => left === right
  },
  publish: {
    init: (doc) => ({
      publish: {
        count: doc.count
      },
      cache: {
        previousCount: doc.count
      }
    }),
    reduce: ({
      prev,
      doc
    }) => ({
      publish: {
        count: doc.count
      },
      cache: {
        previousCount: prev.doc.count
      }
    })
  },
  history: {
    capacity: 10
  }
})

const createRuntimeSpec = (): MutationRuntimeSpec<
  TestDoc,
  TestOp,
  TestKey,
  TestPublish,
  TestCache,
  TestExtra
> => {
  const spec = createSpec()
  return {
    normalize: spec.normalize,
    operations: spec.operations,
    publish: spec.publish,
    history: spec.history
  }
}

describe('CommandMutationEngine', () => {
  test('executes a typed intent and publishes commits/history', () => {
    const engine = new CommandMutationEngine({
      doc: {
        count: 1
      },
      spec: createSpec()
    })
    const states: number[] = []
    const commits: number[] = []

    engine.subscribe((current) => {
      states.push(current.doc.count)
    })
    engine.commits.subscribe((commit) => {
      if (commit.kind === 'apply') {
        commits.push(commit.doc.count)
      }
    })

    const result = engine.execute({
      type: 'count.add',
      value: 2
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    expect(result.data).toBe(2)
    expect(result.write.doc).toEqual({
      count: 3
    })
    expect(result.write.inverse).toEqual([{
      type: 'count.add',
      value: -2
    }])
    expect(result.write.footprint).toEqual(['count'])
    expect(result.write.extra).toEqual({
      total: 3
    })
    expect(engine.current()).toEqual({
      rev: 1,
      doc: {
        count: 3
      },
      publish: {
        count: 3
      }
    })
    expect(engine.current()).not.toHaveProperty('cache')
    expect(states).toEqual([3])
    expect(commits).toEqual([3])
    expect(engine.history.get().undoDepth).toBe(1)
  })

  test('supports batched execute with output array', () => {
    const engine = new CommandMutationEngine({
      doc: {
        count: 0
      },
      spec: createSpec()
    })

    const result = engine.execute([{
      type: 'count.add',
      value: 2
    }, {
      type: 'count.add',
      value: 3
    }])

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    expect(result.data).toEqual([2, 3])
    expect(result.write.doc).toEqual({
      count: 5
    })
    expect(result.write.forward).toEqual([{
      type: 'count.add',
      value: 2
    }, {
      type: 'count.add',
      value: 3
    }])
  })

  test('supports direct apply and does not capture remote writes into history', () => {
    const engine = new CommandMutationEngine({
      doc: {
        count: 0
      },
      spec: createSpec()
    })

    const result = engine.apply([{
      type: 'count.add',
      value: 5
    }], {
      origin: 'remote'
    })

    expect(result.ok).toBe(true)
    expect(engine.current().doc).toEqual({
      count: 5
    })
    expect(engine.history.get().undoDepth).toBe(0)
  })

  test('checkpoint operations clear local history by default', () => {
    const engine = new CommandMutationEngine({
      doc: {
        count: 0
      },
      spec: createSpec()
    })

    engine.execute({
      type: 'count.add',
      value: 1
    })
    engine.apply([{
      type: 'count.reset',
      value: 99
    }])

    expect(engine.current().doc).toEqual({
      count: 99
    })
    expect(engine.history.get().undoDepth).toBe(0)
  })

  test('load resets current state without emitting an apply commit and clears history', () => {
    const engine = new CommandMutationEngine({
      doc: {
        count: 0
      },
      spec: createSpec()
    })
    const commitKinds: Array<'apply' | 'replace'> = []
    const revisions: number[] = []

    engine.commits.subscribe((commit) => {
      commitKinds.push(commit.kind)
    })
    engine.subscribe((current) => {
      revisions.push(current.rev)
    })

    engine.execute({
      type: 'count.add',
      value: 1
    })
    engine.load({
      count: 9
    })

    expect(commitKinds).toEqual(['apply', 'replace'])
    expect(revisions).toEqual([1, 2])
    expect(engine.current()).toEqual({
      rev: 2,
      doc: {
        count: 9
      },
      publish: {
        count: 9
      }
    })
    expect(engine.history.get().undoDepth).toBe(0)
  })

  test('replace resets runtime without emitting an apply commit and returns true', () => {
    const engine = new CommandMutationEngine({
      doc: {
        count: 0
      },
      spec: createSpec()
    })
    const commits: Array<'apply' | 'replace'> = []

    engine.commits.subscribe((commit) => {
      commits.push(commit.kind)
    })

    engine.execute({
      type: 'count.add',
      value: 1
    })
    const replaced = engine.replace({
      count: 7
    })

    expect(replaced).toBe(true)
    expect(commits).toEqual(['apply', 'replace'])
    expect(engine.current()).toEqual({
      rev: 2,
      doc: {
        count: 7
      },
      publish: {
        count: 7
      }
    })
    expect(engine.history.get().undoDepth).toBe(0)
  })

  test('operation runtime exposes apply without compile', () => {
    const engine = new OperationMutationRuntime({
      doc: {
        count: 0
      },
      spec: createRuntimeSpec()
    })

    const result = engine.apply([{
      type: 'count.add',
      value: 1
    }])

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    expect(result.write.doc.count).toBe(1)
  })

  test('returns the live current doc snapshot', () => {
    const engine = new CommandMutationEngine({
      doc: {
        count: 2
      },
      spec: createSpec()
    })

    const snapshot = engine.current()
    snapshot.doc.count = 100

    expect(engine.current().doc).toEqual({
      count: 100
    })
  })

  test('returns a failure when operations validation fails', () => {
    const engine = new OperationMutationRuntime({
      doc: {
        count: 0
      },
      spec: createRuntimeSpec()
    })

    const result = engine.apply([{
      type: 'count.add',
      value: 13
    }])

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'invalid',
        message: 'Cannot apply.'
      }
    })
  })
})
