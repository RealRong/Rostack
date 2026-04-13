import {
  createDerivedStore,
  createValueStore,
  read,
  type ValueStore
} from '@shared/core'
import type { Viewport } from '@whiteboard/core/types'
import type { EditorState } from '../types/editor'
import type { EditorQueryRead } from '../query'
import type { PointerSample } from '../types/input'
import type { NodeRegistry } from '../types/node'
import type { Tool } from '../types/tool'
import type { DrawState } from './draw/state'
import { createLocalDrawActions, type LocalDrawActions } from './actions/draw'
import {
  createLocalFeedbackActions,
  type LocalFeedbackActions
} from './actions/feedback'
import { createLocalEditActions, type LocalEditActions } from './actions/edit'
import {
  createLocalSessionActions,
  type LocalSessionActions
} from './actions/session'
import {
  createLocalViewportActions,
  type LocalViewportActions
} from './actions/viewport'
import {
  createDrawStateStore,
  type DrawStateStore
} from './draw/runtime'
import { createFeedback, type EditorFeedbackRuntime } from './feedback'
import { createEditState, type EditState } from './session/edit'
import {
  createSelectionState,
  type SelectionState
} from './session/selection'
import {
  createViewport,
  type ViewportInputRuntime,
  type ViewportRuntime
} from './viewport/runtime'
import { createAutoPan } from '../input/core/autoPan'
import type { ActiveGesture } from '../input/core/gesture'
import type {
  InteractionBinding,
  InteractionRuntime,
  InteractionSession,
  InteractionSessionTransition
} from '../input/core/types'

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

type ReadNodeEdge = Pick<EditorQueryRead, 'node' | 'edge'>

export type EditorLocalState = {
  tool: ValueStore<Tool>
  draw: DrawStateStore
  selection: SelectionState
  edit: EditState
  pointer: ValueStore<PointerSample | null>
  space: ValueStore<boolean>
}

export type EditorLocalActions = {
  session: LocalSessionActions
  edit: LocalEditActions
  viewport: LocalViewportActions
  draw: LocalDrawActions
  feedback: LocalFeedbackActions
}

export type EditorLocalRuntime = {
  state: EditorLocalState
  stores: Pick<EditorState, 'tool' | 'draw' | 'edit' | 'selection'> & {
    pointer: ValueStore<PointerSample | null>
    space: ValueStore<boolean>
  }
  viewport: ViewportRuntime
  interaction: InteractionRuntime
  feedback: EditorFeedbackRuntime
  actions: EditorLocalActions
  bindQuery: (read: EditorQueryRead) => void
  bindInteractions: (bindings: readonly InteractionBinding[]) => void
  reset: () => void
  reconcileAfterCommit: (read: ReadNodeEdge) => void
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

const createInteractionRuntime = ({
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
    get: () => read(active) !== null
  })
  const mode = createDerivedStore({
    get: () => read(active)?.mode ?? 'idle'
  })
  const chrome = createDerivedStore({
    get: () => {
      const current = read(active)
      return current === null
        || Boolean(current.chrome)
    }
  })
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

  const syncGesture = (
    running: RunningSession | null
  ) => {
    gesture.set(running?.session.gesture ?? null)
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
    mode,
    busy,
    chrome,
    gesture,
    handlePointerDown: (input) => {
      if (active.get()) {
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
    },
    handleKeyUp: (input) => {
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
    },
    handleBlur: () => {
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
  }
}

export const createLocalRuntime = ({
  initialTool,
  initialDrawState,
  initialViewport,
  registry
}: {
  initialTool: Tool
  initialDrawState: DrawState
  initialViewport: Viewport
  registry: NodeRegistry
}): EditorLocalRuntime => {
  const tool = createValueStore<Tool>(initialTool)
  const draw = createDrawStateStore(initialDrawState)
  const selection = createSelectionState()
  const edit = createEditState()
  const pointer = createValueStore<PointerSample | null>(null)
  const space = createValueStore(false)
  const viewport = createViewport({
    initialViewport
  })

  let readRuntime: EditorQueryRead | null = null
  let bindings: readonly InteractionBinding[] = []

  const state: EditorLocalState = {
    tool,
    draw,
    selection,
    edit,
    pointer,
    space
  }
  const stores: EditorLocalRuntime['stores'] = {
    tool,
    draw: draw.store,
    edit: edit.source,
    selection: selection.source,
    pointer,
    space
  }
  const interaction = createInteractionRuntime({
    getViewport: () => viewport.input,
    getBindings: () => bindings,
    space
  })
  const feedback = createFeedback({
    viewport: viewport.read,
    gesture: interaction.gesture
  })
  const actions: EditorLocalActions = {
    session: createLocalSessionActions({
      state,
      getRead: () => readRuntime
    }),
    edit: createLocalEditActions({
      state,
      registry,
      getRead: () => readRuntime
    }),
    viewport: createLocalViewportActions({
      state,
      viewport
    }),
    draw: createLocalDrawActions({
      state
    }),
    feedback: createLocalFeedbackActions({
      feedback
    })
  }

  return {
    state,
    stores,
    viewport,
    interaction,
    feedback,
    actions,
    bindQuery: (read) => {
      readRuntime = read
    },
    bindInteractions: (nextBindings) => {
      bindings = nextBindings
    },
    reset: () => {
      pointer.set(null)
      space.set(false)
      interaction.cancel()
      feedback.reset()
      edit.mutate.clear()
      selection.mutate.clear()
    },
    reconcileAfterCommit: (read) => {
      selection.mutate.reconcile(read)

      const currentEdit = edit.source.get()
      if (
        currentEdit
        && (
          (currentEdit.kind === 'node' && !read.node.item.get(currentEdit.nodeId))
          || (currentEdit.kind === 'edge-label' && !read.edge.item.get(currentEdit.edgeId))
        )
      ) {
        edit.mutate.clear()
      }
    }
  }
}
