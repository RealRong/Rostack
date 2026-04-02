import type { PropertyId, GroupDocument, GroupProperty, GroupRecord, GroupView, RecordId, ViewId } from '@/core/contracts'
import {
  createDerivedStore,
  createKeyedDerivedStore,
  createValueStore,
  type ReadStore,
  type ValueStore,
  type KeyedReadStore
} from '@/runtime/store'
import {
  getDocumentPropertyById,
  getDocumentRecordById,
  getDocumentViewById
} from '@/core/document'
import {
  resolveViewProjection,
  type ViewProjection
} from '@/engine/projection/view'

export const equalIds = <T extends string>(left: readonly T[], right: readonly T[]) => (
  left.length === right.length && left.every((value, index) => value === right[index])
)

export interface ReadSource {
  document: ValueStore<GroupDocument>
  recordIds: ReadStore<readonly RecordId[]>
  record: KeyedReadStore<RecordId, GroupRecord | undefined>
  propertyIds: ReadStore<readonly PropertyId[]>
  property: KeyedReadStore<PropertyId, GroupProperty | undefined>
  viewIds: ReadStore<readonly ViewId[]>
  view: KeyedReadStore<ViewId, GroupView | undefined>
  viewProjection: KeyedReadStore<ViewId, ViewProjection | undefined>
  setDocument: (document: GroupDocument) => void
}

export const createReadSource = (document: GroupDocument): ReadSource => {
  const documentStore = createValueStore<GroupDocument>({
    initial: document
  })

  const recordIds: ReadStore<readonly RecordId[]> = createDerivedStore<readonly RecordId[]>({
    get: read => read(documentStore).records.order,
    isEqual: equalIds
  })

  const propertyIds: ReadStore<readonly PropertyId[]> = createDerivedStore<readonly PropertyId[]>({
    get: read => read(documentStore).properties.order,
    isEqual: equalIds
  })

  const viewIds: ReadStore<readonly ViewId[]> = createDerivedStore<readonly ViewId[]>({
    get: read => read(documentStore).views.order,
    isEqual: equalIds
  })

  const recordById: KeyedReadStore<RecordId, GroupRecord | undefined> = createKeyedDerivedStore<RecordId, GroupRecord | undefined>({
    get: (read, recordId) => getDocumentRecordById(read(documentStore), recordId)
  })

  const propertyById: KeyedReadStore<PropertyId, GroupProperty | undefined> = createKeyedDerivedStore<PropertyId, GroupProperty | undefined>({
    get: (read, propertyId) => getDocumentPropertyById(read(documentStore), propertyId)
  })

  const viewById: KeyedReadStore<ViewId, GroupView | undefined> = createKeyedDerivedStore<ViewId, GroupView | undefined>({
    get: (read, viewId) => getDocumentViewById(read(documentStore), viewId)
  })
  const viewProjectionById: KeyedReadStore<ViewId, ViewProjection | undefined> = createKeyedDerivedStore<ViewId, ViewProjection | undefined>({
    get: (read, viewId) => resolveViewProjection(
      read(documentStore),
      viewId
    )
  })

  return {
    document: documentStore,
    recordIds,
    record: recordById,
    propertyIds,
    property: propertyById,
    viewIds,
    view: viewById,
    viewProjection: viewProjectionById,
    setDocument: nextDocument => {
      documentStore.set(nextDocument)
    }
  }
}
