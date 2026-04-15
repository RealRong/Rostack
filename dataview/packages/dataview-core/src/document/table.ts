import type { DataDoc, DataRecord, EntityTable, RecordId } from '@dataview/core/contracts/state'
import { createOrderedKeyedCollection } from '@shared/core'

export const cloneRecordInput = (record: DataRecord): DataRecord => structuredClone(record)

export const cloneEntityInput = <TEntity>(entity: TEntity): TEntity => structuredClone(entity)

export const createEntityOverlay = <TId extends string, TEntity extends { id: TId }>(
  table: EntityTable<TId, TEntity>
): Record<TId, TEntity> => Object.create(table.byId) as Record<TId, TEntity>

export const replaceDocumentTable = <
  TKey extends 'fields' | 'records' | 'views'
>(
  document: DataDoc,
  key: TKey,
  table: DataDoc[TKey]
): DataDoc => {
  if (document[key] === table) {
    return document
  }

  return {
    ...document,
    [key]: table
  }
}

const createEntityTableAccess = <TId extends string, TEntity extends { id: TId }>(
  table: EntityTable<TId, TEntity>
) => createOrderedKeyedCollection({
  ids: table.order,
  get: entityId => table.byId[entityId]
})

export const listEntityTable = <TId extends string, TEntity extends { id: TId }>(table: EntityTable<TId, TEntity>): TEntity[] => {
  return table.order.flatMap(entityId => {
    const entity = table.byId[entityId]
    return entity ? [entity] : []
  })
}

export const getEntityTableIds = <TId extends string, TEntity extends { id: TId }>(table: EntityTable<TId, TEntity>): TId[] => {
  return table.order.slice()
}

export const getEntityTableById = <TId extends string, TEntity extends { id: TId }>(
  table: EntityTable<TId, TEntity>,
  entityId: TId
): TEntity | undefined => table.byId[entityId]

export const hasEntityTableId = <TId extends string, TEntity extends { id: TId }>(
  table: EntityTable<TId, TEntity>,
  entityId: TId
) => Boolean(table.byId[entityId])

export const cloneEntityTable = <TId extends string, TEntity extends { id: TId }>(table: EntityTable<TId, TEntity>): EntityTable<TId, TEntity> => {
  const byId = {} as Record<TId, TEntity>

  for (const entityIdKey in table.byId) {
    const entityId = entityIdKey as TId
    const entity = table.byId[entityId]
    if (!entity) {
      continue
    }
    byId[entityId] = cloneEntityInput(entity)
  }

  return {
    byId,
    order: table.order.slice()
  }
}

export const hasOwnKeys = (value: object) => Object.keys(value).length > 0

export const hasOwnValueChanges = <TValue extends object>(current: TValue, patch: Partial<TValue>) => {
  const currentRecord = current as Record<string, unknown>
  const patchRecord = patch as Record<string, unknown>

  for (const key of Object.keys(patchRecord)) {
    if (!Object.is(currentRecord[key], patchRecord[key])) {
      return true
    }
  }

  return false
}

export const mergePatchedEntity = <TEntity extends object>(current: TEntity, patch: Partial<TEntity>) => {
  if (!hasOwnKeys(patch)) {
    return current
  }

  if (!hasOwnValueChanges(current, patch)) {
    return current
  }

  return {
    ...current,
    ...patch
  }
}

export const putEntityTableEntity = <TId extends string, TEntity extends { id: TId }>(
  table: EntityTable<TId, TEntity>,
  entity: TEntity
): EntityTable<TId, TEntity> => {
  const exists = Boolean(table.byId[entity.id])
  const byId = createEntityOverlay(table)
  byId[entity.id] = entity

  return {
    byId,
    order: exists ? table.order : [...table.order, entity.id]
  }
}

export const patchEntityTableEntity = <TId extends string, TEntity extends { id: TId }>(
  table: EntityTable<TId, TEntity>,
  entityId: TId,
  patch: Partial<Omit<TEntity, 'id'>>
): EntityTable<TId, TEntity> => {
  const entity = table.byId[entityId]
  if (!entity) {
    return table
  }

  const nextEntity = mergePatchedEntity(entity, patch as Partial<TEntity>) as TEntity
  if (nextEntity === entity) {
    return table
  }

  const byId = createEntityOverlay(table)
  byId[entityId] = nextEntity

  return {
    byId,
    order: table.order
  }
}

export const removeEntityTableEntity = <TId extends string, TEntity extends { id: TId }>(
  table: EntityTable<TId, TEntity>,
  entityId: TId
): EntityTable<TId, TEntity> => {
  if (!table.byId[entityId]) {
    return table
  }

  const byId = createEntityOverlay(table)
  byId[entityId] = undefined as unknown as TEntity

  return {
    byId,
    order: table.order.filter(id => id !== entityId)
  }
}

export const normalizeRecordInput = (records: readonly DataRecord[]): EntityTable<RecordId, DataRecord> => {
  const byId: Record<RecordId, DataRecord> = {}
  const order: RecordId[] = []
  const seen = new Set<RecordId>()

  records.forEach(record => {
    const nextRecord = cloneRecordInput(record)
    byId[nextRecord.id] = nextRecord
    if (!seen.has(nextRecord.id)) {
      seen.add(nextRecord.id)
      order.push(nextRecord.id)
    }
  })

  return {
    byId,
    order
  }
}

export const normalizeEntityTable = <TId extends string, TEntity extends { id: TId }>(table: EntityTable<TId, TEntity>): EntityTable<TId, TEntity> => {
  const byId = {} as Record<TId, TEntity>
  const order: TId[] = []
  const seen = new Set<TId>()

  table.order.forEach(entityId => {
    const entity = table.byId[entityId]
    if (!entity || seen.has(entityId)) {
      return
    }
    seen.add(entityId)
    byId[entityId] = cloneEntityInput(entity)
    order.push(entityId)
  })

  for (const entityIdKey in table.byId) {
    const entityId = entityIdKey as TId
    const entity = table.byId[entityId]
    if (!entity || seen.has(entityId)) {
      continue
    }
    seen.add(entityId)
    byId[entityId] = cloneEntityInput(entity)
    order.push(entityId)
  }

  return {
    byId,
    order
  }
}
