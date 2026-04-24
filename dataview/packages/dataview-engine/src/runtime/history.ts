import type { DocumentOperation } from '@dataview/core/contracts/operations'
import { operation } from '@dataview/core/operation'
import type {
  HistoryApi,
  HistoryState
} from '@dataview/engine/contracts/history'
import type {
  CommitResult
} from '@dataview/engine/contracts/result'
import type {
  EngineWrite,
  EngineWrites
} from '@dataview/engine/contracts/write'
import { history as mutationHistory, meta as mutationMeta } from '@shared/mutation'

const EMPTY_RESULT: CommitResult = {
  issues: [],
  applied: false
}

export const createEngineHistory = (input: {
  capacity: number
  writes: EngineWrites
  replay: (
    kind: 'undo' | 'redo',
    operations: readonly DocumentOperation[],
  ) => CommitResult
}): HistoryApi => {
  const controller = mutationHistory.create<
    DocumentOperation,
    never,
    EngineWrite
  >({
    capacity: input.capacity,
    conflicts: () => false,
    track: (write) => (
      write.origin === 'user'
      && write.forward.every((entry) => mutationMeta.tracksHistory(operation.meta, entry))
    )
  })

  input.writes.subscribe((write) => {
    if (write.origin === 'history') {
      return
    }
    if (write.origin !== 'user') {
      controller.clear()
      return
    }
    controller.capture(write)
  })

  const state = (): HistoryState => {
    const current = controller.state()
    return {
      capacity: input.capacity,
      undoDepth: current.undoDepth,
      redoDepth: current.redoDepth
    }
  }

  const replay = (
    kind: 'undo' | 'redo'
  ): CommitResult => {
    const operations = kind === 'undo'
      ? controller.undo()
      : controller.redo()
    if (!operations) {
      return EMPTY_RESULT
    }

    const result = input.replay(kind, operations)
    if (result.applied) {
      controller.confirm()
    } else {
      controller.cancel('restore')
    }
    return result
  }

  return {
    state,
    canUndo: () => controller.state().canUndo,
    canRedo: () => controller.state().canRedo,
    undo: () => replay('undo'),
    redo: () => replay('redo'),
    clear: () => {
      controller.clear()
    }
  }
}
