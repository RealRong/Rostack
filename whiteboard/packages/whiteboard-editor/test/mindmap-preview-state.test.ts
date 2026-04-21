import { describe, expect, it } from 'vitest'
import { createEditorSession } from '../src/session/runtime'
import { createGesture } from '../src/input/core/gesture'
import { DEFAULT_DRAW_STATE } from '../src/session/draw/state'

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

    session.interaction.write.setActive({
      mode: 'mindmap-drag',
      chrome: false
    })
    session.interaction.write.setGesture(createGesture('mindmap-drag', {
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

    expect(session.preview.state.get().mindmap.preview).toEqual({
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
