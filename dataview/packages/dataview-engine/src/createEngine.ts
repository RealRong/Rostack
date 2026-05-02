import type {
  DataDoc
} from '@dataview/core/types'
import {
  document as documentApi
} from '@dataview/core/document'
import {
  compile
} from '@dataview/core/mutation'
import {
  createDataviewQueryContext,
  dataviewMutationModel,
  type DataviewMutationDelta,
  type DataviewMutationWriter
} from '@dataview/core/mutation'
import type {
  DocumentOperation
} from '@dataview/core/types'
import {
  createMutationDelta,
  MutationEngine
} from '@shared/mutation'
import type {
  MutationOptions
} from '@shared/mutation/engine'
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
  EngineCommit
} from '@dataview/engine/contracts/write'
import {
  createDataviewCommitTrace
} from '@dataview/engine/mutation/projection/trace'
import {
  createDataviewProjection
} from '@dataview/engine/projection'
import {
  createEngineSource
} from '@dataview/engine/source/createEngineSource'
import { createPerformanceRuntime } from '@dataview/engine/runtime/performance'
import type {
  MutationProgram
} from '@shared/mutation'
import type {
  DataviewIntentTable,
  DataviewErrorCode
} from '@dataview/engine/types/intent'

const DEFAULT_HISTORY_CONFIG = {
  enabled: true,
  capacity: 100,
  captureSystem: false,
  captureRemote: false
} as const

const EMPTY_MUTATION_CHANGES = Object.freeze(
  Object.create(null)
) as Record<string, never>

export const createEngine = (options: CreateEngineOptions): Engine => {
  const performance = createPerformanceRuntime(options.performance)
  const historyConfig = {
    ...DEFAULT_HISTORY_CONFIG,
    ...(options.history ?? {})
  }
  const projection = createDataviewProjection()
  const mutationEngine = new MutationEngine<
    DataDoc,
    DataviewIntentTable,
    DocumentOperation,
    ReturnType<typeof compile.createReader>,
    void,
    DataviewErrorCode,
    DataviewMutationWriter
  >({
    document: options.document,
    normalize: documentApi.normalize,
    model: dataviewMutationModel,
    createReader: compile.createReader,
    createWriter: compile.createWriter,
    compile: compile.handlers,
    history: historyConfig.enabled
      ? {
          capacity: historyConfig.capacity,
          capture: {
            user: true,
            system: historyConfig.captureSystem,
            remote: historyConfig.captureRemote
          }
        }
      : false
  })
  const currentListeners = new Set<(current: DataviewCurrent) => void>()
  const commitListeners = new Set<(commit: EngineCommit) => void>()

  projection.update({
    document: mutationEngine.current().document,
    delta: createMutationDelta(dataviewMutationModel, {
      reset: true,
      changes: EMPTY_MUTATION_CHANGES
    })
  })
  const source = createEngineSource({
    readDocument: () => mutationEngine.document(),
    subscribeDocument: (listener) => mutationEngine.subscribe((commit) => {
      listener(commit as EngineCommit)
    }),
    projection
  })

  const readCurrent = (): DataviewCurrent => {
    const current = mutationEngine.current()
    const context = createDataviewQueryContext(current.document)
    return {
      rev: current.rev,
      doc: current.document,
      active: projection.read.active.snapshot(),
      docActiveViewId: context.activeViewId,
      docActiveView: context.activeView
    }
  }

  mutationEngine.subscribe((commit) => {
    const nextCommit = commit as EngineCommit
    const projectionResult = projection.update({
      document: nextCommit.document,
      delta: createMutationDelta(
        dataviewMutationModel,
        nextCommit.delta
      ) as DataviewMutationDelta
    })
    const commitTrace = createDataviewCommitTrace({
      performance,
      startedAt: nextCommit.at,
      commit: nextCommit,
      index: {
        trace: projection.read.index.trace()
      },
      active: {
        trace: projection.read.publish.activeTrace(projectionResult.trace.totalMs)
      },
      outputMs: 0
    })

    if (commitTrace && performance.enabled) {
      performance.recordCommit(commitTrace)
    }

    const current = readCurrent()
    currentListeners.forEach((listener) => {
      listener(current)
    })
    commitListeners.forEach((listener) => {
      listener(nextCommit)
    })
  })

  const engineBase = {
    current: readCurrent,
    subscribe: (listener: (current: DataviewCurrent) => void) => {
      currentListeners.add(listener)
      return () => {
        currentListeners.delete(listener)
      }
    },
    doc: () => mutationEngine.document(),
    replace: (nextDocument: DataDoc, replaceOptions?: MutationOptions) => (
      mutationEngine.replace(nextDocument, replaceOptions)
    ),
    execute: mutationEngine.execute.bind(mutationEngine),
    apply: (program: MutationProgram<string>, applyOptions?: MutationOptions) => (
      mutationEngine.apply(program, applyOptions)
    )
  }
  const engineWithInfra = {
    ...engineBase,
    commits: {
      subscribe: (listener: (commit: EngineCommit) => void) => {
        commitListeners.add(listener)
        return () => {
          commitListeners.delete(listener)
        }
      }
    },
    history: mutationEngine.history,
    performance: performance.api
  } satisfies Pick<
    Engine,
    'current' | 'subscribe' | 'doc' | 'replace' | 'execute' | 'apply' | 'commits' | 'history' | 'performance'
  >

  return {
    spec: options.spec,
    ...engineWithInfra,
    source,
    fields: createFieldsApi(engineBase),
    records: createRecordsApi(engineBase),
    views: createViewsApi(engineBase),
    active: createActiveViewApi(engineBase)
  }
}
