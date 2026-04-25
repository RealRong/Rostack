import { store } from '@shared/core'
import type { ViewportInputRuntime } from '@whiteboard/editor/session/viewport'
import { createAutoPan } from '@whiteboard/editor/input/session/autoPan'
import type {
  InteractionBinding,
  InteractionRuntime,
  InteractionSession,
  InteractionSessionTransition
} from '@whiteboard/editor/input/core/types'

type SessionMeta = Readonly<{
  id: number
  key: string
  mode: InteractionSession['mode']
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
  state
}: {
  getViewport: () => Pick<ViewportInputRuntime, 'panScreenBy' | 'screenPoint' | 'size'> | null
  getBindings: () => readonly InteractionBinding[]
  state: Pick<
    import('@whiteboard/editor/session/runtime').EditorSessionInteractionWrite,
    'setActive' | 'setGesture' | 'setSpace'
  > & {
    getSpace: () => boolean
  }
}): InteractionRuntime => {
  let nextId = 1
  let current: RunningSession | null = null
  let lastPointer: {
    clientX: number
    clientY: number
  } | null = null
  const autoPan = createAutoPan({
    getViewport
  })

  const matchesPointer = (
    pointerId: number | undefined,
    input: {
      pointerId: number
    }
  ) => pointerId === undefined || input.pointerId === pointerId

  const syncActive = (running: RunningSession | null) => {
    if (!running) {
      state.setActive(null)
      syncGesture(null)
      return
    }

    state.setActive({
      mode: running.session.mode,
      chrome: running.session.chrome
    })
    syncGesture(running)
  }

  const syncGesture = (
    running: RunningSession | null
  ) => {
    state.setGesture(running?.session.gesture ?? null)
  }

  const refreshAutoPan = () => {
    if (!lastPointer) {
      return
    }

    autoPan.update(lastPointer)
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
            refreshAutoPan()
          }
        }
      })
    }
  }

  const attachSession = (
    running: RunningSession
  ) => {
    const session = running.session
    session.attach?.((transition) => {
      if (current?.id !== running.id || running.session !== session) {
        return
      }

      applyTransition(running, transition)
      if (current?.id === running.id) {
        syncGesture(running)
        refreshAutoPan()
      }
    })
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
        cleanup(running)
        return
      case 'cancel':
        if (current?.id !== running.id) {
          return
        }
        running.session.cancel?.()
        if (current?.id !== running.id) {
          return
        }
        cleanup(running)
        return
      case 'replace':
        running.session.cleanup?.()
        running.pointerId = transition.session.pointerId ?? running.pointerId
        running.session = transition.session
        current = running
        attachSession(running)
        syncActive(running)
        applyAutoPan(running)
    }
  }

  const activateRunning = (
    running: RunningSession
  ) => {
    current = running
    attachSession(running)
    syncActive(running)
    applyAutoPan(running)
    refreshAutoPan()
  }

  const cancel = () => {
    const running = current
    if (!running) {
      return
    }

    applyTransition(running, {
      kind: 'cancel'
    })
  }

  return {
    pointerMode: (phase) => current?.session.pointer?.[phase] ?? (
      phase === 'move'
        ? 'point'
        : 'full'
    ),
    handlePointerDown: (input) => {
      if (current) {
        return false
      }

      lastPointer = {
        clientX: input.client.x,
        clientY: input.client.y
      }

      const bindings = getBindings()
      for (let index = 0; index < bindings.length; index += 1) {
        const binding = bindings[index]
        if (!binding?.start) {
          continue
        }

        const startResult = binding.start(input)
        if (!startResult) {
          continue
        }

        if (startResult === 'handled') {
          return true
        }

        activateRunning({
          id: nextId++,
          key: binding.key,
          pointerId: startResult.pointerId ?? readDefaultPointerId(input),
          session: startResult
        })
        return true
      }

      return false
    },
    handlePointerMove: (input) => {
      lastPointer = {
        clientX: input.client.x,
        clientY: input.client.y
      }
      const running = current
      if (running) {
        if (!matchesPointer(running.pointerId, input)) {
          return false
        }

        applyTransition(running, running.session.move?.(input))
        if (current?.id === running.id) {
          syncGesture(running)
          refreshAutoPan()
        }
        return true
      }

      return false
    },
    handlePointerUp: (input) => {
      lastPointer = {
        clientX: input.client.x,
        clientY: input.client.y
      }
      const running = current
      if (!running || !matchesPointer(running.pointerId, input)) {
        return false
      }

      applyTransition(running, running.session.up?.(input))
      if (current?.id === running.id) {
        syncGesture(running)
        refreshAutoPan()
      }
      return true
    },
    handlePointerCancel: (input) => {
      if (!current || !matchesPointer(current.pointerId, input)) {
        return false
      }

      cancel()
      return true
    },
    handlePointerLeave: () => {
      lastPointer = null
    },
    handleWheel: (_input) => Boolean(current),
    cancel,
    handleKeyDown: (input) => {
      let handled = false

      if (input.code === 'Space') {
        if (!state.getSpace()) {
          state.setSpace(true)
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

      if (current && input.key === 'Escape') {
        cancel()
      }

      return true
    },
    handleKeyUp: (input) => {
      let handled = false

      if (input.code === 'Space') {
        if (state.getSpace()) {
          state.setSpace(false)
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
    },
    handleBlur: () => {
      if (state.getSpace()) {
        state.setSpace(false)
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
  }
}
