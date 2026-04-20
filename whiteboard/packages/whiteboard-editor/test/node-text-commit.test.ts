import { describe, expect, it, vi } from 'vitest'
import { createNodeTextWrite } from '../src/write/node'

describe('createNodeTextWrite.commit', () => {
  it('dispatches a single node.text.commit payload', () => {
    const textCommit = vi.fn()

    const write = createNodeTextWrite({
      read: {
        committed: () => undefined
      },
      write: {
        textCommit,
        update: vi.fn(),
        updateMany: vi.fn(),
      }
    })

    write.commit({
      nodeId: 'node-1',
      field: 'text',
      value: 'Central topic',
      size: {
        width: 144,
        height: 44
      },
      wrapWidth: 144
    })

    expect(textCommit).toHaveBeenCalledWith({
      nodeId: 'node-1',
      field: 'text',
      value: 'Central topic',
      size: {
        width: 144,
        height: 44
      },
      wrapWidth: 144
    })
  })
})
