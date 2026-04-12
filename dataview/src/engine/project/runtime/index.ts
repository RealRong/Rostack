import type {
  CommitDelta,
  DataDoc,
  ViewId
} from '@dataview/core/contracts'
import {
  now
} from '../../perf/shared'
import {
  runProjection
} from './run'
import {
  emptyProjectionState,
  emptyProjectState,
  type ProjectionState,
  type ProjectState
} from './state'
import type {
  IndexState
} from '../../index/types'
import type {
  ProjectTrace,
  PublishTrace
} from '../../api/public'

const PROJECT_STORE_KEYS = [
  'view',
  'query',
  'records',
  'sections',
  'appearances',
  'fields',
  'calculations'
] as const satisfies readonly (keyof ProjectState)[]

const equalProjectValue = (
  previous: ProjectState[keyof ProjectState],
  next: ProjectState[keyof ProjectState]
) => Object.is(previous, next)

const createPublishTrace = (
  previous: ProjectState,
  next: ProjectState
): PublishTrace => ({
  storeCount: PROJECT_STORE_KEYS.length,
  changedStores: PROJECT_STORE_KEYS.flatMap(key => equalProjectValue(previous[key], next[key])
    ? []
    : [key])
})

export interface ProjectDeriveResult {
  state: ProjectState
  projection: ProjectionState
  trace?: {
    project: ProjectTrace
    publish: PublishTrace
    publishMs: number
  }
}

export const createProjectState = (input: {
  doc: DataDoc
  index: IndexState
  delta: CommitDelta
  capturePerf: boolean
}): ProjectDeriveResult => deriveProject({
  previous: emptyProjectState(),
  projection: emptyProjectionState(),
  doc: input.doc,
  index: input.index,
  delta: input.delta,
  capturePerf: input.capturePerf
})

export const deriveProject = (input: {
  previous: ProjectState
  projection: ProjectionState
  doc: DataDoc
  index: IndexState
  delta: CommitDelta
  capturePerf: boolean
}): ProjectDeriveResult => {
  const runResult = runProjection({
    document: input.doc,
    activeViewId: input.doc.activeViewId as ViewId | undefined,
    delta: input.delta,
    index: input.index,
    previousProjection: input.projection,
    previousPublished: input.previous,
    capturePerf: input.capturePerf
  })

  if (!input.capturePerf || !runResult.trace) {
    return {
      state: runResult.published,
      projection: runResult.projection
    }
  }

  const publishStart = now()
  const publish = createPublishTrace(input.previous, runResult.published)

  return {
    state: runResult.published,
    projection: runResult.projection,
    trace: {
      project: runResult.trace,
      publish,
      publishMs: now() - publishStart
    }
  }
}
