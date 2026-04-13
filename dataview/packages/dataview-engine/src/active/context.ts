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
  createRecordFieldWriteAction,
  createUniqueFieldName,
  isTitleFieldId
} from '@dataview/core/field'
import {
  getDocumentActiveView,
  getDocumentActiveViewId,
  getDocumentFieldById
} from '@dataview/core/document'
import { group as groupCore } from '@dataview/core/group'
import { reorderViewOrders } from '@dataview/core/view'
import {
  read,
  sameJsonValue,
  type ReadStore
} from '@shared/core'
import { meta, renderMessage } from '@dataview/meta'
import type {
  ActionResult,
  ActiveViewApi,
  DocumentSelectApi,
  FieldsApi,
  GalleryState,
  ItemId,
  ItemList,
  KanbanState,
  RecordsApi
} from '#dataview-engine/contracts/public'
import { selectDocument } from '#dataview-engine/runtime/selectors/document'
import type { RuntimeStore } from '#dataview-engine/runtime/store'
import {
  createActiveSelect,
  createActiveStateStore,
  createGalleryStateStore,
  createKanbanStateStore
} from '#dataview-engine/active/selectors'

type ActiveViewPatchAction = Extract<Action, { type: 'view.patch' }>

export interface ActiveContextOptions {
  store: RuntimeStore
  select: DocumentSelectApi
  dispatch: (action: Action | readonly Action[]) => ActionResult
  fields: Pick<FieldsApi, 'list' | 'create'>
  records: Pick<RecordsApi, 'values'>
}

export interface ActiveViewContext {
  id: ActiveViewApi['id']
  config: ActiveViewApi['config']
  state: ActiveViewApi['state']
  select: ActiveViewApi['select']
  galleryState: ReadStore<GalleryState | undefined>
  kanbanState: ReadStore<KanbanState | undefined>
  readDocument: () => import('@dataview/core/contracts').DataDoc
  readConfig: () => View | undefined
  readState: () => import('#dataview-engine/contracts/public').ViewState | undefined
  commit: (action: Action | readonly Action[]) => boolean
  commitPatch: (patch: ViewPatch) => boolean
  withView: <T>(fn: (view: View) => T) => T | undefined
  withField: <T>(fieldId: FieldId, fn: (view: View, field: Field) => T) => T | undefined
  withFilterField: <T>(index: number, fn: (view: View, field: Field | undefined) => T) => T | undefined
  withGroupField: <T>(fn: (view: View, field: Field) => T) => T | undefined
  createMoveOrderAction: (
    recordIds: readonly RecordId[],
    beforeRecordId?: RecordId
  ) => ActiveViewPatchAction | undefined
  createField: (input?: {
    name?: string
    kind?: CustomFieldKind
  }) => CustomFieldId | undefined
  documentSelect: DocumentSelectApi
  recordsApi: Pick<RecordsApi, 'values'>
  dispatch: ActiveContextOptions['dispatch']
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

export const createActiveContext = (
  options: ActiveContextOptions
): ActiveViewContext => {
  const id = selectDocument({
    store: options.store,
    read: getDocumentActiveViewId
  })
  const config = selectDocument({
    store: options.store,
    read: getDocumentActiveView
  })
  const state = createActiveStateStore(options.store)
  const select = createActiveSelect(state)
  const galleryState = createGalleryStateStore(state)
  const kanbanState = createKanbanStateStore(state)
  const readDocument = () => read(options.select.document)
  const readConfig = () => read(config)
  const readState = () => read(state)
  const commit = (action: Action | readonly Action[]) => options.dispatch(action).applied

  const createPatchAction = (
    patch: ViewPatch
  ): ActiveViewPatchAction | undefined => {
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
  ): ActiveViewPatchAction | undefined => withView(view => {
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
    documentSelect: options.select,
    recordsApi: options.records,
    dispatch: options.dispatch
  }
}
