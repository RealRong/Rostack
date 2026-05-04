import type {
  DataDoc
} from '@dataview/core/types'
import {
  compile
} from '@dataview/core/mutation'
import {
  dataviewMutationSchema,
  createDataviewChange,
  createDataviewQuery,
} from '@dataview/core/mutation'
import {
  createMutationChange,
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
  createDataviewResolvedContext
} from '@dataview/engine/active/frame'
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
    compile,
    services: undefined,
    history: historyConfig.enabled
  })
  const currentListeners = new Set<(current: DataviewCurrent) => void>()
  const commitListeners = new Set<(commit: EngineCommit) => void>()
  let currentRevision = 0
  const toDataDoc = (document: ReturnType<typeof mutationEngine.document>): DataDoc => document as DataDoc
  const toEngineCommit = (commit: ReturnType<typeof mutationEngine.apply>): EngineCommit => {
    const document = toDataDoc(commit.document)

    return {
      ...commit,
      document,
      change: createDataviewChange(
        createDataviewQuery(document),
        commit.change
      )
    }
  }

  const initialDocument = toDataDoc(mutationEngine.document())
  projection.update({
    document: initialDocument,
    change: createDataviewChange(
      createDataviewQuery(initialDocument),
      createMutationChange(dataviewMutationSchema, [], {
        reset: true
      })
    )
  })
  const source = createEngineSource({
    readDocument: () => toDataDoc(mutationEngine.document()),
    subscribeDocument: (listener) => mutationEngine.subscribe((commit) => {
      listener(toEngineCommit(commit))
    }),
    projection
  })

  const readCurrent = (): DataviewCurrent => {
    const document = toDataDoc(mutationEngine.document())
    const context = createDataviewResolvedContext(document)
    return {
      rev: currentRevision,
      doc: document,
      active: projection.read.active.snapshot(),
      docActiveViewId: context.activeViewId,
      docActiveView: context.activeView
    }
  }

  mutationEngine.subscribe((rawCommit) => {
    const commit = toEngineCommit(rawCommit)
    currentRevision += 1
    const startedAt = now()
    const projectionResult = projection.update({
      document: commit.document,
      change: commit.change
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
    if (Array.isArray(input)) {
      const result = mutationEngine.execute(input, executeOptions)
      if (!result.ok) {
        return result as ExecuteResultOf<I>
      }

      return {
        ok: true,
        data: result.data,
        commit: toEngineCommit(result.commit)
      } as ExecuteResultOf<I>
    }

    const result = mutationEngine.execute(input as Intent, executeOptions)
    if (!result.ok) {
      return result as ExecuteResultOf<I>
    }

    return {
      ok: true,
      data: result.data,
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
    doc: () => toDataDoc(mutationEngine.document()),
    replace: (nextDocument: DataDoc, replaceOptions?: MutationOptions) => {
      const commit = mutationEngine.replace(nextDocument, replaceOptions)
      return toEngineCommit(commit)
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
