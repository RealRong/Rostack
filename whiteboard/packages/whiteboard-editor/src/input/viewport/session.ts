import type {
  InteractionBinding,
  InteractionSession
} from '#whiteboard-editor/input/core/types'
import { FINISH } from '#whiteboard-editor/input/core/result'
import type { InteractionContext } from '#whiteboard-editor/input/context'
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

type ViewportInteractionDeps = Pick<
  InteractionContext,
  'query' | 'local'
>

const allowsLeftDrag = (
  ctx: ViewportInteractionDeps
) => (
  ctx.query.space.get()
  || ctx.query.tool.is('hand')
)

const updatePan = (
  ctx: ViewportInteractionDeps,
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
  ctx.local.viewport.viewport.panScreenBy({
    x: -deltaX,
    y: -deltaY
  })
}

export const createViewportInteraction = (
  ctx: ViewportInteractionDeps
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
