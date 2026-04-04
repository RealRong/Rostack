import {
  createDerivedStore
} from '@whiteboard/engine'
import type { Editor, EditorInteractionState } from '../../types/editor'
import type { InteractionRuntime } from '../interaction/types'
import type { RuntimeStateController } from '../state'
import type { EditorHost } from '../../host/types'

export const createEditorState = ({
  interaction,
  runtime,
  host
}: {
  interaction: InteractionRuntime
  runtime: RuntimeStateController
  host: Pick<EditorHost, 'viewport'>
}): Editor['state'] => {
  const interactionState = createDerivedStore<EditorInteractionState>({
    get: (readStore) => {
      const mode = readStore(interaction.mode)
      const busy = readStore(interaction.busy)
      const chrome = readStore(interaction.chrome)
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
        space: readStore(runtime.state.space)
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
    viewport: host.viewport.read,
    interaction: interactionState
  } satisfies Editor['state']
}
