import type { GroupCommitChangeSet, GroupCommitChangeSummary, GroupCommitChangedIds, GroupCommitEntityChange } from '../contracts/changeSet'
import type { GroupOperationType } from '../contracts/operations'
import type { PropertyId, GroupDocument, GroupStateSlice, RecordId, ViewId } from '../contracts/state'
import { getDocumentPropertyById, getDocumentViewById } from '../document'

export const getOperationChangedSlices = (operation: { type: GroupOperationType }): GroupStateSlice[] => {
  switch (operation.type) {
    case 'document.record.insert':
    case 'document.record.patch':
    case 'document.value.set':
    case 'document.value.patch':
    case 'document.value.clear':
      return ['documentRecords']
    case 'document.record.remove':
      return ['documentRecords']
    case 'document.view.put':
    case 'document.view.remove':
      return ['documentViews']
    case 'document.property.put':
    case 'document.property.patch':
    case 'document.property.remove':
      return ['documentProperties']
    case 'external.version.bump':
      return ['externalRelations']
  }
}

export const summarizeCommitChanges = (changes: GroupCommitChangeSet): GroupCommitChangeSummary => ({
  touchesDocument: changes.changedSlices.some(slice => slice.startsWith('document')),
  touchesRecords: Boolean(changes.records),
  touchesProperties: Boolean(changes.properties),
  touchesViews: Boolean(changes.views),
  touchesValues: Boolean(changes.values)
})

const toArray = <T>(values: Set<T>): readonly T[] | undefined => {
  return values.size ? Array.from(values.values()) : undefined
}

const toEntityChange = <T extends string>(input: {
  added: Set<T>
  updated: Set<T>
  removed: Set<T>
}): GroupCommitEntityChange<T> | undefined => {
  const added = toArray(input.added)
  const updated = toArray(input.updated) as GroupCommitChangedIds<T> | undefined
  const removed = toArray(input.removed)

  if (!added && !updated && !removed) {
    return undefined
  }

  return {
    added,
    updated,
    removed
  }
}

export interface ChangeCollector {
  addSlices: (slices: GroupStateSlice[]) => void
  addRecordAdded: (recordId: RecordId) => void
  addRecordUpdated: (recordId: RecordId) => void
  addRecordRemoved: (recordId: RecordId) => void
  addPropertyPut: (propertyId: PropertyId) => void
  addPropertyUpdated: (propertyId: PropertyId) => void
  addPropertyRemoved: (propertyId: PropertyId) => void
  addViewPut: (viewId: ViewId) => void
  addViewUpdated: (viewId: ViewId) => void
  addViewRemoved: (viewId: ViewId) => void
  addValueChange: (recordId: RecordId, propertyIds: readonly PropertyId[]) => void
  build: () => GroupCommitChangeSet
}

export const createChangeCollector = (baseDocument: GroupDocument): ChangeCollector => {
  const changedSlices = new Set<GroupStateSlice>()

  const recordsAdded = new Set<RecordId>()
  const recordsUpdated = new Set<RecordId>()
  const recordsRemoved = new Set<RecordId>()

  const propertiesAdded = new Set<PropertyId>()
  const propertiesUpdated = new Set<PropertyId>()
  const propertiesRemoved = new Set<PropertyId>()

  const viewsAdded = new Set<ViewId>()
  const viewsUpdated = new Set<ViewId>()
  const viewsRemoved = new Set<ViewId>()

  const valueRecordIds = new Set<RecordId>()
  const valuePropertyIds = new Set<PropertyId>()

  return {
    addSlices: (slices) => {
      slices.forEach(slice => changedSlices.add(slice))
    },
    addRecordAdded: (recordId) => recordsAdded.add(recordId),
    addRecordUpdated: (recordId) => recordsUpdated.add(recordId),
    addRecordRemoved: (recordId) => recordsRemoved.add(recordId),
    addPropertyPut: (propertyId) => {
      if (getDocumentPropertyById(baseDocument, propertyId)) {
        propertiesUpdated.add(propertyId)
      } else {
        propertiesAdded.add(propertyId)
      }
    },
    addPropertyUpdated: (propertyId) => propertiesUpdated.add(propertyId),
    addPropertyRemoved: (propertyId) => propertiesRemoved.add(propertyId),
    addViewPut: (viewId) => {
      if (getDocumentViewById(baseDocument, viewId)) {
        viewsUpdated.add(viewId)
      } else {
        viewsAdded.add(viewId)
      }
    },
    addViewUpdated: (viewId) => viewsUpdated.add(viewId),
    addViewRemoved: (viewId) => viewsRemoved.add(viewId),
    addValueChange: (recordId, propertyIds) => {
      valueRecordIds.add(recordId)
      propertyIds.forEach(propertyId => valuePropertyIds.add(propertyId))
    },
    build: () => {
      const values = valueRecordIds.size || valuePropertyIds.size
        ? {
            recordIds: toArray(valueRecordIds) as GroupCommitChangedIds<RecordId> | undefined,
            propertyIds: toArray(valuePropertyIds) as GroupCommitChangedIds<PropertyId> | undefined
          }
        : undefined

      return {
        changedSlices: Array.from(changedSlices),
        records: toEntityChange({
          added: recordsAdded,
          updated: recordsUpdated,
          removed: recordsRemoved
        }),
        properties: toEntityChange({
          added: propertiesAdded,
          updated: propertiesUpdated,
          removed: propertiesRemoved
        }),
        views: toEntityChange({
          added: viewsAdded,
          updated: viewsUpdated,
          removed: viewsRemoved
        }),
        values
      }
    }
  }
}
