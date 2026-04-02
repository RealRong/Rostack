import type { GroupBaseOperation } from '../../contracts/operations'
import type { GroupDocument, GroupProperty, GroupRecord, GroupView } from '../../contracts/state'
import {
  enumerateRecords,
  getDocumentPropertyById,
  getDocumentRecordById,
  getDocumentRecordIndex,
  getDocumentViewById
} from '../../document'

const hasOwn = (record: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(record, key)
const cloneValue = <T>(value: T): T => structuredClone(value)
const readObjectValue = (value: unknown, key: string) => (value as Record<string, unknown>)[key]

const collectInsertedRecordIds = (records: readonly GroupRecord[]) => {
  const recordIds: string[] = []
  enumerateRecords(records as GroupRecord[], entry => {
    recordIds.push(entry.record.id)
  })
  return recordIds
}

const captureRecordEntries = (document: GroupDocument, recordIds: readonly string[]) => {
  return recordIds
    .map(recordId => {
      const record = getDocumentRecordById(document, recordId)
      const index = getDocumentRecordIndex(document, recordId)
      if (!record || index < 0) {
        return undefined
      }
      return {
        record: cloneValue(record),
        index
      }
    })
    .filter((entry): entry is { record: GroupRecord; index: number } => Boolean(entry))
    .sort((left, right) => left.index - right.index)
}

const buildRecordInverse = (
  before: GroupDocument,
  operation: Extract<GroupBaseOperation, { type: 'document.record.insert' | 'document.record.patch' | 'document.record.remove' }>
): GroupBaseOperation[] => {
  switch (operation.type) {
    case 'document.record.insert':
      return [{ type: 'document.record.remove', recordIds: collectInsertedRecordIds(operation.records) }]
    case 'document.record.patch': {
      const record = getDocumentRecordById(before, operation.recordId)
      if (!record) {
        return []
      }

      const patch = Object.fromEntries(
        Object.keys(operation.patch).map(key => [key, cloneValue(readObjectValue(record, key))])
      ) as Partial<Omit<GroupRecord, 'id'>>

      return [{ type: 'document.record.patch', recordId: operation.recordId, patch }]
    }
    case 'document.record.remove':
      return captureRecordEntries(before, operation.recordIds).map(entry => ({
        type: 'document.record.insert',
        records: [entry.record],
        target: {
          index: entry.index
        }
      }) satisfies GroupBaseOperation)
  }
}

const buildValueInverse = (
  before: GroupDocument,
  operation: Extract<GroupBaseOperation, { type: 'document.value.set' | 'document.value.patch' | 'document.value.clear' }>
): GroupBaseOperation[] => {
  const record = getDocumentRecordById(before, operation.recordId)
  if (!record) {
    return []
  }

  switch (operation.type) {
    case 'document.value.set': {
      const property = String(operation.property)
      if (hasOwn(record.values, property)) {
        return [{ type: 'document.value.set', recordId: operation.recordId, property, value: cloneValue(record.values[property]) }]
      }

      return [{ type: 'document.value.clear', recordId: operation.recordId, property }]
    }
    case 'document.value.patch':
      return Object.keys(operation.patch).map(property => {
        if (hasOwn(record.values, property)) {
          return {
            type: 'document.value.set',
            recordId: operation.recordId,
            property,
            value: cloneValue(record.values[property])
          } satisfies GroupBaseOperation
        }

        return {
          type: 'document.value.clear',
          recordId: operation.recordId,
          property
        } satisfies GroupBaseOperation
      })
    case 'document.value.clear': {
      const property = String(operation.property)
      if (!hasOwn(record.values, property)) {
        return []
      }

      return [{ type: 'document.value.set', recordId: operation.recordId, property, value: cloneValue(record.values[property]) }]
    }
  }
}

const buildPropertyPatchInverse = (
  before: GroupDocument,
  operation: Extract<GroupBaseOperation, { type: 'document.property.patch' }>
): GroupBaseOperation[] => {
  const property = getDocumentPropertyById(before, operation.propertyId)
  if (!property) {
    return []
  }

  const patch = Object.fromEntries(
    Object.keys(operation.patch).map(key => [key, cloneValue(readObjectValue(property, key))])
  ) as Partial<Omit<GroupProperty, 'id'>>

  return [{ type: 'document.property.patch', propertyId: operation.propertyId, patch }]
}

const buildSchemaInverse = (
  before: GroupDocument,
  operation: Extract<GroupBaseOperation, {
    type:
      | 'document.view.put'
      | 'document.view.remove'
      | 'document.property.put'
      | 'document.property.patch'
      | 'document.property.remove'
  }>
): GroupBaseOperation[] => {
  switch (operation.type) {
    case 'document.view.put': {
      const previousView = getDocumentViewById(before, operation.view.id)
      return previousView
        ? [{ type: 'document.view.put', view: cloneValue(previousView) }]
        : [{ type: 'document.view.remove', viewId: operation.view.id }]
    }
    case 'document.view.remove': {
      const previousView = getDocumentViewById(before, operation.viewId)
      return previousView ? [{ type: 'document.view.put', view: cloneValue(previousView) }] : []
    }
    case 'document.property.put': {
      const previousProperty = getDocumentPropertyById(before, operation.property.id)
      return previousProperty
        ? [{ type: 'document.property.put', property: cloneValue(previousProperty) }]
        : [{ type: 'document.property.remove', propertyId: operation.property.id }]
    }
    case 'document.property.patch':
      return buildPropertyPatchInverse(before, operation)
    case 'document.property.remove': {
      const previousProperty = getDocumentPropertyById(before, operation.propertyId)
      return previousProperty ? [{ type: 'document.property.put', property: cloneValue(previousProperty) }] : []
    }
  }
}

export const buildInverseOperations = (before: GroupDocument, operation: GroupBaseOperation): GroupBaseOperation[] => {
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
    case 'document.view.remove':
    case 'document.property.put':
    case 'document.property.patch':
    case 'document.property.remove':
      return buildSchemaInverse(before, operation)
    case 'external.version.bump':
      return [{ type: 'external.version.bump', source: operation.source }]
  }
}
