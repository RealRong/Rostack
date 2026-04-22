import { createOrderedKeyedCollection } from './collection'
import { hasPatchChanges } from './json'

export interface EntityTable<TId extends string, TEntity extends { id: TId }> {
  byId: Record<TId, TEntity>
  order: TId[]
}

const cloneEntity = <TEntity>(
  entity: TEntity
): TEntity => structuredClone(entity)

const createOverlay = <TId extends string, TEntity extends { id: TId }>(
  table: EntityTable<TId, TEntity>
): Record<TId, TEntity> => Object.create(table.byId) as Record<TId, TEntity>

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
): boolean => Boolean(table.byId[entityId])

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

  if (!hasPatchChanges(current, patch)) {
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

const normalizeList = <TId extends string, TEntity extends { id: TId }>(
  entities: readonly TEntity[]
): EntityTable<TId, TEntity> => {
  const byId = {} as Record<TId, TEntity>
  const order: TId[] = []
  const seen = new Set<TId>()

  entities.forEach(entity => {
    const nextEntity = cloneEntity(entity)
    byId[nextEntity.id] = nextEntity
    if (seen.has(nextEntity.id)) {
      return
    }

    seen.add(nextEntity.id)
    order.push(nextEntity.id)
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
    order: exists
      ? table.order
      : [...table.order, entity.id]
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
) => createOrderedKeyedCollection({
  ids: table.order,
  get: entityId => table.byId[entityId]
})

export const entityTable = {
  access,
  clone: {
    entity: cloneEntity,
    table: cloneTable
  },
  normalize: {
    list: normalizeList,
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
    same: hasPatchChanges,
    merge: mergePatch
  },
  overlay: createOverlay
} as const
