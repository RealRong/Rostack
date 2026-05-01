import { describe, expect, it } from 'vitest'
import { createGesture } from '../src/input/core/gesture'
import { DEFAULT_DRAW_STATE } from '../src/session/draw/state'
import { composeEditorPreviewState } from '../src/preview/state'
import { createEditorStateRuntime } from '../src/state-engine/runtime'

describe('mindmap preview state', () => {
  it('projects interaction mindmap drag gesture into preview state', () => {
    const runtime = createEditorStateRuntime({
      initialTool: {
        type: 'select'
      },
      initialDrawState: DEFAULT_DRAW_STATE,
      initialViewport: {
        center: { x: 0, y: 0 },
        zoom: 1
      }
    })

    runtime.dispatch({
      type: 'interaction.set',
      interaction: {
        mode: 'mindmap-drag',
        chrome: false,
        space: false
      }
    })
    const preview = composeEditorPreviewState({
      base: runtime.snapshot().overlay.preview,
      gesture: createGesture('mindmap-drag', {
        mindmap: {
          rootMove: {
            treeId: 'mind-1',
            delta: {
              x: 60,
              y: 40
            }
          }
        }
      }),
      readDocument: () => ({
        nodes: {
          'mind-1': {
            owner: {
              kind: 'mindmap',
              id: 'mind-1'
            }
          }
        },
        mindmaps: {}
      }) as never
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
