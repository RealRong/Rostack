import { describe, expect, test } from 'vitest'
import {
  MutationEngine,
  type MutationIntentTable,
  type MutationKeySpec,
  type MutationReduceSpec
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

type TestReduce = MutationReduceSpec<
  TestDoc,
  TestOp,
  TestKey,
  TestExtra,
  import('@shared/reducer').ReducerContext<TestDoc, TestOp, TestKey> & {
    total: number
  }
>

const testKey: MutationKeySpec<TestKey> = {
  serialize: (key) => key,
  conflicts: (left, right) => left === right
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

const createEngineInput = () => ({
  normalize: (doc) => doc,
  key: testKey,
  operations: {
    'count.add': {
      family: 'count',
      footprint: (ctx: import('@shared/reducer').ReducerContext<TestDoc, TestOp, TestKey>, _op: TestOp) => {
        ctx.footprint('count')
      },
      apply: (ctx: import('@shared/reducer').ReducerContext<TestDoc, TestOp, TestKey> & { total: number }, op: Extract<TestOp, { type: 'count.add' }>) => {
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
      footprint: (ctx: import('@shared/reducer').ReducerContext<TestDoc, TestOp, TestKey>) => {
        ctx.footprint('count')
      },
      apply: (ctx: import('@shared/reducer').ReducerContext<TestDoc, TestOp, TestKey> & { total: number }, op: Extract<TestOp, { type: 'count.reset' }>) => {
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
  reduce: {
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
    })
  } satisfies TestReduce,
  compile: ({
    intents
  }) => ({
    ops: intents.map((intent) => ({
      type: 'count.add' as const,
      value: intent.value
    })),
    outputs: intents.map((intent) => intent.value)
  }),
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

describe('MutationEngine', () => {
  test('executes a typed intent and publishes commits/history', () => {
    const engine = new MutationEngine({
      document: {
        count: 1
      },
      ...createEngineInput()
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
    expect(result.commit.doc).toEqual({
      count: 3
    })
    expect(result.commit.inverse).toEqual([{
      type: 'count.add',
      value: -2
    }])
    expect(result.commit.footprint).toEqual(['count'])
    expect(result.commit.extra).toEqual({
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
    const engine = new MutationEngine({
      document: {
        count: 0
      },
      ...createEngineInput()
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
    expect(result.commit.doc).toEqual({
      count: 5
    })
    expect(result.commit.forward).toEqual([{
      type: 'count.add',
      value: 2
    }, {
      type: 'count.add',
      value: 3
    }])
  })

  test('supports direct apply and does not capture remote writes into history', () => {
    const engine = new MutationEngine({
      document: {
        count: 0
      },
      ...createEngineInput()
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
    const engine = new MutationEngine({
      document: {
        count: 0
      },
      ...createEngineInput()
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

  test('replace(system origin) resets current state without emitting an apply commit and clears history', () => {
    const engine = new MutationEngine({
      document: {
        count: 0
      },
      ...createEngineInput()
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
    engine.replace({
      count: 9
    }, {
      origin: 'system'
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
    const engine = new MutationEngine({
      document: {
        count: 0
      },
      ...createEngineInput()
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
    const engine = new MutationEngine({
      document: {
        count: 0
      },
      ...(() => {
        const input = createEngineInput()
        return {
          normalize: input.normalize,
          key: input.key,
          operations: input.operations,
          reduce: input.reduce,
          publish: input.publish,
          history: input.history
        }
      })()
    })

    const result = engine.apply([{
      type: 'count.add',
      value: 1
    }])

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    expect(result.commit.doc.count).toBe(1)
  })

  test('returns the live current doc snapshot', () => {
    const engine = new MutationEngine({
      document: {
        count: 2
      },
      ...createEngineInput()
    })

    const snapshot = engine.current()
    snapshot.doc.count = 100

    expect(engine.current().doc).toEqual({
      count: 100
    })
  })

  test('returns a failure when operations validation fails', () => {
    const engine = new MutationEngine({
      document: {
        count: 0
      },
      ...(() => {
        const input = createEngineInput()
        return {
          normalize: input.normalize,
          key: input.key,
          operations: input.operations,
          reduce: input.reduce
        }
      })()
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
