import type {
  Action,
  CustomFieldId,
  CustomFieldKind,
  Field,
  FieldId,
  RecordId,
  View,
  ViewGroup,
  ViewPatch
} from '@dataview/core/contracts'
import {
  getDocumentActiveView,
  getDocumentActiveViewId,
  getDocumentFieldById
} from '@dataview/core/document'
import {
  createRecordFieldWriteAction,
  createUniqueFieldName,
  isTitleFieldId
} from '@dataview/core/field'
import { group as groupCore } from '@dataview/core/group'
import {
  reorderViewOrders
} from '@dataview/core/view'
import {
  createDerivedStore,
  read,
  sameJsonValue,
  type ReadStore
} from '@shared/core'
import { meta, renderMessage } from '@dataview/meta'
import type {
  ActionResult,
  DocumentReadApi,
  FieldList,
  FieldsApi,
  GalleryState,
  ItemId,
  ItemList,
  KanbanState,
  RecordsApi,
  ViewApi,
  ViewSelectApi,
  ViewState
} from '../../contracts/public'
import { createStoreSelector, selectDocument } from '../../state/select'
import type { Store } from '../../state/store'

type ViewPatchAction = Extract<Action, { type: 'view.patch' }>

const usesOptionGroupingColors = (
  field?: Pick<Field, 'kind'>
) => {
  if (!field || field.kind === 'title') {
    return false
  }

  return (
    field.kind === 'select'
    || field.kind === 'multiSelect'
    || field.kind === 'status'
  )
}

const sameViewState = (
  left: ViewState | undefined,
  right: ViewState | undefined
) => left === right || (
  !!left
  && !!right
  && left.view === right.view
  && left.query === right.query
  && left.records === right.records
  && left.sections === right.sections
  && left.items === right.items
  && left.fields === right.fields
  && left.summaries === right.summaries
)

const sameGalleryState = (
  left: GalleryState | undefined,
  right: GalleryState | undefined
) => left === right || (
  !!left
  && !!right
  && left.groupUsesOptionColors === right.groupUsesOptionColors
  && left.canReorder === right.canReorder
  && left.cardSize === right.cardSize
)

const sameKanbanState = (
  left: KanbanState | undefined,
  right: KanbanState | undefined
) => left === right || (
  !!left
  && !!right
  && left.groupUsesOptionColors === right.groupUsesOptionColors
  && left.cardsPerColumn === right.cardsPerColumn
  && left.fillColumnColor === right.fillColumnColor
  && left.canReorder === right.canReorder
)

export const createViewSelect = (
  state: ReadStore<ViewState | undefined>
): ViewSelectApi => (
  selector,
  isEqual
) => createDerivedStore({
  get: () => selector(read(state)),
  ...(isEqual ? { isEqual } : {})
})

export const createViewStateStore = (
  store: Store
) => createStoreSelector<ViewState | undefined>({
  store,
  read: state => state.currentView.snapshot,
  isEqual: sameViewState
})

export const createGalleryStateStore = (
  state: ReadStore<ViewState | undefined>
) => createDerivedStore<GalleryState | undefined>({
  get: () => {
    const current = read(state)
    if (!current || current.view.type !== 'gallery') {
      return undefined
    }

    const groupField = current.query.group.field
    const groupUsesOptionColors = usesOptionGroupingColors(groupField)
    const canReorder = !current.query.group.active && !current.query.sort.active

    return {
      groupUsesOptionColors,
      canReorder,
      cardSize: current.view.options.gallery.cardSize
    }
  },
  isEqual: sameGalleryState
})

export const createKanbanStateStore = (
  state: ReadStore<ViewState | undefined>
) => createDerivedStore<KanbanState | undefined>({
  get: () => {
    const current = read(state)
    if (!current || current.view.type !== 'kanban') {
      return undefined
    }

    const groupField = current.query.group.field
    const groupUsesOptionColors = usesOptionGroupingColors(groupField)

    return {
      groupUsesOptionColors,
      cardsPerColumn: current.view.options.kanban.cardsPerColumn,
      fillColumnColor: groupUsesOptionColors && current.view.options.kanban.fillColumnColor,
      canReorder: current.query.group.active && !current.query.sort.active
    }
  },
  isEqual: sameKanbanState
})

export interface ViewBaseOptions {
  store: Store
  read: DocumentReadApi
  dispatch: (action: Action | readonly Action[]) => ActionResult
  fields: Pick<FieldsApi, 'list' | 'create'>
  records: Pick<RecordsApi, 'values'>
}

export interface ViewBaseContext {
  id: ViewApi['id']
  config: ViewApi['config']
  state: ViewApi['state']
  select: ViewApi['select']
  galleryState: ReadStore<GalleryState | undefined>
  kanbanState: ReadStore<KanbanState | undefined>
  readDocument: () => import('@dataview/core/contracts').DataDoc
  readConfig: () => View | undefined
  readState: () => ViewState | undefined
  commit: (action: Action | readonly Action[]) => boolean
  commitPatch: (patch: ViewPatch) => boolean
  withView: <T>(fn: (view: View) => T) => T | undefined
  withField: <T>(fieldId: FieldId, fn: (view: View, field: Field) => T) => T | undefined
  withFilterField: <T>(index: number, fn: (view: View, field: Field | undefined) => T) => T | undefined
  withGroupField: <T>(fn: (view: View, field: Field) => T) => T | undefined
  createMoveOrderAction: (
    recordIds: readonly RecordId[],
    beforeRecordId?: RecordId
  ) => ViewPatchAction | undefined
  createField: (input?: {
    name?: string
    kind?: CustomFieldKind
  }) => CustomFieldId | undefined
  documentRead: DocumentReadApi
  recordsApi: Pick<RecordsApi, 'values'>
  dispatch: ViewBaseOptions['dispatch']
}

export const createGroupValueActions = (input: {
  readRecord: (recordId: RecordId) => import('@dataview/core/contracts').DataRecord | undefined
  group: ViewGroup
  field: Field
  items: ItemList
  itemIds: readonly ItemId[]
  targetSection: string
}): readonly Action[] | undefined => {
  const fieldId = input.group.field
  const itemIdsByRecordId = new Map<RecordId, ItemId[]>()

  input.itemIds.forEach(itemId => {
    const recordId = input.items.get(itemId)?.recordId
    if (!recordId) {
      return
    }

    const ids = itemIdsByRecordId.get(recordId)
    if (ids) {
      ids.push(itemId)
      return
    }

    itemIdsByRecordId.set(recordId, [itemId])
  })

  const actions: Action[] = []

  for (const [recordId, itemIds] of itemIdsByRecordId) {
    const record = input.readRecord(recordId)
    const initialValue = isTitleFieldId(fieldId)
      ? record?.title
      : record?.values[fieldId]
    let currentValue = initialValue

    for (const itemId of itemIds) {
      const next = groupCore.write.next({
        field: input.field,
        group: input.group,
        currentValue,
        fromKey: input.items.get(itemId)?.sectionKey,
        toKey: input.targetSection
      })
      if (next.kind === 'invalid') {
        return undefined
      }

      currentValue = next.kind === 'clear'
        ? undefined
        : next.value
    }

    if (sameJsonValue(initialValue, currentValue)) {
      continue
    }

    actions.push(createRecordFieldWriteAction(recordId, fieldId, currentValue))
  }

  return actions
}

export const createViewBase = (
  options: ViewBaseOptions
): ViewBaseContext => {
  const id = selectDocument({
    store: options.store,
    read: getDocumentActiveViewId
  })
  const config = selectDocument({
    store: options.store,
    read: getDocumentActiveView
  })
  const state = createViewStateStore(options.store)
  const select = createViewSelect(state)
  const galleryState = createGalleryStateStore(state)
  const kanbanState = createKanbanStateStore(state)
  const readDocument = () => read(options.read.document)
  const readConfig = () => read(config)
  const readState = () => read(state)
  const commit = (action: Action | readonly Action[]) => options.dispatch(action).applied

  const createPatchAction = (
    patch: ViewPatch
  ): ViewPatchAction | undefined => {
    const viewId = id.get()
    return viewId
      ? {
          type: 'view.patch',
          viewId,
          patch
        }
      : undefined
  }

  const commitPatch = (patch: ViewPatch): boolean => {
    const action = createPatchAction(patch)
    return action
      ? commit(action)
      : false
  }

  const withView = <T,>(
    fn: (view: View) => T
  ): T | undefined => {
    const view = readConfig()
    if (!view) {
      return undefined
    }

    return fn(view)
  }

  const withField = <T,>(
    fieldId: FieldId,
    fn: (view: View, field: Field) => T
  ): T | undefined => withView(view => {
    const field = getDocumentFieldById(readDocument(), fieldId)
    if (!field) {
      return undefined
    }

    return fn(view, field)
  })

  const withFilterField = <T,>(
    index: number,
    fn: (view: View, field: Field | undefined) => T
  ): T | undefined => withView(view => {
    const fieldId = view.filter.rules[index]?.fieldId
    return fn(
      view,
      fieldId
        ? getDocumentFieldById(readDocument(), fieldId)
        : undefined
    )
  })

  const withGroupField = <T,>(
    fn: (view: View, field: Field) => T
  ): T | undefined => withView(view => {
    if (!view.group) {
      return undefined
    }

    const field = getDocumentFieldById(readDocument(), view.group.field)
    if (!field) {
      return undefined
    }

    return fn(view, field)
  })

  const createMoveOrderAction = (
    recordIds: readonly RecordId[],
    beforeRecordId?: RecordId
  ): ViewPatchAction | undefined => withView(view => {
    if (!recordIds.length) {
      return undefined
    }

    return createPatchAction({
      orders: reorderViewOrders({
        allRecordIds: readDocument().records.order,
        currentOrder: view.orders,
        movingRecordIds: recordIds,
        beforeRecordId
      })
    })
  })

  const createField = (input?: {
    name?: string
    kind?: CustomFieldKind
  }): CustomFieldId | undefined => {
    const kind = input?.kind ?? 'text'
    const explicitName = input?.name?.trim()
    const name = explicitName || createUniqueFieldName(
      renderMessage(meta.field.kind.get(kind).defaultName),
      options.fields.list()
    )

    if (!name) {
      return undefined
    }

    return options.fields.create({
      name,
      kind
    })
  }

  return {
    id,
    config,
    state,
    select,
    galleryState,
    kanbanState,
    readDocument,
    readConfig,
    readState,
    commit,
    commitPatch,
    withView,
    withField,
    withFilterField,
    withGroupField,
    createMoveOrderAction,
    createField,
    documentRead: options.read,
    recordsApi: options.records,
    dispatch: options.dispatch
  }
}
