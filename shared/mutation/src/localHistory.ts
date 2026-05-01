import {
  store
} from '../../core/src/index'
import {
  mutationFailure
} from './engine'
import type {
  HistoryController,
  HistoryState
} from './history'
import type {
  ApplyCommit,
  CommitRecord,
  CommitStream,
  Origin,
} from './write'
import type {
  MutationProgram
} from './engine/program/program'

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

export interface HistorySyncPort<Footprint> {
  observeRemote(changeId: string, footprint: readonly Footprint[]): void
  confirmPublished(input: {
    id: string
    footprint: readonly Footprint[]
  }): void
  cancel(mode: 'restore' | 'invalidate'): void
}

export interface HistoryPort<
  Result,
  Program = MutationProgram<string>,
  Footprint = any,
  Commit extends ApplyCommit<any, any, Footprint, any> = ApplyCommit<any, any, Footprint, any>
> extends store.ReadStore<HistoryPortState> {
  readonly sync: HistorySyncPort<Footprint>
  undo(): Result
  redo(): Result
  clear(): void
  withPolicy(
    policy?: HistoryPolicy<Result>
  ): HistoryPort<Result, Program, Footprint, Commit>
}

export interface HistoryPortEngine<
  Doc,
  Program,
  Footprint,
  Result extends {
    ok: boolean
  },
  Commit extends ApplyCommit<Doc, any, Footprint, any> = ApplyCommit<Doc, any, Footprint, any>
> {
  apply(
    program: Program,
    options?: {
      origin?: Origin
    }
  ): Result
  commits: CommitStream<CommitRecord<Doc, any, Footprint, any>>
  historyController(): HistoryController<Program, Footprint, Commit> | undefined
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
  Program,
  Footprint,
  Result extends {
    ok: boolean
  },
  Commit extends ApplyCommit<Doc, any, Footprint, any> = ApplyCommit<Doc, any, Footprint, any>
>(
  engine: HistoryPortEngine<Doc, Program, Footprint, Result, Commit>
): HistoryPort<Result, Program, Footprint, Commit> => {
  const controller = engine.historyController()
  const state = store.value<HistoryPortState>({
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

    const program = kind === 'undo'
      ? controller.undo()
      : controller.redo()
    if (!program) {
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

    const result = engine.apply(program, {
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

  const sync: HistorySyncPort<Footprint> = {
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
    cancel: (mode) => {
      if (controller?.cancel(mode)) {
        publish()
      }
    }
  }

  const withPolicy = <PolicyResult extends {
    ok: boolean
  }>(
    policy?: HistoryPolicy<PolicyResult>
  ): HistoryPort<PolicyResult, Program, Footprint, Commit> => ({
    get: state.get,
    subscribe: state.subscribe,
    sync,
    clear: () => {
      if (controller?.clear()) {
        publish()
      }
    },
    undo: () => run('undo', policy as HistoryPolicy<Result> | undefined) as unknown as PolicyResult,
    redo: () => run('redo', policy as HistoryPolicy<Result> | undefined) as unknown as PolicyResult,
    withPolicy: (nextPolicy?: HistoryPolicy<PolicyResult>) => withPolicy(nextPolicy)
  })

  return withPolicy<Result>()
}
