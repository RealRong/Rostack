import { describe, expect, test } from 'vitest'
import {
  CommandMutationEngine,
  OperationMutationRuntime,
  applyResult,
  type CommandMutationSpec,
  type MutationRuntimeSpec,
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
      handle: (ctx, op) => {
        ctx.total += op.value
        ctx.replace({
          count: ctx.doc().count + op.value
        })
        ctx.inverseMany([{
          type: 'count.add',
          value: -op.value
        }])
        ctx.footprint('count')
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
      outputs: intents.map((intent) => intent.value)
    }),
    apply: ({
      doc,
      ops
    }) => applyResult.success(
      reducer.reduce({
        doc,
        ops
      })
    ),
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
      capacity: 10,
      track: (write) => write.origin === 'user',
      clear: (write) => write.forward.some((op) => op.value === 99),
      conflicts: (left, right) => left === right
    }
  }
}

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
    clone: spec.clone,
    normalize: spec.normalize,
    apply: spec.apply,
    publish: spec.publish,
    history: spec.history
  }
}

describe('CommandMutationEngine', () => {
  test('executes a typed intent and publishes writes/history', () => {
    const engine = new CommandMutationEngine({
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
    expect(engine.current()).not.toHaveProperty('cache')
    expect(states).toEqual([3])
    expect(writes).toEqual([3])
    expect(engine.history?.state().undoDepth).toBe(1)
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
    expect(engine.history?.state().undoDepth).toBe(0)
  })

  test('load resets current state without emitting a write and clears history', () => {
    const engine = new CommandMutationEngine({
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

  test('replace resets runtime without emitting a write and returns true', () => {
    const engine = new CommandMutationEngine({
      doc: {
        count: 0
      },
      spec: createSpec()
    })
    let writeCount = 0

    engine.writes.subscribe(() => {
      writeCount += 1
    })

    engine.execute({
      type: 'count.add',
      value: 1
    })
    const replaced = engine.replace({
      count: 7
    })

    expect(replaced).toBe(true)
    expect(writeCount).toBe(1)
    expect(engine.current()).toEqual({
      rev: 2,
      doc: {
        count: 7
      },
      publish: {
        count: 7
      }
    })
    expect(engine.history?.state().undoDepth).toBe(0)
  })

  test('history clear policy can clear and skip capturing the current write', () => {
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
    engine.execute({
      type: 'count.add',
      value: 99
    })

    expect(engine.current().doc).toEqual({
      count: 100
    })
    expect(engine.history?.state().undoDepth).toBe(0)
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

  test('returns a failure when spec.apply fails', () => {
    const engine = new OperationMutationRuntime({
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
