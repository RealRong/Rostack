import { describe, expect, test } from 'vitest'
import { planningContext } from '@shared/mutation'

describe('planningContext', () => {
  test('collects issues and operations together', () => {
    const context = planningContext.createPlanningContext<
      { kind: 'reader' },
      string,
      'missing',
      { type: 'test' }
    >({
      read: {
        kind: 'reader'
      },
      source: {
        type: 'test'
      }
    })

    context.emit('a')
    context.emitMany(['b', 'c'])
    context.issue({
      code: 'missing',
      message: 'missing value'
    })

    expect(context.finish()).toEqual({
      operations: ['a', 'b', 'c'],
      issues: [
        {
          code: 'missing',
          message: 'missing value',
          severity: 'error',
          source: {
            type: 'test'
          }
        }
      ]
    })
  })

  test('supports fail-fast mode', () => {
    const context = planningContext.createPlanningContext<
      undefined,
      string,
      'invalid'
    >({
      read: undefined,
      mode: 'fail-fast'
    })

    expect(() => {
      context.issue({
        code: 'invalid',
        message: 'stop'
      })
    }).toThrow('stop')
  })
})
