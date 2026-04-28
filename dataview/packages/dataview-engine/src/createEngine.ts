import type {
  DataDoc
} from '@dataview/core/types'
import type {
  DocumentOperation
} from '@dataview/core/types/operations'
import type {
  DataviewReduceContext,
  DataviewTrace,
  ValidationCode
} from '@dataview/core/operations'
import {
  createDataviewCompileScope,
  dataviewIntentHandlers,
  dataviewOperationTable,
  dataviewReduceSpec
} from '@dataview/core/operations'
import {
  MutationEngine,
  type MutationFootprint,
  type MutationOptions
} from '@shared/mutation'
import { createActiveViewApi } from '@dataview/engine/active/api/active'
import { createFieldsApi } from '@dataview/engine/api/fields'
import { createRecordsApi } from '@dataview/engine/api/records'
import { createViewsApi } from '@dataview/engine/api/views'
import type {
  CreateEngineOptions,
  Engine
} from '@dataview/engine/contracts/api'
import type {
  DataviewCurrent
} from '@dataview/engine/contracts/result'
import type {
  DataviewMutationCache,
  DataviewPublish
} from './mutation/types'
import { createDataviewPublishSpec } from './mutation/publish'
import { createPerformanceRuntime } from '@dataview/engine/runtime/performance'
import type {
  DataviewIntentTable
} from '@dataview/engine/types/intent'

const DEFAULT_HISTORY_CONFIG = {
  enabled: true,
  capacity: 100,
  captureSystem: false,
  captureRemote: false
} as const

const createDataviewOperationsRuntime = () => ({
  table: dataviewOperationTable,
  ...(dataviewReduceSpec.createContext
    ? {
        createContext: dataviewReduceSpec.createContext
      }
    : {}),
  ...(dataviewReduceSpec.validate
    ? {
        validate: dataviewReduceSpec.validate
      }
    : {}),
  ...(dataviewReduceSpec.settle
    ? {
        settle: dataviewReduceSpec.settle
      }
    : {}),
  done: dataviewReduceSpec.done
}) as const

const shouldTrackHistory = (
  origin: 'user' | 'remote' | 'system' | 'history',
  capture: {
    captureSystem: boolean
    captureRemote: boolean
  },
  ops: readonly DocumentOperation[]
): boolean => {
  if (origin === 'history') {
    return false
  }

  const originAllowed = origin === 'user'
    || (origin === 'system' && capture.captureSystem)
    || (origin === 'remote' && capture.captureRemote)

  return originAllowed
    && ops.every((entry) => dataviewOperationTable[entry.type].history !== false)
}

const shouldClearHistory = (
  origin: 'user' | 'remote' | 'system' | 'history',
  capture: {
    captureSystem: boolean
    captureRemote: boolean
  },
  ops: readonly DocumentOperation[]
): boolean => (
  shouldTrackHistory(origin, capture, ops)
  && ops.some((entry) => dataviewOperationTable[entry.type].sync === 'checkpoint')
)

const toCurrent = (current: {
  rev: number
  doc: DataDoc
  publish: DataviewPublish
}): DataviewCurrent => ({
  rev: current.rev,
  doc: current.doc,
  publish: current.publish
})

export const createEngine = (options: CreateEngineOptions): Engine => {
  const performance = createPerformanceRuntime(options.performance)
  const operationsRuntime = createDataviewOperationsRuntime()
  const historyConfig = {
    ...DEFAULT_HISTORY_CONFIG,
    ...(options.history ?? {})
  }
  const mutationEngine = new MutationEngine<
    DataDoc,
    DataviewIntentTable,
    DocumentOperation,
    MutationFootprint,
    DataviewPublish,
    DataviewMutationCache,
    {
      trace: DataviewTrace
    },
    DataviewReduceContext,
    ReturnType<typeof createDataviewCompileScope>,
    ValidationCode
  >({
    document: options.document,
    normalize: (doc) => doc,
    operations: dataviewOperationTable,
    reduce: dataviewReduceSpec,
    compile: {
      handlers: dataviewIntentHandlers,
      createContext: createDataviewCompileScope,
      apply: ({
        doc,
        ops
      }) => {
        const reduced = MutationEngine.reduce({
          document: doc,
          ops,
          operations: operationsRuntime
        })

        return reduced.ok
          ? {
              ok: true as const,
              doc: reduced.doc
            }
          : {
              ok: false as const,
              issue: {
                code: 'compile.applyFailed',
                message: reduced.error.message,
                severity: 'error' as const,
                details: reduced.error.details
              }
            }
      }
    },
    publish: createDataviewPublishSpec({
      performance
    }),
    history: historyConfig.enabled
      ? {
          capacity: historyConfig.capacity,
          track: ({
            origin,
            ops
          }) => shouldTrackHistory(origin, historyConfig, ops),
          clear: ({
            origin,
            ops
          }) => shouldClearHistory(origin, historyConfig, ops)
        }
      : false
  })

  const engineBase = {
    current: () => toCurrent(mutationEngine.current()),
    subscribe: (listener: (current: DataviewCurrent) => void) => mutationEngine.subscribe((current) => {
      listener(toCurrent(current))
    }),
    doc: () => mutationEngine.doc(),
    replace: (nextDocument: DataDoc, replaceOptions?: MutationOptions) => (
      mutationEngine.replace(nextDocument, replaceOptions)
    ),
    execute: mutationEngine.execute.bind(mutationEngine),
    apply: ((operations: readonly DocumentOperation[], applyOptions?: MutationOptions) => (
      mutationEngine.apply(operations, applyOptions)
    ))
  }
  const engineWithInfra = {
    ...engineBase,
    commits: mutationEngine.commits,
    history: mutationEngine.history,
    performance: performance.api
  } satisfies Pick<
    Engine,
    'current' | 'subscribe' | 'doc' | 'replace' | 'execute' | 'apply' | 'commits' | 'history' | 'performance'
  >

  return {
    spec: options.spec,
    ...engineWithInfra,
    fields: createFieldsApi(engineBase),
    records: createRecordsApi(engineBase),
    views: createViewsApi(engineBase),
    active: createActiveViewApi(engineBase)
  }
}
