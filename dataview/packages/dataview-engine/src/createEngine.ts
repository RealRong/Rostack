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
  dataviewMutationSchema,
  type DataviewMutationDelta,
} from '@dataview/core/mutation'
import {
  createMutationDelta,
  createMutationEngine,
  type MutationWrite,
} from '@shared/mutation'
import { createActiveViewApi } from '@dataview/engine/active/api/active'
import { createFieldsApi } from '@dataview/engine/api/fields'
import { createRecordsApi } from '@dataview/engine/api/records'
import { createViewsApi } from '@dataview/engine/api/views'
import type {
  CreateEngineOptions,
  Engine,
  MutationOptions
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
import { now } from '@dataview/engine/runtime/clock'
import type {
  ExecuteInput,
  ExecuteResultOf,
  Intent,
} from '@dataview/engine/types/intent'

const DEFAULT_HISTORY_CONFIG = {
  enabled: true,
  capacity: 100,
  captureSystem: false,
  captureRemote: false
} as const

export const createEngine = (options: CreateEngineOptions): Engine => {
  const performance = createPerformanceRuntime(options.performance)
  const historyConfig = {
    ...DEFAULT_HISTORY_CONFIG,
    ...(options.history ?? {})
  }
  const projection = createDataviewProjection()
  const mutationEngine = createMutationEngine({
    schema: dataviewMutationSchema,
    document: options.document,
    normalize: documentApi.normalize,
    compile,
    services: undefined,
    history: historyConfig.enabled
  })
  const currentListeners = new Set<(current: DataviewCurrent) => void>()
  const commitListeners = new Set<(commit: EngineCommit) => void>()
  const asDataDoc = (document: unknown): DataDoc => document as DataDoc
  const toEngineCommit = (commit: ReturnType<typeof mutationEngine.apply>): EngineCommit => ({
    ...commit,
    document: asDataDoc(commit.document)
  })

  projection.update({
    document: asDataDoc(mutationEngine.current().document),
    delta: createMutationDelta(dataviewMutationSchema, [])
  })
  const source = createEngineSource({
    readDocument: () => asDataDoc(mutationEngine.document()),
    subscribeDocument: (listener) => mutationEngine.subscribe((commit) => {
      listener(toEngineCommit(commit))
    }),
    projection
  })

  const readCurrent = (): DataviewCurrent => {
    const current = mutationEngine.current()
    const document = asDataDoc(current.document)
    const context = createDataviewQueryContext(document)
    return {
      rev: current.rev,
      doc: document,
      active: projection.read.active.snapshot(),
      docActiveViewId: context.activeViewId,
      docActiveView: context.activeView
    }
  }

  mutationEngine.subscribe((rawCommit) => {
    const commit = toEngineCommit(rawCommit)
    const startedAt = now()
    const projectionResult = projection.update({
      document: commit.document,
      delta: commit.delta as DataviewMutationDelta
    })
    const commitTrace = createDataviewCommitTrace({
      performance,
      startedAt,
      commit,
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
      listener(commit)
    })
  })

  const execute = <I extends ExecuteInput>(
    input: I,
    executeOptions?: MutationOptions
  ): ExecuteResultOf<I> => {
    const result = mutationEngine.execute(
      input as Intent | readonly Intent[],
      executeOptions
    )
    if (!result.ok) {
      return result as ExecuteResultOf<I>
    }

    const data = Array.isArray(input)
      ? result.data
      : result.data[0]

    return {
      ok: true,
      data,
      commit: toEngineCommit(result.commit)
    } as ExecuteResultOf<I>
  }

  const engineBase = {
    current: readCurrent,
    subscribe: (listener: (current: DataviewCurrent) => void) => {
      currentListeners.add(listener)
      return () => {
        currentListeners.delete(listener)
      }
    },
    doc: () => asDataDoc(mutationEngine.document()),
    replace: (nextDocument: DataDoc, replaceOptions?: MutationOptions) => {
      const commit = mutationEngine.replace(nextDocument, replaceOptions)
      return {
        ...toEngineCommit(commit),
        previousDocument: asDataDoc(commit.previousDocument)
      }
    },
    execute,
    apply: (writes: readonly MutationWrite[], applyOptions?: MutationOptions) => (
      toEngineCommit(mutationEngine.apply(writes, applyOptions))
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
    history: {
      state: mutationEngine.history.state,
      canUndo: mutationEngine.history.canUndo,
      canRedo: mutationEngine.history.canRedo,
      undo: () => {
        const commit = mutationEngine.history.undo()
        return commit ? toEngineCommit(commit) : undefined
      },
      redo: () => {
        const commit = mutationEngine.history.redo()
        return commit ? toEngineCommit(commit) : undefined
      },
      clear: mutationEngine.history.clear
    },
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
