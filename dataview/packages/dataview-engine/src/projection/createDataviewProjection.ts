import type {
  CardLayout,
  CardSize,
  CustomField,
  CustomFieldId,
  DataDoc,
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
import {
  type DataviewMutationChange,
} from '@dataview/core/mutation'
import {
  createProjection,
  type ProjectionFamilySnapshot,
  type ProjectionStoreTree
} from '@shared/projection'
import type {
  ProjectionPhaseTable
} from '@shared/projection/createProjection'
import {
  createDataviewFrame,
  createDataviewResolvedContext,
  type DataviewResolvedContext
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
  Section,
  SectionId
} from '@dataview/engine/contracts/shared'
import type {
  ActiveViewGallery,
  ActiveViewKanban,
  ActiveViewQuery,
  ActiveViewTable,
  ViewState
} from '@dataview/engine/contracts/view'
import type {
  CalculationCollection
} from '@dataview/core/view'
import {
  equal
} from '@shared/core'

const TITLE_FIELD: Field = {
  id: TITLE_FIELD_ID,
  name: 'Title',
  kind: 'title',
  system: true,
  meta: undefined
}

const EMPTY_RECORD_IDS = [] as readonly RecordId[]
const EMPTY_FIELD_IDS = [] as readonly FieldId[]
const EMPTY_VIEW_IDS = [] as readonly ViewId[]
const EMPTY_DOCUMENT_FIELDS = new Map<FieldId, Field>()
const EMPTY_DOCUMENT_RECORDS = new Map<RecordId, DataDoc['records']['byId'][RecordId]>()
const EMPTY_DOCUMENT_VIEWS = new Map<ViewId, View>()
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
  cardsPerColumn: 25 as KanbanCardsPerColumn
}

export type DataviewProjectionPhaseName = 'document' | 'active'

export interface DataviewProjectionInput {
  document: DataDoc
  change: DataviewMutationChange
}

export interface DataviewProjectionOutput {
  activeId?: ViewId
  active?: ViewState
}

export interface DataviewProjectionRead {
  document: {
    current(): DataDoc | undefined
    query(): DataviewResolvedContext | undefined
  }
  active: {
    id(): ViewId | undefined
    state(): DataviewState['active']
    snapshot(): ViewState | undefined
  }
  index: {
    state(): DataviewState['active']['index']
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

const readDocumentRecords = (
  state: DataviewState
): ProjectionFamilySnapshot<RecordId, DataDoc['records']['byId'][RecordId]> => state.document?.current
  ? buildFamilySnapshot({
      ids: state.document.current.records.ids,
      read: (recordId) => state.document?.current?.records.byId[recordId]
    })
  : {
      ids: EMPTY_RECORD_IDS,
      byId: EMPTY_DOCUMENT_RECORDS
    }

const readDocumentFields = (
  state: DataviewState
): ProjectionFamilySnapshot<FieldId, Field> => state.document?.current
  ? buildFamilySnapshot({
      ids: [TITLE_FIELD_ID, ...state.document.current.fields.ids],
      read: (fieldId) => fieldId === TITLE_FIELD_ID
        ? TITLE_FIELD
        : state.document?.current?.fields.byId[fieldId]
    })
  : {
      ids: EMPTY_FIELD_IDS,
      byId: EMPTY_DOCUMENT_FIELDS
    }

const EMPTY_CUSTOM_FIELDS = new Map<CustomFieldId, CustomField>()

const readDocumentSchemaFields = (
  state: DataviewState
): ProjectionFamilySnapshot<CustomFieldId, CustomField> => state.document?.current
  ? buildFamilySnapshot({
      ids: state.document.current.fields.ids as readonly CustomFieldId[],
      read: (fieldId) => state.document?.current?.fields.byId[fieldId]
    })
  : {
      ids: EMPTY_FIELD_IDS as readonly CustomFieldId[],
      byId: EMPTY_CUSTOM_FIELDS
    }

const readDocumentViews = (
  state: DataviewState
): ProjectionFamilySnapshot<ViewId, View> => state.document?.current
  ? buildFamilySnapshot({
      ids: state.document.current.views.ids,
      read: (viewId) => state.document?.current?.views.byId[viewId]
    })
  : {
      ids: EMPTY_VIEW_IDS,
      byId: EMPTY_DOCUMENT_VIEWS
    }

const toValueChange = <T,>(
  value: T
) => ({
  value
})

export const createDataviewProjectionRead = (runtime: {
  state: () => DataviewState
}): DataviewProjectionRead => ({
  document: {
    current: () => runtime.state().document?.current,
    query: () => runtime.state().document?.query
  },
  active: {
    id: () => runtime.state().active.spec?.id,
    state: () => runtime.state().active,
    snapshot: () => runtime.state().active.snapshot
  },
  index: {
    state: () => runtime.state().active.index
  }
})

export const createDataviewProjection = () => createProjection({
  createState,
  createRead: createDataviewProjectionRead,
  capture: ({ read }) => ({
    activeId: read.active.id(),
    active: read.active.snapshot()
  }),
  stores: {
    document: {
      meta: {
        kind: 'value' as const,
        read: (state: DataviewState) => state.document?.current.meta ?? {},
        change: (state: DataviewState) => toValueChange(
          state.document?.current.meta ?? {}
        ),
        isEqual: equal.sameJsonValue
      },
      records: {
        kind: 'family' as const,
        read: readDocumentRecords,
        change: () => 'replace'
      },
      fields: {
        kind: 'family' as const,
        read: readDocumentFields,
        change: () => 'replace'
      },
      schema: {
        fields: {
          kind: 'family' as const,
          read: readDocumentSchemaFields,
          change: () => 'replace'
        }
      },
      views: {
        kind: 'family' as const,
        read: readDocumentViews,
        change: () => 'replace'
      }
    },
    active: {
      view: {
        kind: 'value' as const,
        read: (state: DataviewState) => state.active.snapshot?.view,
        change: (state: DataviewState) => toValueChange(
          state.active.snapshot?.view
        )
      },
      viewId: {
        kind: 'value' as const,
        read: (state: DataviewState) => state.active.snapshot?.view.id,
        change: (state: DataviewState) => toValueChange(
          state.active.snapshot?.view.id
        )
      },
      viewType: {
        kind: 'value' as const,
        read: (state: DataviewState) => state.active.snapshot?.view.type,
        change: (state: DataviewState) => toValueChange(
          state.active.snapshot?.view.type
        )
      },
      query: {
        kind: 'value' as const,
        read: (state: DataviewState) => state.active.snapshot?.query ?? EMPTY_QUERY,
        change: (state: DataviewState) => toValueChange(
          state.active.snapshot?.query ?? EMPTY_QUERY
        )
      },
      table: {
        kind: 'value' as const,
        read: (state: DataviewState) => state.active.snapshot?.table ?? EMPTY_TABLE,
        change: (state: DataviewState) => toValueChange(
          state.active.snapshot?.table ?? EMPTY_TABLE
        )
      },
      gallery: {
        kind: 'value' as const,
        read: (state: DataviewState) => state.active.snapshot?.gallery ?? EMPTY_GALLERY,
        change: (state: DataviewState) => toValueChange(
          state.active.snapshot?.gallery ?? EMPTY_GALLERY
        )
      },
      kanban: {
        kind: 'value' as const,
        read: (state: DataviewState) => state.active.snapshot?.kanban ?? EMPTY_KANBAN,
        change: (state: DataviewState) => toValueChange(
          state.active.snapshot?.kanban ?? EMPTY_KANBAN
        )
      },
      records: {
        matched: {
          kind: 'value' as const,
          read: (state: DataviewState) => state.active.snapshot?.records.matched ?? EMPTY_RECORD_IDS,
          change: (state: DataviewState) => toValueChange(
            state.active.snapshot?.records.matched ?? EMPTY_RECORD_IDS
          )
        },
        ordered: {
          kind: 'value' as const,
          read: (state: DataviewState) => state.active.snapshot?.records.ordered ?? EMPTY_RECORD_IDS,
          change: (state: DataviewState) => toValueChange(
            state.active.snapshot?.records.ordered ?? EMPTY_RECORD_IDS
          )
        },
        visible: {
          kind: 'value' as const,
          read: (state: DataviewState) => state.active.snapshot?.records.visible ?? EMPTY_RECORD_IDS,
          change: (state: DataviewState) => toValueChange(
            state.active.snapshot?.records.visible ?? EMPTY_RECORD_IDS
          )
        }
      },
      fields: {
        kind: 'family' as const,
        read: (state: DataviewState) => state.active.fields,
        change: (state: DataviewState) => state.active.changes.fields
      },
      sections: {
        kind: 'family' as const,
        read: (state: DataviewState) => state.active.sections,
        change: (state: DataviewState) => state.active.changes.sections
      },
      items: {
        kind: 'family' as const,
        read: (state: DataviewState) => state.active.items,
        change: (state: DataviewState) => state.active.changes.items
      },
      summaries: {
        kind: 'family' as const,
        read: (state: DataviewState) => state.active.summaries,
        change: (state: DataviewState) => state.active.changes.summaries
      }
    }
  } satisfies ProjectionStoreTree<DataviewState>,
  plan: () => ({
    phases: ['document', 'active']
  }),
  phases: ({
    document: (ctx) => {
      ctx.state.document = {
        current: ctx.input.document,
        query: createDataviewResolvedContext(ctx.input.document)
      }
      ctx.phase.document.changed = true
    },
    active: {
      after: ['document'],
      run: (ctx) => {
        const frame = createDataviewFrame({
          revision: ctx.revision,
          document: ctx.input.document,
          change: ctx.input.change
        })
        const index = ensureDataviewIndex({
          frame,
          previous: ctx.read.index.state()
        })
        const nextActive = runDataviewActive({
          frame,
          plan: createDataviewActivePlan({
            frame,
            previous: ctx.read.active.state(),
            index
          }),
          index,
          previous: ctx.read.active.state()
        })

        ctx.state.revision = ctx.revision
        ctx.state.active = nextActive
        if (didActiveChange(ctx.state)) {
          ctx.phase.active.changed = true
        }
      }
    }
  }) satisfies ProjectionPhaseTable<
    DataviewProjectionInput,
    DataviewState,
    DataviewProjectionRead,
    DataviewProjectionPhaseName
  >
})
