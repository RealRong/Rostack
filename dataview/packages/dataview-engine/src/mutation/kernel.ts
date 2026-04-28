import type {
  DataDoc,
} from '@dataview/core/types'
import {
  compile,
  definitions,
  spec,
  type DataviewMutationKey,
  type DataviewTrace
} from '@dataview/core/operations'
import type {
  DocumentOperation
} from '@dataview/core/types/operations'
import {
  type MutationCompileInput
} from '@shared/mutation'
import type {
  DataviewHistoryConfig
} from '@dataview/engine/contracts/history'
import type {
  DataviewIntentTable
} from '@dataview/engine/types/intent'
import type {
  DataviewMutationCache,
  DataviewPublish
} from './types'

const DEFAULT_HISTORY_CONFIG: DataviewHistoryConfig = {
  enabled: true,
  capacity: 100,
  captureSystem: false,
  captureRemote: false
}

const shouldTrackOrigin = (
  origin: 'user' | 'remote' | 'system' | 'history',
  config: DataviewHistoryConfig
): boolean => {
  switch (origin) {
    case 'user':
      return true
    case 'system':
      return config.captureSystem
    case 'remote':
      return config.captureRemote
    default:
      return false
  }
}

const shouldClearHistory = (
  commit: {
    origin: 'user' | 'remote' | 'system' | 'history'
    forward: readonly DocumentOperation[]
  },
  config: DataviewHistoryConfig
): boolean => (
  shouldTrackOrigin(commit.origin, config)
  && commit.forward.some((entry) => definitions[entry.type].sync === 'checkpoint')
)

export const createDataviewMutationKernel = (input?: {
  history?: Partial<DataviewHistoryConfig>
}) => {
  const historyConfig = {
    ...DEFAULT_HISTORY_CONFIG,
    ...(input?.history ?? {})
  }

  return {
    normalize: (doc: DataDoc) => doc,
    key: {
      serialize: spec.serializeKey,
      ...(spec.conflicts
        ? {
            conflicts: spec.conflicts
          }
        : {})
    },
    operations: spec.table,
    reduce: {
      ...(spec.createContext
        ? {
            createContext: spec.createContext
          }
        : {}),
      ...(spec.validate
        ? {
            validate: spec.validate
          }
        : {}),
      ...(spec.settle
        ? {
            settle: spec.settle
          }
        : {}),
      done: spec.done
    },
    compile: ({
      doc,
      intents
    }: MutationCompileInput<DataDoc, import('@dataview/core/types').Intent>) => {
      const result = compile({
        document: doc,
        intents
      })

      return {
        ops: result.ops,
        issues: result.issues,
        canApply: result.canApply,
        outputs: result.outputs
      }
    },
    ...(historyConfig.enabled
      ? {
          history: {
            capacity: historyConfig.capacity,
            track: ({
              origin,
              ops
            }: {
              origin: 'user' | 'remote' | 'system' | 'history'
              ops: readonly DocumentOperation[]
            }) => (
              shouldTrackOrigin(origin, historyConfig)
              && ops.every((entry: DocumentOperation) => definitions[entry.type].history !== false)
            ),
            clear: ({
              origin,
              ops
            }: {
              origin: 'user' | 'remote' | 'system' | 'history'
              ops: readonly DocumentOperation[]
            }) => shouldClearHistory({
              origin,
              forward: ops
            }, historyConfig)
          }
        }
      : {
          history: false as const
        })
  }
}
