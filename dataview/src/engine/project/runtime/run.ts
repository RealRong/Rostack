import type {
  CommitDelta,
  DataDoc,
  ViewId
} from '@dataview/core/contracts'
import {
  getDocumentFields,
  getDocumentViewById
} from '@dataview/core/document'
import type {
  IndexState
} from '../../index/types'
import type {
  ProjectStageMetrics,
  ProjectStageName,
  ProjectStageTrace,
  ProjectTrace
} from '../../api/public'
import {
  now
} from '../../perf/shared'
import {
  runQueryStage
} from './query'
import {
  runSectionsStage
} from './sections'
import {
  runCalcStage
} from './calc'
import {
  publishViewState
} from '../publish/view'
import {
  buildStageMetrics
} from './trace'
import {
  emptyCalcState,
  emptyProjectionState,
  emptyProjectState,
  type ProjectionAction,
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

  const timeStage = <T extends { action: ProjectionAction },>(
    stage: ProjectStageName,
    run: () => T,
    previousPublishedValue: ProjectState[keyof ProjectState],
    readPublishedValue: (result: T) => ProjectState[keyof ProjectState],
    buildMetrics?: (result: T) => ProjectStageMetrics | undefined
  ): T => {
    const start = input.capturePerf ? now() : 0
    const result = run()
    if (input.capturePerf) {
      const nextPublishedValue = readPublishedValue(result)
      stageTraces.push({
        stage,
        action: result.action,
        executed: result.action !== 'reuse',
        changed: !Object.is(previousPublishedValue, nextPublishedValue),
        durationMs: now() - start,
        ...(buildMetrics
          ? {
              metrics: buildMetrics(result)
            }
          : {})
      })
    }
    return result
  }

  if (!view || !input.activeViewId) {
    return {
      projection: emptyProjectionState(),
      published: emptyProjectState(),
      ...(input.capturePerf
        ? {
            trace: {
              plan: {
                query: 'reuse',
                sections: 'reuse',
                calc: 'reuse'
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

  const activeViewId = input.activeViewId
  const previousViewId = input.previousPublished.view?.id
  const fieldsById = new Map(
    getDocumentFields(input.document).map(field => [field.id, field] as const)
  )

  const query = timeStage(
    'query',
    () => runQueryStage({
      document: input.document,
      activeViewId,
      previousViewId,
      delta: input.delta,
      view,
      index: input.index,
      previous: input.previousProjection.query,
      previousPublished: input.previousPublished.records
    }),
    input.previousPublished.records,
    result => result.records,
    result => buildStageMetrics(
      'query',
      input.previousPublished.records,
      result.records
    )
  )

  const sections = timeStage(
    'sections',
    () => runSectionsStage({
      activeViewId,
      previousViewId,
      delta: input.delta,
      view,
      query: query.state,
      previous: input.previousProjection.sections,
      previousQuery: input.previousProjection.query,
      previousPublished: {
        sections: input.previousPublished.sections,
        appearances: input.previousPublished.appearances
      },
      index: input.index
    }),
    input.previousPublished.sections,
    result => result.sections,
    result => buildStageMetrics(
      'sections',
      input.previousPublished.sections,
      result.sections
    )
  )

  const calc = timeStage(
    'calc',
    () => runCalcStage({
      activeViewId,
      previousViewId,
      delta: input.delta,
      view,
      previous: input.previousProjection.calc,
      previousSections: input.previousProjection.sections,
      previousPublished: input.previousPublished.calculations,
      sections: sections.state,
      sectionsAction: sections.action,
      index: input.index,
      fieldsById
    }),
    input.previousPublished.calculations,
    result => result.calculations,
    result => buildStageMetrics(
      'calc',
      input.previousPublished.calculations,
      result.calculations
    )
  )

  const published = {
    ...publishViewState({
      document: input.document,
      viewId: activeViewId,
      previous: input.previousPublished
    }),
    records: query.records,
    sections: sections.sections,
    appearances: sections.appearances,
    calculations: calc.calculations
  } satisfies ProjectState

  return {
    projection: {
      query: query.state,
      sections: sections.state,
      calc: calc.state
    },
    published,
    ...(input.capturePerf
      ? {
        trace: {
          plan: {
              query: query.action,
              sections: sections.action,
              calc: calc.action
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
