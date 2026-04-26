import { store } from '@shared/core'
import { isEdgeInteractionMode } from '@whiteboard/editor/input/interaction/mode'
import type { EditorInteractionState, EditorSessionState } from '@whiteboard/editor/types/editor'
import type { EditorSession } from '@whiteboard/editor/session/runtime'

export const createSessionState = (
  session: Pick<EditorSession, 'state' | 'interaction' | 'viewport'>
): EditorSessionState => {
  const interactionState = store.createDerivedStore<EditorInteractionState>({
    get: () => {
      const mode = store.read(session.interaction.read.mode)
      const busy = store.read(session.interaction.read.busy)
      const chrome = store.read(session.interaction.read.chrome)
      const transforming = mode === 'node-transform'

      return {
        busy,
        chrome,
        transforming,
        drawing: mode === 'draw',
        panning: mode === 'viewport-pan',
        selecting:
          mode === 'press'
          || mode === 'marquee'
          || mode === 'node-drag'
          || mode === 'mindmap-drag'
          || mode === 'node-transform',
        editingEdge: isEdgeInteractionMode(mode),
        space: store.read(session.interaction.read.space)
      }
    },
    isEqual: (left, right) => (
      left.busy === right.busy
      && left.chrome === right.chrome
      && left.transforming === right.transforming
      && left.drawing === right.drawing
      && left.panning === right.panning
      && left.selecting === right.selecting
      && left.editingEdge === right.editingEdge
      && left.space === right.space
    )
  })

  return {
    tool: session.state.tool,
    draw: session.state.draw,
    edit: session.state.edit,
    selection: session.state.selection,
    viewport: session.viewport.read,
    interaction: interactionState
  }
}
