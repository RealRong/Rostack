import { describe, expect, test } from 'vitest'
import { Reducer } from '@shared/reducer'

describe('Reducer', () => {
  test('runs handlers, settle, and done while collecting inverse and footprint', () => {
    let total = 0
    const reducer = new Reducer<
      {
        count: number
      },
      {
        type: 'count.add'
        value: number
      },
      string,
      {
        total: number
        current: number
      }
    >({
      spec: {
        serializeKey: (key) => key,
        handle: (ctx, op) => {
          total += op.value
          ctx.replace({
            count: total
          })
          ctx.inverseMany([{
            type: 'count.add',
            value: -op.value
          }])
          ctx.footprint(`count:${op.value}`)
        },
        settle: (ctx) => {
          ctx.footprint('done')
        },
        done: (ctx) => ({
          total,
          current: ctx.doc().count
        })
      }
    })

    const result = reducer.reduce({
      doc: {
        count: 0
      },
      ops: [{
        type: 'count.add',
        value: 1
      }, {
        type: 'count.add',
        value: 2
      }, {
        type: 'count.add',
        value: 3
      }]
    })

    expect(result).toEqual({
      ok: true,
      doc: {
        count: 6
      },
      inverse: [{
        type: 'count.add',
        value: -3
      }, {
        type: 'count.add',
        value: -2
      }, {
        type: 'count.add',
        value: -1
      }],
      footprint: [
        'count:1',
        'count:2',
        'count:3',
        'done'
      ],
      extra: {
        total: 6,
        current: 6
      }
    })
  })

  test('supports full document replace without touching draft.write', () => {
    const reducer = new Reducer<
      {
        value: number
      },
      {
        type: 'replace'
        value: number
      },
      never
    >({
      spec: {
        serializeKey: (_key) => '',
        handle: (ctx, op) => {
          const current = ctx.doc().value
          ctx.replace({
            value: current + op.value
          })
          ctx.inverseMany([{
            type: 'replace',
            value: current
          }])
        },
        done: () => undefined
      }
    })

    const result = reducer.reduce({
      doc: {
        value: 1
      },
      ops: [{
        type: 'replace',
        value: 2
      }, {
        type: 'replace',
        value: 3
      }]
    })

    expect(result).toEqual({
      ok: true,
      doc: {
        value: 6
      },
      inverse: [{
        type: 'replace',
        value: 3
      }, {
        type: 'replace',
        value: 1
      }],
      footprint: [],
      extra: undefined
    })
  })
})
