import type { BaseOperation } from '../../contracts/operations'
import type { DataDoc, CustomField, Row, View } from '../../contracts/state'
import {
  enumerateRecords,
  getDocumentActiveViewId,
  getDocumentCustomFieldById,
  getDocumentRecordById,
  getDocumentRecordIndex,
  getDocumentViewById
} from '../../document'

const hasOwn = (record: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(record, key)
const readObjectValue = (value: unknown, key: string) => (value as Record<string, unknown>)[key]

const collectInsertedRecordIds = (records: readonly Row[]) => {
  const recordIds: string[] = []
  enumerateRecords(records as Row[], entry => {
    recordIds.push(entry.record.id)
  })
  return recordIds
}

const captureRecordEntries = (document: DataDoc, recordIds: readonly string[]) => {
  return recordIds
    .map(recordId => {
      const record = getDocumentRecordById(document, recordId)
      const index = getDocumentRecordIndex(document, recordId)
      if (!record || index < 0) {
        return undefined
      }
      return {
        record,
        index
      }
    })
    .filter((entry): entry is { record: Row; index: number } => Boolean(entry))
    .sort((left, right) => left.index - right.index)
}

const buildRecordInverse = (
  before: DataDoc,
  operation: Extract<BaseOperation, { type: 'document.record.insert' | 'document.record.patch' | 'document.record.remove' }>
): BaseOperation[] => {
  switch (operation.type) {
    case 'document.record.insert':
      return [{ type: 'document.record.remove', recordIds: collectInsertedRecordIds(operation.records) }]
    case 'document.record.patch': {
      const record = getDocumentRecordById(before, operation.recordId)
      if (!record) {
        return []
      }

      const patch = Object.fromEntries(
        Object.keys(operation.patch).map(key => [key, readObjectValue(record, key)])
      ) as Partial<Omit<Row, 'id'>>

      return [{ type: 'document.record.patch', recordId: operation.recordId, patch }]
    }
    case 'document.record.remove':
      return captureRecordEntries(before, operation.recordIds).map(entry => ({
        type: 'document.record.insert',
        records: [entry.record],
        target: {
          index: entry.index
        }
      }) satisfies BaseOperation)
  }
}

const buildValueInverse = (
  before: DataDoc,
  operation: Extract<BaseOperation, { type: 'document.value.set' | 'document.value.patch' | 'document.value.clear' }>
): BaseOperation[] => {
  const record = getDocumentRecordById(before, operation.recordId)
  if (!record) {
    return []
  }

  switch (operation.type) {
    case 'document.value.set': {
      const fieldId = String(operation.field)
      if (hasOwn(record.values, fieldId)) {
        return [{ type: 'document.value.set', recordId: operation.recordId, field: fieldId, value: record.values[fieldId] }]
      }

      return [{ type: 'document.value.clear', recordId: operation.recordId, field: fieldId }]
    }
    case 'document.value.patch':
      return Object.keys(operation.patch).map(fieldId => {
        if (hasOwn(record.values, fieldId)) {
          return {
            type: 'document.value.set',
            recordId: operation.recordId,
            field: fieldId,
            value: record.values[fieldId]
          } satisfies BaseOperation
        }

        return {
          type: 'document.value.clear',
          recordId: operation.recordId,
          field: fieldId
        } satisfies BaseOperation
      })
    case 'document.value.clear': {
      const fieldId = String(operation.field)
      if (!hasOwn(record.values, fieldId)) {
        return []
      }

      return [{ type: 'document.value.set', recordId: operation.recordId, field: fieldId, value: record.values[fieldId] }]
    }
  }
}

const buildPropertyPatchInverse = (
  before: DataDoc,
  operation: Extract<BaseOperation, { type: 'document.customField.patch' }>
): BaseOperation[] => {
  const field = getDocumentCustomFieldById(before, operation.fieldId)
  if (!field) {
    return []
  }

  const patch = Object.fromEntries(
    Object.keys(operation.patch).map(key => [key, readObjectValue(field, key)])
  ) as Partial<Omit<CustomField, 'id'>>

  return [{ type: 'document.customField.patch', fieldId: operation.fieldId, patch }]
}

const buildSchemaInverse = (
  before: DataDoc,
  operation: Extract<BaseOperation, {
    type:
      | 'document.view.put'
      | 'document.activeView.set'
      | 'document.view.remove'
      | 'document.customField.put'
      | 'document.customField.patch'
      | 'document.customField.remove'
  }>
): BaseOperation[] => {
  switch (operation.type) {
    case 'document.view.put': {
      const previousView = getDocumentViewById(before, operation.view.id)
      return previousView
        ? [{ type: 'document.view.put', view: previousView }]
        : [{ type: 'document.view.remove', viewId: operation.view.id }]
    }
    case 'document.activeView.set':
      return [{
        type: 'document.activeView.set',
        viewId: getDocumentActiveViewId(before)
      }]
    case 'document.view.remove': {
      const previousView = getDocumentViewById(before, operation.viewId)
      return previousView ? [{ type: 'document.view.put', view: previousView }] : []
    }
    case 'document.customField.put': {
      const previousField = getDocumentCustomFieldById(before, operation.field.id)
      return previousField
        ? [{ type: 'document.customField.put', field: previousField }]
        : [{ type: 'document.customField.remove', fieldId: operation.field.id }]
    }
    case 'document.customField.patch':
      return buildPropertyPatchInverse(before, operation)
    case 'document.customField.remove': {
      const previousField = getDocumentCustomFieldById(before, operation.fieldId)
      return previousField ? [{ type: 'document.customField.put', field: previousField }] : []
    }
  }
}

export const buildInverseOperations = (before: DataDoc, operation: BaseOperation): BaseOperation[] => {
  switch (operation.type) {
    case 'document.record.insert':
    case 'document.record.patch':
    case 'document.record.remove':
      return buildRecordInverse(before, operation)
    case 'document.value.set':
    case 'document.value.patch':
    case 'document.value.clear':
      return buildValueInverse(before, operation)
    case 'document.view.put':
    case 'document.activeView.set':
    case 'document.view.remove':
    case 'document.customField.put':
    case 'document.customField.patch':
    case 'document.customField.remove':
      return buildSchemaInverse(before, operation)
    case 'external.version.bump':
      return [{ type: 'external.version.bump', source: operation.source }]
  }
}
