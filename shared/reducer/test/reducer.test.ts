import { describe, expect, test } from 'vitest'
import { Reducer } from '@shared/reducer'

describe('Reducer', () => {
  test('runs handlers, collects inverse and footprint, and returns done extra', () => {
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
        handlers: {
          add: (ctx, op) => {
            const current = ctx.doc()
            ctx.replace({
              count: current.count + op.value
            })
            ctx.inverse({
              type: 'add',
              value: -op.value
            })
            ctx.footprint(`count:${op.value}`)
          }
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
      forward: [{
        type: 'add',
        value: 1
      }, {
        type: 'add',
        value: 2
      }],
      inverse: [{
        type: 'add',
        value: -2
      }, {
        type: 'add',
        value: -1
      }],
      footprint: ['count:1', 'count:2'],
      extra: {
        count: 3
      },
      issues: []
    })
  })

  test('supports stop and only keeps processed ops in forward', () => {
    const reducer = new Reducer<
      {
        value: number
      },
      | {
          type: 'replace'
          value: number
        }
      | {
          type: 'add'
          value: number
        },
      never,
      {
        value: number
      }
    >({
      spec: {
        serializeKey: () => '',
        handlers: {
          replace: (ctx, op) => {
            ctx.replace({
              value: op.value
            })
            ctx.stop()
          },
          add: (ctx, op) => {
            ctx.replace({
              value: ctx.doc().value + op.value
            })
          }
        },
        done: (ctx) => ({
          value: ctx.doc().value
        })
      }
    })

    const result = reducer.reduce({
      doc: {
        value: 1
      },
      ops: [{
        type: 'replace',
        value: 10
      }, {
        type: 'add',
        value: 5
      }]
    })

    expect(result).toEqual({
      ok: true,
      doc: {
        value: 10
      },
      forward: [{
        type: 'replace',
        value: 10
      }],
      inverse: [],
      footprint: [],
      extra: {
        value: 10
      },
      issues: []
    })
  })

  test('returns failure without committing draft when a handler fails', () => {
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
        handlers: {
          fail: (ctx) => {
            ctx.replace({
              value: 2
            })
            ctx.fail({
              code: 'invalid',
              message: 'boom'
            })
          }
        }
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
      doc: {
        value: 1
      },
      forward: [],
      inverse: [],
      footprint: [],
      issues: [{
        code: 'invalid',
        message: 'boom',
        level: 'error'
      }],
      error: {
        code: 'invalid',
        message: 'boom',
        level: 'error'
      }
    })
  })
})
