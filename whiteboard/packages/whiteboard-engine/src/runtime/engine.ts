import {
  MutationEngine,
  type Origin as MutationOrigin
} from '@shared/mutation'
import { createRegistries } from '@whiteboard/core/kernel'
import { resolveBoardConfig } from '../config'
import type {
  CreateEngineOptions,
  Engine,
  EngineHistoryConfig,
  EnginePublish
} from '../contracts/document'
import type {
  ExecuteResult,
  Intent,
  IntentKind
} from '../contracts/intent'
import { createWhiteboardMutationSpec } from '../mutation'
import { DEFAULT_ENGINE_HISTORY_CONFIG } from '../mutation/spec'
import { failure } from '../result'

const resolveIntentOrigin = (
  intent: Intent,
  origin?: MutationOrigin
): MutationOrigin => {
  const intentOrigin = (
    'origin' in intent
      ? intent.origin
      : undefined
  ) as import('@whiteboard/core/types').Origin | undefined

  return origin
    ?? intentOrigin
    ?? 'user'
}

const readPublish = (
  publish?: EnginePublish
): EnginePublish => {
  if (!publish) {
    throw new Error('Whiteboard engine publish is unavailable.')
  }
  return publish
}

const mapExecuteFailure = <K extends IntentKind>(
  result: ExecuteResult<K>
): ExecuteResult<K> => {
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
  ) as ExecuteResult<K>
}

export const createEngine = ({
  registries,
  document,
  onDocumentChange,
  config: overrides,
  history
}: CreateEngineOptions): Engine => {
  const config = resolveBoardConfig(overrides)
  const resolvedRegistries = registries ?? createRegistries()
  const resolvedHistory: EngineHistoryConfig = {
    ...DEFAULT_ENGINE_HISTORY_CONFIG,
    ...(history ?? {})
  }

  const core = new MutationEngine({
    doc: document,
    spec: createWhiteboardMutationSpec({
      config,
      registries: resolvedRegistries,
      history: resolvedHistory
    })
  })

  if (onDocumentChange) {
    let currentDocument = core.current().doc
    core.subscribe((current) => {
      if (current.doc === currentDocument) {
        return
      }
      currentDocument = current.doc
      onDocumentChange(current.doc)
    })
  }

  return {
    config,
    writes: core.writes,
    history: core.history,
    current: () => readPublish(core.current().publish),
    subscribe: (listener) => core.subscribe((current) => {
      listener(readPublish(current.publish))
    }),
    execute: ((intent, options) => mapExecuteFailure(
      core.execute(intent as never, {
        origin: resolveIntentOrigin(intent, options?.origin)
      }) as ExecuteResult<IntentKind>
    )) as Engine['execute'],
    apply: (ops, options) => core.apply(ops, {
      origin: options?.origin ?? 'user'
    })
  }
}
