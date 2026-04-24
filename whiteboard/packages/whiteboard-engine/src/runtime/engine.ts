import {
  MutationEngine,
  type Origin as MutationOrigin
} from '@shared/mutation'
import { createRegistries } from '@whiteboard/core/kernel'
import { META } from '@whiteboard/core/spec/operation'
import type { Operation } from '@whiteboard/core/types'
import { resolveBoardConfig } from '../config'
import type {
  CreateEngineOptions,
  Engine,
  EngineHistoryConfig,
  EnginePublish
} from '../contracts/document'
import { createWhiteboardMutationSpec } from '../mutation'
import { DEFAULT_ENGINE_HISTORY_CONFIG } from '../mutation/spec'
import type {
  ExecuteResult,
  Intent,
  IntentKind
} from '../types/intent'

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

const shouldTrackHistoryOrigin = (
  origin: MutationOrigin,
  config: EngineHistoryConfig
): boolean => {
  if (!config.enabled || origin === 'history' || origin === 'load') {
    return false
  }
  if (origin === 'system') {
    return config.captureSystem
  }
  if (origin === 'remote') {
    return config.captureRemote
  }
  return true
}

const shouldClearHistory = (
  write: {
    origin: MutationOrigin
    forward: readonly Operation[]
  },
  config: EngineHistoryConfig
): boolean => shouldTrackHistoryOrigin(write.origin, config)
  && write.forward.some((op) => META[op.type].sync === 'checkpoint')

const readPublish = (
  publish?: EnginePublish
): EnginePublish => {
  if (!publish) {
    throw new Error('Whiteboard engine publish is unavailable.')
  }
  return publish
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

  if (core.history) {
    core.writes.subscribe((write) => {
      if (shouldClearHistory(write, resolvedHistory)) {
        core.history?.clear()
      }
    })
  }

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
    execute: ((intent, options) => core.execute(intent as never, {
      origin: resolveIntentOrigin(intent, options?.origin)
    }) as ExecuteResult<IntentKind>) as Engine['execute'],
    apply: (ops, options) => core.apply(ops, {
      origin: options?.origin ?? 'user'
    })
  }
}
