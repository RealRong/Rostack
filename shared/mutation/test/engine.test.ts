import { describe, expect, test } from 'vitest'
import {
  MutationEngine,
  apply,
  draftPath,
  path,
  type MutationEngineSpec
} from '@shared/mutation'

type TestDoc = {
  count: number
}

type TestIntent = {
  type: 'count.add'
  value: number
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

const createSpec = (): MutationEngineSpec<
  TestDoc,
  TestIntent,
  TestOp,
  TestKey,
  TestPublish,
  number,
  TestExtra
> => ({
  clone: (doc) => ({
    ...doc
  }),
  serializeKey: (key) => key,
  compile: ({
    intents
  }) => ({
    ops: intents.map((intent) => ({
      type: 'count.add',
      value: intent.value
    })),
    value: intents.reduce((sum, intent) => sum + intent.value, 0)
  }),
  apply: ({
    doc,
    ops
  }) => apply({
    doc,
    ops,
    serializeKey: (key: TestKey) => key,
    model: {
      init: () => ({
        total: doc.count
      }),
      step: (ctx, op) => {
        ctx.state.total += op.value
        draftPath.set(ctx.write(), path.of('count'), ctx.state.total)
        ctx.inverse.prepend({
          type: 'count.add',
          value: -op.value
        })
        ctx.footprint.add('count')
      },
      done: (ctx) => ({
        total: ctx.doc().count
      })
    }
  }),
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
    conflicts: (left, right) => left === right
  }
})

describe('MutationEngine', () => {
  test('executes intents and publishes writes/history', () => {
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

    expect(result.applied).toBe(true)
    expect(result.issues).toEqual([])
    expect(result.value).toBe(2)
    expect(result.write?.doc).toEqual({
      count: 3
    })
    expect(result.write?.inverse).toEqual([{
      type: 'count.add',
      value: -2
    }])
    expect(result.write?.footprint).toEqual(['count'])
    expect(result.write?.extra).toEqual({
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

    expect(result.applied).toBe(true)
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

  test('returns a compile issue when execute is unavailable', () => {
    const engine = new MutationEngine({
      doc: {
        count: 0
      },
      spec: {
        clone: (doc: TestDoc) => ({
          ...doc
        }),
        serializeKey: (key: TestKey) => key,
        apply: ({
          doc,
          ops
        }) => apply({
          doc,
          ops,
          serializeKey: (key: TestKey) => key,
          model: {
            init: () => undefined,
            step: (ctx, op: TestOp) => {
              draftPath.set(ctx.write(), path.of('count'), ctx.doc().count + op.value)
            }
          }
        })
      }
    })

    const result = engine.execute({
      type: 'count.add',
      value: 1
    })

    expect(result.applied).toBe(false)
    expect(result.issues).toEqual([{
      code: 'mutation_engine.compile.missing',
      message: 'MutationEngine.execute requires spec.compile.'
    }])
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
})
