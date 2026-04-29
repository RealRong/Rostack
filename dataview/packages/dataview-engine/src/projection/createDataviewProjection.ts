import type {
  CalculationCollection
} from '@dataview/core/view'
import type {
  DataDoc,
  Field,
  FieldId,
  ViewId
} from '@dataview/core/types'
import {
  createProjection,
  type ProjectionFamilySnapshot,
  type ProjectionPhaseTable,
  type ProjectionStoreTree
} from '@shared/projection'
import {
  createDataviewFrame
} from '@dataview/engine/active/frame'
import {
  createDataviewActivePlan
} from '@dataview/engine/active/plan'
import {
  createDataviewActiveState,
  runDataviewActive
} from '@dataview/engine/active/runtime'
import type {
  DataviewState
} from '@dataview/engine/active/state'
import {
  ensureDataviewIndex
} from '@dataview/engine/active/index/runtime'
import type {
  DataviewMutationDelta
} from '@dataview/engine/mutation/delta'
import type {
  SnapshotTrace,
  ViewTrace
} from '@dataview/engine/contracts/performance'
import type {
  ItemId,
  ItemPlacement,
  Section,
  SectionId
} from '@dataview/engine/contracts/shared'
import type {
  ViewState
} from '@dataview/engine/contracts/view'

export type DataviewProjectionPhaseName = 'active'

export interface DataviewProjectionInput {
  document: DataDoc
  delta: DataviewMutationDelta
}

export interface DataviewProjectionOutput {
  activeId?: ViewId
  active?: ViewState
}

const EMPTY_SECTION_IDS = [] as readonly SectionId[]
const EMPTY_FIELD_IDS = [] as readonly FieldId[]
const EMPTY_ITEM_IDS = [] as readonly ItemId[]
const EMPTY_FIELDS = new Map<FieldId, Field>()
const EMPTY_SECTIONS = new Map<SectionId, Section>()
const EMPTY_ITEMS = new Map<ItemId, ItemPlacement>()
const EMPTY_SUMMARIES = new Map<SectionId, CalculationCollection>()

const EMPTY_FIELD_SNAPSHOT: ProjectionFamilySnapshot<FieldId, Field> = {
  ids: EMPTY_FIELD_IDS,
  byId: EMPTY_FIELDS
}

const EMPTY_SECTION_SNAPSHOT: ProjectionFamilySnapshot<SectionId, Section> = {
  ids: EMPTY_SECTION_IDS,
  byId: EMPTY_SECTIONS
}

const EMPTY_ITEM_SNAPSHOT: ProjectionFamilySnapshot<ItemId, ItemPlacement> = {
  ids: EMPTY_ITEM_IDS,
  byId: EMPTY_ITEMS
}

const EMPTY_SUMMARY_SNAPSHOT: ProjectionFamilySnapshot<SectionId, CalculationCollection> = {
  ids: EMPTY_SECTION_IDS,
  byId: EMPTY_SUMMARIES
}

const EMPTY_SNAPSHOT_TRACE: SnapshotTrace = {
  storeCount: 0,
  changedStores: []
}

const readFieldSnapshot = (
  state: DataviewState
): ProjectionFamilySnapshot<FieldId, Field> => {
  const fields = state.active.snapshot?.fields
  if (!fields) {
    return EMPTY_FIELD_SNAPSHOT
  }

  return {
    ids: fields.ids,
    byId: new Map(fields.ids.flatMap((fieldId) => {
      const field = fields.get(fieldId)
      return field
        ? [[fieldId, field] as const]
        : []
    }))
  }
}

const readSectionSnapshot = (
  state: DataviewState
): ProjectionFamilySnapshot<SectionId, Section> => {
  const sections = state.active.snapshot?.sections
  if (!sections) {
    return EMPTY_SECTION_SNAPSHOT
  }

  return {
    ids: sections.ids,
    byId: new Map(sections.ids.flatMap((sectionId) => {
      const section = sections.get(sectionId)
      return section
        ? [[sectionId, section] as const]
        : []
    }))
  }
}

const readItemSnapshot = (
  state: DataviewState
): ProjectionFamilySnapshot<ItemId, ItemPlacement> => {
  const items = state.active.snapshot?.items
  if (!items) {
    return EMPTY_ITEM_SNAPSHOT
  }

  return {
    ids: items.ids,
    byId: new Map(items.ids.flatMap((itemId) => {
      const placement = items.read.placement(itemId)
      return placement
        ? [[itemId, placement] as const]
        : []
    }))
  }
}

const readSummarySnapshot = (
  state: DataviewState
): ProjectionFamilySnapshot<SectionId, CalculationCollection> => {
  const snapshot = state.active.snapshot
  if (!snapshot) {
    return EMPTY_SUMMARY_SNAPSHOT
  }

  const byId = new Map<SectionId, CalculationCollection>()
  snapshot.sections.ids.forEach((sectionId) => {
    const summary = snapshot.summaries.get(sectionId)
    if (summary) {
      byId.set(sectionId, summary)
    }
  })

  return {
    ids: byId.size
      ? snapshot.sections.ids.filter((sectionId) => byId.has(sectionId))
      : EMPTY_SECTION_IDS,
    byId: byId.size
      ? byId
      : EMPTY_SUMMARIES
  }
}

const buildViewTrace = (input: {
  state: DataviewState
  totalMs: number
}): ViewTrace => {
  const trace = input.state.active.trace
  return {
    plan: {
      query: trace.query.action,
      membership: trace.membership.action,
      summary: trace.summary.action,
      publish: trace.publish.action
    },
    timings: {
      totalMs: input.totalMs
    },
    stages: [{
      stage: 'query',
      action: trace.query.action,
      executed: true,
      changed: trace.query.changed,
      durationMs: trace.query.deriveMs + trace.query.publishMs,
      deriveMs: trace.query.deriveMs,
      publishMs: trace.query.publishMs,
      ...(trace.query.metrics
        ? { metrics: trace.query.metrics }
        : {})
    }, {
      stage: 'membership',
      action: trace.membership.action,
      executed: true,
      changed: trace.membership.changed,
      durationMs: trace.membership.deriveMs + trace.membership.publishMs,
      deriveMs: trace.membership.deriveMs,
      publishMs: trace.membership.publishMs,
      ...(trace.membership.metrics
        ? { metrics: trace.membership.metrics }
        : {})
    }, {
      stage: 'summary',
      action: trace.summary.action,
      executed: true,
      changed: trace.summary.changed,
      durationMs: trace.summary.deriveMs + trace.summary.publishMs,
      deriveMs: trace.summary.deriveMs,
      publishMs: trace.summary.publishMs,
      ...(trace.summary.metrics
        ? { metrics: trace.summary.metrics }
        : {})
    }, {
      stage: 'publish',
      action: trace.publish.action,
      executed: true,
      changed: trace.publish.changed,
      durationMs: trace.publish.deriveMs + trace.publish.publishMs,
      deriveMs: trace.publish.deriveMs,
      publishMs: trace.publish.publishMs,
      ...(trace.publish.metrics
        ? { metrics: trace.publish.metrics }
        : {})
    }]
  }
}

const createState = (): DataviewState => ({
  revision: 0,
  active: createDataviewActiveState()
})

const didActiveChange = (
  state: DataviewState
): boolean => state.active.changes.active !== 'skip'
  || state.active.changes.fields !== 'skip'
  || state.active.changes.sections !== 'skip'
  || state.active.changes.items !== 'skip'
  || state.active.changes.summaries !== 'skip'

export const createDataviewProjection = () => createProjection({
  createState,
  createRead: (runtime) => ({
    activeId: () => runtime.state().active.spec?.id,
    active: () => runtime.state().active.snapshot,
    indexState: () => runtime.state().active.index?.state,
    indexTrace: () => runtime.state().active.index?.trace,
    snapshotTrace: () => runtime.state().active.trace.snapshot,
    viewTrace: (totalMs = 0) => buildViewTrace({
      state: runtime.state(),
      totalMs
    }),
    activeTrace: (totalMs = 0) => ({
      view: buildViewTrace({
        state: runtime.state(),
        totalMs
      }),
      snapshot: runtime.state().active.trace.snapshot,
      snapshotMs: runtime.state().active.trace.publish.publishMs
    })
  }),
  capture: ({ state }) => ({
    activeId: state.active.spec?.id,
    active: state.active.snapshot
  }),
  stores: {
    active: {
      kind: 'value' as const,
      read: (state: DataviewState) => state.active.snapshot,
      change: (state: DataviewState) => state.active.changes.active
    },
    fields: {
      kind: 'family' as const,
      read: readFieldSnapshot,
      change: (state: DataviewState) => state.active.changes.fields
    },
    sections: {
      kind: 'family' as const,
      read: readSectionSnapshot,
      change: (state: DataviewState) => state.active.changes.sections
    },
    items: {
      kind: 'family' as const,
      read: readItemSnapshot,
      change: (state: DataviewState) => state.active.changes.items
    },
    summaries: {
      kind: 'family' as const,
      read: readSummarySnapshot,
      change: (state: DataviewState) => state.active.changes.summaries
    }
  } satisfies ProjectionStoreTree<DataviewState>,
  plan: () => ({
    phases: ['active']
  }),
  phases: ({
    active: (ctx) => {
      const frame = createDataviewFrame({
        revision: ctx.revision,
        document: ctx.input.document,
        delta: ctx.input.delta
      })
      const index = ensureDataviewIndex({
        frame,
        previous: ctx.state.active.index
      })
      const nextActive = runDataviewActive({
        frame,
        plan: createDataviewActivePlan({
          frame,
          previous: ctx.state.active,
          index
        }),
        index,
        previous: ctx.state.active
      })

      ctx.state.revision = ctx.revision
      ctx.state.active = nextActive
      if (didActiveChange(ctx.state)) {
        ctx.phase.active.changed = true
      }
    }
  }) satisfies ProjectionPhaseTable<
    DataviewProjectionInput,
    DataviewState,
    DataviewProjectionPhaseName
  >
})
