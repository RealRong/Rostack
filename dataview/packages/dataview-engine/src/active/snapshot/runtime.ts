import type {
  CommitImpact,
  ViewId
} from '@dataview/core/contracts'
import type { IndexState } from '@dataview/engine/active/index/contracts'
import type {
  DeriveAction,
  ViewCache
} from '@dataview/engine/contracts/internal'
import type {
  ViewStageMetrics,
  ViewStageName,
  ViewStageTrace,
  ViewState,
  ViewTrace
} from '@dataview/engine/contracts/public'
import { now } from '@dataview/engine/runtime/clock'
import { publishViewBase } from '@dataview/engine/active/snapshot/base'
import { buildStageMetrics } from '@dataview/engine/active/snapshot/trace'
import { runQueryStage } from '@dataview/engine/active/snapshot/query/runtime'
import { runSectionsStage } from '@dataview/engine/active/snapshot/sections/runtime'
import { runSummaryStage } from '@dataview/engine/active/snapshot/summary/runtime'
import type {
  DocumentReadContext
} from '@dataview/engine/document/reader'

interface ViewRunResult {
  cache: ViewCache
  snapshot?: ViewState
  trace?: ViewTrace
}

export const deriveViewSnapshot = (input: {
  documentContext: DocumentReadContext
  impact: CommitImpact
  index: IndexState
  previousIndex?: IndexState
  previousCache: ViewCache
  previousSnapshot?: ViewState
  capturePerf: boolean
}): ViewRunResult => {
  const totalStart = now()
  const stageTraces: ViewStageTrace[] = []
  const activeViewId = input.documentContext.activeViewId as ViewId | undefined
  const view = input.documentContext.activeView

  const timeStage = <T extends { action: DeriveAction },>(
    stage: ViewStageName,
    run: () => T,
    previousSnapshot: ViewState | undefined,
    nextSnapshot: (result: T) => ViewState | undefined,
    buildMetrics?: (result: T) => ViewStageMetrics | undefined
  ): T => {
    const result = run()
    if (input.capturePerf) {
      const next = nextSnapshot(result)
      const deriveMs = 'deriveMs' in result && typeof result.deriveMs === 'number'
        ? result.deriveMs
        : 0
      const publishMs = 'publishMs' in result && typeof result.publishMs === 'number'
        ? result.publishMs
        : 0
      stageTraces.push({
        stage,
        action: result.action,
        executed: result.action !== 'reuse',
        changed: !Object.is(previousSnapshot, next),
        durationMs: deriveMs + publishMs,
        deriveMs,
        publishMs,
        ...(buildMetrics
          ? { metrics: buildMetrics(result) }
          : {})
      })
    }
    return result
  }

  if (!view || !activeViewId) {
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

  const previousViewId = input.previousSnapshot?.view.id

  const query = timeStage(
    'query',
    () => runQueryStage({
      reader: input.documentContext.reader,
      activeViewId,
      previousViewId,
      impact: input.impact,
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
      impact: input.impact,
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
      impact: input.impact,
      view,
      previous: input.previousCache.summary,
      previousIndex: input.previousIndex,
      previousSections: input.previousCache.sections,
      previousPublished: input.previousSnapshot?.summaries,
      sections: sections.state,
      sectionsAction: sections.action,
      index: input.index,
      fieldsById: input.documentContext.fieldsById
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
    reader: input.documentContext.reader,
    fieldsById: input.documentContext.fieldsById,
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
