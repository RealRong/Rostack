import { createTimeoutTask, type TimeoutTask } from '@shared/core'
import { GestureTuning } from '@whiteboard/editor/input/session/tuning'
import {
  FINISH,
  replaceSession
} from '@whiteboard/editor/input/session/result'
import type { InteractionSession, InteractionSessionTransition } from '@whiteboard/editor/input/core/types'
import type {
  PointerDownInput,
  PointerMoveInput,
  PointerUpInput
} from '@whiteboard/editor/types/input'

const isDragStart = (
  start: PointerDownInput,
  input: PointerMoveInput
) => Math.hypot(
  input.client.x - start.client.x,
  input.client.y - start.client.y
) >= GestureTuning.dragMinDistance

type HoldResult =
  | InteractionSession
  | InteractionSessionTransition
  | null
  | void

export const createPressDragSession = (input: {
  start: PointerDownInput
  chrome?: boolean
  holdDelay?: number
  createDragSession: (input: PointerMoveInput) => InteractionSession | null
  onTap?: (input: PointerUpInput) => InteractionSessionTransition | void
  onHold?: () => HoldResult
}): InteractionSession => {
  let holdTask: TimeoutTask | null = null
  let dispatchTransition:
    | ((transition: InteractionSessionTransition) => void)
    | null = null

  const clearHold = () => {
    holdTask?.cancel()
    holdTask = null
  }

  if (input.onHold) {
    holdTask = createTimeoutTask(() => {
      holdTask = null
      const next = input.onHold?.()
      if (!next) {
        dispatchTransition?.(FINISH)
        return
      }

      dispatchTransition?.(
        'mode' in next
          ? replaceSession(next)
          : next
      )
    })
    holdTask.schedule(input.holdDelay ?? GestureTuning.holdDelay)
  }

  return {
    mode: 'press',
    pointerId: input.start.pointerId,
    chrome: input.chrome,
    attach: (dispatch) => {
      dispatchTransition = dispatch
    },
    move: (nextInput) => {
      if (!isDragStart(input.start, nextInput)) {
        return
      }

      clearHold()
      const next = input.createDragSession(nextInput)
      if (!next) {
        return FINISH
      }

      next.move?.(nextInput)
      return replaceSession(next)
    },
    up: (nextInput) => {
      clearHold()
      return input.onTap?.(nextInput) ?? FINISH
    },
    cancel: clearHold,
    cleanup: clearHold
  }
}
