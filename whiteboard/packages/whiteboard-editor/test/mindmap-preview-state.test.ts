import { describe, expect, it } from 'vitest'
import { createGesture } from '../src/input/core/gesture'
import { DEFAULT_DRAW_STATE } from '../src/session/draw/state'
import { composeEditorInputPreviewState } from '../src/session/preview/state'
import { EMPTY_HOVER_STATE } from '../src/input/hover/store'
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
        space: false,
        hover: EMPTY_HOVER_STATE
      }
    })
    const preview = composeEditorInputPreviewState({
      base: runtime.stores.preview.store.get(),
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
      hover: runtime.stores.interaction.store.get().hover
    })

    expect(preview.mindmap.preview).toEqual({
      rootMove: {
        treeId: 'mind-1',
        delta: {
          x: 60,
          y: 40
        }
      }
    })
  })
})
