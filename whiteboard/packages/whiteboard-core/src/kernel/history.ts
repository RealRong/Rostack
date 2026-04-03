import type { Operation, Origin } from '../types'
import type {
  HistoryApi,
  HistoryCapture,
  HistoryConfig,
  HistoryReplay,
  HistoryState
} from '../types/kernel'

const DEFAULT_HISTORY_CONFIG: HistoryConfig = {
  enabled: true,
  capacity: 100,
  captureSystem: true,
  captureRemote: false
}

type HistoryEntry<TOperation> = {
  forward: readonly TOperation[]
  inverse: readonly TOperation[]
}

export const createHistory = <
  TOperation = Operation,
  TOrigin extends string = Origin,
  TReplayResult = boolean
>({
  replay,
  now,
  config
}: {
  replay: HistoryReplay<TOperation, TReplayResult>
  now?: () => number
  config?: Partial<HistoryConfig>
}): HistoryApi<TOperation, TOrigin, TReplayResult> => {
  const readNow = now ?? (() => Date.now())
  const currentConfig: HistoryConfig = {
    ...DEFAULT_HISTORY_CONFIG,
    ...(config ?? {})
  }

  const listeners = new Set<(state: HistoryState) => void>()
  let undoStack: Array<HistoryEntry<TOperation>> = []
  let redoStack: Array<HistoryEntry<TOperation>> = []
  let isApplying = false
  let lastUpdatedAt: number | undefined

  const createSnapshot = (): HistoryState => ({
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    undoDepth: undoStack.length,
    redoDepth: redoStack.length,
    isApplying,
    lastUpdatedAt
  })

  let snapshot = createSnapshot()

  const emit = () => {
    lastUpdatedAt = readNow()
    snapshot = createSnapshot()
    listeners.forEach((listener) => listener(snapshot))
  }

  const trimUndo = () => {
    const capacity = Math.max(0, currentConfig.capacity)
    if (capacity === 0) {
      undoStack = []
      return
    }
    if (undoStack.length > capacity) {
      undoStack.splice(0, undoStack.length - capacity)
    }
  }

  const shouldCaptureOrigin = (origin?: TOrigin) => {
    if (origin === 'system' && !currentConfig.captureSystem) return false
    if (origin === 'remote' && !currentConfig.captureRemote) return false
    return true
  }

  const pushUndo = (entry: HistoryEntry<TOperation>) => {
    undoStack.push(entry)
    redoStack = []
    trimUndo()
    emit()
  }

  const get = (): HistoryState => snapshot

  return {
    get,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    configure: (nextConfig) => {
      const previousCapacity = currentConfig.capacity
      if (typeof nextConfig.enabled === 'boolean') {
        currentConfig.enabled = nextConfig.enabled
      }
      if (typeof nextConfig.capacity === 'number') {
        currentConfig.capacity = Math.max(0, nextConfig.capacity)
      }
      if (typeof nextConfig.captureSystem === 'boolean') {
        currentConfig.captureSystem = nextConfig.captureSystem
      }
      if (typeof nextConfig.captureRemote === 'boolean') {
        currentConfig.captureRemote = nextConfig.captureRemote
      }
      if (previousCapacity !== currentConfig.capacity) {
        trimUndo()
      }
      emit()
    },
    clear: () => {
      undoStack = []
      redoStack = []
      isApplying = false
      emit()
    },
    capture: ({ forward, inverse, origin }) => {
      if (!currentConfig.enabled) return
      if (isApplying) return
      if (!shouldCaptureOrigin(origin)) return
      if (!forward.length || !inverse.length) return
      pushUndo({ forward, inverse })
    },
    undo: () => {
      if (!undoStack.length) {
        emit()
        return false
      }

      const entry = undoStack.pop()
      if (!entry) return false

      isApplying = true
      emit()
      try {
        const result = replay(entry.inverse)
        if (result === false) {
          undoStack.push(entry)
          return false
        }
        redoStack.push(entry)
        return result
      } finally {
        isApplying = false
        emit()
      }
    },
    redo: () => {
      if (!redoStack.length) {
        emit()
        return false
      }

      const entry = redoStack.pop()
      if (!entry) return false

      isApplying = true
      emit()
      try {
        const result = replay(entry.forward)
        if (result === false) {
          redoStack.push(entry)
          return false
        }
        undoStack.push(entry)
        trimUndo()
        return result
      } finally {
        isApplying = false
        emit()
      }
    }
  }
}
