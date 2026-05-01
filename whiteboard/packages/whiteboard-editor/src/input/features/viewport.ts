import type {
  InteractionBinding,
  InteractionSession
} from '@whiteboard/editor/input/core/types'
import { FINISH } from '@whiteboard/editor/input/session/result'
import type { EditorInputContext } from '@whiteboard/editor/input/runtime'
import type { EditorCommand } from '@whiteboard/editor/state-engine/intents'

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

type ViewportServices = Pick<
  EditorInputContext,
  'editor'
>

const allowsLeftDrag = (
  ctx: ViewportServices
) => (
  ctx.editor.scene.ui.state.interaction.get().space
  || ctx.editor.scene.ui.state.tool.is('hand')
)

const updatePan = (
  ctx: ViewportServices,
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
  const nextViewport = ctx.editor.viewport.resolve.panScreenBy({
    x: -deltaX,
    y: -deltaY
  })
  if (!nextViewport) {
    return
  }

  ctx.editor.dispatch({
    type: 'viewport.set',
    viewport: nextViewport
  } satisfies EditorCommand)
}

export const createViewportBinding = (
  ctx: ViewportServices
): InteractionBinding => ({
  key: 'viewport.pan',
  start: (input) => {
    if (input.ignoreInput) {
      return null
    }

    const middleDrag = input.button === 1 || (input.buttons & 4) === 4
    const leftDrag =
      (input.button === 0 || (input.buttons & 1) === 1)
      && allowsLeftDrag(ctx)

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
        updatePan(ctx, state, event)
      },
      up: () => FINISH
    }

    return session
  }
})
