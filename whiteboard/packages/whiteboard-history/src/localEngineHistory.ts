import { store } from '@shared/core'
import { history as mutationHistory } from '@shared/mutation'
import type { HistoryFootprint } from '@whiteboard/core/spec/history'
import { META } from '@whiteboard/core/spec/operation'
import type { Operation } from '@whiteboard/core/types'
import type { Engine, EngineWrites } from '@whiteboard/engine'
import type { EngineWrite } from '@whiteboard/engine/types/engineWrite'
import type { CommandResult } from '@whiteboard/engine/types/result'
import type {
  HistoryApi,
  HistoryState,
  LocalEngineHistoryConfig
} from '@whiteboard/history/types'

export const DEFAULT_LOCAL_ENGINE_HISTORY_CONFIG: LocalEngineHistoryConfig = {
  enabled: true,
  capacity: 100,
  captureSystem: false,
  captureRemote: false
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
  origin: EngineWrite['origin'],
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
  engine: Pick<Engine, 'apply'> & {
    writes: EngineWrites
  },
  config?: Partial<LocalEngineHistoryConfig>
): HistoryApi => {
  const resolvedConfig: LocalEngineHistoryConfig = {
    ...DEFAULT_LOCAL_ENGINE_HISTORY_CONFIG,
    ...(config ?? {})
  }
  const controller = mutationHistory.create<
    Operation,
    HistoryFootprint[number],
    EngineWrite
  >({
    capacity: resolvedConfig.capacity,
    conflicts: () => false,
    track: (write) => (
      resolvedConfig.enabled
      && shouldCaptureOrigin(write.origin, resolvedConfig)
    )
  })
  const state = store.createValueStore<HistoryState>({
    ...mutationHistory.emptyState(),
    lastUpdatedAt: undefined
  })

  const publish = () => {
    const current = controller.state()
    state.set({
      ...current,
      lastUpdatedAt: Date.now()
    })
  }

  const captureWrite = (
    write: EngineWrite
  ) => {
    if (write.forward.some((op) => META[op.type].sync === 'checkpoint')) {
      if (!shouldCaptureOrigin(write.origin, resolvedConfig)) {
        return
      }
      if (controller.clear()) {
        publish()
      }
      return
    }

    if (controller.capture(write)) {
      publish()
    }
  }

  engine.writes.subscribe(captureWrite)

  return {
    get: state.get,
    subscribe: state.subscribe,
    clear: () => {
      if (controller.clear()) {
        publish()
      }
    },
    undo: () => {
      const operations = controller.undo()
      if (!operations) {
        return readCancelled('Nothing to undo.')
      }

      publish()

      const result = engine.apply(operations, {
        origin: 'system'
      })
      if (!result.ok) {
        controller.cancel('restore')
        publish()
        return result
      }

      controller.confirm()
      publish()
      return result
    },
    redo: () => {
      const operations = controller.redo()
      if (!operations) {
        return readCancelled('Nothing to redo.')
      }

      publish()

      const result = engine.apply(operations, {
        origin: 'system'
      })
      if (!result.ok) {
        controller.cancel('restore')
        publish()
        return result
      }

      controller.confirm()
      publish()
      return result
    }
  }
}
