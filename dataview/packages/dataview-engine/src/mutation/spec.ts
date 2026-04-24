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
  mutationApply,
  type MutationEngineSpec
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
  PerformanceRuntime
} from '@dataview/engine/runtime/performance'
import type {
  DataviewIntentTable
} from '@dataview/engine/types/intent'
import type {
  DataviewPublishState
} from './types'
import {
  createDataviewPublishSpec
} from './publish'

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

export const createDataviewMutationSpec = (input?: {
  history?: Partial<DataviewHistoryConfig>
  performance?: PerformanceRuntime
}): MutationEngineSpec<
  DataDoc,
  DataviewIntentTable,
  DocumentOperation,
  DataviewMutationKey,
  DataviewPublishState,
  void,
  {
    trace: DataviewTrace
  }
> => {
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
        ? mutationApply.success(result)
        : {
            ok: false as const,
            error: result.error
          }
    },
    publish: createDataviewPublishSpec({
      performance: input?.performance
    }),
    ...(historyConfig.enabled
      ? {
          history: {
            capacity: historyConfig.capacity,
            track: (write) => (
              shouldTrackOrigin(write.origin, historyConfig)
              && write.forward.every((entry) => mutationMeta.tracksHistory(operation.meta, entry))
            ),
            clear: (write) => (
              write.origin === 'load'
              || (
                write.origin !== 'history'
                && !shouldTrackOrigin(write.origin, historyConfig)
              )
            ),
            conflicts: dataviewMutationKeyConflicts
          }
        }
      : {})
  }
}
