import { store } from '@shared/core'
import {
  DEFAULT_ENGINE_HISTORY_CONFIG,
  type Engine,
  type IntentResult
} from '@whiteboard/engine'
import type {
  HistoryApi,
  HistoryState,
  LocalEngineHistoryConfig
} from '@whiteboard/history/types'

export const DEFAULT_LOCAL_ENGINE_HISTORY_CONFIG: LocalEngineHistoryConfig =
  DEFAULT_ENGINE_HISTORY_CONFIG

const readCancelled = (
  message: string
): IntentResult => ({
  ok: false,
  error: {
    code: 'cancelled',
    message
  }
})

const publishState = (
  state: ReturnType<typeof store.createValueStore<HistoryState>>,
  engine: Pick<Engine, 'history'>
) => {
  state.set({
    ...(engine.history?.state() ?? {
      canUndo: false,
      canRedo: false,
      undoDepth: 0,
      redoDepth: 0,
      invalidatedDepth: 0,
      isApplying: false
    }),
    lastUpdatedAt: Date.now()
  })
}

export const createLocalEngineHistory = (
  engine: Pick<Engine, 'apply' | 'history'> & {
    writes: Engine['writes']
  }
): HistoryApi => {
  const controller = engine.history
  const state = store.createValueStore<HistoryState>({
    ...(controller?.state() ?? {
      canUndo: false,
      canRedo: false,
      undoDepth: 0,
      redoDepth: 0,
      invalidatedDepth: 0,
      isApplying: false
    }),
    lastUpdatedAt: undefined
  })

  const publish = () => {
    publishState(state, engine)
  }

  engine.writes.subscribe(() => {
    publish()
  })

  if (!controller) {
    return {
      get: state.get,
      subscribe: state.subscribe,
      clear: () => {},
      undo: () => readCancelled('History is unavailable.'),
      redo: () => readCancelled('History is unavailable.')
    }
  }

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
        origin: 'history'
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
        origin: 'history'
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
