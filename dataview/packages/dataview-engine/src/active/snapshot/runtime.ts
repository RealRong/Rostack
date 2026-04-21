import type {
  ViewId
} from '@dataview/core/contracts'
import type { IndexState } from '@dataview/engine/active/index/contracts'
import {
  compileViewPlan,
  type ViewPlan
} from '@dataview/engine/active/plan'
import type {
  DeriveAction,
  SnapshotChange,
  ViewCache
} from '@dataview/engine/contracts/state'
import type {
  ViewStageName,
  ViewStageTrace,
  ViewState,
  ViewTrace
} from '@dataview/engine/contracts'
import { now } from '@dataview/engine/runtime/clock'
import { publishViewBase } from '@dataview/engine/active/snapshot/base'
import { runQueryStage } from '@dataview/engine/active/snapshot/query/runtime'
import { runSectionsStage } from '@dataview/engine/active/snapshot/sections/runtime'
import { runSummaryStage } from '@dataview/engine/active/snapshot/summary/runtime'
import type {
  DocumentReadContext
} from '@dataview/engine/document/reader'
import type {
  ActiveImpact
} from '@dataview/engine/active/shared/impact'

interface ViewRunResult {
  cache: ViewCache
  snapshot?: ViewState
  delta?: SnapshotChange
  trace?: ViewTrace
}

export const deriveViewSnapshot = (input: {
  documentContext: DocumentReadContext
  viewPlan?: ViewPlan
  previousPlan?: ViewPlan
  impact: ActiveImpact
  index: IndexState
  previousCache: ViewCache
  previousSnapshot?: ViewState
  capturePerf: boolean
}): ViewRunResult => {
  const totalStart = now()
  const stageTraces: ViewStageTrace[] = []
  const activeViewId = input.documentContext.activeViewId as ViewId | undefined
  const view = input.documentContext.activeView
  const viewPlan = view
    ? (input.viewPlan ?? compileViewPlan(input.documentContext.reader, view))
    : undefined

  const timeStage = <T extends { action: DeriveAction },>(
    stage: ViewStageName,
    run: () => T,
    previousSnapshot: ViewState | undefined,
    nextSnapshot: (result: T) => ViewState | undefined
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
        ...(
          'metrics' in result && result.metrics
            ? { metrics: result.metrics }
            : {}
        )
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
      plan: viewPlan!.query,
      previousPlan: input.previousPlan?.query,
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
      : undefined
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
      : undefined
  )

  const summary = timeStage(
    'summary',
    () => runSummaryStage({
      activeViewId,
      previousViewId,
      impact: input.impact,
      view,
      calcFields: viewPlan?.calcFields ?? [],
      previous: input.previousCache.summary,
      previousSections: input.previousCache.sections.structure,
      previousPublished: input.previousSnapshot?.summaries,
      sections: sections.state.structure,
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
      : undefined
  )

  const base = publishViewBase({
    reader: input.documentContext.reader,
    fieldsById: input.documentContext.fieldsById,
    viewId: activeViewId,
    previous: input.previousSnapshot
      ? {
          view: input.previousSnapshot.view,
          query: input.previousSnapshot.query,
          fields: input.previousSnapshot.fields,
          table: input.previousSnapshot.table,
          gallery: input.previousSnapshot.gallery,
          kanban: input.previousSnapshot.kanban
        }
      : undefined
  })
  const snapshot = base.view && base.query && base.fields && base.table && base.gallery && base.kanban
    ? {
        view: base.view,
        query: base.query,
        records: query.records,
        sections: sections.sections,
        items: sections.items,
        fields: base.fields,
        table: base.table,
        gallery: base.gallery,
        kanban: base.kanban,
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
    && input.previousSnapshot.table === snapshot.table
    && input.previousSnapshot.gallery === snapshot.gallery
    && input.previousSnapshot.kanban === snapshot.kanban
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
    ...(publishedSnapshot
      ? {
          delta: {
            query: query.delta,
            sections: sections.delta,
            summary: summary.delta
          }
        }
      : {}),
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
