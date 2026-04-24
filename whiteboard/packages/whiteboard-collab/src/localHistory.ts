import { store as coreStore } from '@shared/core'
import { history as mutationHistory } from '@shared/mutation'
import { historyFootprintConflicts } from '@whiteboard/core/spec/history'
import type { HistoryFootprint } from '@whiteboard/core/spec/history'
import type { Engine } from '@whiteboard/engine'
import type { EngineWrite } from '@whiteboard/engine/types/engineWrite'
import type { CommandResult } from '@whiteboard/engine/types/result'
import type { HistoryState } from '@whiteboard/history'
import type {
  CollabLocalHistory
} from '@whiteboard/collab/types/session'

type BaseController = ReturnType<typeof mutationHistory.create<
  import('@whiteboard/core/types').Operation,
  HistoryFootprint[number],
  EngineWrite
>>

type LocalHistoryController = {
  controller: BaseController
  localHistory: CollabLocalHistory
  clear: () => void
}

const readHistoryCancelled = (
  message: string
): CommandResult => ({
  ok: false,
  error: {
    code: 'cancelled',
    message
  }
})

const publishState = (
  stateStore: ReturnType<typeof coreStore.createValueStore<HistoryState>>,
  controller: BaseController
) => {
  const runtime = controller.state()
  stateStore.set({
    ...runtime,
    lastUpdatedAt: Date.now()
  })
}

export const createLocalHistoryController = ({
  engine,
  canApply
}: {
  engine: Engine
  canApply: () => boolean
}): LocalHistoryController => {
  const state = coreStore.createValueStore<HistoryState>({
    ...mutationHistory.emptyState(),
    lastUpdatedAt: undefined
  })

  const baseController = mutationHistory.create<
    import('@whiteboard/core/types').Operation,
    HistoryFootprint[number],
    EngineWrite
  >({
    conflicts: historyFootprintConflicts
  })

  const publish = () => {
    publishState(state, controller)
  }

  const controller: BaseController = {
    state: () => baseController.state(),
    capture: (...args) => {
      const changed = baseController.capture(...args)
      if (changed) {
        publish()
      }
      return changed
    },
    observe: (...args) => {
      const changed = baseController.observe(...args)
      if (changed) {
        publish()
      }
      return changed
    },
    undo: () => {
      const operations = baseController.undo()
      if (operations) {
        publish()
      }
      return operations
    },
    redo: () => {
      const operations = baseController.redo()
      if (operations) {
        publish()
      }
      return operations
    },
    confirm: (...args) => {
      const changed = baseController.confirm(...args)
      if (changed) {
        publish()
      }
      return changed
    },
    cancel: (...args) => {
      const changed = baseController.cancel(...args)
      if (changed) {
        publish()
      }
      return changed
    },
    clear: () => {
      const changed = baseController.clear()
      if (changed) {
        publish()
      }
      return changed
    }
  }

  const failPending = () => {
    controller.cancel('invalidate')
  }

  const clear = () => {
    controller.clear()
  }

  const undo = (): CommandResult => {
    if (!canApply()) {
      return readHistoryCancelled('Collaboration session is not connected.')
    }
    if (controller.state().isApplying) {
      return readHistoryCancelled('History operation is already applying.')
    }
    const operations = controller.undo()
    if (!operations) {
      return readHistoryCancelled('Nothing to undo.')
    }

    const result = engine.apply(operations, {
      origin: 'user'
    })
    if (!result.ok) {
      failPending()
    }
    return result
  }

  const redo = (): CommandResult => {
    if (!canApply()) {
      return readHistoryCancelled('Collaboration session is not connected.')
    }
    if (controller.state().isApplying) {
      return readHistoryCancelled('History operation is already applying.')
    }
    const operations = controller.redo()
    if (!operations) {
      return readHistoryCancelled('Nothing to redo.')
    }

    const result = engine.apply(operations, {
      origin: 'user'
    })
    if (!result.ok) {
      failPending()
    }
    return result
  }

  return {
    controller,
    localHistory: {
      get: state.get,
      subscribe: state.subscribe,
      undo,
      redo,
      clear
    },
    clear
  }
}
