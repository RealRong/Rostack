import type { ActiveDelta } from '@dataview/engine/contracts/delta'
import type {
  ViewState
} from '@dataview/engine/contracts/view'
import type {
  ItemList,
  SectionList,
  ViewRecords,
  ViewSummaries
} from '@dataview/engine/contracts/shared'
import type {
  MembershipPhaseState,
  QueryPhaseState,
  SummaryPhaseDelta,
  SummaryPhaseState
} from '@dataview/engine/active/state'
import {
  EMPTY_SUMMARY_PHASE_DELTA
} from '@dataview/engine/active/state'
import {
  publishStruct
} from '@shared/projector'
import {
  publishViewBase
} from '@dataview/engine/active/publish/base'
import {
  publishSections
} from '@dataview/engine/active/publish/sections'
import {
  publishSummaries
} from '@dataview/engine/active/publish/summaries'
import {
  projectActiveDelta
} from '@dataview/engine/mutation/delta'
import type {
  DocumentReader
} from '@dataview/engine/document/reader'
import { now } from '@dataview/engine/runtime/clock'
import type {
  View,
  ViewId
} from '@dataview/core/contracts'
import type { ItemIdPool } from './itemIdPool'
import {
  defineActiveProjectorPhase,
  readActiveView
} from '../projector/context'
import {
  createActiveStageMetrics,
  toActivePhaseMetrics
} from '../projector/metrics'
import { publishPhaseScope } from '../contracts/projector'

const SNAPSHOT_KEYS = [
  'view',
  'query',
  'records',
  'sections',
  'items',
  'fields',
  'table',
  'gallery',
  'kanban',
  'summaries'
] as const satisfies readonly (keyof ViewState)[]

const EMPTY_METRICS = toActivePhaseMetrics({
  deriveMs: 0,
  publishMs: 0
})

const createPublishReset = (
  previous: ViewState | undefined
): {
  snapshot?: undefined
  delta?: ActiveDelta
  action: 'reuse' | 'sync'
} => previous
  ? {
      snapshot: undefined,
      delta: {
        reset: true
      },
      action: 'sync'
    }
  : {
      snapshot: undefined,
      delta: undefined,
      action: 'reuse'
    }

const publishViewRecords = (input: {
  state: QueryPhaseState
  previous?: ViewRecords
}): ViewRecords => {
  const matched = input.state.matched.read.ids()
  const ordered = input.state.ordered.read.ids()
  const visible = input.state.visible.read.ids()

  if (
    input.previous
    && input.previous.matched === matched
    && input.previous.ordered === ordered
    && input.previous.visible === visible
  ) {
    return input.previous
  }

  return {
    matched,
    ordered,
    visible
  }
}

const runPublishStage = (input: {
  reader: DocumentReader
  activeViewId: ViewId
  previous?: ViewState
  view: View
  queryState: QueryPhaseState
  previousRecords?: ViewRecords
  membershipState: MembershipPhaseState
  previousMembershipState?: MembershipPhaseState
  previousSections?: SectionList
  previousItems?: ItemList
  summaryState: SummaryPhaseState
  summaryDelta: SummaryPhaseDelta
  previousSummaryState?: SummaryPhaseState
  previousSummaries?: ViewSummaries
  itemIds: ItemIdPool
}): {
  action: 'reuse' | 'sync' | 'rebuild'
  snapshot?: ViewState
  delta?: ActiveDelta
  deriveMs: number
  publishMs: number
  metrics: ReturnType<typeof createActiveStageMetrics>
} => {
  const publishStart = now()
  const canReusePublished = input.previous?.view.id === input.activeViewId
  if (!canReusePublished) {
    input.itemIds.gc.clear()
  }
  const records = publishViewRecords({
    state: input.queryState,
    previous: canReusePublished
      ? input.previousRecords
      : undefined
  })
  const sections = publishSections({
    view: input.view,
    sections: input.membershipState,
    previousSections: canReusePublished
      ? input.previousMembershipState
      : undefined,
    itemIds: input.itemIds,
    previous: canReusePublished && input.previousSections && input.previousItems
      ? {
          sections: input.previousSections,
          items: input.previousItems
        }
      : undefined
  })
  const summaries = publishSummaries({
    summary: input.summaryState,
    previousSummary: canReusePublished
      ? input.previousSummaryState
      : undefined,
    previous: canReusePublished
      ? input.previousSummaries
      : undefined,
    reader: input.reader,
    view: input.view
  })
  const base = publishViewBase({
    reader: input.reader,
    viewId: input.activeViewId,
    previous: canReusePublished && input.previous
      ? {
          view: input.previous.view,
          query: input.previous.query,
          fields: input.previous.fields,
          table: input.previous.table,
          gallery: input.previous.gallery,
          kanban: input.previous.kanban
        }
      : undefined
  })
  const nextSnapshot = base.view && base.query && base.fields && base.table && base.gallery && base.kanban
    ? {
        view: base.view,
        query: base.query,
        records,
        sections: sections.sections,
        items: sections.items,
        fields: base.fields,
        table: base.table,
        gallery: base.gallery,
        kanban: base.kanban,
        summaries
      } satisfies ViewState
    : undefined
  const published = nextSnapshot
    ? publishStruct({
        previous: input.previous,
        next: nextSnapshot,
        keys: SNAPSHOT_KEYS
      })
    : undefined
  const snapshot = published?.value
  const delta = projectActiveDelta({
    previous: input.previous,
    next: snapshot,
    sections: sections.delta?.sections,
    items: sections.delta?.items,
    summaries: input.summaryDelta
  })
  const publishMs = now() - publishStart
  const outputCount = SNAPSHOT_KEYS.length

  return {
    action: !input.previous
      ? 'rebuild'
      : snapshot === input.previous
        ? 'reuse'
        : input.previous.view.id !== snapshot?.view.id
            || input.previous.view.type !== snapshot?.view.type
          ? 'rebuild'
          : 'sync',
    snapshot,
    ...(delta
      ? {
          delta
        }
      : {}),
    deriveMs: 0,
    publishMs,
    metrics: createActiveStageMetrics({
      inputCount: input.previous
        ? outputCount
        : 0,
      outputCount,
      reusedNodeCount: published?.reusedNodeCount ?? 0,
      rebuiltNodeCount: published?.rebuiltNodeCount ?? outputCount
    })
  }
}

export const activePublishPhase = defineActiveProjectorPhase({
  name: 'publish',
  deps: ['query', 'membership', 'summary'],
  scope: publishPhaseScope,
  run: (context) => {
    const scope = context.scope
    const { activeViewId, view } = readActiveView(context.input)
    if (scope?.reset || !activeViewId || !view) {
      const reset = createPublishReset(context.previous)
      context.working.publish.itemIds.gc.clear()
      context.working.publish.snapshot = reset.snapshot
      context.working.publish.delta = reset.delta

      return {
        action: reset.action,
        metrics: EMPTY_METRICS
      }
    }

    const result = runPublishStage({
      reader: context.input.read.reader,
      activeViewId,
      previous: context.previous,
      view,
      queryState: context.working.query.state,
      previousRecords: context.previous?.records,
      membershipState: context.working.membership.state,
      previousMembershipState: scope?.membership?.previous ?? context.working.membership.state,
      previousSections: context.previous?.sections,
      previousItems: context.previous?.items,
      summaryState: context.working.summary.state,
      summaryDelta: scope?.summary?.delta ?? EMPTY_SUMMARY_PHASE_DELTA,
      previousSummaryState: scope?.summary?.previous ?? context.working.summary.state,
      previousSummaries: context.previous?.summaries,
      itemIds: context.working.publish.itemIds
    })

    context.working.publish.snapshot = result.snapshot
    context.working.publish.delta = result.delta

    return {
      action: result.action,
      metrics: toActivePhaseMetrics({
        deriveMs: result.deriveMs,
        publishMs: result.publishMs,
        stage: result.metrics
      })
    }
  }
})
