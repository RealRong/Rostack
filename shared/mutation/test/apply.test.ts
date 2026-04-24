import { describe, expect, test } from 'vitest'
import { apply, draftPath, path } from '@shared/mutation'

describe('apply', () => {
  test('runs model step/settle/done and returns inverse/footprint', () => {
    const result = apply({
      doc: {
        count: 0
      },
      ops: [1, 2, 3],
      serializeKey: (key: string) => key,
      model: {
        init: () => ({
          total: 0
        }),
        step: (ctx, op: number) => {
          ctx.state.total += op
          draftPath.set(ctx.write(), path.of('count'), ctx.state.total)
          ctx.inverse.prepend(-op)
          ctx.footprint.add(`count:${op}`)
        },
        settle: (ctx) => {
          ctx.footprint.add('done')
        },
        done: (ctx) => ({
          total: ctx.state.total,
          current: ctx.doc().count
        })
      }
    })

    expect(result.doc).toEqual({
      count: 6
    })
    expect(result.forward).toEqual([1, 2, 3])
    expect(result.inverse).toEqual([-3, -2, -1])
    expect(result.footprint).toEqual([
      'count:1',
      'count:2',
      'count:3',
      'done'
    ])
    expect(result.extra).toEqual({
      total: 6,
      current: 6
    })
  })

  test('supports full document replace without touching draft.write', () => {
    const result = apply({
      doc: {
        value: 1
      },
      ops: [2, 3],
      serializeKey: (_key: never) => '',
      model: {
        init: () => undefined,
        step: (ctx, op: number) => {
          ctx.replace({
            value: ctx.doc().value + op
          })
          ctx.inverse.prepend(ctx.doc().value - op)
        }
      }
    })

    expect(result.doc).toEqual({
      value: 6
    })
    expect(result.inverse).toEqual([3, 1])
    expect(result.footprint).toEqual([])
  })
})
