import { describe, expect, test } from 'vitest'
import { Reducer } from '@shared/reducer'

describe('Reducer', () => {
  test('runs handle, beforeEach, settle, and done while collecting inverse and footprint', () => {
    let total = 0
    const reducer = new Reducer<
      {
        count: number
      },
      {
        type: 'add'
        value: number
      },
      string,
      {
        count: number
      }
    >({
      spec: {
        serializeKey: (key) => key,
        beforeEach: (ctx, op) => {
          ctx.footprint(`before:${op.value}`)
        },
        handle: (ctx, op) => {
          total += op.value
          ctx.replace({
            count: ctx.doc().count + op.value
          })
          ctx.inverseMany([{
            type: 'add',
            value: -op.value
          }])
          ctx.footprint(`count:${op.value}`)
        },
        settle: (ctx) => {
          ctx.footprint('done')
        },
        done: (ctx) => ({
          count: ctx.doc().count
        })
      }
    })

    const result = reducer.reduce({
      doc: {
        count: 0
      },
      ops: [{
        type: 'add',
        value: 1
      }, {
        type: 'add',
        value: 2
      }]
    })

    expect(result).toEqual({
      ok: true,
      doc: {
        count: 3
      },
      inverse: [{
        type: 'add',
        value: -2
      }, {
        type: 'add',
        value: -1
      }],
      footprint: [
        'before:1',
        'count:1',
        'before:2',
        'count:2',
        'done'
      ],
      extra: {
        count: 3
      }
    })
    expect(total).toBe(3)
  })

  test('supports single handle reducer entry', () => {
    const reducer = new Reducer<
      {
        count: number
      },
      | {
          type: 'add'
          value: number
        }
      | {
          type: 'double'
        },
      string,
      {
        count: number
      }
    >({
      spec: {
        serializeKey: (key) => key,
        handle: (ctx, op) => {
          if (op.type === 'add') {
            ctx.replace({
              count: ctx.doc().count + op.value
            })
            ctx.inverseMany([{
              type: 'add',
              value: -op.value
            }])
            ctx.footprint(`add:${op.value}`)
            return
          }

          ctx.replace({
            count: ctx.doc().count * 2
          })
          ctx.inverseMany([{
            type: 'double'
          }])
          ctx.footprint('double')
        },
        done: (ctx) => ({
          count: ctx.doc().count
        })
      }
    })

    const result = reducer.reduce({
      doc: {
        count: 2
      },
      ops: [{
        type: 'add',
        value: 3
      }, {
        type: 'double'
      }]
    })

    expect(result).toEqual({
      ok: true,
      doc: {
        count: 10
      },
      inverse: [{
        type: 'double'
      }, {
        type: 'add',
        value: -3
      }],
      footprint: ['add:3', 'double'],
      extra: {
        count: 10
      }
    })
  })

  test('returns failure without exposing partial reducer state', () => {
    const reducer = new Reducer<
      {
        value: number
      },
      {
        type: 'fail'
      },
      never,
      void,
      import('@shared/reducer').ReducerContext<{
        value: number
      }, {
        type: 'fail'
      }, never, 'invalid'>,
      'invalid'
    >({
      spec: {
        serializeKey: () => '',
        handle: (ctx) => {
          ctx.replace({
            value: 2
          })
          ctx.fail({
            code: 'invalid',
            message: 'boom'
          })
        },
        done: () => undefined
      }
    })

    const result = reducer.reduce({
      doc: {
        value: 1
      },
      ops: [{
        type: 'fail'
      }]
    })

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'invalid',
        message: 'boom'
      }
    })
  })
})
