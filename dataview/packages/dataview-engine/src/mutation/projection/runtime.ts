import type {
  DataviewPublishProjectionOptions,
  DataviewPublishProjectionRuntime,
  DataviewPublishProjectionUpdateInput
} from './types'
import {
  createDataviewCommitTrace
} from './trace'
import {
  appendResetDelta,
  captureDataviewPublishProjection,
  createBootstrapDataviewPublishProjectionCapture,
  createDataviewPublishProjectionState
} from './spec'
import {
  createDocumentReadContext
} from '@dataview/engine/document/reader'
import {
  emptyNormalizedIndexDemand
} from '@dataview/engine/active/index/demand'
import {
  resolveViewPlan
} from '@dataview/engine/active/plan'
import {
  createBaseImpact
} from '@dataview/engine/active/projection/impact'
import { now } from '@dataview/engine/runtime/clock'

export const createDataviewPublishProjectionRuntime = (
  options: DataviewPublishProjectionOptions = {}
): DataviewPublishProjectionRuntime => {
  let state = createDataviewPublishProjectionState()
  let bootstrapped = false

  return {
    reset: (doc) => {
      state = createDataviewPublishProjectionState()
      const capture = createBootstrapDataviewPublishProjectionCapture({
        doc,
        state
      })
      const shouldReset = bootstrapped
      bootstrapped = true

      return shouldReset
        ? {
            publish: appendResetDelta(capture.publish),
            cache: capture.cache
          }
        : capture
    },
    update: (input: DataviewPublishProjectionUpdateInput) => {
      const startedAt = now()
      const trace = input.write.extra.trace
      const impact = createBaseImpact(trace)
      const read = createDocumentReadContext(input.doc)
      const plan = resolveViewPlan(read, read.activeViewId)

      state.indexProjection.update({
        document: input.doc,
        demand: plan?.index ?? emptyNormalizedIndexDemand(),
        impact
      })
      const index = state.indexProjection.capture()
      const active = state.activeProjection.update({
        read: {
          reader: read.reader
        },
        view: {
          plan,
          previousPlan: input.prev.cache.plan
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
      state.documentProjection.update({
        previous: input.prev.doc,
        next: input.doc,
        trace
      })
      const docDelta = state.documentProjection.capture()
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
      const commitTrace = createDataviewCommitTrace({
        performance: options.performance,
        startedAt,
        write: input.write,
        trace,
        index: {
          trace: index.trace
        },
        active: {
          trace: active.trace
        },
        outputMs
      })

      if (commitTrace && options.performance) {
        options.performance.recordCommit(commitTrace)
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
