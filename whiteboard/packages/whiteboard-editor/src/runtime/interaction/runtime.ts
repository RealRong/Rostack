import {
  createDerivedStore,
  createValueStore
} from '@whiteboard/engine'
import type { ActiveGesture } from './gesture'
import type {
  InteractionBinding,
  InteractionControl,
  InteractionKeyboardInput,
  InteractionRuntime,
  InteractionSession,
  InteractionSessionTransition,
  InteractionSessionMode,
  InteractionState
} from '../../types/runtime/interaction'
import type {
  PointerDownInput,
  PointerMoveInput,
  PointerUpInput,
  WheelInput
} from '../../types/input'
import type { ViewportInputRuntime } from '../viewport'
import { createAutoPan } from './autoPan'

type SessionMeta = Readonly<{
  id: number
  key: string
  mode: InteractionSessionMode
  pointerId?: number
  chrome?: boolean
}>

type RunningSession = {
  id: number
  key: string
  pointerId?: number
  session: InteractionSession
}

const isRecord = (
  value: unknown
): value is Record<string, unknown> => (
  typeof value === 'object'
  && value !== null
)

const readDefaultPointerId = (
  input: unknown
) => {
  if (!isRecord(input)) {
    return undefined
  }

  return typeof input.pointerId === 'number'
    ? input.pointerId
    : undefined
}

export const createInteractionRuntime = ({
  getViewport,
  getBindings,
  space
}: {
  getViewport: () => Pick<ViewportInputRuntime, 'panScreenBy' | 'screenPoint' | 'size'> | null
  getBindings: () => readonly InteractionBinding[]
  space: {
    get: () => boolean
    set: (value: boolean) => void
  }
}): InteractionRuntime => {
  const active = createValueStore<SessionMeta | null>(null)
  const gesture = createValueStore<ActiveGesture | null>(null)
  const busy = createDerivedStore({
    get: (read) => read(active) !== null
  })
  const mode = createDerivedStore({
    get: (read) => read(active)?.mode ?? 'idle'
  })
  const chrome = createDerivedStore({
    get: (read) => {
      const current = read(active)
      return current === null
        || Boolean(current.chrome)
    }
  })
  const state = createDerivedStore<InteractionState>({
    get: (read) => ({
      busy: read(busy),
      chrome: read(chrome),
      mode: read(mode),
      transforming: read(mode) === 'node-transform'
    }),
    isEqual: (left, right) => (
      left.busy === right.busy
      && left.chrome === right.chrome
      && left.mode === right.mode
      && left.transforming === right.transforming
    )
  })
  let nextId = 1
  let current: RunningSession | null = null
  const autoPan = createAutoPan({
    getViewport
  })

  const readBindings = () => getBindings()

  const matchesPointer = (
    pointerId: number | undefined,
    input: {
      pointerId: number
    }
  ) => pointerId === undefined || input.pointerId === pointerId

  const syncGesture = (
    running: RunningSession | null
  ) => {
    gesture.set(running?.session.gesture ?? null)
  }

  const syncActive = (running: RunningSession | null) => {
    if (!running) {
      active.set(null)
      syncGesture(null)
      return
    }

    active.set({
      id: running.id,
      key: running.key,
      mode: running.session.mode,
      pointerId: running.pointerId,
      chrome: running.session.chrome
    })
    syncGesture(running)
  }

  const cleanup = (running: RunningSession) => {
    autoPan.stop()
    current = null
    syncActive(null)
    running.session.cleanup?.()
  }

  const applyAutoPan = (
    running: RunningSession
  ) => {
    autoPan.stop()
    const options = running.session.autoPan
    if (options) {
      autoPan.start({
        ...options,
        frame: (pointer) => {
          if (current?.id !== running.id) {
            return
          }

          applyTransition(running, options.frame?.(pointer))
          if (current?.id === running.id) {
            syncGesture(running)
          }
        }
      })
    }
  }

  const activateRunning = (
    running: RunningSession
  ) => {
    current = running
    syncActive(running)
    applyAutoPan(running)
  }

  const replaceRunningSession = (
    running: RunningSession,
    nextSession: InteractionSession
  ) => {
    running.session.cleanup?.()
    running.pointerId = nextSession.pointerId ?? running.pointerId
    running.session = nextSession
    activateRunning(running)
  }

  const finishRunning = (
    running: RunningSession
  ) => {
    if (current?.id !== running.id) {
      return
    }

    cleanup(running)
  }

  const cancelRunning = (
    running: RunningSession
  ) => {
    if (current?.id !== running.id) {
      return
    }

    running.session.cancel?.()
    if (current?.id !== running.id) {
      return
    }

    cleanup(running)
  }

  const applyTransition = (
    running: RunningSession,
    transition: InteractionSessionTransition | void
  ) => {
    if (!transition || current?.id !== running.id) {
      return
    }

    switch (transition.kind) {
      case 'finish':
        finishRunning(running)
        return
      case 'cancel':
        cancelRunning(running)
        return
      case 'replace':
        replaceRunningSession(running, transition.session)
    }
  }

  const cancel = () => {
    const running = current
    if (!running) {
      return
    }

    cancelRunning(running)
  }

  const handlePointerDown = (
    input: PointerDownInput
  ) => {
    if (active.get()) {
      return false
    }

    const bindings = readBindings()
    for (let index = 0; index < bindings.length; index += 1) {
      const binding = bindings[index]
      if (!binding?.start) {
        continue
      }

      const id = nextId++
      let running: RunningSession | null = null

      const control: InteractionControl = {
        replace: (session) => {
          if (!running) {
            return
          }

          replaceRunningSession(running, session)
        },
        pan: (pointer) => {
          autoPan.update(pointer)
        }
      }

      const startResult = binding.start(input, control)
      if (!startResult) {
        continue
      }

      if (startResult === 'handled') {
        return true
      }

      const nextSession = startResult
      running = {
        id,
        key: binding.key,
        pointerId: nextSession.pointerId ?? readDefaultPointerId(input),
        session: nextSession
      }

      activateRunning(running)

      return true
    }

    return false
  }

  const handlePointerMove = (
    input: PointerMoveInput
  ) => {
    const running = current
    if (running) {
      if (!matchesPointer(running.pointerId, input)) {
        return false
      }

      applyTransition(running, running.session.move?.(input))
      if (current?.id === running.id) {
        syncGesture(running)
      }
      return true
    }

    return false
  }

  const handlePointerUp = (
    input: PointerUpInput
  ) => {
    const running = current
    if (!running || !matchesPointer(running.pointerId, input)) {
      return false
    }

    applyTransition(running, running.session.up?.(input))
    if (current?.id === running.id) {
      syncGesture(running)
    }
    return true
  }

  const handlePointerCancel = (
    input: {
      pointerId: number
    }
  ) => {
    if (!current || !matchesPointer(current.pointerId, input)) {
      return false
    }

    cancelRunning(current)
    return true
  }

  const handlePointerLeave = () => {
  }

  const handleWheel = (
    input: WheelInput
  ) => {
    return Boolean(current)
  }

  const handleKeyDown = (
    input: InteractionKeyboardInput
  ) => {
    let handled = false

    if (input.code === 'Space') {
      if (!space.get()) {
        space.set(true)
      }
      handled = true
    }

    const running = current
    if (!running) {
      return handled
    }

    applyTransition(running, running.session.keydown?.(input))
    if (current?.id === running.id) {
      syncGesture(running)
    }

    if (active.get() && input.key === 'Escape') {
      cancel()
    }

    return true
  }

  const handleKeyUp = (
    input: InteractionKeyboardInput
  ) => {
    let handled = false

    if (input.code === 'Space') {
      if (space.get()) {
        space.set(false)
      }
      handled = true
    }

    const running = current
    if (!running) {
      return handled
    }

    applyTransition(running, running.session.keyup?.(input))
    if (current?.id === running.id) {
      syncGesture(running)
    }
    return true
  }

  const handleBlur = () => {
    if (space.get()) {
      space.set(false)
    }

    const running = current
    if (!running) {
      return
    }

    if (running.session.blur) {
      applyTransition(running, running.session.blur())
      if (current?.id === running.id) {
        syncGesture(running)
      }
      return
    }

    cancel()
  }

  return {
    mode,
    busy,
    chrome,
    gesture,
    state,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handlePointerLeave,
    handleWheel,
    cancel,
    handleKeyDown,
    handleKeyUp,
    handleBlur
  }
}
