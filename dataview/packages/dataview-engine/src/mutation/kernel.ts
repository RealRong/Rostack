import type {
  DataDoc,
  Intent as CoreIntent
} from '@dataview/core/contracts'
import {
  compileIntents,
  dataviewMutationOperations,
  type DataviewMutationKey,
  type DataviewTrace
} from '@dataview/core/mutation'
import {
  DATAVIEW_OPERATION_DEFINITIONS
} from '@dataview/core/operation/definition'
import type {
  DocumentOperation
} from '@dataview/core/contracts/operations'
import {
  type CommandMutationSpec
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
  origin: 'user' | 'remote' | 'system' | 'load' | 'history',
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
  write: {
    origin: 'user' | 'remote' | 'system' | 'load' | 'history'
    forward: readonly DocumentOperation[]
  },
  config: DataviewHistoryConfig
): boolean => (
  shouldTrackOrigin(write.origin, config)
  && write.forward.some((entry) => DATAVIEW_OPERATION_DEFINITIONS[entry.type].sync === 'checkpoint')
)

export type DataviewMutationKernel = Omit<
  CommandMutationSpec<
    DataDoc,
    DataviewIntentTable,
    DocumentOperation,
    DataviewMutationKey,
    DataviewPublish,
    DataviewMutationCache,
    {
      trace: DataviewTrace
    }
  >,
  'publish'
>

export const createDataviewMutationKernel = (input?: {
  history?: Partial<DataviewHistoryConfig>
}): DataviewMutationKernel => {
  const historyConfig = {
    ...DEFAULT_HISTORY_CONFIG,
    ...(input?.history ?? {})
  }

  return {
    normalize: (doc) => doc,
    compile: ({ doc, intents }) => {
      const result = compileIntents({
        document: doc,
        intents: intents as readonly CoreIntent[]
      })

      return {
        ops: result.ops,
        issues: result.issues,
        canApply: result.canApply,
        outputs: result.outputs
      }
    },
    operations: dataviewMutationOperations,
    ...(historyConfig.enabled
      ? {
          history: {
            capacity: historyConfig.capacity,
            track: ({
              origin,
              ops
            }) => (
              shouldTrackOrigin(origin, historyConfig)
              && ops.every((entry) => DATAVIEW_OPERATION_DEFINITIONS[entry.type].history !== false)
            ),
            clear: ({
              origin,
              ops
            }) => shouldClearHistory({
              origin,
              forward: ops
            }, historyConfig)
          }
        }
      : {
          history: false
        })
  }
}
