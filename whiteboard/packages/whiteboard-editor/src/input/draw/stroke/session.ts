import type { PointerDownInput, PointerSample } from '@whiteboard/editor/types/input'
import type { InteractionContext } from '@whiteboard/editor/input/context'
import type { InteractionSession } from '@whiteboard/editor/input/core/types'
import { FINISH } from '@whiteboard/editor/input/core/result'
import {
  commitDrawStroke,
  previewDrawStroke,
  startDrawStroke,
  stepDrawStroke,
  type DrawStrokeState
} from '@whiteboard/editor/input/draw/stroke/start'

type DrawPointer = {
  samples: readonly PointerSample[]
}

export const startStrokeState = (
  ctx: InteractionContext,
  input: PointerDownInput
): DrawStrokeState | null => startDrawStroke({
  tool: ctx.query.tool.get(),
  pointer: input,
  state: ctx.query.draw.get()
}) ?? null

export const createStrokeSession = (
  ctx: InteractionContext,
  initial: DrawStrokeState
): InteractionSession => {
  let state = initial

  const step = (
    input: DrawPointer,
    force = false
  ) => {
    const nextState = stepDrawStroke(
      state,
      input,
      {
        force
      }
    )
    if (nextState.points !== state.points) {
      ctx.local.feedback.draw.setPreview(
        previewDrawStroke(nextState, {
          zoom: ctx.query.viewport.get().zoom
        })
      )
    }
    state = nextState
  }

  return {
    mode: 'draw',
    move: (input) => {
      step(input)
    },
    up: (input) => {
      step(input, true)
      const commit = commitDrawStroke(state, {
        zoom: ctx.query.viewport.get().zoom
      })
      if (commit) {
        ctx.command.node.create(commit)
      }
      return FINISH
    },
    cleanup: () => {
      ctx.local.feedback.draw.setPreview(null)
    }
  }
}
