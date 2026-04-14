import { describe, expect, it } from 'vitest'
import { createHistory } from '../src/kernel/history'

describe('createHistory', () => {
  it('does not capture system-origin changes by default', () => {
    const history = createHistory({
      replay: () => true
    })

    history.capture({
      forward: [{ type: 'node.update' }],
      inverse: [{ type: 'node.update.inverse' }],
      origin: 'system'
    })

    expect(history.get().canUndo).toBe(false)
  })

  it('still captures user-origin changes by default', () => {
    const history = createHistory({
      replay: () => true
    })

    history.capture({
      forward: [{ type: 'node.update' }],
      inverse: [{ type: 'node.update.inverse' }],
      origin: 'user'
    })

    expect(history.get().canUndo).toBe(true)
  })
})
