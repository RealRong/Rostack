import { store } from '@shared/core'
import type { EditorInteractionState, EditorStore } from '@whiteboard/editor/types/editor'
import type { EditorSession } from '@whiteboard/editor/session/runtime'

export const createEditorStore = (
  session: Pick<EditorSession, 'state' | 'interaction' | 'viewport'>
): EditorStore => {
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
        editingEdge:
          mode === 'edge-drag'
          || mode === 'edge-label'
          || mode === 'edge-connect'
          || mode === 'edge-route',
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
