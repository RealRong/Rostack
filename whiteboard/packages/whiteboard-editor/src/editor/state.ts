import {
  createDerivedStore,
  read
} from '@shared/core'
import type { Editor, EditorInteractionState } from '@whiteboard/editor/types/editor'
import type { InteractionRuntime } from '@whiteboard/editor/input/core/types'
import type { EditorLocalRuntime } from '@whiteboard/editor/local/runtime'
import type { ViewportRuntime } from '@whiteboard/editor/local/viewport/runtime'

export const createEditorState = ({
  interaction,
  runtime,
  viewport
}: {
  interaction: InteractionRuntime
  runtime: EditorLocalRuntime
  viewport: ViewportRuntime['read']
}): Editor['store'] => {
  const interactionState = createDerivedStore<EditorInteractionState>({
    get: () => {
      const mode = read(interaction.mode)
      const busy = read(interaction.busy)
      const chrome = read(interaction.chrome)
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
          || mode === 'edge-connect'
          || mode === 'edge-route',
        space: read(runtime.state.space)
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
    tool: runtime.stores.tool,
    draw: runtime.stores.draw,
    edit: runtime.stores.edit,
    selection: runtime.stores.selection,
    viewport,
    interaction: interactionState
  } satisfies Editor['store']
}
