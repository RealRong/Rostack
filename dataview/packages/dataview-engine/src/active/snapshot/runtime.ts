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
  ActivePatch,
  ViewStageName,
  ViewStageTrace,
  ViewState,
  ViewTrace
} from '@dataview/engine/contracts'
import { now } from '@dataview/engine/runtime/clock'
import { runPublishStage } from '@dataview/engine/active/snapshot/publish/runtime'
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
  change?: SnapshotChange
  patch?: ActivePatch
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
    changed: (result: T) => boolean
  ): T => {
    const result = run()
    if (input.capturePerf) {
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
        changed: changed(result),
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
                summary: 'reuse',
                publish: 'reuse'
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
      previous: input.previousCache.query.state,
      previousPublished: input.previousSnapshot?.records
    }),
    result => input.previousSnapshot?.records !== result.records
  )

  const sections = timeStage(
    'sections',
    () => runSectionsStage({
      activeViewId,
      previousViewId,
      impact: input.impact,
      view,
      query: query.state,
      previous: {
        structure: input.previousCache.sections.state,
        projection: input.previousCache.sections.projection
      },
      index: input.index
    }),
    result => (
      input.previousCache.sections.state !== result.state.structure
      || input.previousCache.sections.projection !== result.state.projection
    )
  )

  const summary = timeStage(
    'summary',
    () => runSummaryStage({
      activeViewId,
      previousViewId,
      impact: input.impact,
      view,
      calcFields: viewPlan?.calcFields ?? [],
      previous: input.previousCache.summary.state,
      previousSections: input.previousCache.sections.state,
      sections: sections.state.structure,
      sectionsAction: sections.action,
      sectionDelta: sections.delta,
      index: input.index
    }),
    result => input.previousCache.summary.state !== result.state
  )
  const change = {
    query: query.delta,
    sections: sections.delta,
    summary: summary.delta
  } satisfies SnapshotChange
  const publish = timeStage(
    'publish',
    () => runPublishStage({
      reader: input.documentContext.reader,
      fieldsById: input.documentContext.fieldsById,
      activeViewId,
      previous: input.previousSnapshot,
      view,
      records: query.records,
      sectionState: sections.state,
      previousSectionState: input.previousCache.sections.state,
      previousSections: input.previousSnapshot?.sections,
      previousItems: input.previousSnapshot?.items,
      summaryState: summary.state,
      previousSummaryState: input.previousCache.summary.state,
      previousSummaries: input.previousSnapshot?.summaries,
      change
    }),
    result => input.previousSnapshot !== result.snapshot
  )

  return {
    cache: {
      query: {
        state: query.state
      },
      sections: {
        state: sections.state.structure,
        projection: sections.state.projection
      },
      summary: {
        state: summary.state
      }
    },
    snapshot: publish.snapshot,
    ...(publish.snapshot
      ? {
          change
        }
      : {}),
    ...(publish.patch
      ? {
          patch: publish.patch
        }
      : {}),
    ...(input.capturePerf
      ? {
          trace: {
            plan: {
              query: query.action,
              sections: sections.action,
              summary: summary.action,
              publish: publish.action
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
