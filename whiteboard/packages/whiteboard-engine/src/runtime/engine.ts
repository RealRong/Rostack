import { createId } from '@shared/core'
import {
  createMutationEngine,
  type MutationCommit,
  type MutationOrigin,
  type MutationResult,
  type MutationWrite,
} from '@shared/mutation'
import {
  normalizeDocument
} from '@whiteboard/core/document'
import {
  createWhiteboardChange,
  whiteboardCompile,
  whiteboardMutationSchema,
  type WhiteboardChange,
  type WhiteboardCompileIds,
  type WhiteboardCompileServices,
  type WhiteboardIntent,
} from '@whiteboard/core/mutation'
import { createWhiteboardQuery } from '@whiteboard/core/query'
import { createRegistries } from '@whiteboard/core/registry'
import type { Document } from '@whiteboard/core/types'
import { resolveBoardConfig } from '../config'
import type {
  CreateEngineOptions,
  Engine,
  MutationOptions,
} from '../contracts/document'
import type {
  ExecuteResult,
  Intent,
  IntentKind,
} from '../contracts/intent'
import { cancelled, failure, success } from '../result'
import type {
  EngineApplyCommit,
  EngineCommit,
} from '../types/engineWrite'

type CoreCommit = MutationCommit<typeof whiteboardMutationSchema>

const resolveIntentOrigin = (
  intent: Intent,
  origin?: MutationOrigin
): MutationOrigin => {
  const intentOrigin = (
    'origin' in intent
    && (
      intent.origin === 'user'
      || intent.origin === 'remote'
      || intent.origin === 'system'
    )
  )
    ? intent.origin
    : undefined

  return origin
    ?? intentOrigin
    ?? 'user'
}

const mapExecuteFailure = (
  result: MutationResult<unknown, CoreCommit>
): ExecuteResult => {
  if (result.ok) {
    throw new Error('mapExecuteFailure only accepts failed execute results.')
  }

  const issue = result.issues[0]
  if (!issue) {
    return failure(
      'invalid',
      'Mutation execution failed without issues.'
    )
  }

  return failure(
    issue.code,
    issue.message,
    issue.details
  )
}

const hasVisibleCommit = (
  commit: CoreCommit
): boolean => commit.change.reset() || commit.writes.length > 0

const toWhiteboardChange = (
  commit: CoreCommit
): WhiteboardChange => createWhiteboardChange(
  createWhiteboardQuery(() => commit.document),
  commit.change
)

const toEngineCommit = (
  rev: number,
  commit: CoreCommit & {
    previousDocument?: Document
  }
): EngineCommit => {
  if (commit.kind === 'replace') {
    return {
      kind: 'replace',
      rev,
      origin: commit.origin,
      document: commit.document,
      change: toWhiteboardChange(commit),
      inverse: commit.inverse,
      writes: commit.writes,
      previousDocument: commit.previousDocument ?? commit.document
    }
  }

  return {
    kind: 'apply',
    rev,
    origin: commit.origin,
    document: commit.document,
    change: toWhiteboardChange(commit),
    inverse: commit.inverse,
    writes: commit.writes
  }
}

const toApplyCommit = (
  rev: number,
  commit: CoreCommit
): EngineApplyCommit => {
  const mapped = toEngineCommit(rev, commit)
  if (mapped.kind !== 'apply') {
    throw new Error('Expected apply commit.')
  }
  return mapped
}

const mapExecuteResult = <TIntent extends Intent>(
  commit: EngineApplyCommit,
  result: MutationResult<unknown, CoreCommit>
): ExecuteResult<TIntent['type'] & IntentKind> => {
  if (result.ok) {
    return {
      ok: true,
      data: result.data as ExecuteResult<TIntent['type'] & IntentKind> extends {
        ok: true
        data: infer TData
      }
        ? TData
        : never,
      commit
    }
  }

  return mapExecuteFailure(result) as ExecuteResult<TIntent['type'] & IntentKind>
}

export const createEngine = ({
  registries,
  document,
  layout,
  onDocumentChange,
  config: overrides
}: CreateEngineOptions): Engine => {
  const config = resolveBoardConfig(overrides)
  const resolvedRegistries = registries ?? createRegistries()
  const ids: WhiteboardCompileIds = {
    node: () => createId('node'),
    edge: () => createId('edge'),
    edgeLabel: () => createId('edge_label'),
    edgeRoutePoint: () => createId('edge_point'),
    group: () => createId('group'),
    mindmap: () => createId('mindmap')
  }
  const services: WhiteboardCompileServices = {
    ids,
    registries: resolvedRegistries,
    layout
  }

  const core = createMutationEngine({
    schema: whiteboardMutationSchema,
    document,
    normalize: normalizeDocument,
    services,
    compile: whiteboardCompile,
    history: true
  })

  let currentRevision = 0
  let pendingReplacePreviousDocument: Document | undefined
  const commitRevisions = new WeakMap<CoreCommit, number>()

  const readCommitRevision = (
    commit: CoreCommit
  ): number => {
    const cached = commitRevisions.get(commit)
    if (cached !== undefined) {
      return cached
    }

    const nextRevision = hasVisibleCommit(commit)
      ? currentRevision + 1
      : currentRevision

    if (hasVisibleCommit(commit)) {
      currentRevision = nextRevision
    }

    commitRevisions.set(commit, nextRevision)
    return nextRevision
  }

  const mapCoreCommit = (
    commit: CoreCommit
  ): EngineCommit => toEngineCommit(
    readCommitRevision(commit),
    commit.kind === 'replace' && pendingReplacePreviousDocument
      ? {
          ...commit,
          previousDocument: pendingReplacePreviousDocument
        }
      : commit
  )

  core.subscribe((commit) => {
    readCommitRevision(commit)
    if (onDocumentChange) {
      onDocumentChange(commit.document)
    }
  })

  const subscribeCurrent: Engine['subscribe'] = (listener) => core.subscribe((commit) => {
    listener({
      rev: readCommitRevision(commit),
      doc: commit.document
    })
  })

  const history: Engine['history'] = {
    state: core.history.state,
    canUndo: core.history.canUndo,
    canRedo: core.history.canRedo,
    undo: () => {
      const commit = core.history.undo()
      if (!commit) {
        return cancelled('Nothing to undo.')
      }
      return success(
        toApplyCommit(readCommitRevision(commit), commit),
        undefined
      )
    },
    redo: () => {
      const commit = core.history.redo()
      if (!commit) {
        return cancelled('Nothing to redo.')
      }
      return success(
        toApplyCommit(readCommitRevision(commit), commit),
        undefined
      )
    },
    clear: core.history.clear
  }

  const engine: Engine = {
    config,
    commits: {
      subscribe: (listener: (commit: EngineCommit) => void) => core.subscribe((commit) => {
        listener(mapCoreCommit(commit))
      })
    },
    history,
    doc: () => core.document(),
    rev: () => currentRevision,
    subscribe: subscribeCurrent,
    execute: <TIntent extends Intent>(
      intent: TIntent,
      options?: MutationOptions
    ): ExecuteResult<TIntent['type'] & IntentKind> => {
      const result = core.execute(intent, {
        origin: resolveIntentOrigin(intent, options?.origin)
      })

      if (!result.ok) {
        return mapExecuteFailure(result) as ExecuteResult<TIntent['type'] & IntentKind>
      }

      return mapExecuteResult<TIntent>(
        toApplyCommit(readCommitRevision(result.commit), result.commit),
        result
      )
    },
    replace: (nextDocument, options) => {
      pendingReplacePreviousDocument = core.document()
      const commit = core.replace(nextDocument, {
        origin: options?.origin ?? 'system',
        history: options?.history
      })
      const mapped = mapCoreCommit(commit)
      pendingReplacePreviousDocument = undefined
      return mapped
    },
    apply: (writes: readonly MutationWrite[], options) => {
      const commit = core.apply(writes, {
        origin: options?.origin ?? 'user',
        history: options?.history
      })

      return success(
        toApplyCommit(readCommitRevision(commit), commit),
        undefined
      )
    }
  }

  return engine
}
