import { describe, expect, test } from 'vitest'
import { mutationContext } from '@shared/core'

describe('mutationContext', () => {
  test('tracks current state and inverse operations', () => {
    const context = mutationContext.createMutationContext<
      { revision: number },
      { revision: number },
      string,
      { trace: string[] }
    >({
      base: {
        revision: 0
      },
      working: {
        trace: []
      }
    })

    context.replace({
      revision: 1
    })
    context.inverse.prepend('undo-1')
    context.inverse.append('undo-tail')
    context.working.trace.push('changed')

    expect(context.finish()).toEqual({
      current: {
        revision: 1
      },
      inverse: ['undo-1', 'undo-tail'],
      working: {
        trace: ['changed']
      }
    })
  })
})
