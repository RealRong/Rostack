import type {
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
  DataviewActiveState
} from '@dataview/engine/active/state'
import {
  createEmptyDataviewActiveState,
  EMPTY_SNAPSHOT_TRACE,
  EMPTY_STAGE_TRACE,
  emptyMembershipPhaseState,
  emptyQueryPhaseState,
  emptySummaryPhaseState
} from '@dataview/engine/active/state'
import type {
  SectionId
} from '@dataview/engine/contracts/shared'
import type {
  ViewState
} from '@dataview/engine/contracts/view'
import {
  createSnapshotTrace
} from '@dataview/engine/active/projection/trace'

const buildFieldPatch = (input: {
  previous?: ViewState
  next?: ViewState
}): EntityDelta<FieldId> | undefined => {
  if (!input.previous || !input.next) {
    return undefined
  }

  return entityDelta.fromSnapshots({
    previousIds: input.previous.fields.ids,
    nextIds: input.next.fields.ids,
    previousGet: (fieldId) => input.previous?.fields.get(fieldId),
    nextGet: (fieldId) => input.next?.fields.get(fieldId)
  })
}

const buildSummaryPatch = (input: {
  previous?: ViewState
  next?: ViewState
}): EntityDelta<SectionId> | undefined => {
  if (!input.previous || !input.next) {
    return undefined
  }

  const previousSummaries = input.previous.summaries
  const nextSummaries = input.next.summaries

  return entityDelta.fromSnapshots({
    previousIds: input.previous.sections.ids.filter((sectionId) => previousSummaries.has(sectionId)),
    nextIds: input.next.sections.ids.filter((sectionId) => nextSummaries.has(sectionId)),
    previousGet: (sectionId) => previousSummaries.get(sectionId),
    nextGet: (sectionId) => nextSummaries.get(sectionId)
  })
}

const clearActiveState = (
  previous: DataviewActiveState
): DataviewActiveState => ({
  query: emptyQueryPhaseState(),
  membership: emptyMembershipPhaseState(),
  summary: emptySummaryPhaseState(),
  snapshot: undefined,
  itemIds: previous.itemIds,
  patches: {},
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
    query: query.state,
    membership: membership.state,
    summary: summary.state,
    snapshot: publish.snapshot,
    itemIds: input.previous.itemIds,
    patches: {
      fields: buildFieldPatch({
        previous: input.previous.snapshot,
        next: publish.snapshot
      }),
      sections: publish.sectionPatch,
      items: publish.itemPatch,
      summaries: buildSummaryPatch({
        previous: input.previous.snapshot,
        next: publish.snapshot
      })
    },
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
