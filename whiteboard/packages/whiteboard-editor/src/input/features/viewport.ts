import type {
  InteractionBinding,
  InteractionSession
} from '@whiteboard/editor/input/core/types'
import { FINISH } from '@whiteboard/editor/input/internals/result'
import type { Editor } from '@whiteboard/editor/api/editor'
type PanState = {
  lastClient: {
    x: number
    y: number
  }
}

type PanPointer = {
  client: {
    x: number
    y: number
  }
}

const allowsLeftDrag = (
  editor: Editor
) => (
  editor.scene.ui.state.interaction.get().space
  || editor.scene.ui.state.tool.is('hand')
)

const updatePan = (
  editor: Editor,
  state: PanState,
  input: PanPointer
) => {
  const deltaX = input.client.x - state.lastClient.x
  const deltaY = input.client.y - state.lastClient.y
  if (deltaX === 0 && deltaY === 0) {
    return
  }

  state.lastClient = {
    x: input.client.x,
    y: input.client.y
  }
  editor.actions.viewport.panScreenBy({
    x: -deltaX,
    y: -deltaY
  })
}

export const createViewportBinding = (
  editor: Editor
): InteractionBinding => ({
  key: 'viewport.pan',
  start: (input) => {
    if (input.ignoreInput) {
      return null
    }

    const middleDrag = input.button === 1 || (input.buttons & 4) === 4
    const leftDrag =
      (input.button === 0 || (input.buttons & 1) === 1)
      && allowsLeftDrag(editor)

    if (!middleDrag && !leftDrag) {
      return null
    }

    const state: PanState = {
      lastClient: {
        x: input.client.x,
        y: input.client.y
      }
    }

    const session: InteractionSession = {
      mode: 'viewport-pan',
      move: (event) => {
        updatePan(editor, state, event)
      },
      up: () => FINISH
    }

    return session
  }
})
