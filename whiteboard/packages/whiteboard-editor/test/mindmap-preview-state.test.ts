import { describe, expect, it } from 'vitest'
import { createEditorSession } from '../src/session/runtime'
import { createGesture } from '../src/input/core/gesture'
import { DEFAULT_DRAW_STATE } from '../src/session/draw/state'
import { EMPTY_HOVER_STATE } from '../src/input/hover/store'

describe('mindmap preview state', () => {
  it('projects interaction mindmap drag gesture into preview state', () => {
    const session = createEditorSession({
      initialTool: {
        type: 'select'
      },
      initialDrawState: DEFAULT_DRAW_STATE,
      initialViewport: {
        center: { x: 0, y: 0 },
        zoom: 1
      }
    })

    session.dispatch({
      type: 'interaction.set',
      interaction: {
        mode: 'mindmap-drag',
        chrome: false,
        space: false,
        hover: EMPTY_HOVER_STATE
      }
    })
    session.transient.setGesture(createGesture('mindmap-drag', {
      mindmap: {
        rootMove: {
          treeId: 'mind-1',
          delta: {
            x: 60,
            y: 40
          }
        }
      }
    }))

    expect(session.preview.get().mindmap.preview).toEqual({
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
