import {
  createMutationEngine,
  type MutationCommit,
  type MutationDocument,
  type MutationOrigin,
  type MutationResult,
  type MutationWrite,
} from '@shared/mutation'
import type {
  WhiteboardCompileIds,
  WhiteboardCompileServices,
  WhiteboardIntent,
} from '@whiteboard/core/mutation'
import {
  whiteboardCompile,
  whiteboardMutationSchema
} from '@whiteboard/core/mutation'
import {
  normalizeDocument
} from '@whiteboard/core/document'
import { createRegistries } from '@whiteboard/core/registry'
import { createId } from '@shared/core'
import { resolveBoardConfig } from '../config'
import type {
  CreateEngineOptions,
  Engine,
  MutationOptions,
} from '../contracts/document'
import type {
  ExecuteResult,
  Intent,
  IntentKind
} from '../contracts/intent'
import { cancelled, failure, success } from '../result'
import type { Document } from '@whiteboard/core/types'
import type { WhiteboardMutationDelta } from '../mutation'
import type {
  EngineApplyCommit,
  EngineCommit,
} from '../types/engineWrite'

type CoreCommit = MutationCommit<typeof whiteboardMutationSchema>
type WhiteboardMutationDocument = MutationDocument<typeof whiteboardMutationSchema>

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
  result: MutationResult<readonly unknown[], CoreCommit>
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

const toEngineCommit = (
  rev: number,
  commit: CoreCommit & {
    previousDocument?: unknown
  }
): EngineCommit => {
  if (commit.kind === 'replace') {
    return {
      kind: 'replace',
      rev,
      origin: commit.origin,
      document: commit.document as unknown as Document,
      delta: commit.delta as WhiteboardMutationDelta,
      inverse: commit.inverse,
      authored: commit.writes,
      previousDocument: (commit.previousDocument ?? commit.document) as unknown as Document
    }
  }

  return {
    kind: 'apply',
    rev,
    origin: commit.origin,
    document: commit.document as unknown as Document,
    delta: commit.delta as WhiteboardMutationDelta,
    inverse: commit.inverse,
    authored: commit.writes
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
  rev: number,
  result: MutationResult<readonly unknown[], CoreCommit>
): ExecuteResult<TIntent['type'] & IntentKind> => {
  if (result.ok) {
    return {
      ok: true,
      data: result.data[0] as ExecuteResult<TIntent['type'] & IntentKind> extends {
        ok: true
        data: infer TData
      }
        ? TData
        : never,
      commit: toApplyCommit(rev, result.commit)
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
    document: document as unknown as WhiteboardMutationDocument,
    normalize: (next) => normalizeDocument(next as unknown as Document) as unknown as WhiteboardMutationDocument,
    services,
    compile: whiteboardCompile,
    history: true
  })

  core.subscribe((commit) => {
    if (onDocumentChange) {
      onDocumentChange(commit.document as unknown as Document)
    }
  })

  const subscribeCurrent: Engine['subscribe'] = (listener) => core.subscribe((commit) => {
    listener({
      rev: core.current().rev,
      doc: commit.document as unknown as Document
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
        toApplyCommit(core.current().rev, commit),
        undefined
      )
    },
    redo: () => {
      const commit = core.history.redo()
      if (!commit) {
        return cancelled('Nothing to redo.')
      }
      return success(
        toApplyCommit(core.current().rev, commit),
        undefined
      )
    },
    clear: core.history.clear
  }

  const engine: Engine = {
    config,
    commits: {
      subscribe: (listener: (commit: import('../types/engineWrite').EngineCommit) => void) => core.subscribe((commit) => {
        listener(toEngineCommit(core.current().rev, commit))
      })
    },
    history,
    doc: () => core.document() as unknown as Document,
    rev: () => core.current().rev,
    subscribe: subscribeCurrent,
    execute: <TIntent extends Intent>(
      intent: TIntent,
      options?: MutationOptions
    ): ExecuteResult<TIntent['type'] & IntentKind> => mapExecuteResult<TIntent>(
      core.current().rev + 1,
      core.execute(intent, {
        origin: resolveIntentOrigin(intent, options?.origin)
      })
    ),
    replace: (document, options) => toEngineCommit(
      core.current().rev + 1,
      core.replace(document as unknown as WhiteboardMutationDocument, {
        origin: options?.origin ?? 'system',
        history: options?.history
      })
    ),
    apply: (writes: readonly MutationWrite[], options) => success(
      toApplyCommit(
        core.current().rev + 1,
        core.apply(writes, {
          origin: options?.origin ?? 'user',
          history: options?.history
        })
      ),
      undefined
    )
  }

  return engine
}
