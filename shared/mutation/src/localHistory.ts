import { store } from '@shared/core'
import {
  mutationFailure
} from './engine'
import type {
  HistoryController,
  HistoryState
} from './history'
import type {
  CommitRecord,
  CommitStream,
  Origin,
  Write,
} from './write'

export interface HistoryPortState extends HistoryState {
  lastUpdatedAt?: number
}

export interface HistoryPort<Result> extends store.ReadStore<HistoryPortState> {
  undo(): Result
  redo(): Result
  clear(): void
}

export interface HistoryPortOptions<Result> {
  apply?: {
    origin?: Origin
    canRun?(): boolean
    onUnavailable?(
      reason: 'history-missing' | 'cannot-apply' | 'empty'
    ): Result
  }
}

export interface HistoryPortEngine<
  Doc,
  Op,
  Key,
  Result extends {
    ok: boolean
  },
  W extends Write<Doc, Op, Key, any> = Write<Doc, Op, Key, any>
> {
  apply(
    ops: readonly Op[],
    options?: {
      origin?: Origin
    }
  ): Result
  commits: CommitStream<CommitRecord<Doc, Op, Key, any>>
  history?: HistoryController<Op, Key, W>
}

const EMPTY_HISTORY_STATE: HistoryPortState = {
  canUndo: false,
  canRedo: false,
  undoDepth: 0,
  redoDepth: 0,
  invalidatedDepth: 0,
  isApplying: false,
  lastUpdatedAt: undefined
}

const readCancelled = <Result>(
  message: string
): Result => mutationFailure(
  'cancelled',
  message
) as Result

const readUnavailable = <Result>(
  reason: 'history-missing' | 'cannot-apply' | 'empty',
  fallback: string,
  options?: HistoryPortOptions<Result>
): Result => (
  options?.apply?.onUnavailable?.(reason)
  ?? readCancelled<Result>(fallback)
)

const readState = (
  controller?: Pick<HistoryController<any, any, any>, 'state'>
): HistoryPortState => ({
  ...(controller?.state() ?? EMPTY_HISTORY_STATE),
  lastUpdatedAt: Date.now()
})

export const createHistoryPort = <
  Doc,
  Op,
  Key,
  Result extends {
    ok: boolean
  },
  W extends Write<Doc, Op, Key, any> = Write<Doc, Op, Key, any>
>(
  engine: HistoryPortEngine<Doc, Op, Key, Result, W>,
  options?: HistoryPortOptions<Result>
): HistoryPort<Result> => {
  const controller = engine.history
  const state = store.createValueStore<HistoryPortState>({
    ...(controller?.state() ?? EMPTY_HISTORY_STATE),
    lastUpdatedAt: undefined
  })

  const publish = () => {
    state.set(readState(controller))
  }

  engine.commits.subscribe(() => {
    publish()
  })

  const run = (
    kind: 'undo' | 'redo'
  ): Result => {
    if (!controller) {
      return readUnavailable('history-missing', 'History is unavailable.', options)
    }

    if (options?.apply?.canRun && !options.apply.canRun()) {
      return readUnavailable('cannot-apply', 'History cannot apply right now.', options)
    }

    const operations = kind === 'undo'
      ? controller.undo()
      : controller.redo()
    if (!operations) {
      return readUnavailable(
        'empty',
        kind === 'undo'
          ? 'Nothing to undo.'
          : 'Nothing to redo.',
        options
      )
    }

    publish()

    const result = engine.apply(operations, {
      origin: options?.apply?.origin ?? 'history'
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

  return {
    get: state.get,
    subscribe: state.subscribe,
    clear: () => {
      if (controller?.clear()) {
        publish()
      }
    },
    undo: () => run('undo'),
    redo: () => run('redo')
  }
}
