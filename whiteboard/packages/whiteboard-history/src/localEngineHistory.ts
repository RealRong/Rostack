import { createValueStore } from '@shared/core'
import { sync } from '@whiteboard/core/spec/operation'
import type { Operation, Origin } from '@whiteboard/core/types'
import type { Engine } from '@whiteboard/engine'
import type { EngineWrite } from '@whiteboard/engine/types/engineWrite'
import type { CommandResult } from '@whiteboard/engine/types/result'
import type {
  HistoryApi,
  HistoryState,
  LocalEngineHistoryConfig
} from '@whiteboard/history/types'

type HistoryEntry = {
  forward: readonly Operation[]
  inverse: readonly Operation[]
}

export const DEFAULT_LOCAL_ENGINE_HISTORY_CONFIG: LocalEngineHistoryConfig = {
  enabled: true,
  capacity: 100,
  captureSystem: false,
  captureRemote: false
}

const EMPTY_STATE: HistoryState = {
  canUndo: false,
  canRedo: false,
  undoDepth: 0,
  redoDepth: 0,
  invalidatedDepth: 0,
  isApplying: false
}

const readCancelled = (
  message: string
): CommandResult => ({
  ok: false,
  error: {
    code: 'cancelled',
    message
  }
})

const shouldCaptureOrigin = (
  origin: Origin,
  config: LocalEngineHistoryConfig
): boolean => {
  if (origin === 'system') {
    return config.captureSystem
  }
  if (origin === 'remote') {
    return config.captureRemote
  }
  return true
}

export const createLocalEngineHistory = (
  engine: Pick<Engine, 'apply' | 'write'>,
  config?: Partial<LocalEngineHistoryConfig>
): HistoryApi => {
  const resolvedConfig: LocalEngineHistoryConfig = {
    ...DEFAULT_LOCAL_ENGINE_HISTORY_CONFIG,
    ...(config ?? {})
  }
  const state = createValueStore<HistoryState>(EMPTY_STATE)

  let undoStack: HistoryEntry[] = []
  let redoStack: HistoryEntry[] = []
  let isApplying = false
  let lastUpdatedAt: number | undefined
  let lastWrite: EngineWrite | null = null

  const publish = () => {
    lastUpdatedAt = Date.now()
    state.set({
      canUndo: undoStack.length > 0,
      canRedo: redoStack.length > 0,
      undoDepth: undoStack.length,
      redoDepth: redoStack.length,
      invalidatedDepth: 0,
      isApplying,
      lastUpdatedAt
    })
  }

  const trimUndo = () => {
    const capacity = Math.max(0, resolvedConfig.capacity)
    if (capacity === 0) {
      undoStack = []
      return
    }
    if (undoStack.length > capacity) {
      undoStack.splice(0, undoStack.length - capacity)
    }
  }

  const clearStacks = () => {
    undoStack = []
    redoStack = []
  }

  const captureWrite = (
    write: EngineWrite
  ) => {
    if (isApplying) {
      return
    }

    if (write.forward.some((op) => sync.isCheckpointOnly(op))) {
      if (!shouldCaptureOrigin(write.origin, resolvedConfig)) {
        return
      }
      clearStacks()
      publish()
      return
    }

    if (!resolvedConfig.enabled) {
      return
    }
    if (!shouldCaptureOrigin(write.origin, resolvedConfig)) {
      return
    }
    if (write.forward.length === 0 || write.inverse.length === 0) {
      return
    }

    undoStack.push({
      forward: write.forward,
      inverse: write.inverse
    })
    redoStack = []
    trimUndo()
    publish()
  }

  engine.write.subscribe(() => {
    const nextWrite = engine.write.get()
    if (!nextWrite || nextWrite === lastWrite) {
      return
    }
    lastWrite = nextWrite
    captureWrite(nextWrite)
  })

  return {
    get: state.get,
    subscribe: state.subscribe,
    clear: () => {
      clearStacks()
      isApplying = false
      publish()
    },
    undo: () => {
      const entry = undoStack[undoStack.length - 1]
      if (!entry) {
        return readCancelled('Nothing to undo.')
      }

      undoStack = undoStack.slice(0, -1)
      isApplying = true
      publish()

      const result = engine.apply(entry.inverse, {
        origin: 'system'
      })
      if (!result.ok) {
        undoStack = [...undoStack, entry]
        isApplying = false
        publish()
        return result
      }

      redoStack = [...redoStack, entry]
      isApplying = false
      publish()
      return result
    },
    redo: () => {
      const entry = redoStack[redoStack.length - 1]
      if (!entry) {
        return readCancelled('Nothing to redo.')
      }

      redoStack = redoStack.slice(0, -1)
      isApplying = true
      publish()

      const result = engine.apply(entry.forward, {
        origin: 'system'
      })
      if (!result.ok) {
        redoStack = [...redoStack, entry]
        isApplying = false
        publish()
        return result
      }

      undoStack = [...undoStack, entry]
      trimUndo()
      isApplying = false
      publish()
      return result
    }
  }
}
