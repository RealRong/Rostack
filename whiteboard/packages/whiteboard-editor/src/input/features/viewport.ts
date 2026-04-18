import type {
  InteractionBinding,
  InteractionSession
} from '@whiteboard/editor/input/core/types'
import { FINISH } from '@whiteboard/editor/input/session/result'
import type { EditorServices } from '@whiteboard/editor/editor/services'

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
  EditorServices,
  'query' | 'local'
>

const allowsLeftDrag = (
  ctx: ViewportServices
) => (
  ctx.query.space.get()
  || ctx.query.tool.is('hand')
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
  ctx.local.viewport.input.panScreenBy({
    x: -deltaX,
    y: -deltaY
  })
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
