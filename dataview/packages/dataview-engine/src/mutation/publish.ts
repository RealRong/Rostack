import type {
  DataDoc
} from '@dataview/core/contracts'
import type {
  DocumentOperation
} from '@dataview/core/contracts/operations'
import {
  dataviewTrace,
  type DataviewMutationKey,
  type DataviewTrace
} from '@dataview/core/mutation'
import type {
  MutationPublishSpec
} from '@shared/mutation'
import {
  emptyNormalizedIndexDemand
} from '@dataview/engine/active/index/demand'
import {
  createIndexProjectionRuntime
} from '@dataview/engine/active/index/projection'
import {
  resolveViewPlan
} from '@dataview/engine/active/plan'
import {
  createActiveProjectionRuntime
} from '@dataview/engine/active/projection/runtime'
import {
  createBaseImpact
} from '@dataview/engine/active/projection/impact'
import {
  createDocumentReadContext
} from '@dataview/engine/document/reader'
import { now } from '@dataview/engine/runtime/clock'
import {
  summarizeTrace,
  toPerformanceKind,
  type PerformanceRuntime
} from '@dataview/engine/runtime/performance'
import type {
  CommitTrace,
  IndexStageTrace,
  IndexTrace
} from '@dataview/engine/contracts/performance'
import { createDocumentProjectionRuntime } from './projection/document'
import type {
  DataviewMutationCache,
  DataviewPublish
} from './types'

const createEmptyIndexStageTrace = (): IndexStageTrace => ({
  action: 'reuse',
  changed: false,
  durationMs: 0
})

const createEmptyIndexTrace = (): IndexTrace => ({
  changed: false,
  timings: {
    totalMs: 0
  },
  records: createEmptyIndexStageTrace(),
  search: createEmptyIndexStageTrace(),
  bucket: createEmptyIndexStageTrace(),
  sort: createEmptyIndexStageTrace(),
  summaries: createEmptyIndexStageTrace()
})

const createDataviewMutationCache = (input: {
  doc: DataDoc
  trace: DataviewTrace
  activeProjection: ReturnType<typeof createActiveProjectionRuntime>
  indexProjection: ReturnType<typeof createIndexProjectionRuntime>
}): {
  publish: DataviewPublish
  cache: DataviewMutationCache
} => {
  const read = createDocumentReadContext(input.doc)
  const plan = resolveViewPlan(read, read.activeViewId)
  input.indexProjection.update({
    document: input.doc,
    demand: plan?.index ?? emptyNormalizedIndexDemand()
  })
  const index = input.indexProjection.capture()
  const active = input.activeProjection.update({
    read: {
      reader: read.reader
    },
    view: {
      plan
    },
    index: {
      state: index.state
    },
    impact: createBaseImpact(input.trace)
  }).snapshot

  return {
    publish: {
      ...(active
        ? { active }
        : {})
    },
    cache: {
      ...(plan
        ? { plan }
        : {}),
      index: index.state
    }
  }
}

const appendResetDelta = (
  publish: DataviewPublish
): DataviewPublish => ({
  ...publish,
  delta: {
    doc: {
      reset: true
    },
    active: {
      reset: true
    }
  }
})

export const createDataviewPublishSpec = (input?: {
  performance?: PerformanceRuntime
}): MutationPublishSpec<
  DataDoc,
  DocumentOperation,
  DataviewMutationKey,
  {
    trace: DataviewTrace
  },
  DataviewPublish,
  DataviewMutationCache
> => {
  let activeProjection = createActiveProjectionRuntime()
  let indexProjection = createIndexProjectionRuntime()
  let documentProjection = createDocumentProjectionRuntime()
  let bootstrapped = false

  return {
    init: (doc) => {
      activeProjection = createActiveProjectionRuntime()
      indexProjection = createIndexProjectionRuntime()
      documentProjection = createDocumentProjectionRuntime()
      const runtime = createDataviewMutationCache({
        doc,
        trace: dataviewTrace.reset(undefined, doc),
        activeProjection,
        indexProjection
      })
      const shouldReset = bootstrapped
      bootstrapped = true

      return shouldReset
        ? {
            publish: appendResetDelta(runtime.publish),
            cache: runtime.cache
          }
        : runtime
    },
    reduce: ({ prev, doc, write }) => {
      const perf = input?.performance
      const startedAt = now()
      const trace = write.extra.trace
      const impact = createBaseImpact(trace)
      const read = createDocumentReadContext(doc)
      const plan = resolveViewPlan(read, read.activeViewId)
      indexProjection.update({
        document: doc,
        demand: plan?.index ?? emptyNormalizedIndexDemand(),
        impact
      })
      const index = indexProjection.capture()
      const active = activeProjection.update({
        read: {
          reader: read.reader
        },
        view: {
          plan,
          previousPlan: prev.cache.plan
        },
        index: {
          state: index.state,
          ...(index.delta
            ? {
                delta: index.delta
              }
            : {})
        },
        impact
      })

      const outputStart = now()
      documentProjection.update({
        previous: prev.doc,
        next: doc,
        trace
      })
      const docDelta = documentProjection.capture()
      const activeDelta = active.delta
      const delta = docDelta || activeDelta
        ? {
            ...(docDelta
              ? { doc: docDelta }
              : {}),
            ...(activeDelta
              ? { active: activeDelta }
              : {})
          }
        : undefined
      const outputMs = now() - outputStart
      const performanceTrace: Omit<CommitTrace, 'id'> | undefined = perf?.enabled
        ? {
            kind: toPerformanceKind(write.origin),
            timings: {
              totalMs: now() - startedAt,
              indexMs: index.trace?.timings.totalMs,
              viewMs: active.trace.view.timings.totalMs,
              outputMs,
              snapshotMs: active.trace.snapshotMs
            },
            impact: summarizeTrace(trace),
            index: index.trace ?? createEmptyIndexTrace(),
            view: active.trace.view,
            snapshot: active.trace.snapshot
          }
        : undefined

      if (performanceTrace && perf) {
        perf.recordCommit(performanceTrace)
      }

      return {
        publish: {
          ...(active.snapshot
            ? { active: active.snapshot }
            : {}),
          ...(delta
            ? { delta }
            : {})
        },
        cache: {
          ...(plan
            ? { plan }
            : {}),
          index: index.state
        }
      }
    }
  }
}
