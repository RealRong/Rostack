import { describe, expect, test } from 'vitest'
import {
  MutationEngine,
  draftPath,
  mutationApply,
  path,
  type MutationEngineSpec,
  type MutationIntentTable
} from '@shared/mutation'
import { Reducer } from '@shared/reducer'

type TestDoc = {
  count: number
}

type TestOp = {
  type: 'count.add'
  value: number
}

type TestKey = 'count'

type TestPublish = {
  count: number
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

const createSpec = (): MutationEngineSpec<
  TestDoc,
  TestIntentTable,
  TestOp,
  TestKey,
  TestPublish,
  number,
  TestExtra
> => {
  const reducer = new Reducer<
    TestDoc,
    TestOp,
    TestKey,
    TestExtra,
    import('@shared/reducer').ReducerContext<TestDoc, TestOp, TestKey> & {
      total: number
    }
  >({
    spec: {
      serializeKey: (key) => key,
      createContext: (ctx) => ({
        ...ctx,
        total: 0
      }),
      handlers: {
        'count.add': (ctx, op) => {
          ctx.total += op.value
          draftPath.set(ctx.write(), path.of('count'), ctx.doc().count + op.value)
          ctx.inverse({
            type: 'count.add',
            value: -op.value
          })
          ctx.footprint('count')
        }
      },
      done: (ctx) => ({
        total: ctx.doc().count
      })
    }
  })

  return {
  clone: (doc) => ({
    ...doc
  }),
  compile: ({
    intents
  }) => ({
    ops: intents.map((intent) => ({
      type: 'count.add',
      value: intent.value
    })),
    outputs: intents.map((intent) => intent.value),
    value: intents.reduce((sum, intent) => sum + intent.value, 0)
  }),
  apply: ({
    doc,
    ops
  }) => mutationApply.success(
    reducer.reduce({
      doc,
      ops
    })
  ),
  publish: {
    init: (doc) => ({
      count: doc.count
    }),
    reduce: ({
      doc
    }) => ({
      count: doc.count
    })
  },
  history: {
    capacity: 10,
    track: (write) => write.origin === 'user',
    clear: (write) => write.forward.some((op) => op.value === 99),
    conflicts: (left, right) => left === right
  }
}
}

describe('MutationEngine', () => {
  test('executes a typed intent and publishes writes/history', () => {
    const engine = new MutationEngine({
      doc: {
        count: 1
      },
      spec: createSpec()
    })
    const states: number[] = []
    const writes: number[] = []

    engine.subscribe((current) => {
      states.push(current.doc.count)
    })
    engine.writes.subscribe((write) => {
      writes.push(write.doc.count)
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
    expect(states).toEqual([3])
    expect(writes).toEqual([3])
    expect(engine.history?.state().undoDepth).toBe(1)
  })

  test('supports executeMany with batch data', () => {
    const engine = new MutationEngine({
      doc: {
        count: 0
      },
      spec: createSpec()
    })

    const result = engine.executeMany([{
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
    expect(result.data).toBe(5)
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
    const engine = new MutationEngine({
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
    expect(engine.history?.state().undoDepth).toBe(0)
  })

  test('load resets current state without emitting a write and clears history', () => {
    const engine = new MutationEngine({
      doc: {
        count: 0
      },
      spec: createSpec()
    })
    let writeCount = 0
    const revisions: number[] = []

    engine.writes.subscribe(() => {
      writeCount += 1
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

    expect(writeCount).toBe(1)
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
    expect(engine.history?.state().undoDepth).toBe(0)
  })

  test('history clear policy can clear and skip capturing the current write', () => {
    const engine = new MutationEngine({
      doc: {
        count: 0
      },
      spec: createSpec()
    })

    engine.execute({
      type: 'count.add',
      value: 1
    })
    engine.execute({
      type: 'count.add',
      value: 99
    })

    expect(engine.current().doc).toEqual({
      count: 100
    })
    expect(engine.history?.state().undoDepth).toBe(0)
  })

  test('returns a failure when execute is unavailable', () => {
    const engine = new MutationEngine({
      doc: {
        count: 0
      },
      spec: {
        clone: (doc: TestDoc) => ({
          ...doc
        }),
        apply: ({
          doc,
          ops
        }) => mutationApply.success(new Reducer<
          TestDoc,
          TestOp,
          TestKey
        >({
          spec: {
            serializeKey: (key) => key,
            handlers: {
              'count.add': (ctx, op) => {
                draftPath.set(ctx.write(), path.of('count'), ctx.doc().count + op.value)
              }
            }
          }
        }).reduce({
          doc,
          ops
        }))
      }
    })

    const result = engine.execute({
      type: 'count.add',
      value: 1
    })

    expect(result.ok).toBe(false)
    if (result.ok) {
      return
    }
    expect(result.error).toEqual({
      code: 'mutation_engine.compile.missing',
      message: 'MutationEngine.execute requires spec.compile.'
    })
  })

  test('protects internal doc state via clone on current reads', () => {
    const engine = new MutationEngine({
      doc: {
        count: 2
      },
      spec: createSpec()
    })

    const snapshot = engine.current()
    snapshot.doc.count = 100

    expect(engine.current().doc).toEqual({
      count: 2
    })
  })

  test('returns a failure when spec.apply fails', () => {
    const engine = new MutationEngine({
      doc: {
        count: 0
      },
      spec: {
        clone: (doc: TestDoc) => ({
          ...doc
        }),
        apply: () => ({
          ok: false,
          error: {
            code: 'invalid',
            message: 'Cannot apply.'
          }
        })
      }
    })

    const result = engine.apply([{
      type: 'count.add',
      value: 1
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
