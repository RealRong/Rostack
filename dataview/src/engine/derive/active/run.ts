import type {
  CommitDelta,
  DataDoc,
  ViewId
} from '@dataview/core/contracts'
import {
  getDocumentFields,
  getDocumentViewById
} from '@dataview/core/document'
import type { IndexState } from '../../index/types'
import type {
  DeriveAction,
  ViewCache
} from '../../contracts/internal'
import type {
  ViewStageMetrics,
  ViewStageName,
  ViewStageTrace,
  ViewState,
  ViewTrace
} from '../../contracts/public'
import { now } from '../../perf/shared'
import { publishViewBase } from './snapshot'
import { buildStageMetrics } from './trace'
import { runQueryStage } from './query'
import { runSectionsStage } from './sections'
import { runSummaryStage } from './summary'

interface ViewRunResult {
  cache: ViewCache
  snapshot?: ViewState
  trace?: ViewTrace
}

export const deriveViewSnapshot = (input: {
  document: DataDoc
  activeViewId?: ViewId
  delta: CommitDelta
  index: IndexState
  previousCache: ViewCache
  previousSnapshot?: ViewState
  capturePerf: boolean
}): ViewRunResult => {
  const totalStart = now()
  const stageTraces: ViewStageTrace[] = []
  const view = input.activeViewId
    ? getDocumentViewById(input.document, input.activeViewId)
    : undefined

  const timeStage = <T extends { action: DeriveAction },>(
    stage: ViewStageName,
    run: () => T,
    previousSnapshot: ViewState | undefined,
    nextSnapshot: (result: T) => ViewState | undefined,
    buildMetrics?: (result: T) => ViewStageMetrics | undefined
  ): T => {
    const start = input.capturePerf ? now() : 0
    const result = run()
    if (input.capturePerf) {
      const next = nextSnapshot(result)
      stageTraces.push({
        stage,
        action: result.action,
        executed: result.action !== 'reuse',
        changed: !Object.is(previousSnapshot, next),
        durationMs: now() - start,
        ...(buildMetrics
          ? { metrics: buildMetrics(result) }
          : {})
      })
    }
    return result
  }

  if (!view || !input.activeViewId) {
    return {
      cache: {
        query: input.previousCache.query,
        sections: input.previousCache.sections,
        summary: input.previousCache.summary
      },
      snapshot: undefined,
      ...(input.capturePerf
        ? {
            trace: {
              plan: {
                query: 'reuse',
                sections: 'reuse',
                summary: 'reuse'
              },
              timings: {
                totalMs: now() - totalStart
              },
              stages: stageTraces
            } satisfies ViewTrace
          }
        : {})
    }
  }

  const activeViewId = input.activeViewId
  const previousViewId = input.previousSnapshot?.view.id
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
      previous: input.previousCache.query,
      previousPublished: input.previousSnapshot?.records
    }),
    input.previousSnapshot,
    result => input.previousSnapshot
      ? {
          ...input.previousSnapshot,
          records: result.records
        }
      : undefined,
    result => buildStageMetrics(
      'query',
      input.previousSnapshot,
      input.previousSnapshot
        ? {
            ...input.previousSnapshot,
            records: result.records
          }
        : undefined
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
      previous: input.previousCache.sections,
      previousQuery: input.previousCache.query,
      previousPublished: {
        sections: input.previousSnapshot?.sections,
        items: input.previousSnapshot?.items
      },
      index: input.index
    }),
    input.previousSnapshot,
    result => input.previousSnapshot
      ? {
          ...input.previousSnapshot,
          sections: result.sections,
          items: result.items
        }
      : undefined,
    result => buildStageMetrics(
      'sections',
      input.previousSnapshot,
      input.previousSnapshot
        ? {
            ...input.previousSnapshot,
            sections: result.sections,
            items: result.items
          }
        : undefined
    )
  )

  const summary = timeStage(
    'summary',
    () => runSummaryStage({
      activeViewId,
      previousViewId,
      delta: input.delta,
      view,
      previous: input.previousCache.summary,
      previousSections: input.previousCache.sections,
      previousPublished: input.previousSnapshot?.summaries,
      sections: sections.state,
      sectionsAction: sections.action,
      index: input.index,
      fieldsById
    }),
    input.previousSnapshot,
    result => input.previousSnapshot
      ? {
          ...input.previousSnapshot,
          summaries: result.summaries
        }
      : undefined,
    result => buildStageMetrics(
      'summary',
      input.previousSnapshot,
      input.previousSnapshot
        ? {
            ...input.previousSnapshot,
            summaries: result.summaries
          }
        : undefined
    )
  )

  const base = publishViewBase({
    document: input.document,
    viewId: activeViewId,
    previous: input.previousSnapshot
      ? {
          view: input.previousSnapshot.view,
          query: input.previousSnapshot.query,
          fields: input.previousSnapshot.fields
        }
      : undefined
  })
  const snapshot = base.view && base.query && base.fields
    ? {
        view: base.view,
        query: base.query,
        records: query.records,
        sections: sections.sections,
        items: sections.items,
        fields: base.fields,
        summaries: summary.summaries
      } satisfies ViewState
    : undefined
  const publishedSnapshot = snapshot
    && input.previousSnapshot
    && input.previousSnapshot.view === snapshot.view
    && input.previousSnapshot.query === snapshot.query
    && input.previousSnapshot.records === snapshot.records
    && input.previousSnapshot.sections === snapshot.sections
    && input.previousSnapshot.items === snapshot.items
    && input.previousSnapshot.fields === snapshot.fields
    && input.previousSnapshot.summaries === snapshot.summaries
      ? input.previousSnapshot
      : snapshot

  return {
    cache: {
      query: query.state,
      sections: sections.state,
      summary: summary.state
    },
    snapshot: publishedSnapshot,
    ...(input.capturePerf
      ? {
          trace: {
            plan: {
              query: query.action,
              sections: sections.action,
              summary: summary.action
            },
            timings: {
              totalMs: now() - totalStart
            },
            stages: stageTraces
          } satisfies ViewTrace
        }
      : {})
  }
}
