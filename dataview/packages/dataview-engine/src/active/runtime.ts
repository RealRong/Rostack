import type {
  CalculationCollection
} from '@dataview/core/view'
import type {
  Field,
  FieldId
} from '@dataview/core/types'
import {
  entityDelta,
  type EntityDelta
} from '@shared/delta'
import type {
  DataviewFrame
} from '@dataview/engine/active/frame'
import type {
  DataviewIndexResult
} from '@dataview/engine/active/index/runtime'
import type {
  DataviewActivePlan
} from '@dataview/engine/active/plan'
import {
  runQueryStep
} from '@dataview/engine/active/query/stage'
import {
  runMembershipStep
} from '@dataview/engine/active/membership/stage'
import {
  runSummaryStep
} from '@dataview/engine/active/summary/stage'
import {
  publishActiveView
} from '@dataview/engine/active/publish/stage'
import type {
  DataviewActiveState,
  DataviewStoreChanges
} from '@dataview/engine/active/state'
import {
  createEmptyDataviewActiveState,
  createEmptyDataviewStoreChanges,
  EMPTY_FIELD_FAMILY,
  EMPTY_ITEM_FAMILY,
  EMPTY_SNAPSHOT_TRACE,
  EMPTY_SECTION_FAMILY,
  EMPTY_STAGE_TRACE,
  EMPTY_SUMMARY_FAMILY,
  emptyMembershipPhaseState,
  emptyQueryPhaseState,
  emptySummaryPhaseState
} from '@dataview/engine/active/state'
import type {
  ItemId,
  ItemPlacement,
  Section,
  SectionId
} from '@dataview/engine/contracts/shared'
import type {
  ViewState
} from '@dataview/engine/contracts/view'
import {
  createSnapshotTrace
} from '@dataview/engine/active/projection/trace'
import type {
  ProjectionFamilyChange,
  ProjectionFamilySnapshot
} from '@shared/projection'

const toFamilyChange = <TKey extends string | number, TValue>(input: {
  snapshot: ProjectionFamilySnapshot<TKey, TValue>
  delta?: EntityDelta<TKey>
}): ProjectionFamilyChange<TKey, TValue> => {
  const delta = input.delta
  if (!delta) {
    return 'skip'
  }

  const set = delta.set?.map((key) => {
    const value = input.snapshot.byId.get(key)
    if (value === undefined) {
      throw new Error(`Dataview store change set key ${String(key)} is missing from snapshot.`)
    }

    return [key, value] as const
  })

  return {
    ...(delta.order
      ? {
          ids: input.snapshot.ids
        }
      : {}),
    ...(set?.length
      ? {
          set
        }
      : {}),
    ...(delta.remove?.length
      ? {
          remove: delta.remove
        }
      : {})
  }
}

const readFieldFamily = (
  view?: ViewState
): ProjectionFamilySnapshot<FieldId, Field> => ({
  ids: view?.fields.ids ?? [],
  byId: view?.fields.ids.length
    ? new Map(view.fields.ids.flatMap((fieldId) => {
      const field = view.fields.get(fieldId)
      return field
        ? [[fieldId, field] as const]
        : []
    }))
    : new Map()
})

const readSectionFamily = (
  view?: ViewState
): ProjectionFamilySnapshot<SectionId, Section> => ({
  ids: view?.sections.ids ?? [],
  byId: view?.sections.ids.length
    ? new Map(view.sections.ids.flatMap((sectionId) => {
      const section = view.sections.get(sectionId)
      return section
        ? [[sectionId, section] as const]
        : []
    }))
    : new Map()
})

const readItemFamily = (
  view?: ViewState
): ProjectionFamilySnapshot<ItemId, ItemPlacement> => ({
  ids: view?.items.ids ?? [],
  byId: view?.items.ids.length
    ? new Map(view.items.ids.flatMap((itemId) => {
      const placement = view.items.read.placement(itemId)
      return placement
        ? [[itemId, placement] as const]
        : []
    }))
    : new Map()
})

const readSummaryFamily = (
  view?: ViewState
): ProjectionFamilySnapshot<SectionId, CalculationCollection> => {
  if (!view) {
    return EMPTY_SUMMARY_FAMILY
  }

  const byId = new Map<SectionId, CalculationCollection>()
  view.sections.ids.forEach((sectionId) => {
    const summary = view.summaries.get(sectionId)
    if (summary) {
      byId.set(sectionId, summary)
    }
  })

  return {
    ids: byId.size
      ? view.sections.ids.filter((sectionId) => byId.has(sectionId))
      : [],
    byId
  }
}

const buildFieldChange = (input: {
  previous: ProjectionFamilySnapshot<FieldId, Field>
  next: ProjectionFamilySnapshot<FieldId, Field>
}): ProjectionFamilyChange<FieldId, Field> => {
  return toFamilyChange({
    snapshot: input.next,
    delta: entityDelta.fromSnapshots({
      previousIds: input.previous.ids,
      nextIds: input.next.ids,
      previousGet: (fieldId) => input.previous.byId.get(fieldId),
      nextGet: (fieldId) => input.next.byId.get(fieldId)
    })
  })
}

const buildSummaryChange = (input: {
  previous: ProjectionFamilySnapshot<SectionId, CalculationCollection>
  next: ProjectionFamilySnapshot<SectionId, CalculationCollection>
}): ProjectionFamilyChange<SectionId, CalculationCollection> => {
  return toFamilyChange({
    snapshot: input.next,
    delta: entityDelta.fromSnapshots({
      previousIds: input.previous.ids,
      nextIds: input.next.ids,
      previousGet: (sectionId) => input.previous.byId.get(sectionId),
      nextGet: (sectionId) => input.next.byId.get(sectionId)
    })
  })
}

const buildStoreChanges = (input: {
  previous?: ViewState
  next?: ViewState
  previousFields: ProjectionFamilySnapshot<FieldId, Field>
  nextFields: ProjectionFamilySnapshot<FieldId, Field>
  previousSections: ProjectionFamilySnapshot<SectionId, Section>
  nextSections: ProjectionFamilySnapshot<SectionId, Section>
  previousItems: ProjectionFamilySnapshot<ItemId, ItemPlacement>
  nextItems: ProjectionFamilySnapshot<ItemId, ItemPlacement>
  previousSummaries: ProjectionFamilySnapshot<SectionId, CalculationCollection>
  nextSummaries: ProjectionFamilySnapshot<SectionId, CalculationCollection>
  sectionDelta?: EntityDelta<SectionId>
  itemDelta?: EntityDelta<ItemId>
}): DataviewStoreChanges => {
  if (!input.previous && !input.next) {
    return createEmptyDataviewStoreChanges()
  }

  if (!input.previous || !input.next) {
    return {
      active: {
        value: input.next
      },
      fields: 'replace',
      sections: 'replace',
      items: 'replace',
      summaries: 'replace'
    }
  }

  return {
    active: input.previous !== input.next
      ? {
          value: input.next
        }
      : 'skip',
    fields: buildFieldChange({
      previous: input.previousFields,
      next: input.nextFields
    }),
    sections: toFamilyChange({
      snapshot: input.nextSections,
      delta: input.sectionDelta
    }),
    items: toFamilyChange({
      snapshot: input.nextItems,
      delta: input.itemDelta
    }),
    summaries: buildSummaryChange({
      previous: input.previousSummaries,
      next: input.nextSummaries
    })
  }
}

const clearActiveState = (
  previous: DataviewActiveState
): DataviewActiveState => ({
  query: emptyQueryPhaseState(),
  membership: emptyMembershipPhaseState(),
  summary: emptySummaryPhaseState(),
  snapshot: undefined,
  fields: EMPTY_FIELD_FAMILY,
  sections: EMPTY_SECTION_FAMILY,
  items: EMPTY_ITEM_FAMILY,
  summaries: EMPTY_SUMMARY_FAMILY,
  itemIds: previous.itemIds,
  changes: previous.snapshot
    ? {
        active: {
          value: undefined
        },
        fields: 'replace',
        sections: 'replace',
        items: 'replace',
        summaries: 'replace'
      }
    : createEmptyDataviewStoreChanges(),
  trace: {
    query: EMPTY_STAGE_TRACE,
    membership: EMPTY_STAGE_TRACE,
    summary: EMPTY_STAGE_TRACE,
    publish: {
      action: previous.snapshot
        ? 'sync'
        : 'reuse',
      changed: Boolean(previous.snapshot),
      deriveMs: 0,
      publishMs: 0
    },
    snapshot: previous.snapshot
      ? createSnapshotTrace(previous.snapshot, undefined)
      : EMPTY_SNAPSHOT_TRACE
  }
})

export const runDataviewActive = (input: {
  frame: DataviewFrame
  plan: DataviewActivePlan
  index?: DataviewIndexResult
  previous: DataviewActiveState
}): DataviewActiveState => {
  const active = input.frame.active
  if (!active || !input.index) {
    return clearActiveState(input.previous)
  }

  const query = runQueryStep({
    frame: input.frame,
    active,
    index: input.index,
    plan: input.plan,
    previous: input.previous
  })
  const membership = runMembershipStep({
    frame: input.frame,
    active,
    query: query.state,
    queryDelta: query.delta,
    index: input.index,
    plan: input.plan,
    previous: input.previous
  })
  const summary = runSummaryStep({
    active,
    membership: membership.state,
    membershipDelta: membership.delta,
    index: input.index,
    plan: input.plan,
    previous: input.previous
  })
  const publish = publishActiveView({
    frame: input.frame,
    active,
    plan: input.plan,
    query: query.state,
    membership: membership.state,
    summary: summary.state,
    previous: input.previous
  })
  const snapshotTrace = createSnapshotTrace(
    input.previous.snapshot,
    publish.snapshot
  )
  const fields = readFieldFamily(publish.snapshot)
  const sections = readSectionFamily(publish.snapshot)
  const items = readItemFamily(publish.snapshot)
  const summaries = readSummaryFamily(publish.snapshot)

  return {
    spec: active,
    index: input.index.index,
    query: query.state,
    membership: membership.state,
    summary: summary.state,
    snapshot: publish.snapshot,
    fields,
    sections,
    items,
    summaries,
    itemIds: input.previous.itemIds,
    changes: buildStoreChanges({
      previous: input.previous.snapshot,
      next: publish.snapshot,
      previousFields: input.previous.fields,
      nextFields: fields,
      previousSections: input.previous.sections,
      nextSections: sections,
      previousItems: input.previous.items,
      nextItems: items,
      previousSummaries: input.previous.summaries,
      nextSummaries: summaries,
      sectionDelta: publish.sectionDelta,
      itemDelta: publish.itemDelta
    }),
    trace: {
      query: query.trace,
      membership: membership.trace,
      summary: summary.trace,
      publish: publish.trace,
      snapshot: snapshotTrace
    }
  }
}

export const createDataviewActiveState = (): DataviewActiveState => createEmptyDataviewActiveState()
