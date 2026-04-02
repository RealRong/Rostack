import {
  createValueStore,
  type ValueStore
} from '@dataview/runtime/store'

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
  capture?: Element | null
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

const capturePointer = (
  target: Element | null | undefined,
  pointerId: number | undefined
) => {
  if (!target || pointerId === undefined) {
    return
  }

  const capture = (target as Element & {
    setPointerCapture?: (pointerId: number) => void
  }).setPointerCapture
  if (typeof capture !== 'function') {
    return
  }

  try {
    capture.call(target, pointerId)
  } catch {
    // Ignore pointer capture failures.
  }
}

const releasePointer = (
  target: Element | null | undefined,
  pointerId: number | undefined
) => {
  if (!target || pointerId === undefined) {
    return
  }

  const release = (target as Element & {
    releasePointerCapture?: (pointerId: number) => void
  }).releasePointerCapture
  if (typeof release !== 'function') {
    return
  }

  try {
    release.call(target, pointerId)
  } catch {
    // Ignore pointer capture failures.
  }
}

const samePointer = (
  current: ActiveInteraction,
  event: PointerEvent
) => current.pointerId === undefined || event.pointerId === current.pointerId

const eventTarget = (
  event: InteractionPointerLikeEvent | PointerEvent | undefined
): Element | undefined => {
  const target = event?.currentTarget
  return target instanceof Element
    ? target
    : undefined
}

const eventWindow = (
  event: InteractionPointerLikeEvent | PointerEvent | undefined
) => {
  const target = eventTarget(event)
  if (target) {
    return target.ownerDocument.defaultView
  }

  return typeof window !== 'undefined'
    ? window
    : null
}

export interface InteractionDomain {
  store: ValueStore<InteractionState>
  api: InteractionApi
}

export const createInteractionCoordinator = (): InteractionDomain => {
  const store = createValueStore<InteractionState>({
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
    releasePointer(current.capture, current.pointerId)
    active = null
    endCurrent = null
    store.update(state => (
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
    current: store.get,
    start: input => {
      if (active) {
        return null
      }

      const pointerId = input.event?.pointerId
      const capture = input.capture ?? eventTarget(input.event)
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
      store.set({
        mode: input.mode,
        gesture
      })
      capturePointer(capture, pointerId)

      return session
    },
    cancel: () => {
      endCurrent?.()
    },
    setMode: mode => {
      if (active || store.get().mode === mode) {
        return
      }

      store.set({
        mode,
        gesture: defaultGesture(mode)
      })
    },
    setGesture: gesture => {
      if (active) {
        active.gesture = gesture
      }

      store.update(state => (
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
    store,
    api
  }
}
