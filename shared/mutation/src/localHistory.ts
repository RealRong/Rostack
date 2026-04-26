import { store } from '@shared/core'
import {
  mutationFailure
} from './engine'
import type {
  HistoryController,
  HistoryState
} from './history'
import type {
  Origin,
  Write,
  WriteStream
} from './write'

export interface LocalHistoryState extends HistoryState {
  lastUpdatedAt?: number
}

export interface LocalHistoryApi<Result> extends store.ReadStore<LocalHistoryState> {
  undo(): Result
  redo(): Result
  clear(): void
}

export interface LocalHistoryOptions<Result> {
  apply?: {
    origin?: Origin
    canRun?(): boolean
    onUnavailable?(
      reason: 'history-missing' | 'cannot-apply' | 'empty'
    ): Result
  }
}

export interface LocalHistoryEngine<
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
  writes: WriteStream<W>
  history?: HistoryController<Op, Key, W>
}

const EMPTY_HISTORY_STATE: LocalHistoryState = {
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
  options?: LocalHistoryOptions<Result>
): Result => (
  options?.apply?.onUnavailable?.(reason)
  ?? readCancelled<Result>(fallback)
)

const readState = (
  controller?: Pick<HistoryController<any, any, any>, 'state'>
): LocalHistoryState => ({
  ...(controller?.state() ?? EMPTY_HISTORY_STATE),
  lastUpdatedAt: Date.now()
})

export const createLocalMutationHistory = <
  Doc,
  Op,
  Key,
  Result extends {
    ok: boolean
  },
  W extends Write<Doc, Op, Key, any> = Write<Doc, Op, Key, any>
>(
  engine: LocalHistoryEngine<Doc, Op, Key, Result, W>,
  options?: LocalHistoryOptions<Result>
): LocalHistoryApi<Result> => {
  const controller = engine.history
  const state = store.createValueStore<LocalHistoryState>({
    ...(controller?.state() ?? EMPTY_HISTORY_STATE),
    lastUpdatedAt: undefined
  })

  const publish = () => {
    state.set(readState(controller))
  }

  engine.writes.subscribe(() => {
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
