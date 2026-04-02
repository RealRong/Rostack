import type { GroupEntityTable, GroupRecord, RecordId } from '../contracts/state'

export const cloneRecordInput = (record: GroupRecord): GroupRecord => structuredClone(record)

export const cloneEntityInput = <TEntity>(entity: TEntity): TEntity => structuredClone(entity)

export const listEntityTable = <TId extends string, TEntity extends { id: TId }>(table: GroupEntityTable<TId, TEntity>): TEntity[] => {
  return table.order
    .map(entityId => table.byId[entityId])
    .filter((entity): entity is TEntity => Boolean(entity))
}

export const getEntityTableIds = <TId extends string, TEntity extends { id: TId }>(table: GroupEntityTable<TId, TEntity>): TId[] => {
  return table.order.slice()
}

export const getEntityTableById = <TId extends string, TEntity extends { id: TId }>(
  table: GroupEntityTable<TId, TEntity>,
  entityId: TId
): TEntity | undefined => table.byId[entityId]

export const hasEntityTableId = <TId extends string, TEntity extends { id: TId }>(
  table: GroupEntityTable<TId, TEntity>,
  entityId: TId
) => Boolean(table.byId[entityId])

export const cloneEntityTable = <TId extends string, TEntity extends { id: TId }>(table: GroupEntityTable<TId, TEntity>): GroupEntityTable<TId, TEntity> => {
  const byId = {} as Record<TId, TEntity>

  Object.keys(table.byId).forEach(entityIdKey => {
    const entityId = entityIdKey as TId
    byId[entityId] = cloneEntityInput(table.byId[entityId])
  })

  return {
    byId,
    order: table.order.slice()
  }
}

export const cloneRecordTable = (table: GroupEntityTable<RecordId, GroupRecord>): GroupEntityTable<RecordId, GroupRecord> => {
  const byId: Record<RecordId, GroupRecord> = {}

  Object.keys(table.byId).forEach(recordIdKey => {
    const recordId = recordIdKey as RecordId
    byId[recordId] = cloneRecordInput(table.byId[recordId])
  })

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
    ...cloneEntityInput(patch)
  }
}

export const putEntityTableEntity = <TId extends string, TEntity extends { id: TId }>(
  table: GroupEntityTable<TId, TEntity>,
  entity: TEntity
): GroupEntityTable<TId, TEntity> => {
  const exists = Boolean(table.byId[entity.id])

  return {
    byId: {
      ...table.byId,
      [entity.id]: cloneEntityInput(entity)
    },
    order: exists ? table.order : [...table.order, entity.id]
  }
}

export const patchEntityTableEntity = <TId extends string, TEntity extends { id: TId }>(
  table: GroupEntityTable<TId, TEntity>,
  entityId: TId,
  patch: Partial<Omit<TEntity, 'id'>>
): GroupEntityTable<TId, TEntity> => {
  const entity = table.byId[entityId]
  if (!entity) {
    return table
  }

  const nextEntity = mergePatchedEntity(entity, patch as Partial<TEntity>) as TEntity
  if (nextEntity === entity) {
    return table
  }

  return {
    byId: {
      ...table.byId,
      [entityId]: nextEntity
    },
    order: table.order
  }
}

export const removeEntityTableEntity = <TId extends string, TEntity extends { id: TId }>(
  table: GroupEntityTable<TId, TEntity>,
  entityId: TId
): GroupEntityTable<TId, TEntity> => {
  if (!table.byId[entityId]) {
    return table
  }

  const nextById = { ...table.byId }
  delete nextById[entityId]

  return {
    byId: nextById,
    order: table.order.filter(id => id !== entityId)
  }
}

export const normalizeRecordInput = (records: readonly GroupRecord[]): GroupEntityTable<RecordId, GroupRecord> => {
  const byId: Record<RecordId, GroupRecord> = {}
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

export const normalizeEntityTable = <TId extends string, TEntity extends { id: TId }>(table: GroupEntityTable<TId, TEntity>): GroupEntityTable<TId, TEntity> => {
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

  Object.keys(table.byId).forEach(entityIdKey => {
    const entityId = entityIdKey as TId
    const entity = table.byId[entityId]
    if (!entity || seen.has(entityId)) {
      return
    }
    seen.add(entityId)
    byId[entityId] = cloneEntityInput(entity)
    order.push(entityId)
  })

  return {
    byId,
    order
  }
}

export const normalizeRecordTable = (table: GroupEntityTable<RecordId, GroupRecord>): GroupEntityTable<RecordId, GroupRecord> => {
  const byId: Record<RecordId, GroupRecord> = {}
  const order: RecordId[] = []
  const seen = new Set<RecordId>()

  table.order.forEach(recordId => {
    const record = table.byId[recordId]
    if (!record || seen.has(recordId)) {
      return
    }
    seen.add(recordId)
    byId[recordId] = cloneRecordInput(record)
    order.push(recordId)
  })

  Object.keys(table.byId).forEach(recordIdKey => {
    const recordId = recordIdKey as RecordId
    const record = table.byId[recordId]
    if (!record || seen.has(recordId)) {
      return
    }
    seen.add(recordId)
    byId[recordId] = cloneRecordInput(record)
    order.push(recordId)
  })

  return {
    byId,
    order
  }
}

export const isSameOrder = (left: readonly string[], right: readonly string[]) => {
  if (left.length !== right.length) {
    return false
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false
    }
  }

  return true
}
