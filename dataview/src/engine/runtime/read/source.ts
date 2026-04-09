import type { CustomFieldId, DataDoc, CustomField, Row, View, RecordId, ViewId } from '@dataview/core/contracts'
import {
  createDerivedStore,
  createKeyedDerivedStore,
  createValueStore,
  type ReadStore,
  type ValueStore,
  type KeyedReadStore
} from '@shared/store'
import {
  getDocumentActiveView,
  getDocumentActiveViewId,
  getDocumentCustomFieldById,
  getDocumentRecordById,
  getDocumentViewById
} from '@dataview/core/document'
import {
  resolveViewProjection,
  type ViewProjection
} from '@dataview/engine/projection/view'
import {
  resolveViewFilterProjection,
  type ViewFilterProjection
} from '@dataview/core/filter'
import {
  resolveViewGroupProjection,
  type ViewGroupProjection
} from '@dataview/core/group'
import {
  resolveViewSearchProjection,
  type ViewSearchProjection
} from '@dataview/core/search'
import {
  resolveViewSortProjection,
  type ViewSortProjection
} from '@dataview/core/sort'

export const equalIds = <T extends string>(left: readonly T[], right: readonly T[]) => (
  left.length === right.length && left.every((value, index) => value === right[index])
)

export interface ReadSource {
  document: ValueStore<DataDoc>
  activeViewId: ReadStore<ViewId | undefined>
  activeView: ReadStore<View | undefined>
  recordIds: ReadStore<readonly RecordId[]>
  record: KeyedReadStore<RecordId, Row | undefined>
  customFieldIds: ReadStore<readonly CustomFieldId[]>
  customField: KeyedReadStore<CustomFieldId, CustomField | undefined>
  viewIds: ReadStore<readonly ViewId[]>
  view: KeyedReadStore<ViewId, View | undefined>
  filter: KeyedReadStore<ViewId, ViewFilterProjection | undefined>
  group: KeyedReadStore<ViewId, ViewGroupProjection | undefined>
  search: KeyedReadStore<ViewId, ViewSearchProjection | undefined>
  sort: KeyedReadStore<ViewId, ViewSortProjection | undefined>
  viewProjection: KeyedReadStore<ViewId, ViewProjection | undefined>
  setDocument: (document: DataDoc) => void
}

export const createReadSource = (document: DataDoc): ReadSource => {
  const documentStore = createValueStore<DataDoc>({
    initial: document
  })

  const recordIds: ReadStore<readonly RecordId[]> = createDerivedStore<readonly RecordId[]>({
    get: read => read(documentStore).records.order,
    isEqual: equalIds
  })

  const activeViewId: ReadStore<ViewId | undefined> = createDerivedStore<ViewId | undefined>({
    get: read => getDocumentActiveViewId(read(documentStore))
  })

  const activeView: ReadStore<View | undefined> = createDerivedStore<View | undefined>({
    get: read => getDocumentActiveView(read(documentStore))
  })

  const customFieldIds: ReadStore<readonly CustomFieldId[]> = createDerivedStore<readonly CustomFieldId[]>({
    get: read => read(documentStore).fields.order,
    isEqual: equalIds
  })

  const viewIds: ReadStore<readonly ViewId[]> = createDerivedStore<readonly ViewId[]>({
    get: read => read(documentStore).views.order,
    isEqual: equalIds
  })

  const recordById: KeyedReadStore<RecordId, Row | undefined> = createKeyedDerivedStore<RecordId, Row | undefined>({
    get: (read, recordId) => getDocumentRecordById(read(documentStore), recordId)
  })

  const customFieldById: KeyedReadStore<CustomFieldId, CustomField | undefined> = createKeyedDerivedStore<CustomFieldId, CustomField | undefined>({
    get: (read, fieldId) => getDocumentCustomFieldById(read(documentStore), fieldId)
  })

  const viewById: KeyedReadStore<ViewId, View | undefined> = createKeyedDerivedStore<ViewId, View | undefined>({
    get: (read, viewId) => getDocumentViewById(read(documentStore), viewId)
  })
  const filterByViewId: KeyedReadStore<ViewId, ViewFilterProjection | undefined> = createKeyedDerivedStore<ViewId, ViewFilterProjection | undefined>({
    get: (read, viewId) => resolveViewFilterProjection(
      read(documentStore),
      viewId
    )
  })
  const groupByViewId: KeyedReadStore<ViewId, ViewGroupProjection | undefined> = createKeyedDerivedStore<ViewId, ViewGroupProjection | undefined>({
    get: (read, viewId) => resolveViewGroupProjection(
      read(documentStore),
      viewId
    )
  })
  const searchByViewId: KeyedReadStore<ViewId, ViewSearchProjection | undefined> = createKeyedDerivedStore<ViewId, ViewSearchProjection | undefined>({
    get: (read, viewId) => resolveViewSearchProjection(
      read(documentStore),
      viewId
    )
  })
  const sortByViewId: KeyedReadStore<ViewId, ViewSortProjection | undefined> = createKeyedDerivedStore<ViewId, ViewSortProjection | undefined>({
    get: (read, viewId) => resolveViewSortProjection(
      read(documentStore),
      viewId
    )
  })
  const viewProjectionById: KeyedReadStore<ViewId, ViewProjection | undefined> = createKeyedDerivedStore<ViewId, ViewProjection | undefined>({
    get: (read, viewId) => resolveViewProjection(
      read(documentStore),
      viewId
    )
  })

  return {
    document: documentStore,
    activeViewId,
    activeView,
    recordIds,
    record: recordById,
    customFieldIds,
    customField: customFieldById,
    viewIds,
    view: viewById,
    filter: filterByViewId,
    group: groupByViewId,
    search: searchByViewId,
    sort: sortByViewId,
    viewProjection: viewProjectionById,
    setDocument: nextDocument => {
      documentStore.set(nextDocument)
    }
  }
}
