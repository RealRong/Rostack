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

export interface HistoryPolicy<Result> {
  canRun?(): boolean
  onUnavailable?(
    reason: 'history-missing' | 'cannot-apply' | 'empty',
    action: 'undo' | 'redo'
  ): Result
  onSuccess?(
    result: Result,
    action: 'undo' | 'redo'
  ): void
  onFailure?(
    result: Result,
    action: 'undo' | 'redo'
  ): void
  confirmOnSuccess?: boolean
  cancelOnFailure?: 'restore' | 'invalidate' | false
}

interface HistoryPortRuntime<
  Op,
  Key,
  W extends Write<any, Op, Key, any>
> {
  controller(): HistoryController<Op, Key, W> | undefined
  sync(): void
  observeRemote(changeId: string, footprint: readonly Key[]): void
  confirmPublished(input: {
    id: string
    footprint: readonly Key[]
  }): void
  cancelPending(mode: 'restore' | 'invalidate'): void
  withPolicy<Result extends {
    ok: boolean
  }>(
    policy?: HistoryPolicy<Result>
  ): HistoryPort<Result, Op, Key, W>
}

const HISTORY_PORT_RUNTIME = Symbol('shared.mutation.historyPortRuntime')

export interface HistoryPort<
  Result,
  Op = any,
  Key = any,
  W extends Write<any, Op, Key, any> = Write<any, Op, Key, any>
> extends store.ReadStore<HistoryPortState> {
  undo(): Result
  redo(): Result
  clear(): void
  withPolicy(
    policy?: HistoryPolicy<Result>
  ): HistoryPort<Result, Op, Key, W>
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
  historyController(): HistoryController<Op, Key, W> | undefined
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
  policy?: HistoryPolicy<Result>
): Result => (
  policy?.onUnavailable?.(reason, action)
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
  engine: HistoryPortEngine<Doc, Op, Key, Result, W>
): HistoryPort<Result, Op, Key, W> => {
  const controller = engine.historyController()
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
    kind: 'undo' | 'redo',
    policy?: HistoryPolicy<Result>
  ): Result => {
    if (!controller) {
      return readUnavailable('history-missing', kind, 'History is unavailable.', policy)
    }

    if (policy?.canRun && !policy.canRun()) {
      return readUnavailable('cannot-apply', kind, 'History cannot apply right now.', policy)
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
        policy
      )
    }

    publish()

    const result = engine.apply(operations, {
      origin: 'history'
    })
    if (!result.ok) {
      policy?.onFailure?.(result, kind)
      if (policy?.cancelOnFailure !== false) {
        controller.cancel(policy?.cancelOnFailure ?? 'restore')
      }
      publish()
      return result
    }

    policy?.onSuccess?.(result, kind)
    if (policy?.confirmOnSuccess ?? true) {
      controller.confirm()
    }
    publish()
    return result
  }

  const runtime: HistoryPortRuntime<Op, Key, W> = {
    controller: () => controller,
    sync: publish,
    observeRemote: (changeId, footprint) => {
      if (controller?.observe(changeId, footprint)) {
        publish()
      }
    },
    confirmPublished: (input) => {
      if (controller?.confirm(input)) {
        publish()
      }
    },
    cancelPending: (mode) => {
      if (controller?.cancel(mode)) {
        publish()
      }
    },
    withPolicy: <PolicyResult extends {
      ok: boolean
    }>(
      policy?: HistoryPolicy<PolicyResult>
    ): HistoryPort<PolicyResult, Op, Key, W> => {
      const base = port as unknown as HistoryPort<PolicyResult, Op, Key, W>
      const scoped = {
        get: base.get,
        subscribe: base.subscribe,
        clear: () => base.clear(),
        undo: () => run('undo', policy as HistoryPolicy<Result> | undefined) as unknown as PolicyResult,
        redo: () => run('redo', policy as HistoryPolicy<Result> | undefined) as unknown as PolicyResult,
        withPolicy: (nextPolicy?: HistoryPolicy<PolicyResult>) => runtime.withPolicy(nextPolicy)
      } satisfies HistoryPort<PolicyResult, Op, Key, W>
      ;(scoped as HistoryPort<PolicyResult, Op, Key, W> & {
        [HISTORY_PORT_RUNTIME]?: HistoryPortRuntime<Op, Key, W>
      })[HISTORY_PORT_RUNTIME] = runtime
      return scoped
    }
  }

  const port = {
    get: state.get,
    subscribe: state.subscribe,
    clear: () => {
      if (controller?.clear()) {
        publish()
      }
    },
    undo: () => run('undo'),
    redo: () => run('redo'),
    withPolicy: (policy?: HistoryPolicy<Result>) => runtime.withPolicy(policy)
  } as HistoryPort<Result, Op, Key, W>
  ;(port as HistoryPort<Result, Op, Key, W> & {
    [HISTORY_PORT_RUNTIME]?: HistoryPortRuntime<Op, Key, W>
  })[HISTORY_PORT_RUNTIME] = runtime
  return port
}

export const readHistoryPortRuntime = <
  Result,
  Op,
  Key,
  W extends Write<any, Op, Key, any>
>(
  history: HistoryPort<Result, Op, Key, W>
): HistoryPortRuntime<Op, Key, W> => (
  history as HistoryPort<Result, Op, Key, W> & {
    [HISTORY_PORT_RUNTIME]?: HistoryPortRuntime<Op, Key, W>
  }
)[HISTORY_PORT_RUNTIME] ?? ({
  controller: () => undefined,
  sync: () => {},
  observeRemote: () => {},
  confirmPublished: () => {},
  cancelPending: () => {},
  withPolicy: () => history as any
} as HistoryPortRuntime<Op, Key, W>)
