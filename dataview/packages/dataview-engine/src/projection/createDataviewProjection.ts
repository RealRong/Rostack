import type {
  CalculationCollection
} from '@dataview/core/view'
import type {
  DataDoc,
  Field,
  FieldId,
  RecordId,
  View,
  ViewId
} from '@dataview/core/types'
import {
  createProjection,
  type ProjectionFamilyPatch,
  type ProjectionFamilySnapshot,
  type ProjectionPhaseTable,
  type ProjectionSurfaceTree
} from '@shared/projection'
import {
  entityDelta,
  type EntityDelta
} from '@shared/delta'
import type {
  IndexDelta,
  IndexState,
  NormalizedIndexDemand
} from '@dataview/engine/active/index/contracts'
import {
  createIndexState,
  deriveIndex
} from '@dataview/engine/active/index/runtime'
import {
  emptyNormalizedIndexDemand
} from '@dataview/engine/active/index/demand'
import type {
  ViewPlan
} from '@dataview/engine/active/plan'
import {
  resolveViewPlan
} from '@dataview/engine/active/plan'
import {
  calculationFieldsChanged,
  sectionChanged
} from '@dataview/engine/active/projection/dirty'
import type {
  DataviewMutationDelta
} from '@dataview/engine/mutation/delta'
import {
  runQueryStage
} from '@dataview/engine/active/query/stage'
import {
  runMembershipStage
} from '@dataview/engine/active/membership/stage'
import {
  runSummaryStage
} from '@dataview/engine/active/summary/stage'
import {
  runPublishStage
} from '@dataview/engine/active/publish/stage'
import {
  createItemIdPool
} from '@dataview/engine/active/publish/itemIdPool'
import type {
  IndexTrace,
  SnapshotTrace,
  ViewStageAction,
  ViewStageMetrics,
  ViewStageTrace,
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
import {
  createDocumentReadContext,
  type DocumentReadContext
} from '@dataview/engine/document/reader'
import {
  EMPTY_MEMBERSHIP_PHASE_DELTA,
  EMPTY_QUERY_PHASE_DELTA,
  EMPTY_SUMMARY_PHASE_DELTA,
  emptyMembershipPhaseState,
  emptyQueryPhaseState,
  emptySummaryPhaseState,
  type MembershipPhaseDelta,
  type MembershipPhaseState,
  type QueryPhaseDelta,
  type QueryPhaseState,
  type SummaryPhaseDelta,
  type SummaryPhaseState
} from '@dataview/engine/active/state'
import {
  createSnapshotTrace
} from '@dataview/engine/active/projection/trace'

export type DataviewProjectionPhaseName =
  | 'document'
  | 'index'
  | 'query'
  | 'membership'
  | 'summary'
  | 'view'

export interface DataviewProjectionInput {
  document: DataDoc
  delta: DataviewMutationDelta
  runtime: {}
}

export interface DataviewProjectionOutput {
  activeViewId?: ViewId
  active?: ViewState
}

type DataviewProjectionStage = {
  action: ViewStageAction
  deriveMs: number
  publishMs: number
  metrics?: ViewStageMetrics
}

interface DataviewProjectionState {
  document: {
    read?: DocumentReadContext
    activeViewId?: ViewId
    view?: View
    plan?: ViewPlan
    previousActiveViewId?: ViewId
    previousPlan?: ViewPlan
  }
  index: {
    current?: IndexState
    demand: NormalizedIndexDemand
    delta?: IndexDelta
    trace?: IndexTrace
    action: ViewStageAction
  }
  query: {
    state: QueryPhaseState
    delta: QueryPhaseDelta
    stage: DataviewProjectionStage
  }
  membership: {
    state: MembershipPhaseState
    previous?: MembershipPhaseState
    delta: MembershipPhaseDelta
    stage: DataviewProjectionStage
  }
  summary: {
    state: SummaryPhaseState
    previous?: SummaryPhaseState
    delta: SummaryPhaseDelta
    stage: DataviewProjectionStage
  }
  view: {
    itemIds: ReturnType<typeof createItemIdPool>
    previous?: ViewState
    snapshot?: ViewState
    fieldPatch?: EntityDelta<FieldId>
    sectionPatch?: EntityDelta<SectionId>
    itemPatch?: EntityDelta<ItemId>
    summaryPatch?: EntityDelta<SectionId>
    stage: DataviewProjectionStage
    snapshotTrace: SnapshotTrace
  }
}

const EMPTY_SECTION_IDS = [] as readonly SectionId[]
const EMPTY_FIELD_IDS = [] as readonly FieldId[]
const EMPTY_ITEM_IDS = [] as readonly ItemId[]
const EMPTY_FIELDS = new Map<FieldId, Field>()
const EMPTY_SECTIONS = new Map<SectionId, Section>()
const EMPTY_ITEMS = new Map<ItemId, ItemPlacement>()
const EMPTY_SUMMARIES = new Map<SectionId, CalculationCollection>()

const FIELD_SNAPSHOT_CACHE = new WeakMap<ViewState['fields'], ProjectionFamilySnapshot<FieldId, Field>>()
const SECTION_SNAPSHOT_CACHE = new WeakMap<ViewState['sections'], ProjectionFamilySnapshot<SectionId, Section>>()
const ITEM_SNAPSHOT_CACHE = new WeakMap<ViewState['items'], ProjectionFamilySnapshot<ItemId, ItemPlacement>>()

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

const EMPTY_STAGE: DataviewProjectionStage = {
  action: 'reuse',
  deriveMs: 0,
  publishMs: 0
}

const sameOrder = <T,>(
  left: readonly T[],
  right: readonly T[]
): boolean => (
  left.length === right.length
  && left.every((value, index) => Object.is(value, right[index]))
)

const hasDeltaChanges = (
  delta: DataviewMutationDelta
): boolean => delta.reset === true
  || delta.changes.size > 0

const isQueryStateEmpty = (
  state: QueryPhaseState
): boolean => state.visible.read.count() === 0
  && state.matched.read.count() === 0
  && state.ordered.read.count() === 0
  && state.search === undefined

const isMembershipStateEmpty = (
  state: MembershipPhaseState
): boolean => state.sections.order.length === 0
  && state.meta.size === 0

const isSummaryStateEmpty = (
  state: SummaryPhaseState
): boolean => state.bySection.size === 0

const createState = (): DataviewProjectionState => ({
  document: {
  },
  index: {
    demand: emptyNormalizedIndexDemand(),
    action: 'reuse'
  },
  query: {
    state: emptyQueryPhaseState(),
    delta: EMPTY_QUERY_PHASE_DELTA,
    stage: EMPTY_STAGE
  },
  membership: {
    state: emptyMembershipPhaseState(),
    delta: EMPTY_MEMBERSHIP_PHASE_DELTA,
    stage: EMPTY_STAGE
  },
  summary: {
    state: emptySummaryPhaseState(),
    delta: EMPTY_SUMMARY_PHASE_DELTA,
    stage: EMPTY_STAGE
  },
  view: {
    itemIds: createItemIdPool(),
    stage: EMPTY_STAGE,
    snapshotTrace: EMPTY_SNAPSHOT_TRACE
  }
})

const readFieldSnapshot = (
  state: DataviewProjectionState
): ProjectionFamilySnapshot<FieldId, Field> => {
  const fields = state.view.snapshot?.fields
  if (!fields) {
    return EMPTY_FIELD_SNAPSHOT
  }

  const cached = FIELD_SNAPSHOT_CACHE.get(fields)
  if (cached) {
    return cached
  }

  const snapshot: ProjectionFamilySnapshot<FieldId, Field> = {
    ids: fields.ids,
    byId: new Map(fields.ids.flatMap((fieldId) => {
      const field = fields.get(fieldId)
      return field
        ? [[fieldId, field] as const]
        : []
    }))
  }
  FIELD_SNAPSHOT_CACHE.set(fields, snapshot)
  return snapshot
}

const readSectionSnapshot = (
  state: DataviewProjectionState
): ProjectionFamilySnapshot<SectionId, Section> => {
  const sections = state.view.snapshot?.sections
  if (!sections) {
    return EMPTY_SECTION_SNAPSHOT
  }

  const cached = SECTION_SNAPSHOT_CACHE.get(sections)
  if (cached) {
    return cached
  }

  const snapshot: ProjectionFamilySnapshot<SectionId, Section> = {
    ids: sections.ids,
    byId: new Map(sections.ids.flatMap((sectionId) => {
      const section = sections.get(sectionId)
      return section
        ? [[sectionId, section] as const]
        : []
    }))
  }
  SECTION_SNAPSHOT_CACHE.set(sections, snapshot)
  return snapshot
}

const readItemSnapshot = (
  state: DataviewProjectionState
): ProjectionFamilySnapshot<ItemId, ItemPlacement> => {
  const items = state.view.snapshot?.items
  if (!items) {
    return EMPTY_ITEM_SNAPSHOT
  }

  const cached = ITEM_SNAPSHOT_CACHE.get(items)
  if (cached) {
    return cached
  }

  const snapshot: ProjectionFamilySnapshot<ItemId, ItemPlacement> = {
    ids: items.ids,
    byId: new Map(items.ids.flatMap((itemId) => {
      const placement = items.read.placement(itemId)
      return placement
        ? [[itemId, placement] as const]
        : []
    }))
  }
  ITEM_SNAPSHOT_CACHE.set(items, snapshot)
  return snapshot
}

const readSummarySnapshot = (
  state: DataviewProjectionState
): ProjectionFamilySnapshot<SectionId, CalculationCollection> => {
  const snapshot = state.view.snapshot
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
  state: DataviewProjectionState
  totalMs: number
}): ViewTrace => {
  const stages: ViewStageTrace[] = [{
    stage: 'query',
    action: input.state.query.stage.action,
    executed: true,
    changed: input.state.query.stage.action !== 'reuse',
    durationMs: input.state.query.stage.deriveMs + input.state.query.stage.publishMs,
    deriveMs: input.state.query.stage.deriveMs,
    publishMs: input.state.query.stage.publishMs,
    ...(input.state.query.stage.metrics
      ? {
          metrics: input.state.query.stage.metrics
        }
      : {})
  }, {
    stage: 'membership',
    action: input.state.membership.stage.action,
    executed: true,
    changed: input.state.membership.stage.action !== 'reuse',
    durationMs: input.state.membership.stage.deriveMs + input.state.membership.stage.publishMs,
    deriveMs: input.state.membership.stage.deriveMs,
    publishMs: input.state.membership.stage.publishMs,
    ...(input.state.membership.stage.metrics
      ? {
          metrics: input.state.membership.stage.metrics
        }
      : {})
  }, {
    stage: 'summary',
    action: input.state.summary.stage.action,
    executed: true,
    changed: input.state.summary.stage.action !== 'reuse',
    durationMs: input.state.summary.stage.deriveMs + input.state.summary.stage.publishMs,
    deriveMs: input.state.summary.stage.deriveMs,
    publishMs: input.state.summary.stage.publishMs,
    ...(input.state.summary.stage.metrics
      ? {
          metrics: input.state.summary.stage.metrics
        }
      : {})
  }, {
    stage: 'publish',
    action: input.state.view.stage.action,
    executed: true,
    changed: input.state.view.stage.action !== 'reuse',
    durationMs: input.state.view.stage.deriveMs + input.state.view.stage.publishMs,
    deriveMs: input.state.view.stage.deriveMs,
    publishMs: input.state.view.stage.publishMs,
    ...(input.state.view.stage.metrics
      ? {
          metrics: input.state.view.stage.metrics
        }
      : {})
  }]

  return {
    plan: {
      query: input.state.query.stage.action,
      membership: input.state.membership.stage.action,
      summary: input.state.summary.stage.action,
      publish: input.state.view.stage.action
    },
    timings: {
      totalMs: input.totalMs
    },
    stages
  }
}

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

const readFamilyPatch = <TKey extends string | number>(input: {
  changed: boolean
  previous?: unknown
  next?: unknown
  patch?: EntityDelta<TKey>
}): ProjectionFamilyPatch<TKey> | 'replace' | 'skip' => {
  if (!input.changed) {
    return 'skip'
  }

  if (!input.previous || !input.next) {
    return 'replace'
  }

  return input.patch ?? 'skip'
}

export const createDataviewProjection = () => createProjection({
  createState,
  createRead: (runtime) => ({
    activeViewId: () => runtime.state().document.activeViewId,
    active: () => runtime.state().view.snapshot,
    plan: () => runtime.state().document.plan,
    indexState: () => runtime.state().index.current,
    indexTrace: () => runtime.state().index.trace,
    snapshotTrace: () => runtime.state().view.snapshotTrace,
    viewTrace: (totalMs = 0) => buildViewTrace({
      state: runtime.state(),
      totalMs
    }),
    activeTrace: (totalMs = 0) => ({
      view: buildViewTrace({
        state: runtime.state(),
        totalMs
      }),
      snapshot: runtime.state().view.snapshotTrace,
      snapshotMs: runtime.state().view.stage.publishMs
    }),
    record: (recordId: RecordId) => runtime.state().document.read?.reader.records.get(recordId),
    field: (fieldId: FieldId) => runtime.state().document.read?.reader.fields.get(fieldId),
    section: (sectionId: SectionId) => runtime.state().view.snapshot?.sections.get(sectionId),
    item: (itemId: ItemId) => runtime.state().view.snapshot?.items.read.placement(itemId),
    summary: (sectionId: SectionId) => runtime.state().view.snapshot?.summaries.get(sectionId)
  }),
  output: ({ state }) => ({
    activeViewId: state.document.activeViewId,
    active: state.view.snapshot
  }),
  surface: ({
    active: {
      kind: 'value' as const,
      read: (state: DataviewProjectionState) => state.view.snapshot,
      changed: (ctx) => ctx.phase.view.changed
    },
    fields: {
      kind: 'family' as const,
      read: readFieldSnapshot,
      idsEqual: sameOrder,
      changed: (ctx) => ctx.phase.view.changed,
      patch: (ctx) => readFamilyPatch({
        changed: ctx.phase.view.changed,
        previous: ctx.state.view.previous,
        next: ctx.state.view.snapshot,
        patch: ctx.state.view.fieldPatch
      })
    },
    sections: {
      kind: 'family' as const,
      read: readSectionSnapshot,
      idsEqual: sameOrder,
      changed: (ctx) => ctx.phase.view.changed,
      patch: (ctx) => readFamilyPatch({
        changed: ctx.phase.view.changed,
        previous: ctx.state.view.previous,
        next: ctx.state.view.snapshot,
        patch: ctx.state.view.sectionPatch
      })
    },
    items: {
      kind: 'family' as const,
      read: readItemSnapshot,
      idsEqual: sameOrder,
      changed: (ctx) => ctx.phase.view.changed,
      patch: (ctx) => readFamilyPatch({
        changed: ctx.phase.view.changed,
        previous: ctx.state.view.previous,
        next: ctx.state.view.snapshot,
        patch: ctx.state.view.itemPatch
      })
    },
    summaries: {
      kind: 'family' as const,
      read: readSummarySnapshot,
      idsEqual: sameOrder,
      changed: (ctx) => ctx.phase.view.changed,
      patch: (ctx) => readFamilyPatch({
        changed: ctx.phase.view.changed,
        previous: ctx.state.view.previous,
        next: ctx.state.view.snapshot,
        patch: ctx.state.view.summaryPatch
      })
    }
  }) satisfies ProjectionSurfaceTree<
    DataviewProjectionInput,
    DataviewProjectionState,
    DataviewProjectionPhaseName
  >,
  phases: ({
    document: (ctx) => {
      const previousActiveViewId = ctx.state.document.activeViewId
      const previousPlan = ctx.state.document.plan
      const read = createDocumentReadContext(ctx.input.document)
      const plan = resolveViewPlan(read, read.activeViewId)
      const initial = ctx.state.document.read === undefined
      const planChanged = previousActiveViewId !== read.activeViewId
        || previousPlan?.query.executionKey !== plan?.query.executionKey
        || sectionChanged({
          previousPlan,
          plan
        })
        || calculationFieldsChanged({
          previousPlan,
          plan
        })

      ctx.state.document.previousActiveViewId = previousActiveViewId
      ctx.state.document.previousPlan = previousPlan
      ctx.state.document.read = read
      ctx.state.document.activeViewId = read.activeViewId
      ctx.state.document.view = read.activeView
      ctx.state.document.plan = plan
      ctx.dirty.touchedRecords = ctx.dirty.delta.touched.records()
      ctx.dirty.touchedFields = ctx.dirty.delta.touched.fields()
      ctx.dirty.valueFields = ctx.dirty.delta.record.values.touchedFieldIds()
      ctx.dirty.schemaFields = ctx.dirty.delta.field.schema.touchedIds()
      ctx.dirty.recordSetChanged = ctx.dirty.delta.recordSetChanged()

      if (initial || planChanged || hasDeltaChanges(ctx.dirty.delta)) {
        ctx.phase.document.changed = true
        ctx.dirty.index = true
        ctx.dirty.query = true
        ctx.dirty.membership = true
        ctx.dirty.summary = true
        ctx.dirty.view = true
      }
    },
    index: {
      after: ['document'],
      run: (ctx) => {
        if (ctx.dirty.index !== true) {
          ctx.state.index.action = 'reuse'
          return
        }

        const demand = ctx.state.document.plan?.index ?? emptyNormalizedIndexDemand()
        if (!ctx.state.index.current) {
          ctx.state.index.current = createIndexState(
            ctx.input.document,
            demand
          )
          ctx.state.index.demand = demand
          ctx.state.index.delta = undefined
          ctx.state.index.trace = undefined
          ctx.state.index.action = 'rebuild'
          ctx.phase.index.changed = true
          ctx.dirty.query = true
          ctx.dirty.membership = true
          ctx.dirty.summary = true
          ctx.dirty.view = true
          return
        }

        const next = deriveIndex({
          previous: ctx.state.index.current,
          previousDemand: ctx.state.index.demand,
          document: ctx.input.document,
          delta: ctx.dirty.delta,
          demand
        })

        ctx.state.index.current = next.state
        ctx.state.index.demand = demand
        ctx.state.index.delta = next.delta
        ctx.state.index.trace = next.trace
        ctx.state.index.action = next.trace?.changed
          ? 'sync'
          : 'reuse'

        if (next.trace?.changed) {
          ctx.phase.index.changed = true
          ctx.dirty.query = true
          ctx.dirty.membership = true
          ctx.dirty.summary = true
          ctx.dirty.view = true
        }
      }
    },
    query: {
      after: ['index'],
      run: (ctx) => {
        const view = ctx.state.document.view
        const plan = ctx.state.document.plan
        const reader = ctx.state.document.read?.reader
        const activeViewId = ctx.state.document.activeViewId

        if (!view || !plan || !reader || !activeViewId || !ctx.state.index.current) {
          const changed = !isQueryStateEmpty(ctx.state.query.state)
          ctx.state.query.state = emptyQueryPhaseState()
          ctx.state.query.delta = EMPTY_QUERY_PHASE_DELTA
          ctx.state.query.stage = EMPTY_STAGE
          if (changed) {
            ctx.phase.query.changed = true
            ctx.dirty.membership = true
            ctx.dirty.summary = true
            ctx.dirty.view = true
          }
          return
        }

        if (ctx.dirty.query !== true) {
          ctx.state.query.delta = EMPTY_QUERY_PHASE_DELTA
          ctx.state.query.stage = EMPTY_STAGE
          return
        }

        const result = runQueryStage({
          reader,
          activeViewId,
          previousViewId: ctx.state.document.previousActiveViewId,
          delta: ctx.dirty.delta,
          view,
          plan: plan.query,
          previousPlan: ctx.state.document.previousPlan?.query,
          index: ctx.state.index.current,
          previous: ctx.state.query.state
        })

        ctx.state.query.state = result.state
        ctx.state.query.delta = result.delta
        ctx.state.query.stage = {
          action: result.action,
          deriveMs: result.deriveMs,
          publishMs: result.publishMs,
          metrics: result.metrics
        }

        if (result.action !== 'reuse') {
          ctx.phase.query.changed = true
          ctx.dirty.membership = true
          ctx.dirty.summary = true
          ctx.dirty.view = true
        }
      }
    },
    membership: {
      after: ['query'],
      run: (ctx) => {
        const view = ctx.state.document.view
        const activeViewId = ctx.state.document.activeViewId
        const index = ctx.state.index.current

        if (!view || !activeViewId || !index) {
          const previous = ctx.state.membership.state
          const next = emptyMembershipPhaseState()
          const changed = !isMembershipStateEmpty(previous)
          ctx.state.membership.previous = previous
          ctx.state.membership.state = next
          ctx.state.membership.delta = EMPTY_MEMBERSHIP_PHASE_DELTA
          ctx.state.membership.stage = EMPTY_STAGE
          if (changed) {
            ctx.phase.membership.changed = true
            ctx.dirty.summary = true
            ctx.dirty.view = true
          }
          return
        }

        if (ctx.dirty.membership !== true) {
          ctx.state.membership.delta = EMPTY_MEMBERSHIP_PHASE_DELTA
          ctx.state.membership.stage = EMPTY_STAGE
          return
        }

        const previous = ctx.state.membership.state
        const result = runMembershipStage({
          activeViewId,
          previousViewId: ctx.state.document.previousActiveViewId,
          delta: ctx.dirty.delta,
          view,
          query: ctx.state.query.state,
          queryDelta: ctx.state.query.delta,
          previous,
          index,
          indexDelta: ctx.state.index.delta
        })

        ctx.state.membership.previous = previous
        ctx.state.membership.state = result.state
        ctx.state.membership.delta = result.delta
        ctx.state.membership.stage = {
          action: result.action,
          deriveMs: result.deriveMs,
          publishMs: result.publishMs,
          metrics: result.metrics
        }

        if (result.action !== 'reuse') {
          ctx.phase.membership.changed = true
          ctx.dirty.summary = true
          ctx.dirty.view = true
        }
      }
    },
    summary: {
      after: ['membership'],
      run: (ctx) => {
        const view = ctx.state.document.view
        const plan = ctx.state.document.plan
        const activeViewId = ctx.state.document.activeViewId
        const index = ctx.state.index.current

        if (!view || !plan || !activeViewId || !index) {
          const previous = ctx.state.summary.state
          const next = emptySummaryPhaseState()
          const changed = !isSummaryStateEmpty(previous)
          ctx.state.summary.previous = previous
          ctx.state.summary.state = next
          ctx.state.summary.delta = EMPTY_SUMMARY_PHASE_DELTA
          ctx.state.summary.stage = EMPTY_STAGE
          if (changed) {
            ctx.phase.summary.changed = true
            ctx.dirty.view = true
          }
          return
        }

        if (ctx.dirty.summary !== true) {
          ctx.state.summary.delta = EMPTY_SUMMARY_PHASE_DELTA
          ctx.state.summary.stage = EMPTY_STAGE
          return
        }

        const previous = ctx.state.summary.state
        const result = runSummaryStage({
          activeViewId,
          previousViewId: ctx.state.document.previousActiveViewId,
          delta: ctx.dirty.delta,
          indexDelta: ctx.state.index.delta,
          view,
          calcFields: plan.calcFields,
          previous,
          previousMembership: ctx.state.membership.previous ?? ctx.state.membership.state,
          membership: ctx.state.membership.state,
          membershipAction: ctx.state.membership.stage.action,
          membershipDelta: ctx.state.membership.delta,
          index
        })

        ctx.state.summary.previous = previous
        ctx.state.summary.state = result.state
        ctx.state.summary.delta = result.delta
        ctx.state.summary.stage = {
          action: result.action,
          deriveMs: result.deriveMs,
          publishMs: result.publishMs,
          metrics: result.metrics
        }

        if (result.action !== 'reuse') {
          ctx.phase.summary.changed = true
          ctx.dirty.view = true
        }
      }
    },
    view: {
      after: ['summary'],
      run: (ctx) => {
        const previous = ctx.state.view.snapshot
        const view = ctx.state.document.view
        const activeViewId = ctx.state.document.activeViewId
        const reader = ctx.state.document.read?.reader

        ctx.state.view.previous = previous

        if (!view || !activeViewId || !reader) {
          const next = undefined
          ctx.state.view.snapshot = next
          ctx.state.view.fieldPatch = undefined
          ctx.state.view.sectionPatch = undefined
          ctx.state.view.itemPatch = undefined
          ctx.state.view.summaryPatch = undefined
          ctx.state.view.stage = previous
            ? {
                action: 'sync',
                deriveMs: 0,
                publishMs: 0
              }
            : EMPTY_STAGE
          ctx.state.view.snapshotTrace = createSnapshotTrace(previous, next)
          if (previous) {
            ctx.phase.view.changed = true
          }
          return
        }

        if (ctx.dirty.view !== true && previous) {
          ctx.state.view.fieldPatch = undefined
          ctx.state.view.sectionPatch = undefined
          ctx.state.view.itemPatch = undefined
          ctx.state.view.summaryPatch = undefined
          ctx.state.view.stage = EMPTY_STAGE
          ctx.state.view.snapshotTrace = EMPTY_SNAPSHOT_TRACE
          return
        }

        const result = runPublishStage({
          reader,
          activeViewId,
          previous,
          view,
          queryState: ctx.state.query.state,
          previousRecords: previous?.records,
          membershipState: ctx.state.membership.state,
          previousMembershipState: ctx.state.membership.previous ?? ctx.state.membership.state,
          previousSections: previous?.sections,
          previousItems: previous?.items,
          summaryState: ctx.state.summary.state,
          previousSummaryState: ctx.state.summary.previous ?? ctx.state.summary.state,
          previousSummaries: previous?.summaries,
          itemIds: ctx.state.view.itemIds
        })

        ctx.state.view.snapshot = result.snapshot
        ctx.state.view.fieldPatch = buildFieldPatch({
          previous,
          next: result.snapshot
        })
        ctx.state.view.sectionPatch = result.sectionPatch
        ctx.state.view.itemPatch = result.itemPatch
        ctx.state.view.summaryPatch = buildSummaryPatch({
          previous,
          next: result.snapshot
        })
        ctx.state.view.stage = {
          action: result.action,
          deriveMs: result.deriveMs,
          publishMs: result.publishMs,
          metrics: result.metrics
        }
        ctx.state.view.snapshotTrace = createSnapshotTrace(
          previous,
          result.snapshot
        )

        if (result.action !== 'reuse') {
          ctx.phase.view.changed = true
        }
      }
    }
  }) satisfies ProjectionPhaseTable<
    DataviewProjectionInput,
    DataviewProjectionState,
    DataviewProjectionPhaseName
  >
})
