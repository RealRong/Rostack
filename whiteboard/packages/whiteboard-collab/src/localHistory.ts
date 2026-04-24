import { store as coreStore } from '@shared/core'
import type { Engine, IntentResult } from '@whiteboard/engine'
import type { HistoryState } from '@whiteboard/history'
import type {
  CollabLocalHistory
} from '@whiteboard/collab/types/session'

type BaseController = NonNullable<Engine['history']>

type LocalHistoryController = {
  controller: BaseController
  localHistory: CollabLocalHistory
  clear: () => void
}

const readHistoryCancelled = (
  message: string
): IntentResult => ({
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
  stateStore.set({
    ...controller.state(),
    lastUpdatedAt: Date.now()
  })
}

const createObservedController = (input: {
  controller: BaseController
  publish: () => void
}): BaseController => ({
  state: () => input.controller.state(),
  capture: (...args) => {
    const changed = input.controller.capture(...args)
    if (changed) {
      input.publish()
    }
    return changed
  },
  observe: (...args) => {
    const changed = input.controller.observe(...args)
    if (changed) {
      input.publish()
    }
    return changed
  },
  undo: () => {
    const operations = input.controller.undo()
    if (operations) {
      input.publish()
    }
    return operations
  },
  redo: () => {
    const operations = input.controller.redo()
    if (operations) {
      input.publish()
    }
    return operations
  },
  confirm: (...args) => {
    const changed = input.controller.confirm(...args)
    if (changed) {
      input.publish()
    }
    return changed
  },
  cancel: (...args) => {
    const changed = input.controller.cancel(...args)
    if (changed) {
      input.publish()
    }
    return changed
  },
  clear: () => {
    const changed = input.controller.clear()
    if (changed) {
      input.publish()
    }
    return changed
  }
})

export const createLocalHistoryController = ({
  engine,
  canApply
}: {
  engine: Engine
  canApply: () => boolean
}): LocalHistoryController => {
  if (!engine.history) {
    throw new Error('Collab local history requires engine.history.')
  }

  const state = coreStore.createValueStore<HistoryState>({
    ...engine.history.state(),
    lastUpdatedAt: undefined
  })

  const publish = () => {
    publishState(state, controller)
  }

  const controller = createObservedController({
    controller: engine.history,
    publish
  })

  engine.writes.subscribe(() => {
    publish()
  })

  const failPending = () => {
    controller.cancel('invalidate')
  }

  const clear = () => {
    controller.clear()
  }

  const undo = (): IntentResult => {
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
      origin: 'history'
    })
    if (!result.ok) {
      failPending()
    } else {
      controller.confirm()
    }
    publish()
    return result
  }

  const redo = (): IntentResult => {
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
      origin: 'history'
    })
    if (!result.ok) {
      failPending()
    } else {
      controller.confirm()
    }
    publish()
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
