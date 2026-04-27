import type {
  DataDoc
} from '@dataview/core/contracts'
import {
  dataviewTrace,
  type DataviewTrace
} from '@dataview/core/mutation'
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
  createBaseImpact
} from '@dataview/engine/active/projection/impact'
import {
  createActiveProjectionRuntime
} from '@dataview/engine/active/projection/runtime'
import {
  createDocumentReadContext
} from '@dataview/engine/document/reader'
import { createDocumentProjectionRuntime } from './document'
import type {
  DataviewMutationCache,
  DataviewPublish
} from '../types'

export interface DataviewPublishProjectionState {
  activeProjection: ReturnType<typeof createActiveProjectionRuntime>
  indexProjection: ReturnType<typeof createIndexProjectionRuntime>
  documentProjection: ReturnType<typeof createDocumentProjectionRuntime>
}

export const createDataviewPublishProjectionState = (): DataviewPublishProjectionState => ({
  activeProjection: createActiveProjectionRuntime(),
  indexProjection: createIndexProjectionRuntime(),
  documentProjection: createDocumentProjectionRuntime()
})

export const captureDataviewPublishProjection = (input: {
  doc: DataDoc
  trace: DataviewTrace
  state: Pick<
    DataviewPublishProjectionState,
    'activeProjection' | 'indexProjection'
  >
}): {
  publish: DataviewPublish
  cache: DataviewMutationCache
} => {
  const read = createDocumentReadContext(input.doc)
  const plan = resolveViewPlan(read, read.activeViewId)
  input.state.indexProjection.update({
    document: input.doc,
    demand: plan?.index ?? emptyNormalizedIndexDemand()
  })
  const index = input.state.indexProjection.capture()
  const active = input.state.activeProjection.update({
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

export const appendResetDelta = (
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

export const createBootstrapDataviewPublishProjectionCapture = (input: {
  doc: DataDoc
  state: Pick<
    DataviewPublishProjectionState,
    'activeProjection' | 'indexProjection'
  >
}): {
  publish: DataviewPublish
  cache: DataviewMutationCache
} => captureDataviewPublishProjection({
  doc: input.doc,
  trace: dataviewTrace.reset(undefined, input.doc),
  state: input.state
})
