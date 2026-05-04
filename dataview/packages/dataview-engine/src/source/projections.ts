import type {
  CardLayout,
  CardSize,
  CustomField,
  CustomFieldId,
  DataDoc,
  DataRecord,
  Field,
  FieldId,
  KanbanCardsPerColumn,
  RecordId,
  View,
  ViewId
} from '@dataview/core/types'
import {
  TITLE_FIELD_ID
} from '@dataview/core/types'
import type {
  DataviewMutationChange
} from '@dataview/core/mutation'
import type {
  ActiveViewGallery,
  ActiveViewKanban,
  ActiveViewQuery,
  ActiveViewTable,
  ViewState
} from '@dataview/engine/contracts/view'
import type {
  DataviewActiveState
} from '@dataview/engine/active/state'
import {
  createProjection,
  type ProjectionFamilyChange,
  type ProjectionFamilySnapshot,
  type ProjectionStoreTree,
  type ProjectionValueChange
} from '@shared/projection'
import type {
  ProjectionPhaseTable
} from '@shared/projection/createProjection'
import {
  entityDelta
} from '@shared/delta'
import {
  equal
} from '@shared/core'

const EMPTY_RECORD_IDS = [] as readonly RecordId[]
const EMPTY_QUERY: ActiveViewQuery = {
  search: {
    query: ''
  },
  filters: {
    rules: []
  },
  sort: {
    rules: []
  }
}
const EMPTY_TABLE: ActiveViewTable = {
  wrap: false,
  showVerticalLines: false,
  calc: new Map()
}
const EMPTY_GALLERY: ActiveViewGallery = {
  wrap: false,
  size: 'medium' as CardSize,
  layout: 'vertical' as CardLayout,
  canReorder: false,
  groupUsesOptionColors: false
}
const EMPTY_KANBAN: ActiveViewKanban = {
  wrap: false,
  size: 'medium' as CardSize,
  layout: 'vertical' as CardLayout,
  canReorder: false,
  groupUsesOptionColors: false,
  fillColumnColor: false,
  cardsPerColumn: 0 as KanbanCardsPerColumn
}
const TITLE_FIELD: Field = {
  id: TITLE_FIELD_ID,
  name: 'Title',
  kind: 'title',
  system: true,
  meta: undefined
}
const EMPTY_FIELDS = new Map<FieldId, Field>()
const EMPTY_CUSTOM_FIELDS = new Map<CustomFieldId, CustomField>()
const EMPTY_RECORDS = new Map<RecordId, DataRecord>()
const EMPTY_VIEWS = new Map<ViewId, View>()

const buildFamilySnapshot = <TKey extends string | number, TValue>(input: {
  ids: readonly TKey[]
  read: (key: TKey) => TValue | undefined
}): ProjectionFamilySnapshot<TKey, TValue> => {
  const ids: TKey[] = []
  const byId = new Map<TKey, TValue>()

  input.ids.forEach((key) => {
    const value = input.read(key)
    if (value === undefined) {
      return
    }

    ids.push(key)
    byId.set(key, value)
  })

  return {
    ids,
    byId
  }
}

const buildFamilyChange = <TKey extends string | number, TValue>(input: {
  previous: ProjectionFamilySnapshot<TKey, TValue>
  next: ProjectionFamilySnapshot<TKey, TValue>
}): ProjectionFamilyChange<TKey, TValue> => {
  const delta = entityDelta.fromSnapshots({
    previousIds: input.previous.ids,
    nextIds: input.next.ids,
    previousGet: (key) => input.previous.byId.get(key),
    nextGet: (key) => input.next.byId.get(key)
  })

  if (!delta) {
    return 'skip'
  }

  const set = delta.set?.map((key) => {
    const value = input.next.byId.get(key)
    if (value === undefined) {
      throw new Error(`Missing published projection value for key ${String(key)}.`)
    }

    return [key, value] as const
  })

  return {
    ...(delta.order
      ? {
          ids: input.next.ids
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

const toValueChange = <T,>(
  previous: T,
  next: T,
  isEqual: (left: T, right: T) => boolean = Object.is
): ProjectionValueChange<T> => isEqual(previous, next)
  ? 'skip'
  : {
      value: next
    }

interface DocumentSourceProjectionState {
  meta: DataDoc['meta']
  records: ProjectionFamilySnapshot<RecordId, DataRecord>
  fields: ProjectionFamilySnapshot<FieldId, Field>
  schemaFields: ProjectionFamilySnapshot<CustomFieldId, CustomField>
  views: ProjectionFamilySnapshot<ViewId, View>
  changes: {
    meta: ProjectionValueChange<DataDoc['meta']>
    records: ProjectionFamilyChange<RecordId, DataRecord>
    fields: ProjectionFamilyChange<FieldId, Field>
    schemaFields: ProjectionFamilyChange<CustomFieldId, CustomField>
    views: ProjectionFamilyChange<ViewId, View>
  }
}

export interface DocumentSourceProjectionInput {
  document: DataDoc
  change: DataviewMutationChange
}

const createEmptyDocumentSourceProjectionState = (): DocumentSourceProjectionState => ({
  meta: {},
  records: {
    ids: EMPTY_RECORD_IDS,
    byId: EMPTY_RECORDS
  },
  fields: {
    ids: [],
    byId: EMPTY_FIELDS
  },
  schemaFields: {
    ids: [],
    byId: EMPTY_CUSTOM_FIELDS
  },
  views: {
    ids: [],
    byId: EMPTY_VIEWS
  },
  changes: {
    meta: 'skip',
    records: 'skip',
    fields: 'skip',
    schemaFields: 'skip',
    views: 'skip'
  }
})

export const createDocumentSourceProjection = () => createProjection({
  createState: createEmptyDocumentSourceProjectionState,
  createRead: () => ({}),
  capture: () => undefined,
  stores: {
    meta: {
      kind: 'value' as const,
      read: (state: DocumentSourceProjectionState) => state.meta,
      change: (state: DocumentSourceProjectionState) => state.changes.meta,
      isEqual: equal.sameJsonValue
    },
    records: {
      kind: 'family' as const,
      read: (state: DocumentSourceProjectionState) => state.records,
      change: (state: DocumentSourceProjectionState) => state.changes.records
    },
    fields: {
      kind: 'family' as const,
      read: (state: DocumentSourceProjectionState) => state.fields,
      change: (state: DocumentSourceProjectionState) => state.changes.fields
    },
    schema: {
      fields: {
        kind: 'family' as const,
        read: (state: DocumentSourceProjectionState) => state.schemaFields,
        change: (state: DocumentSourceProjectionState) => state.changes.schemaFields
      }
    },
    views: {
      kind: 'family' as const,
      read: (state: DocumentSourceProjectionState) => state.views,
      change: (state: DocumentSourceProjectionState) => state.changes.views
    }
  } satisfies ProjectionStoreTree<DocumentSourceProjectionState>,
  plan: () => ({
    phases: ['document']
  }),
  phases: ({
    document: (ctx) => {
      const previous = {
        meta: ctx.state.meta,
        records: ctx.state.records,
        fields: ctx.state.fields,
        schemaFields: ctx.state.schemaFields,
        views: ctx.state.views
      }
      const next = {
        meta: ctx.input.document.meta,
        records: buildFamilySnapshot({
          ids: ctx.input.document.records.ids,
          read: (recordId) => ctx.input.document.records.byId[recordId]
        }),
        fields: buildFamilySnapshot({
          ids: [TITLE_FIELD_ID, ...ctx.input.document.fields.ids],
          read: (fieldId) => fieldId === TITLE_FIELD_ID
            ? TITLE_FIELD
            : ctx.input.document.fields.byId[fieldId]
        }),
        schemaFields: buildFamilySnapshot({
          ids: ctx.input.document.fields.ids,
          read: (fieldId) => ctx.input.document.fields.byId[fieldId]
        }),
        views: buildFamilySnapshot({
          ids: ctx.input.document.views.ids,
          read: (viewId) => ctx.input.document.views.byId[viewId]
        })
      }

      ctx.state.meta = next.meta
      ctx.state.records = next.records
      ctx.state.fields = next.fields
      ctx.state.schemaFields = next.schemaFields
      ctx.state.views = next.views
      ctx.state.changes = {
        meta: toValueChange(previous.meta, next.meta, equal.sameJsonValue),
        records: buildFamilyChange({
          previous: previous.records,
          next: next.records
        }),
        fields: buildFamilyChange({
          previous: previous.fields,
          next: next.fields
        }),
        schemaFields: buildFamilyChange({
          previous: previous.schemaFields,
          next: next.schemaFields
        }),
        views: buildFamilyChange({
          previous: previous.views,
          next: next.views
        })
      }

      if (
        ctx.state.changes.meta !== 'skip'
        || ctx.state.changes.records !== 'skip'
        || ctx.state.changes.fields !== 'skip'
        || ctx.state.changes.schemaFields !== 'skip'
        || ctx.state.changes.views !== 'skip'
      ) {
        ctx.phase.document.changed = true
      }
    }
  }) satisfies ProjectionPhaseTable<
    DocumentSourceProjectionInput,
    DocumentSourceProjectionState,
    {},
    'document'
  >
})

interface ActiveSourceProjectionState {
  view?: View
  viewId?: ViewId
  viewType?: View['type']
  query: ActiveViewQuery
  table: ActiveViewTable
  gallery: ActiveViewGallery
  kanban: ActiveViewKanban
  matched: readonly RecordId[]
  ordered: readonly RecordId[]
  visible: readonly RecordId[]
  fields: DataviewActiveState['fields']
  sections: DataviewActiveState['sections']
  items: DataviewActiveState['items']
  summaries: DataviewActiveState['summaries']
  changes: {
    view: ProjectionValueChange<View | undefined>
    viewId: ProjectionValueChange<ViewId | undefined>
    viewType: ProjectionValueChange<View['type'] | undefined>
    query: ProjectionValueChange<ActiveViewQuery>
    table: ProjectionValueChange<ActiveViewTable>
    gallery: ProjectionValueChange<ActiveViewGallery>
    kanban: ProjectionValueChange<ActiveViewKanban>
    matched: ProjectionValueChange<readonly RecordId[]>
    ordered: ProjectionValueChange<readonly RecordId[]>
    visible: ProjectionValueChange<readonly RecordId[]>
    fields: DataviewActiveState['changes']['fields']
    sections: DataviewActiveState['changes']['sections']
    items: DataviewActiveState['changes']['items']
    summaries: DataviewActiveState['changes']['summaries']
  }
}

export interface ActiveSourceProjectionInput {
  change: DataviewMutationChange
  active: DataviewActiveState
}

const createEmptyActiveSourceProjectionState = (): ActiveSourceProjectionState => ({
  query: EMPTY_QUERY,
  table: EMPTY_TABLE,
  gallery: EMPTY_GALLERY,
  kanban: EMPTY_KANBAN,
  matched: EMPTY_RECORD_IDS,
  ordered: EMPTY_RECORD_IDS,
  visible: EMPTY_RECORD_IDS,
  fields: {
    ids: [],
    byId: EMPTY_FIELDS
  },
  sections: {
    ids: [],
    byId: new Map()
  },
  items: {
    ids: [],
    byId: new Map()
  },
  summaries: {
    ids: [],
    byId: new Map()
  },
  changes: {
    view: 'skip',
    viewId: 'skip',
    viewType: 'skip',
    query: 'skip',
    table: 'skip',
    gallery: 'skip',
    kanban: 'skip',
    matched: 'skip',
    ordered: 'skip',
    visible: 'skip',
    fields: 'skip',
    sections: 'skip',
    items: 'skip',
    summaries: 'skip'
  }
})

export const createActiveSourceProjection = () => createProjection({
  createState: createEmptyActiveSourceProjectionState,
  createRead: () => ({}),
  capture: () => undefined,
  stores: {
    view: {
      kind: 'value' as const,
      read: (state: ActiveSourceProjectionState) => state.view,
      change: (state: ActiveSourceProjectionState) => state.changes.view
    },
    viewId: {
      kind: 'value' as const,
      read: (state: ActiveSourceProjectionState) => state.viewId,
      change: (state: ActiveSourceProjectionState) => state.changes.viewId
    },
    viewType: {
      kind: 'value' as const,
      read: (state: ActiveSourceProjectionState) => state.viewType,
      change: (state: ActiveSourceProjectionState) => state.changes.viewType
    },
    query: {
      kind: 'value' as const,
      read: (state: ActiveSourceProjectionState) => state.query,
      change: (state: ActiveSourceProjectionState) => state.changes.query
    },
    table: {
      kind: 'value' as const,
      read: (state: ActiveSourceProjectionState) => state.table,
      change: (state: ActiveSourceProjectionState) => state.changes.table
    },
    gallery: {
      kind: 'value' as const,
      read: (state: ActiveSourceProjectionState) => state.gallery,
      change: (state: ActiveSourceProjectionState) => state.changes.gallery
    },
    kanban: {
      kind: 'value' as const,
      read: (state: ActiveSourceProjectionState) => state.kanban,
      change: (state: ActiveSourceProjectionState) => state.changes.kanban
    },
    records: {
      matched: {
        kind: 'value' as const,
        read: (state: ActiveSourceProjectionState) => state.matched,
        change: (state: ActiveSourceProjectionState) => state.changes.matched,
        isEqual: equal.sameOrder
      },
      ordered: {
        kind: 'value' as const,
        read: (state: ActiveSourceProjectionState) => state.ordered,
        change: (state: ActiveSourceProjectionState) => state.changes.ordered,
        isEqual: equal.sameOrder
      },
      visible: {
        kind: 'value' as const,
        read: (state: ActiveSourceProjectionState) => state.visible,
        change: (state: ActiveSourceProjectionState) => state.changes.visible,
        isEqual: equal.sameOrder
      }
    },
    fields: {
      kind: 'family' as const,
      read: (state: ActiveSourceProjectionState) => state.fields,
      change: (state: ActiveSourceProjectionState) => state.changes.fields
    },
    sections: {
      kind: 'family' as const,
      read: (state: ActiveSourceProjectionState) => state.sections,
      change: (state: ActiveSourceProjectionState) => state.changes.sections
    },
    items: {
      kind: 'family' as const,
      read: (state: ActiveSourceProjectionState) => state.items,
      change: (state: ActiveSourceProjectionState) => state.changes.items
    },
    summaries: {
      kind: 'family' as const,
      read: (state: ActiveSourceProjectionState) => state.summaries,
      change: (state: ActiveSourceProjectionState) => state.changes.summaries
    }
  } satisfies ProjectionStoreTree<ActiveSourceProjectionState>,
  plan: () => ({
    phases: ['active']
  }),
  phases: ({
    active: (ctx) => {
      const previous = {
        view: ctx.state.view,
        viewId: ctx.state.viewId,
        viewType: ctx.state.viewType,
        query: ctx.state.query,
        table: ctx.state.table,
        gallery: ctx.state.gallery,
        kanban: ctx.state.kanban,
        matched: ctx.state.matched,
        ordered: ctx.state.ordered,
        visible: ctx.state.visible
      }
      const snapshot = ctx.input.active.snapshot
      const next = {
        view: snapshot?.view,
        viewId: snapshot?.view.id,
        viewType: snapshot?.view.type,
        query: snapshot?.query ?? EMPTY_QUERY,
        table: snapshot?.table ?? EMPTY_TABLE,
        gallery: snapshot?.gallery ?? EMPTY_GALLERY,
        kanban: snapshot?.kanban ?? EMPTY_KANBAN,
        matched: snapshot?.records.matched ?? EMPTY_RECORD_IDS,
        ordered: snapshot?.records.ordered ?? EMPTY_RECORD_IDS,
        visible: snapshot?.records.visible ?? EMPTY_RECORD_IDS
      }

      ctx.state.view = next.view
      ctx.state.viewId = next.viewId
      ctx.state.viewType = next.viewType
      ctx.state.query = next.query
      ctx.state.table = next.table
      ctx.state.gallery = next.gallery
      ctx.state.kanban = next.kanban
      ctx.state.matched = next.matched
      ctx.state.ordered = next.ordered
      ctx.state.visible = next.visible
      ctx.state.fields = ctx.input.active.fields
      ctx.state.sections = ctx.input.active.sections
      ctx.state.items = ctx.input.active.items
      ctx.state.summaries = ctx.input.active.summaries
      ctx.state.changes = {
        view: toValueChange(previous.view, next.view),
        viewId: toValueChange(previous.viewId, next.viewId),
        viewType: toValueChange(previous.viewType, next.viewType),
        query: toValueChange(previous.query, next.query),
        table: toValueChange(previous.table, next.table),
        gallery: toValueChange(previous.gallery, next.gallery),
        kanban: toValueChange(previous.kanban, next.kanban),
        matched: toValueChange(previous.matched, next.matched, equal.sameOrder),
        ordered: toValueChange(previous.ordered, next.ordered, equal.sameOrder),
        visible: toValueChange(previous.visible, next.visible, equal.sameOrder),
        fields: ctx.input.active.changes.fields,
        sections: ctx.input.active.changes.sections,
        items: ctx.input.active.changes.items,
        summaries: ctx.input.active.changes.summaries
      }

      if (
        ctx.state.changes.view !== 'skip'
        || ctx.state.changes.viewId !== 'skip'
        || ctx.state.changes.viewType !== 'skip'
        || ctx.state.changes.query !== 'skip'
        || ctx.state.changes.table !== 'skip'
        || ctx.state.changes.gallery !== 'skip'
        || ctx.state.changes.kanban !== 'skip'
        || ctx.state.changes.matched !== 'skip'
        || ctx.state.changes.ordered !== 'skip'
        || ctx.state.changes.visible !== 'skip'
        || ctx.state.changes.fields !== 'skip'
        || ctx.state.changes.sections !== 'skip'
        || ctx.state.changes.items !== 'skip'
        || ctx.state.changes.summaries !== 'skip'
      ) {
        ctx.phase.active.changed = true
      }
    }
  }) satisfies ProjectionPhaseTable<
    ActiveSourceProjectionInput,
    ActiveSourceProjectionState,
    {},
    'active'
  >
})
