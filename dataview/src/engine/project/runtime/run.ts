import type {
  CommitDelta,
  DataDoc,
  ViewId
} from '@dataview/core/contracts'
import {
  getDocumentViewById
} from '@dataview/core/document'
import {
  buildNavState
} from '../nav'
import type {
  IndexState
} from '../../index/types'
import type {
  ProjectStageMetrics,
  ProjectStageName,
  ProjectStageTrace,
  ProjectTrace
} from '../../types'
import {
  now
} from '../../perf/shared'
import {
  buildQueryState
} from './query'
import {
  syncSectionState
} from './sections'
import {
  syncCalcState
} from './calc'
import {
  buildPublishedProjectState,
  createRecordSet
} from './publish'
import {
  buildStageMetrics
} from './trace'
import {
  emptyCalcState,
  type ProjectionAction,
  type ProjectionDelta,
  type ProjectionState,
  type ProjectState
} from './state'

interface ProjectRunResult {
  projection: ProjectionState
  published: ProjectState
  trace?: ProjectTrace
}

const equalProjectValue = (
  previous: ProjectState[keyof ProjectState],
  next: ProjectState[keyof ProjectState]
) => Object.is(previous, next)

export const runProjection = (input: {
  document: DataDoc
  activeViewId?: ViewId
  delta: CommitDelta
  projectionDelta: ProjectionDelta
  index: IndexState
  previousProjection: ProjectionState
  previousPublished: ProjectState
  capturePerf: boolean
}): ProjectRunResult => {
  const totalStart = now()
  const stageTraces: ProjectStageTrace[] = []
  const view = input.activeViewId
    ? getDocumentViewById(input.document, input.activeViewId)
    : undefined

  const traceStage = <T,>(
    stage: ProjectStageName,
    action: ProjectionAction,
    previousValue: T,
    nextValue: T,
    metrics?: ProjectStageMetrics
  ) => {
    if (!input.capturePerf) {
      return
    }

    stageTraces.push({
      stage,
      action,
      executed: action !== 'reuse',
      changed: !Object.is(previousValue, nextValue),
      durationMs: 0,
      ...(metrics ? { metrics } : {})
    })
  }

  const timeStage = <T,>(
    stage: ProjectStageName,
    action: ProjectionAction,
    run: () => T,
    previousValue: T,
    buildMetrics?: (nextValue: T) => ProjectStageMetrics | undefined
  ): T => {
    if (action === 'reuse') {
      traceStage(
        stage,
        action,
        previousValue,
        previousValue,
        buildMetrics?.(previousValue)
      )
      return previousValue
    }

    const start = input.capturePerf ? now() : 0
    const nextValue = run()
    if (input.capturePerf) {
      stageTraces.push({
        stage,
        action,
        executed: true,
        changed: !Object.is(previousValue, nextValue),
        durationMs: now() - start,
        ...(buildMetrics
          ? {
              metrics: buildMetrics(nextValue)
            }
          : {})
      })
    }
    return nextValue
  }

  const query = view
    ? timeStage(
        'query',
        input.projectionDelta.query.action,
        () => buildQueryState({
          document: input.document,
          view,
          index: input.index,
          previous: input.previousProjection.query
        }),
        input.previousProjection.query,
        nextValue => buildStageMetrics(
          'query',
          input.previousPublished.records,
          input.activeViewId
            ? createRecordSet(input.activeViewId, nextValue)
            : undefined
        )
      )
    : input.previousProjection.query

  const sections = view
    ? timeStage(
        'sections',
        input.projectionDelta.sections.action,
        () => syncSectionState({
          previous: input.previousProjection.sections,
          previousQuery: input.previousProjection.query,
          view,
          query,
          index: input.index,
          touchedRecords: input.projectionDelta.sections.touchedRecords,
          action: input.projectionDelta.sections.action
        }),
        input.previousProjection.sections
      )
    : input.previousProjection.sections

  const calc = view
    ? timeStage(
        'calc',
        input.projectionDelta.calc.action,
        () => syncCalcState({
          previous: input.previousProjection.calc,
          previousSections: input.previousProjection.sections,
          sections,
          view,
          index: input.index,
          action: input.projectionDelta.calc.action,
          touchedRecords: input.projectionDelta.calc.touchedRecords,
          touchedFields: input.projectionDelta.calc.touchedFields
        }),
        input.previousProjection.calc
      )
    : emptyCalcState()

  const nav = view
    ? timeStage(
        'nav',
        input.projectionDelta.nav.action,
        () => buildNavState({
          sections,
          previous: input.previousProjection.nav,
          previousSections: input.previousProjection.sections
        }),
        input.previousProjection.nav ?? {
          appearances: buildNavState({
            sections: input.previousProjection.sections
          }).appearances,
          sections: []
        },
        nextValue => buildStageMetrics(
          'nav',
          input.previousPublished.appearances,
          nextValue.appearances
        )
      )
    : undefined

  const published = timeStage(
    'adapters',
    input.projectionDelta.adapters.action,
    () => buildPublishedProjectState({
      document: input.document,
      view,
      activeViewId: input.activeViewId,
      query,
      calc,
      nav,
      index: input.index,
      previousProjection: input.previousProjection,
      previousPublished: input.previousPublished
    }),
    input.previousPublished
  )

  if (input.capturePerf) {
    const adaptersTrace = stageTraces.find(stage => stage.stage === 'adapters')
    if (adaptersTrace) {
      adaptersTrace.metrics = {
        changedSectionCount: 0,
        outputCount: Object.values(published).filter(Boolean).length
      }
    }
    const sectionsTrace = stageTraces.find(stage => stage.stage === 'sections')
    if (sectionsTrace) {
      sectionsTrace.metrics = buildStageMetrics(
        'sections',
        input.previousPublished.sections,
        published.sections
      )
      sectionsTrace.changed = !equalProjectValue(input.previousPublished.sections, published.sections)
    }
    const calcTrace = stageTraces.find(stage => stage.stage === 'calc')
    if (calcTrace) {
      calcTrace.metrics = buildStageMetrics(
        'calc',
        input.previousPublished.calculations,
        published.calculations
      )
      calcTrace.changed = !equalProjectValue(input.previousPublished.calculations, published.calculations)
    }
    const navTrace = stageTraces.find(stage => stage.stage === 'nav')
    if (navTrace) {
      navTrace.changed = !equalProjectValue(input.previousPublished.appearances, published.appearances)
    }
  }

  return {
    projection: {
      query,
      sections,
      calc,
      ...(nav ? { nav } : {})
    },
    published,
    ...(input.capturePerf
      ? {
          trace: {
            plan: {
              query: input.projectionDelta.query.action,
              sections: input.projectionDelta.sections.action,
              calc: input.projectionDelta.calc.action,
              nav: input.projectionDelta.nav.action,
              adapters: input.projectionDelta.adapters.action
            },
            timings: {
              totalMs: now() - totalStart
            },
            stages: stageTraces
          } satisfies ProjectTrace
        }
      : {})
  }
}
