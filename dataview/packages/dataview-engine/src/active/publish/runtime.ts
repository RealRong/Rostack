import type {
  Field,
  FieldId,
  View,
  ViewId
} from '@dataview/core/contracts'
import type {
  ActiveDelta
} from '@dataview/engine/contracts/delta'
import type {
  ItemList,
  SectionList,
  ViewRecords,
  ViewSummaries
} from '@dataview/engine/contracts/shared'
import type {
  ViewStageMetrics
} from '@dataview/engine/contracts/performance'
import type {
  ViewState
} from '@dataview/engine/contracts/view'
import type {
  MembershipPhaseState as MembershipState,
  SummaryPhaseDelta as SummaryDelta,
  SummaryPhaseState as SummaryState
} from '@dataview/engine/active/state'
import {
  publishViewBase
} from '@dataview/engine/active/publish/base'
import {
  projectActiveDelta
} from '@dataview/engine/active/publish/delta'
import {
  publishSections
} from '@dataview/engine/active/publish/sections'
import {
  publishSummaries
} from '@dataview/engine/active/publish/summaries'
import { now } from '@dataview/engine/runtime/clock'
import type {
  DocumentReader
} from '@dataview/engine/document/reader'
import type { ItemIdPool } from '@dataview/engine/active/shared/itemIdPool'

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

const countReusedStores = (
  previous: ViewState | undefined,
  next: ViewState | undefined
): number => {
  if (!previous || !next) {
    return 0
  }

  let count = 0
  SNAPSHOT_KEYS.forEach(key => {
    if (previous[key] === next[key]) {
      count += 1
    }
  })
  return count
}

const reuseSnapshot = (
  previous: ViewState | undefined,
  next: ViewState | undefined
): ViewState | undefined => {
  if (!previous || !next) {
    return next
  }

  return SNAPSHOT_KEYS.every(key => previous[key] === next[key])
    ? previous
    : next
}

export const runPublishStage = (input: {
  reader: DocumentReader
  fieldsById: ReadonlyMap<FieldId, Field>
  activeViewId: ViewId
  previous?: ViewState
  view: View
  records: ViewRecords
  membershipState: MembershipState
  previousMembershipState?: MembershipState
  previousSections?: SectionList
  previousItems?: ItemList
  summaryState: SummaryState
  summaryDelta: SummaryDelta
  previousSummaryState?: SummaryState
  previousSummaries?: ViewSummaries
  itemIds: ItemIdPool
}): {
  action: 'reuse' | 'sync' | 'rebuild'
  snapshot?: ViewState
  delta?: ActiveDelta
  deriveMs: number
  publishMs: number
  metrics: ViewStageMetrics
} => {
  const publishStart = now()
  const canReusePublished = input.previous?.view.id === input.activeViewId
  if (!canReusePublished) {
    input.itemIds.gc.clear()
  }
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
    fieldsById: input.fieldsById,
    view: input.view
  })
  const base = publishViewBase({
    reader: input.reader,
    fieldsById: input.fieldsById,
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
  const snapshot = base.view && base.query && base.fields && base.table && base.gallery && base.kanban
    ? {
        view: base.view,
        query: base.query,
        records: input.records,
        sections: sections.sections,
        items: sections.items,
        fields: base.fields,
        table: base.table,
        gallery: base.gallery,
        kanban: base.kanban,
        summaries
      } satisfies ViewState
    : undefined
  const published = reuseSnapshot(input.previous, snapshot)
  const delta = projectActiveDelta({
    previous: input.previous,
    next: published,
    sections: sections.delta?.sections,
    items: sections.delta?.items,
    summaries: input.summaryDelta
  })
  const publishMs = now() - publishStart
  const reusedStoreCount = countReusedStores(input.previous, published)
  const outputCount = SNAPSHOT_KEYS.length

  return {
    action: !input.previous
      ? 'rebuild'
      : published === input.previous
        ? 'reuse'
        : input.previous.view.id !== published?.view.id
            || input.previous.view.type !== published?.view.type
          ? 'rebuild'
          : 'sync',
    snapshot: published,
    ...(delta
      ? {
          delta
        }
      : {}),
    deriveMs: 0,
    publishMs,
    metrics: {
      inputCount: input.previous
        ? outputCount
        : 0,
      outputCount,
      reusedNodeCount: reusedStoreCount,
      rebuiltNodeCount: outputCount - reusedStoreCount
    }
  }
}
