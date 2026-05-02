import { describe, expect, it, vi } from 'vitest'
import { createMindmapDragSession } from '../src/input/features/mindmap/drag'
import { EMPTY_PREVIEW_STATE } from '../src/state/preview'

describe('mindmap preview state', () => {
  it('projects mindmap drag into overlay preview truth', () => {
    let preview = EMPTY_PREVIEW_STATE

    createMindmapDragSession({
      document: {
        snapshot: () => ({
          nodes: {
            'mind-1': {
              owner: {
                kind: 'mindmap',
                id: 'mind-1'
              }
            }
          },
          mindmaps: {}
        })
      },
      scene: {
        mindmaps: {
          tree: vi.fn(() => undefined)
        }
      },
      runtime: {
        viewport: {
          pointer: vi.fn()
        }
      },
      actions: {
        mindmap: {
          moveRoot: vi.fn(),
          moveByDrop: vi.fn()
        }
      },
      dispatch: (input: any) => {
        const command = typeof input === 'function'
          ? input({
              overlay: {
                preview
              }
            })
          : input
        if (command?.type === 'overlay.preview.set') {
          preview = command.preview
        }
      }
    } as any, {
      kind: 'root',
      treeId: 'mind-1',
      pointerId: 1,
      start: { x: 0, y: 0 },
      origin: { x: 0, y: 0 },
      position: { x: 60, y: 40 }
    })

    expect(preview.mindmap).toEqual({
      rootMove: {
        mindmapId: 'mind-1',
        delta: {
          x: 60,
          y: 40
        }
      }
    })
  })
})
