import {
  createDerivedStore,
  read
} from '@shared/core'
import type { EditorInteractionState, EditorStore } from '@whiteboard/editor/types/editor'
import type { InteractionRuntime } from '@whiteboard/editor/input/core/types'
import type { EditorLocal } from '@whiteboard/editor/local/runtime'
import type { ViewportRuntime } from '@whiteboard/editor/local/viewport/runtime'

export const projectEditorStore = ({
  interaction,
  local,
  viewport
}: {
  interaction: InteractionRuntime
  local: Pick<EditorLocal, 'source'>
  viewport: ViewportRuntime['read']
}): EditorStore => {
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
          || mode === 'edge-label'
          || mode === 'edge-connect'
          || mode === 'edge-route',
        space: read(local.source.space)
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
    tool: local.source.tool,
    draw: local.source.draw,
    edit: local.source.edit,
    selection: local.source.selection,
    viewport,
    interaction: interactionState
  }
}
