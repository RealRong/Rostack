import type {
  DataDoc,
  Intent as CoreIntent
} from '@dataview/core/contracts'
import {
  document
} from '@dataview/core/document'
import {
  applyOperations,
  compileIntents,
  dataviewMutationKeyConflicts,
  type DataviewMutationKey,
  type DataviewTrace
} from '@dataview/core/mutation'
import type {
  DocumentOperation
} from '@dataview/core/contracts/operations'
import {
  applyResult,
  type CommandMutationSpec
} from '@shared/mutation'
import {
  meta as mutationMeta
} from '@shared/mutation'
import {
  operation
} from '@dataview/core/operation'
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
  && write.forward.some((entry) => mutationMeta.get(operation.meta, entry).sync === 'checkpoint')
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
    clone: document.clone,
    normalize: document.normalize,
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
    apply: ({ doc, ops }) => {
      const result = applyOperations(doc, ops)
      return result.ok
        ? applyResult.success(result)
        : applyResult.failure(result.error)
    },
    ...(historyConfig.enabled
      ? {
          history: {
            capacity: historyConfig.capacity,
            track: (write) => (
              shouldTrackOrigin(write.origin, historyConfig)
              && write.forward.every((entry) => mutationMeta.tracksHistory(operation.meta, entry))
            ),
            clear: (write) => shouldClearHistory(write, historyConfig),
            conflicts: dataviewMutationKeyConflicts
          }
        }
      : {})
  }
}
