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
  EMPTY_SNAPSHOT_TRACE,
  EMPTY_STAGE_TRACE,
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

const readFieldSnapshot = (
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

const readSectionSnapshot = (
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

const readItemSnapshot = (
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

const readSummarySnapshot = (
  view?: ViewState
): ProjectionFamilySnapshot<SectionId, CalculationCollection> => {
  if (!view) {
    return {
      ids: [],
      byId: new Map()
    }
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
  previous?: ViewState
  next?: ViewState
}): ProjectionFamilyChange<FieldId, Field> => {
  if (!input.previous || !input.next) {
    return 'replace'
  }

  return toFamilyChange({
    snapshot: readFieldSnapshot(input.next),
    delta: entityDelta.fromSnapshots({
      previousIds: input.previous.fields.ids,
      nextIds: input.next.fields.ids,
      previousGet: (fieldId) => input.previous?.fields.get(fieldId),
      nextGet: (fieldId) => input.next?.fields.get(fieldId)
    })
  })
}

const buildSummaryChange = (input: {
  previous?: ViewState
  next?: ViewState
}): ProjectionFamilyChange<SectionId, CalculationCollection> => {
  if (!input.previous || !input.next) {
    return 'replace'
  }

  const previousSummaries = input.previous.summaries
  const nextSummaries = input.next.summaries

  return toFamilyChange({
    snapshot: readSummarySnapshot(input.next),
    delta: entityDelta.fromSnapshots({
      previousIds: input.previous.sections.ids.filter((sectionId) => previousSummaries.has(sectionId)),
      nextIds: input.next.sections.ids.filter((sectionId) => nextSummaries.has(sectionId)),
      previousGet: (sectionId) => previousSummaries.get(sectionId),
      nextGet: (sectionId) => nextSummaries.get(sectionId)
    })
  })
}

const buildStoreChanges = (input: {
  previous?: ViewState
  next?: ViewState
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
    fields: buildFieldChange(input),
    sections: toFamilyChange({
      snapshot: readSectionSnapshot(input.next),
      delta: input.sectionDelta
    }),
    items: toFamilyChange({
      snapshot: readItemSnapshot(input.next),
      delta: input.itemDelta
    }),
    summaries: buildSummaryChange(input)
  }
}

const clearActiveState = (
  previous: DataviewActiveState
): DataviewActiveState => ({
  query: emptyQueryPhaseState(),
  membership: emptyMembershipPhaseState(),
  summary: emptySummaryPhaseState(),
  snapshot: undefined,
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

  return {
    spec: active,
    index: input.index.index,
    query: query.state,
    membership: membership.state,
    summary: summary.state,
    snapshot: publish.snapshot,
    itemIds: input.previous.itemIds,
    changes: buildStoreChanges({
      previous: input.previous.snapshot,
      next: publish.snapshot,
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
