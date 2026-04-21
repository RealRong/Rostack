import { store as coreStore } from '@shared/core'
import {
  eventCurrentTargetElement,
  eventWindow,
  releasePointerCaptureSafe,
  setPointerCaptureSafe
} from '@shared/dom'

export type InteractionMode = 'idle' | 'pointer' | 'keyboard' | 'drag' | 'fill'
export type InteractionGesture =
  | 'idle'
  | 'keyboard'
  | 'pointer'
  | 'cell-press'
  | 'cell-select'
  | 'row-marquee'
  | 'row-select'
  | 'column-resize'
  | 'drag'
  | 'row-reorder'
  | 'column-reorder'
  | 'fill'

type ActiveInteractionGesture = Exclude<InteractionGesture, 'idle' | 'keyboard'>

export interface InteractionPointerLikeEvent {
  pointerId?: number
  currentTarget?: EventTarget | null
}

export interface InteractionState {
  mode: InteractionMode
  gesture: InteractionGesture
}

export interface InteractionSession {
  finish: () => void
  cancel: () => void
}

export interface InteractionStartInput {
  mode: Exclude<InteractionMode, 'idle' | 'keyboard'>
  gesture?: ActiveInteractionGesture
  event?: InteractionPointerLikeEvent | PointerEvent
  capture?: Element | null | false
  move?: (event: PointerEvent, session: InteractionSession) => void
  up?: (event: PointerEvent, session: InteractionSession) => void
  cancel?: (session: InteractionSession) => void
  blur?: (session: InteractionSession) => void
  keydown?: (event: KeyboardEvent, session: InteractionSession) => void
  keyup?: (event: KeyboardEvent, session: InteractionSession) => void
}

export interface InteractionApi {
  current: () => InteractionState
  start: (input: InteractionStartInput) => InteractionSession | null
  cancel: () => void
  setMode: (mode: InteractionMode) => void
  setGesture: (gesture: ActiveInteractionGesture) => void
}

interface ActiveInteraction {
  id: number
  mode: Exclude<InteractionMode, 'idle' | 'keyboard'>
  gesture: ActiveInteractionGesture
  pointerId?: number
  capture?: Element | null
}

const defaultActiveGesture = (
  mode: Exclude<InteractionMode, 'idle' | 'keyboard'>
): ActiveInteractionGesture => {
  switch (mode) {
    case 'pointer':
      return 'pointer'
    case 'drag':
      return 'drag'
    case 'fill':
    default:
      return 'fill'
  }
}

const defaultGesture = (
  mode: InteractionMode
): InteractionGesture => {
  switch (mode) {
    case 'keyboard':
      return 'keyboard'
    case 'pointer':
    case 'drag':
    case 'fill':
      return defaultActiveGesture(mode)
    case 'idle':
    default:
      return 'idle'
  }
}

const equalState = (
  left: InteractionState,
  right: InteractionState
) => (
  left.mode === right.mode
  && left.gesture === right.gesture
)

const samePointer = (
  current: ActiveInteraction,
  event: PointerEvent
) => current.pointerId === undefined || event.pointerId === current.pointerId

export interface InteractionDomain {
  store: coreStore.ValueStore<InteractionState>
  api: InteractionApi
}

export const createInteractionCoordinator = (): InteractionDomain => {
  const stateStore = coreStore.createValueStore<InteractionState>({
    initial: {
      mode: 'idle',
      gesture: 'idle'
    },
    isEqual: equalState
  })
  let nextId = 1
  let active: ActiveInteraction | null = null
  let releaseWindow = () => {}
  let endCurrent: (() => void) | null = null

  const clearWindow = () => {
    releaseWindow()
    releaseWindow = () => {}
  }

  const finish = (current: ActiveInteraction) => {
    if (!active || active.id !== current.id) {
      return
    }

    clearWindow()
    releasePointerCaptureSafe(current.capture, current.pointerId)
    active = null
    endCurrent = null
    stateStore.update(state => (
      state.mode === current.mode
        ? {
            ...state,
            mode: 'idle',
            gesture: 'idle'
          }
        : state
    ))
  }

  const api: InteractionApi = {
    current: stateStore.get,
    start: input => {
      if (active) {
        return null
      }

      const pointerId = input.event?.pointerId
      const capture = input.capture === undefined
        ? eventCurrentTargetElement(input.event)
        : input.capture || null
      const ownerWindow = eventWindow(input.event)
      const gesture = input.gesture ?? defaultActiveGesture(input.mode)
      const current: ActiveInteraction = {
        id: nextId++,
        mode: input.mode,
        gesture,
        pointerId,
        capture
      }
      let done = false

      const session: InteractionSession = {
        finish: () => {
          if (done) {
            return
          }
          done = true
          finish(current)
        },
        cancel: () => {
          if (done) {
            return
          }
          done = true
          finish(current)
        }
      }

      const handlePointerMove = (event: PointerEvent) => {
        if (!samePointer(current, event)) {
          return
        }

        input.move?.(event, session)
      }

      const handlePointerUp = (event: PointerEvent) => {
        if (!samePointer(current, event)) {
          return
        }

        session.finish()
        input.up?.(event, session)
      }

      const handlePointerCancel = (event: PointerEvent) => {
        if (!samePointer(current, event)) {
          return
        }

        session.cancel()
        input.cancel?.(session)
      }

      const handleBlur = () => {
        session.cancel()
        if (input.blur) {
          input.blur(session)
          return
        }

        input.cancel?.(session)
      }

      const handleKeyDown = (event: KeyboardEvent) => {
        input.keydown?.(event, session)
        if (!done && event.key === 'Escape') {
          session.cancel()
          input.cancel?.(session)
        }
      }

      const handleKeyUp = (event: KeyboardEvent) => {
        input.keyup?.(event, session)
      }

      if (ownerWindow) {
        ownerWindow.addEventListener('pointermove', handlePointerMove, true)
        ownerWindow.addEventListener('pointerup', handlePointerUp, true)
        ownerWindow.addEventListener('pointercancel', handlePointerCancel, true)
        ownerWindow.addEventListener('blur', handleBlur, true)
        ownerWindow.addEventListener('keydown', handleKeyDown, true)
        ownerWindow.addEventListener('keyup', handleKeyUp, true)

        releaseWindow = () => {
          ownerWindow.removeEventListener('pointermove', handlePointerMove, true)
          ownerWindow.removeEventListener('pointerup', handlePointerUp, true)
          ownerWindow.removeEventListener('pointercancel', handlePointerCancel, true)
          ownerWindow.removeEventListener('blur', handleBlur, true)
          ownerWindow.removeEventListener('keydown', handleKeyDown, true)
          ownerWindow.removeEventListener('keyup', handleKeyUp, true)
        }
      }

      active = current
      endCurrent = session.cancel
      stateStore.set({
        mode: input.mode,
        gesture
      })
      setPointerCaptureSafe(capture, pointerId)

      return session
    },
    cancel: () => {
      endCurrent?.()
    },
    setMode: mode => {
      if (active || stateStore.get().mode === mode) {
        return
      }

      stateStore.set({
        mode,
        gesture: defaultGesture(mode)
      })
    },
    setGesture: gesture => {
      if (active) {
        active.gesture = gesture
      }

      stateStore.update(state => (
        state.mode === 'idle' || state.mode === 'keyboard'
          ? state
          : {
              ...state,
              gesture
            }
      ))
    }
  }

  return {
    store: stateStore,
    api
  }
}
