import { describe, expect, it, vi } from 'vitest'
import { createMindmapDragSession } from '../src/input/features/mindmap/drag'
import { DEFAULT_DRAW_STATE } from '../src/schema/draw-state'
import { createEditorStateRuntime } from '../src/state/runtime'

describe('mindmap preview state', () => {
  it('projects mindmap drag into overlay preview truth', () => {
    const state = createEditorStateRuntime({
      initialTool: {
        type: 'select'
      },
      initialDrawState: DEFAULT_DRAW_STATE
    })

    createMindmapDragSession({
      state,
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
      viewport: {
        pointer: vi.fn()
      },
      actions: {
        mindmap: {
          moveRoot: vi.fn(),
          moveByDrop: vi.fn()
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

    expect(state.snapshot().preview.mindmap).toEqual({
      'mind-1': {
        rootMove: {
          delta: {
            x: 60,
            y: 40
          }
        }
      }
    })
  })
})
