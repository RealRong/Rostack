import {
  CommandMutationEngine,
  type Origin as MutationOrigin
} from '@shared/mutation'
import { createRegistries } from '@whiteboard/core/kernel'
import { resolveBoardConfig } from '../config'
import type {
  CreateEngineOptions,
  Engine,
  EnginePublish
} from '../contracts/document'
import type {
  ExecuteResult,
  Intent,
  IntentKind
} from '../contracts/intent'
import { createWhiteboardMutationSpec } from '../mutation'
import { failure } from '../result'
import type {
  WhiteboardMutationExtra,
  WhiteboardMutationKey
} from '../mutation/types'
import type { WhiteboardMutationTable } from '@whiteboard/core/intent'
import type { Document, Operation } from '@whiteboard/core/types'

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
  config: overrides
}: CreateEngineOptions): Engine => {
  const config = resolveBoardConfig(overrides)
  const resolvedRegistries = registries ?? createRegistries()

  const core = new CommandMutationEngine<
    Document,
    WhiteboardMutationTable,
    Operation,
    WhiteboardMutationKey,
    EnginePublish,
    void,
    WhiteboardMutationExtra
  >({
    doc: document,
    spec: createWhiteboardMutationSpec({
      config,
      registries: resolvedRegistries
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
  const engine: Engine = {
    config,
    commits: core.commits,
    history: core.history,
    doc: () => core.doc(),
    current: () => core.current().publish,
    subscribe: (listener) => core.subscribe((current) => {
      listener(current.publish)
    }),
    execute: ((intent, options) => mapExecuteFailure(
      core.execute(intent as never, {
        origin: resolveIntentOrigin(intent, options?.origin)
      }) as ExecuteResult<IntentKind>
    )) as Engine['execute'],
    replace: (document, options) => core.replace(document, {
      origin: options?.origin ?? 'system'
    }),
    apply: (ops, options) => core.apply(ops, {
      origin: options?.origin ?? 'user'
    })
  }

  return engine
}
