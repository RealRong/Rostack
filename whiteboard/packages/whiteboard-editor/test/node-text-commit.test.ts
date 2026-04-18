import { describe, expect, it, vi } from 'vitest'
import { createNodeTextCommands } from '../src/command/node/text'

describe('createNodeTextCommands.commit', () => {
  it('persists measured size and wrap width even when text content is unchanged', () => {
    const update = vi.fn()

    const commands = createNodeTextCommands({
      read: {
        committed: () => ({
          node: {
            id: 'node-1',
            type: 'text',
            position: { x: 0, y: 0 },
            size: { width: 240, height: 20 },
            data: {
              text: 'Central topic'
            }
          },
          rect: {
            x: 0,
            y: 0,
            width: 240,
            height: 20
          }
        }),
        live: () => undefined
      },
      write: {
        update,
        updateMany: vi.fn(),
        deleteCascade: vi.fn()
      }
    })

    commands.commit({
      nodeId: 'node-1',
      field: 'text',
      value: 'Central topic',
      size: {
        width: 144,
        height: 44
      },
      wrapWidth: 144
    })

    expect(update).toHaveBeenCalledWith('node-1', {
      fields: {
        size: {
          width: 144,
          height: 44
        }
      },
      records: [{
        op: 'set',
        scope: 'data',
        path: 'wrapWidth',
        value: 144
      }]
    })
  })
})
