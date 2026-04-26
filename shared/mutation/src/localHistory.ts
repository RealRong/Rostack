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

export interface HistoryPortInternal<
  Op,
  Key,
  W extends Write<any, Op, Key, any>
> {
  controller(): HistoryController<Op, Key, W> | undefined
  sync(): void
}

export interface HistoryPort<
  Result,
  Op = any,
  Key = any,
  W extends Write<any, Op, Key, any> = Write<any, Op, Key, any>
> extends store.ReadStore<HistoryPortState> {
  readonly internal: HistoryPortInternal<Op, Key, W>
  undo(): Result
  redo(): Result
  clear(): void
}

export interface HistoryPortOptions<
  Result,
  Op = any,
  Key = any,
  W extends Write<any, Op, Key, any> = Write<any, Op, Key, any>
> {
  apply?: {
    origin?: Origin
    canRun?(): boolean
    onUnavailable?(
      reason: 'history-missing' | 'cannot-apply' | 'empty',
      action: 'undo' | 'redo'
    ): Result
    onSuccess?(input: {
      controller: HistoryController<Op, Key, W>
      result: Result
    }): void
    onFailure?(input: {
      controller: HistoryController<Op, Key, W>
      result: Result
    }): void
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
  historyController?(): HistoryController<Op, Key, W> | undefined
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
  action: 'undo' | 'redo',
  fallback: string,
  options?: HistoryPortOptions<Result, any, any, any>
): Result => (
  options?.apply?.onUnavailable?.(reason, action)
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
  options?: HistoryPortOptions<Result, Op, Key, W>
): HistoryPort<Result, Op, Key, W> => {
  const controller = engine.historyController?.()
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
      return readUnavailable('history-missing', kind, 'History is unavailable.', options)
    }

    if (options?.apply?.canRun && !options.apply.canRun()) {
      return readUnavailable('cannot-apply', kind, 'History cannot apply right now.', options)
    }

    const operations = kind === 'undo'
      ? controller.undo()
      : controller.redo()
    if (!operations) {
      return readUnavailable(
        'empty',
        kind,
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
      if (options?.apply?.onFailure) {
        options.apply.onFailure({
          controller,
          result
        })
      } else {
        controller.cancel('restore')
      }
      publish()
      return result
    }

    if (options?.apply?.onSuccess) {
      options.apply.onSuccess({
        controller,
        result
      })
    } else {
      controller.confirm()
    }
    publish()
    return result
  }

  return {
    get: state.get,
    subscribe: state.subscribe,
    internal: {
      controller: () => controller,
      sync: publish
    },
    clear: () => {
      if (controller?.clear()) {
        publish()
      }
    },
    undo: () => run('undo'),
    redo: () => run('redo')
  } as HistoryPort<Result, Op, Key, W>
}
