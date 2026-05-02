import {
  type MutationDeltaOf,
  type MutationOrigin,
} from '@shared/mutation'
import {
  MutationEngine,
  type MutationResult,
  type MutationOptions
} from '@shared/mutation'
import type {
  WhiteboardCompileIds,
  WhiteboardCompileContext,
  WhiteboardCompileServices,
  WhiteboardIntent,
  whiteboardCompileHandlers
} from '@whiteboard/core/mutation'
import type {
  WhiteboardReader,
} from '@whiteboard/core/query'
import {
  isCheckpointProgram,
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
  Engine
} from '../contracts/document'
import type {
  ExecuteResult,
  Intent,
  IntentKind
} from '../contracts/intent'
import { failure } from '../result'
import type { Document, ResultCode } from '@whiteboard/core/types'
import type { WhiteboardMutationDelta } from '../mutation'

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

const mapExecuteFailure = <
  TResult extends MutationResult<unknown, import('../types/engineWrite').EngineApplyCommit, string>
>(
  result: TResult
): TResult => {
  if (result.ok) {
    return result
  }
  if (
    result.error.code !== 'mutation_engine.compile.blocked'
    || typeof result.error.details !== 'object'
    || result.error.details === null
    || !('issues' in result.error.details)
  ) {
    return result
  }

  const issues = (result.error.details as {
    issues?: readonly {
      code: string
      message: string
      details?: unknown
    }[]
  }).issues
  const issue = issues?.[0]
  if (!issue || (issue.code !== 'invalid' && issue.code !== 'cancelled')) {
    return result
  }

  return failure(
    issue.code,
    issue.message,
    issue.details
  ) as TResult
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

  const core = new MutationEngine<
    Document,
    WhiteboardIntent,
    WhiteboardReader,
    WhiteboardCompileServices,
    string,
    import('@shared/mutation').MutationWriter<typeof whiteboardMutationSchema>,
    WhiteboardMutationDelta,
    Pick<WhiteboardCompileContext, 'query' | 'expect'>,
    typeof whiteboardCompileHandlers
  >({
    schema: whiteboardMutationSchema,
    document,
    normalize: normalizeDocument,
    services,
    compile: whiteboardCompile,
    history: {
      capacity: 100,
      capture: {
        user: true,
        remote: false,
        system: false
      }
    }
  })

  core.subscribe((commit) => {
    if (commit.kind === 'apply' && isCheckpointProgram(commit.authored)) {
      core.history.clear()
    }
    if (onDocumentChange) {
      onDocumentChange(commit.document)
    }
  })

  const subscribeCurrent: Engine['subscribe'] = (listener) => core.subscribe((commit) => {
    listener({
      rev: commit.rev,
      doc: commit.document
    })
  })

  const engine: Engine = {
    config,
    commits: {
      subscribe: (listener: (commit: import('../types/engineWrite').EngineCommit) => void) => core.subscribe(listener)
    },
    history: core.history,
    doc: () => core.document(),
    rev: () => core.current().rev,
    subscribe: subscribeCurrent,
    execute: <TIntent extends Intent>(
      intent: TIntent,
      options?: MutationOptions
    ): ExecuteResult<TIntent['type'] & IntentKind> => mapExecuteFailure(
      core.execute(intent, {
        origin: resolveIntentOrigin(intent, options?.origin)
      })
    ) as ExecuteResult<TIntent['type'] & IntentKind>,
    replace: (document, options) => core.replace(document, {
      origin: options?.origin ?? 'system'
    }),
    apply: (program, options) => core.apply(program, {
      origin: options?.origin ?? 'user'
    })
  }

  return engine
}
