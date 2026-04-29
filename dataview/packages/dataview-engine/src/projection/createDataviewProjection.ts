import type {
  CalculationCollection
} from '@dataview/core/view'
import type {
  DataDoc,
  Field,
  FieldId,
  RecordId,
  ViewId
} from '@dataview/core/types'
import {
  createProjection,
  type ProjectionFamilyPatch,
  type ProjectionFamilySnapshot,
  type ProjectionPhaseTable,
  type ProjectionSurfaceTree
} from '@shared/projection'
import type {
  DataviewFrame
} from '@dataview/engine/active/frame'
import {
  createDataviewFrame
} from '@dataview/engine/active/frame'
import {
  createDataviewActivePlan,
  type DataviewActivePlan,
  createDataviewLastActive
} from '@dataview/engine/active/plan'
import {
  createDataviewActiveState
} from '@dataview/engine/active/runtime'
import {
  runDataviewActive
} from '@dataview/engine/active/runtime'
import type {
  DataviewState
} from '@dataview/engine/active/state'
import {
  emptyDataviewIndexBank,
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

export type DataviewProjectionPhaseName =
  | 'frame'
  | 'active'

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

const sameOrder = <T,>(
  left: readonly T[],
  right: readonly T[]
): boolean => (
  left.length === right.length
  && left.every((value, index) => Object.is(value, right[index]))
)

const readFieldSnapshot = (
  state: DataviewState
): ProjectionFamilySnapshot<FieldId, Field> => {
  const fields = state.active.snapshot?.fields
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
  state: DataviewState
): ProjectionFamilySnapshot<SectionId, Section> => {
  const sections = state.active.snapshot?.sections
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
  state: DataviewState
): ProjectionFamilySnapshot<ItemId, ItemPlacement> => {
  const items = state.active.snapshot?.items
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

const readFamilyPatch = <TKey extends string | number>(input: {
  changed: boolean
  previous?: unknown
  next?: unknown
  patch?: ProjectionFamilyPatch<TKey>
}): ProjectionFamilyPatch<TKey> | 'replace' | 'skip' => {
  if (!input.changed) {
    return 'skip'
  }

  if (!input.previous || !input.next) {
    return 'replace'
  }

  return input.patch ?? 'skip'
}

const createState = (): DataviewState => ({
  index: emptyDataviewIndexBank(),
  active: createDataviewActiveState()
})

const EMPTY_INACTIVE_PLAN: DataviewActivePlan = {
  reset: false,
  reasons: {
    lifecycle: {
      phaseRebuild: false,
      reset: false
    },
    query: {
      sync: false,
      reuse: {
        matched: false,
        ordered: false
      }
    },
    membership: {
      grouped: false,
      rebuild: false,
      sync: false
    },
    summary: {
      enabled: false,
      rebuild: false,
      sync: false,
      sectionChanged: false
    },
    index: {
      rebuilt: false,
      switched: false,
      bucketRebuild: false,
      bucketChanged: false
    },
    publish: {
      snapshotRebuild: false,
      layoutChanged: false
    }
  },
  query: {
    action: 'reuse'
  },
  membership: {
    action: 'reuse'
  },
  summary: {
    action: 'reuse'
  },
  publish: {
    action: 'reuse'
  }
}

export const createDataviewProjection = () => createProjection({
  createState,
  createRead: (runtime) => ({
    activeId: () => runtime.state().frame?.active?.id,
    active: () => runtime.state().active.snapshot,
    frame: () => runtime.state().frame,
    indexState: () => {
      const key = runtime.state().index.currentKey
      return key
        ? runtime.state().index.entries.get(key)?.state
        : undefined
    },
    indexTrace: () => {
      const key = runtime.state().index.currentKey
      return key
        ? runtime.state().index.entries.get(key)?.trace
        : undefined
    },
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
    }),
    record: (recordId: RecordId) => runtime.state().frame?.reader.records.get(recordId),
    field: (fieldId: FieldId) => runtime.state().frame?.reader.fields.get(fieldId),
    section: (sectionId: SectionId) => runtime.state().active.snapshot?.sections.get(sectionId),
    item: (itemId: ItemId) => runtime.state().active.snapshot?.items.read.placement(itemId),
    summary: (sectionId: SectionId) => runtime.state().active.snapshot?.summaries.get(sectionId)
  }),
  output: ({ state }) => ({
    activeId: state.frame?.active?.id,
    active: state.active.snapshot
  }),
  surface: ({
    active: {
      kind: 'value' as const,
      read: (state: DataviewState) => state.active.snapshot,
      changed: (ctx) => ctx.phase.active.changed
    },
    fields: {
      kind: 'family' as const,
      read: readFieldSnapshot,
      idsEqual: sameOrder,
      changed: (ctx) => ctx.phase.active.changed,
      patch: (ctx) => readFamilyPatch({
        changed: ctx.phase.active.changed,
        previous: ctx.previous,
        next: ctx.next,
        patch: ctx.state.active.patches.fields
      })
    },
    sections: {
      kind: 'family' as const,
      read: readSectionSnapshot,
      idsEqual: sameOrder,
      changed: (ctx) => ctx.phase.active.changed,
      patch: (ctx) => readFamilyPatch({
        changed: ctx.phase.active.changed,
        previous: ctx.previous,
        next: ctx.next,
        patch: ctx.state.active.patches.sections
      })
    },
    items: {
      kind: 'family' as const,
      read: readItemSnapshot,
      idsEqual: sameOrder,
      changed: (ctx) => ctx.phase.active.changed,
      patch: (ctx) => readFamilyPatch({
        changed: ctx.phase.active.changed,
        previous: ctx.previous,
        next: ctx.next,
        patch: ctx.state.active.patches.items
      })
    },
    summaries: {
      kind: 'family' as const,
      read: readSummarySnapshot,
      idsEqual: sameOrder,
      changed: (ctx) => ctx.phase.active.changed,
      patch: (ctx) => readFamilyPatch({
        changed: ctx.phase.active.changed,
        previous: ctx.previous,
        next: ctx.next,
        patch: ctx.state.active.patches.summaries
      })
    }
  }) satisfies ProjectionSurfaceTree<
    DataviewProjectionInput,
    DataviewState,
    DataviewProjectionPhaseName
  >,
  phases: ({
    frame: (ctx) => {
      ctx.state.frame = createDataviewFrame({
        revision: ctx.revision,
        document: ctx.input.document,
        delta: ctx.input.delta
      })
      if (ctx.input.delta.reset === true || ctx.input.delta.changes.size > 0) {
        ctx.phase.frame.changed = true
      }
    },
    active: {
      after: ['frame'],
      run: (ctx) => {
        const previousSnapshot = ctx.state.active.snapshot
        const ensured = ctx.state.frame
          ? ensureDataviewIndex({
              frame: ctx.state.frame,
              previous: ctx.state.index
            })
          : {
              bank: ctx.state.index
            }
        const plan = ctx.state.frame
          ? createDataviewActivePlan({
              frame: ctx.state.frame,
              state: ctx.state,
              index: ensured.current
            })
          : EMPTY_INACTIVE_PLAN
        const nextActive = ctx.state.frame
          ? runDataviewActive({
              frame: ctx.state.frame,
              plan,
              index: ensured.current,
              previous: ctx.state.active
            })
          : ctx.state.active

        ctx.state.index = ensured.bank
        ctx.state.active = nextActive
        ctx.state.lastActive = createDataviewLastActive(ctx.state.frame?.active)
        if (previousSnapshot !== nextActive.snapshot) {
          ctx.phase.active.changed = true
        }
      }
    }
  }) satisfies ProjectionPhaseTable<
    DataviewProjectionInput,
    DataviewState,
    DataviewProjectionPhaseName
  >
})
