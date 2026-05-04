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
  EMPTY_SECTION_FAMILY,
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
    sections: input.sectionDelta
      ? toFamilyChange({
          snapshot: input.nextSections,
          delta: input.sectionDelta
        })
      : input.previousSections !== input.nextSections
        ? 'replace'
        : 'skip',
    items: input.itemDelta
      ? toFamilyChange({
          snapshot: input.nextItems,
          delta: input.itemDelta
        })
      : input.previousItems !== input.nextItems
        ? 'replace'
        : 'skip',
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
    : createEmptyDataviewStoreChanges()
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

  return {
    spec: active,
    index: input.index.index,
    query: query.state,
    membership: membership.state,
    summary: summary.state,
    snapshot: publish.snapshot,
    fields: publish.fields,
    sections: publish.sections,
    items: publish.items,
    summaries: publish.summaries,
    itemIds: input.previous.itemIds,
    changes: buildStoreChanges({
      previous: input.previous.snapshot,
      next: publish.snapshot,
      previousFields: input.previous.fields,
      nextFields: publish.fields,
      previousSections: input.previous.sections,
      nextSections: publish.sections,
      previousItems: input.previous.items,
      nextItems: publish.items,
      previousSummaries: input.previous.summaries,
      nextSummaries: publish.summaries,
      sectionDelta: publish.sectionDelta,
      itemDelta: publish.itemDelta
    })
  }
}

export const createDataviewActiveState = (): DataviewActiveState => createEmptyDataviewActiveState()
