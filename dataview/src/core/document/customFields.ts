import type { PropertyId, GroupDocument, GroupEntityTable, GroupProperty } from '../contracts/state'
import {
  getEntityTableById,
  getEntityTableIds,
  hasEntityTableId,
  listEntityTable,
  patchEntityTableEntity,
  putEntityTableEntity,
  removeEntityTableEntity
} from './shared'

const replaceDocumentPropertiesTable = (document: GroupDocument, properties: GroupEntityTable<PropertyId, GroupProperty>): GroupDocument => {
  if (properties === document.properties) {
    return document
  }

  return {
    ...document,
    properties
  }
}

export const getDocumentProperties = (document: GroupDocument): GroupProperty[] => {
  return listEntityTable(document.properties)
}

export const getDocumentPropertyIds = (document: GroupDocument): PropertyId[] => getEntityTableIds(document.properties)
export const getDocumentPropertyById = (document: GroupDocument, propertyId: PropertyId) => getEntityTableById(document.properties, propertyId)
export const hasDocumentProperty = (document: GroupDocument, propertyId: PropertyId) => hasEntityTableId(document.properties, propertyId)

export const putDocumentProperty = (document: GroupDocument, property: GroupProperty): GroupDocument => {
  return replaceDocumentPropertiesTable(document, putEntityTableEntity(document.properties, property))
}

export const patchDocumentProperty = (document: GroupDocument, propertyId: PropertyId, patch: Partial<Omit<GroupProperty, 'id'>>): GroupDocument => {
  const nextProperties = patchEntityTableEntity(document.properties, propertyId, patch)
  if (nextProperties === document.properties) {
    return document
  }

  return replaceDocumentPropertiesTable(document, nextProperties)
}

export const removeDocumentProperty = (document: GroupDocument, propertyId: PropertyId): GroupDocument => {
  const nextProperties = removeEntityTableEntity(document.properties, propertyId)
  if (nextProperties === document.properties) {
    return document
  }

  return replaceDocumentPropertiesTable(document, nextProperties)
}
