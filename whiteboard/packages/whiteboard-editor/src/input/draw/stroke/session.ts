import type { PointerDownInput, PointerSample } from '../../../types/input'
import type { InteractionContext } from '../../context'
import type { InteractionSession } from '../../core/types'
import { FINISH } from '../../core/result'
import {
  commitDrawStroke,
  previewDrawStroke,
  startDrawStroke,
  stepDrawStroke,
  type DrawStrokeState
} from './start'

type DrawPointer = {
  samples: readonly PointerSample[]
}

const clearStrokePreview = (
  ctx: InteractionContext
) => {
  ctx.local.feedback.draw.setPreview(null)
}

const writeStrokePreview = (
  ctx: InteractionContext,
  state: DrawStrokeState
) => {
  ctx.local.feedback.draw.setPreview(
    previewDrawStroke(state, {
      zoom: ctx.query.viewport.get().zoom
    })
  )
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
      writeStrokePreview(ctx, nextState)
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
      clearStrokePreview(ctx)
    }
  }
}
