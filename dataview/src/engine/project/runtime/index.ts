import type {
  CommitDelta,
  DataDoc,
  ViewId
} from '@dataview/core/contracts'
import {
  createResetDelta
} from '@dataview/core/commit/delta'
import type {
  CalculationCollection
} from '@dataview/core/calculation'
import {
  createValueStore
} from '@shared/store'
import {
  createEngineIndex
} from '../../index/runtime'
import type {
  ActiveView,
  EnginePerfOptions,
  IndexTrace,
  PublishTrace,
  ProjectTrace,
  RecordSet,
  EngineProjectApi
} from '../../types'
import {
  now
} from '../../perf/shared'
import type {
  AppearanceList,
  FieldList,
  Section,
  SectionKey
} from '../types'
import {
  createProjectionDelta
} from './delta'
import {
  resolveIndexDemand
} from './demand'
import {
  runProjection
} from './run'
import {
  emptyProjectionState,
  emptyProjectState,
  type ProjectState
} from './state'

interface ProjectSyncTrace {
  timings: {
    totalMs: number
    indexMs?: number
    projectMs?: number
    publishMs?: number
  }
  index: IndexTrace
  project: ProjectTrace
  publish: PublishTrace
}

export interface ProjectSyncResult {
  state: ProjectState
  trace?: ProjectSyncTrace
}

export interface ProjectRuntime extends EngineProjectApi {
  clear: () => void
  state: () => ProjectState
  syncDocument: (document: DataDoc, delta?: CommitDelta) => ProjectSyncResult
}

const equalProjectValue = (
  previous: ProjectState[keyof ProjectState],
  next: ProjectState[keyof ProjectState]
) => Object.is(previous, next)

export const createProjectRuntime = (input: {
  document: DataDoc
  perf?: EnginePerfOptions
}): ProjectRuntime => {
  const stores = {
    view: createValueStore<ActiveView | undefined>({ initial: undefined }),
    filter: createValueStore<ProjectState['filter']>({ initial: undefined }),
    group: createValueStore<ProjectState['group']>({ initial: undefined }),
    search: createValueStore<ProjectState['search']>({ initial: undefined }),
    sort: createValueStore<ProjectState['sort']>({ initial: undefined }),
    records: createValueStore<RecordSet | undefined>({ initial: undefined }),
    sections: createValueStore<readonly Section[] | undefined>({ initial: undefined }),
    appearances: createValueStore<AppearanceList | undefined>({ initial: undefined }),
    fields: createValueStore<FieldList | undefined>({ initial: undefined }),
    calculations: createValueStore<ReadonlyMap<SectionKey, CalculationCollection> | undefined>({ initial: undefined })
  }
  const capturePerf = Boolean(input.perf?.trace || input.perf?.stats)
  const storeKeys = Object.keys(stores) as (keyof typeof stores)[]
  const index = createEngineIndex(
    input.document,
    resolveIndexDemand(input.document, input.document.activeViewId)
  )
  let currentProjection = emptyProjectionState()
  let currentPublished = emptyProjectState()

  const commitState = (
    next: ProjectState
  ): PublishTrace | undefined => {
    const changedStores = capturePerf
      ? storeKeys.flatMap(key => equalProjectValue(
          currentPublished[key],
          next[key]
        )
          ? []
          : [key])
      : []

    currentPublished = next
    stores.view.set(next.view)
    stores.filter.set(next.filter)
    stores.group.set(next.group)
    stores.search.set(next.search)
    stores.sort.set(next.sort)
    stores.records.set(next.records)
    stores.sections.set(next.sections)
    stores.appearances.set(next.appearances)
    stores.fields.set(next.fields)
    stores.calculations.set(next.calculations)

    return capturePerf
      ? {
          storeCount: storeKeys.length,
          changedStores
        }
      : undefined
  }

  const sync = (
    document: DataDoc,
    delta?: CommitDelta
  ): ProjectSyncResult => {
    const totalStart = capturePerf ? now() : 0
    const nextDelta = delta ?? createResetDelta(undefined, document)
    const indexResult = index.sync(
      document,
      nextDelta,
      resolveIndexDemand(document, document.activeViewId)
    )
    const projectionDelta = createProjectionDelta({
      document,
      activeViewId: document.activeViewId,
      delta: nextDelta,
      project: currentPublished
    })
    const runResult = runProjection({
      document,
      activeViewId: document.activeViewId as ViewId | undefined,
      delta: nextDelta,
      projectionDelta,
      index: indexResult.state,
      previousProjection: currentProjection,
      previousPublished: currentPublished,
      capturePerf
    })
    currentProjection = runResult.projection
    const publishStart = capturePerf ? now() : 0
    const publish = commitState(runResult.published)

    return {
      state: currentPublished,
      ...(capturePerf && indexResult.trace && runResult.trace && publish
        ? {
            trace: {
              timings: {
                totalMs: now() - totalStart,
                indexMs: indexResult.trace.timings.totalMs,
                projectMs: runResult.trace.timings.totalMs,
                publishMs: now() - publishStart
              },
              index: indexResult.trace,
              project: runResult.trace,
              publish
            }
          }
        : {})
    }
  }

  const runtime: ProjectRuntime = {
    ...stores,
    clear: () => {
      currentProjection = emptyProjectionState()
      commitState(emptyProjectState())
    },
    state: () => currentPublished,
    syncDocument: sync
  }

  sync(input.document, createResetDelta(undefined, input.document))

  return runtime
}
