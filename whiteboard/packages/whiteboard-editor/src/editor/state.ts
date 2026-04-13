import {
  createDerivedStore,
  read
} from '@shared/core'
import type { Editor, EditorInteractionState } from '../types/editor'
import type { InteractionRuntime } from '../input/core/types'
import type { EditorViewportRuntime } from './types'
import type { EditorStateController } from '../state'

export const createEditorState = ({
  interaction,
  runtime,
  viewport
}: {
  interaction: InteractionRuntime
  runtime: EditorStateController
  viewport: EditorViewportRuntime['read']
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
    ...runtime.public.state,
    viewport,
    interaction: interactionState
  } satisfies Editor['store']
}
