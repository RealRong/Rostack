import type { CommitChangeSet, CommitChangeSummary, CommitChangedIds, CommitEntityChange } from '../contracts/changeSet'
import type { OperationType } from '../contracts/operations'
import type { CustomFieldId, DataDoc, StateSlice, RecordId, ViewId } from '../contracts/state'
import { getDocumentCustomFieldById, getDocumentViewById } from '../document'

export const getOperationChangedSlices = (operation: { type: OperationType }): StateSlice[] => {
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
    case 'document.customField.put':
    case 'document.customField.patch':
    case 'document.customField.remove':
      return ['documentProperties']
    case 'external.version.bump':
      return ['externalRelations']
  }
}

export const summarizeCommitChanges = (changes: CommitChangeSet): CommitChangeSummary => ({
  touchesDocument: changes.changedSlices.some(slice => slice.startsWith('document')),
  touchesRecords: Boolean(changes.records),
  touchesFields: Boolean(changes.fields),
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
}): CommitEntityChange<T> | undefined => {
  const added = toArray(input.added)
  const updated = toArray(input.updated) as CommitChangedIds<T> | undefined
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
  addSlices: (slices: StateSlice[]) => void
  addRecordAdded: (recordId: RecordId) => void
  addRecordUpdated: (recordId: RecordId) => void
  addRecordRemoved: (recordId: RecordId) => void
  addFieldPut: (fieldId: CustomFieldId) => void
  addFieldUpdated: (fieldId: CustomFieldId) => void
  addFieldRemoved: (fieldId: CustomFieldId) => void
  addViewPut: (viewId: ViewId) => void
  addViewUpdated: (viewId: ViewId) => void
  addViewRemoved: (viewId: ViewId) => void
  addValueChange: (recordId: RecordId, fieldIds: readonly CustomFieldId[]) => void
  build: () => CommitChangeSet
}

export const createChangeCollector = (baseDocument: DataDoc): ChangeCollector => {
  const changedSlices = new Set<StateSlice>()

  const recordsAdded = new Set<RecordId>()
  const recordsUpdated = new Set<RecordId>()
  const recordsRemoved = new Set<RecordId>()

  const fieldsAdded = new Set<CustomFieldId>()
  const fieldsUpdated = new Set<CustomFieldId>()
  const fieldsRemoved = new Set<CustomFieldId>()

  const viewsAdded = new Set<ViewId>()
  const viewsUpdated = new Set<ViewId>()
  const viewsRemoved = new Set<ViewId>()

  const valueRecordIds = new Set<RecordId>()
  const valueFieldIds = new Set<CustomFieldId>()

  return {
    addSlices: (slices) => {
      slices.forEach(slice => changedSlices.add(slice))
    },
    addRecordAdded: (recordId) => recordsAdded.add(recordId),
    addRecordUpdated: (recordId) => recordsUpdated.add(recordId),
    addRecordRemoved: (recordId) => recordsRemoved.add(recordId),
    addFieldPut: (fieldId) => {
      if (getDocumentCustomFieldById(baseDocument, fieldId)) {
        fieldsUpdated.add(fieldId)
      } else {
        fieldsAdded.add(fieldId)
      }
    },
    addFieldUpdated: (fieldId) => fieldsUpdated.add(fieldId),
    addFieldRemoved: (fieldId) => fieldsRemoved.add(fieldId),
    addViewPut: (viewId) => {
      if (getDocumentViewById(baseDocument, viewId)) {
        viewsUpdated.add(viewId)
      } else {
        viewsAdded.add(viewId)
      }
    },
    addViewUpdated: (viewId) => viewsUpdated.add(viewId),
    addViewRemoved: (viewId) => viewsRemoved.add(viewId),
    addValueChange: (recordId, fieldIds) => {
      valueRecordIds.add(recordId)
      fieldIds.forEach(fieldId => valueFieldIds.add(fieldId))
    },
    build: () => {
      const values = valueRecordIds.size || valueFieldIds.size
        ? {
            recordIds: toArray(valueRecordIds) as CommitChangedIds<RecordId> | undefined,
            fieldIds: toArray(valueFieldIds) as CommitChangedIds<CustomFieldId> | undefined
          }
        : undefined

      return {
        changedSlices: Array.from(changedSlices),
        records: toEntityChange({
          added: recordsAdded,
          updated: recordsUpdated,
          removed: recordsRemoved
        }),
        fields: toEntityChange({
          added: fieldsAdded,
          updated: fieldsUpdated,
          removed: fieldsRemoved
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
