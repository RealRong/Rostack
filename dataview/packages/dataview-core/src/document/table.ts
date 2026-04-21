import type {
  DataDoc,
  DataRecord,
  EntityTable,
  RecordId
} from '@dataview/core/contracts/state'
import { collection, json } from '@shared/core'



const cloneRecord = (
  record: DataRecord
): DataRecord => structuredClone(record)

const cloneEntity = <TEntity>(
  entity: TEntity
): TEntity => structuredClone(entity)

const createOverlay = <TId extends string, TEntity extends { id: TId }>(
  table: EntityTable<TId, TEntity>
): Record<TId, TEntity> => Object.create(table.byId) as Record<TId, TEntity>

const replace = <TKey extends 'fields' | 'records' | 'views'>(
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

const list = <TId extends string, TEntity extends { id: TId }>(
  table: EntityTable<TId, TEntity>
): TEntity[] => table.order.flatMap(entityId => {
  const entity = table.byId[entityId]
  return entity ? [entity] : []
})

const ids = <TId extends string, TEntity extends { id: TId }>(
  table: EntityTable<TId, TEntity>
): TId[] => table.order.slice()

const get = <TId extends string, TEntity extends { id: TId }>(
  table: EntityTable<TId, TEntity>,
  entityId: TId
): TEntity | undefined => table.byId[entityId]

const has = <TId extends string, TEntity extends { id: TId }>(
  table: EntityTable<TId, TEntity>,
  entityId: TId
) => Boolean(table.byId[entityId])

const hasOwnKeys = (
  value: object
) => Object.keys(value).length > 0

const mergePatch = <TEntity extends object>(
  current: TEntity,
  patch: Partial<TEntity>
) => {
  if (!hasOwnKeys(patch)) {
    return current
  }

  if (!json.hasPatchChanges(current, patch)) {
    return current
  }

  return {
    ...current,
    ...patch
  }
}

const cloneTable = <TId extends string, TEntity extends { id: TId }>(
  table: EntityTable<TId, TEntity>
): EntityTable<TId, TEntity> => {
  const byId = {} as Record<TId, TEntity>

  for (const entityIdKey in table.byId) {
    const entityId = entityIdKey as TId
    const entity = table.byId[entityId]
    if (!entity) {
      continue
    }

    byId[entityId] = cloneEntity(entity)
  }

  return {
    byId,
    order: table.order.slice()
  }
}

const normalizeRecords = (
  records: readonly DataRecord[]
): EntityTable<RecordId, DataRecord> => {
  const byId: Record<RecordId, DataRecord> = {}
  const order: RecordId[] = []
  const seen = new Set<RecordId>()

  records.forEach(record => {
    const nextRecord = cloneRecord(record)
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

const normalizeTable = <TId extends string, TEntity extends { id: TId }>(
  table: EntityTable<TId, TEntity>
): EntityTable<TId, TEntity> => {
  const byId = {} as Record<TId, TEntity>
  const order: TId[] = []
  const seen = new Set<TId>()

  table.order.forEach(entityId => {
    const entity = table.byId[entityId]
    if (!entity || seen.has(entityId)) {
      return
    }

    seen.add(entityId)
    byId[entityId] = cloneEntity(entity)
    order.push(entityId)
  })

  for (const entityIdKey in table.byId) {
    const entityId = entityIdKey as TId
    const entity = table.byId[entityId]
    if (!entity || seen.has(entityId)) {
      continue
    }

    seen.add(entityId)
    byId[entityId] = cloneEntity(entity)
    order.push(entityId)
  }

  return {
    byId,
    order
  }
}

const put = <TId extends string, TEntity extends { id: TId }>(
  table: EntityTable<TId, TEntity>,
  entity: TEntity
): EntityTable<TId, TEntity> => {
  const exists = Boolean(table.byId[entity.id])
  const byId = createOverlay(table)
  byId[entity.id] = entity

  return {
    byId,
    order: exists ? table.order : [...table.order, entity.id]
  }
}

const patch = <TId extends string, TEntity extends { id: TId }>(
  table: EntityTable<TId, TEntity>,
  entityId: TId,
  value: Partial<Omit<TEntity, 'id'>>
): EntityTable<TId, TEntity> => {
  const entity = table.byId[entityId]
  if (!entity) {
    return table
  }

  const nextEntity = mergePatch(entity, value as Partial<TEntity>) as TEntity
  if (nextEntity === entity) {
    return table
  }

  const byId = createOverlay(table)
  byId[entityId] = nextEntity

  return {
    byId,
    order: table.order
  }
}

const remove = <TId extends string, TEntity extends { id: TId }>(
  table: EntityTable<TId, TEntity>,
  entityId: TId
): EntityTable<TId, TEntity> => {
  if (!table.byId[entityId]) {
    return table
  }

  const byId = createOverlay(table)
  byId[entityId] = undefined as unknown as TEntity

  return {
    byId,
    order: table.order.filter(id => id !== entityId)
  }
}

const access = <TId extends string, TEntity extends { id: TId }>(
  table: EntityTable<TId, TEntity>
) => collection.createOrderedKeyedCollection({
  ids: table.order,
  get: entityId => table.byId[entityId]
})

export const entityTable = {
  replace,
  access,
  clone: {
    entity: cloneEntity,
    record: cloneRecord,
    table: cloneTable
  },
  normalize: {
    records: normalizeRecords,
    table: normalizeTable
  },
  read: {
    list,
    ids,
    get,
    has
  },
  write: {
    put,
    patch,
    remove
  },
  patch: {
    same: json.hasPatchChanges,
    merge: mergePatch
  },
  overlay: createOverlay
} as const
