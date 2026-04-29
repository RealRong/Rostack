import type {
  DataviewActiveSpec,
  DataviewFrame
} from '@dataview/engine/active/frame'
import type {
  DataviewActivePlan
} from '@dataview/engine/active/plan'
import type {
  DataviewActiveState,
  DataviewStageTrace,
  MembershipPhaseState,
  QueryPhaseState,
  SummaryPhaseState
} from '@dataview/engine/active/state'
import {
  publishViewBase
} from '@dataview/engine/active/publish/base'
import {
  publishSections
} from '@dataview/engine/active/publish/sections'
import {
  publishStruct
} from '@dataview/engine/active/publish/deltaPublish'
import {
  publishSummaries
} from '@dataview/engine/active/publish/summaries'
import type {
  ViewState
} from '@dataview/engine/contracts/view'
import type {
  ItemId,
  ItemPlacement,
  Section,
  SectionId,
  ViewRecords,
  ViewSummaries
} from '@dataview/engine/contracts/shared'
import type {
  EntityDelta
} from '@shared/delta'
import { now } from '@dataview/engine/runtime/clock'
import {
  createActiveStageMetrics
} from '@dataview/engine/active/projection/metrics'

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

export const publishActiveView = (input: {
  frame: DataviewFrame
  active: DataviewActiveSpec
  plan: DataviewActivePlan
  query: QueryPhaseState
  membership: MembershipPhaseState
  summary: SummaryPhaseState
  previous: DataviewActiveState
}): {
  snapshot?: ViewState
  sectionDelta?: EntityDelta<SectionId>
  itemDelta?: EntityDelta<ItemId>
  trace: DataviewStageTrace
} => {
  const action = input.plan.publish.action
  const previous = input.previous.snapshot
  if (action === 'reuse') {
    return {
      snapshot: previous,
      trace: {
        action,
        changed: false,
        deriveMs: 0,
        publishMs: 0,
        metrics: createActiveStageMetrics({
          inputCount: previous ? SNAPSHOT_KEYS.length : 0,
          outputCount: previous ? SNAPSHOT_KEYS.length : 0,
          reusedNodeCount: previous ? SNAPSHOT_KEYS.length : 0,
          rebuiltNodeCount: 0
        })
      }
    }
  }

  const publishStart = now()
  const canReusePublished = previous?.view.id === input.active.id
  if (!canReusePublished) {
    input.previous.itemIds.gc.clear()
  }
  const records = publishViewRecords({
    state: input.query,
    previous: canReusePublished
      ? previous?.records
      : undefined
  })
  const sections = publishSections({
    view: input.active.view,
    sections: input.membership,
    previousSections: canReusePublished
      ? input.previous.membership
      : undefined,
    itemIds: input.previous.itemIds,
    previous: canReusePublished && previous?.sections && previous?.items
      ? {
          sections: previous.sections,
          items: previous.items
        }
      : undefined
  })
  const summaries = publishSummaries({
    summary: input.summary,
    previousSummary: canReusePublished
      ? input.previous.summary
      : undefined,
    previous: canReusePublished
      ? previous?.summaries
      : undefined,
    reader: input.frame.reader,
    view: input.active.view
  })
  const base = publishViewBase({
    reader: input.frame.reader,
    viewId: input.active.id,
    previous: canReusePublished && previous
      ? {
          view: previous.view,
          query: previous.query,
          fields: previous.fields,
          table: previous.table,
          gallery: previous.gallery,
          kanban: previous.kanban
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
        previous,
        next: nextSnapshot,
        keys: SNAPSHOT_KEYS
      })
    : undefined
  const snapshot = published?.value
  const publishMs = now() - publishStart
  const outputCount = SNAPSHOT_KEYS.length

  return {
    snapshot,
    ...(sections.delta?.sections
      ? {
          sectionDelta: sections.delta.sections
        }
      : {}),
    ...(sections.delta?.items
      ? {
          itemDelta: sections.delta.items
        }
      : {}),
    trace: {
      action,
      changed: snapshot !== previous,
      deriveMs: 0,
      publishMs,
      metrics: createActiveStageMetrics({
        inputCount: previous
          ? outputCount
          : 0,
        outputCount,
        reusedNodeCount: published?.reusedNodeCount ?? 0,
        rebuiltNodeCount: published?.rebuiltNodeCount ?? outputCount
      })
    }
  }
}
