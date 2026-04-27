import type { EntityTable } from '@shared/core'
import { json } from '@shared/core'
import {
  list,
  type DraftList
} from './list'
import {
  record,
  type DraftRecord
} from './record'

export interface DraftEntityTableOptions<
  Id extends string,
  Entity extends { id: Id }
> {
  hasPatchChanges?: (
    current: Entity,
    patch: Partial<Omit<Entity, 'id'>>
  ) => boolean
}

export interface DraftEntityTable<
  Id extends string,
  Entity extends { id: Id }
> {
  readonly base: EntityTable<Id, Entity>

  readonly byId: DraftRecord<Id, Entity>
  readonly ids: DraftList<Id>

  get(id: Id): Entity | undefined
  has(id: Id): boolean

  list(): readonly Entity[]

  put(entity: Entity): void
  patch(
    id: Id,
    patch: Partial<Omit<Entity, 'id'>>
  ): Entity | undefined
  remove(id: Id): Entity | undefined

  changed(): boolean
  finish(): EntityTable<Id, Entity>
}

const defaultHasPatchChanges = <
  Entity extends object
>(
  current: Entity,
  patch: Partial<Entity>
): boolean => json.hasPatchChanges(current, patch)

export const entityTable = <
  Id extends string,
  Entity extends { id: Id }
>(
  base: EntityTable<Id, Entity>,
  options?: DraftEntityTableOptions<Id, Entity>
): DraftEntityTable<Id, Entity> => {
  const byId = record(base.byId)
  const ids = list(base.ids)
  const hasPatchChanges = options?.hasPatchChanges ?? defaultHasPatchChanges

  return {
    base,
    byId,
    ids,
    get: (id) => byId.get(id),
    has: (id) => byId.has(id),
    list: () => ids.current().flatMap((id) => {
      const entity = byId.get(id)
      return entity
        ? [entity]
        : []
    }),
    put: (entity) => {
      const existed = byId.has(entity.id)
      byId.set(entity.id, entity)
      if (!existed) {
        ids.push(entity.id)
      }
    },
    patch: (id, patchValue) => {
      const current = byId.get(id)
      if (!current) {
        return undefined
      }
      if (!hasPatchChanges(current, patchValue)) {
        return current
      }

      const next = {
        ...current,
        ...patchValue
      }
      byId.set(id, next)
      return next
    },
    remove: (id) => {
      const current = byId.get(id)
      if (!current) {
        return undefined
      }

      byId.delete(id)
      const index = ids.current().indexOf(id)
      if (index >= 0) {
        ids.removeAt(index)
      }
      return current
    },
    changed: () => byId.finish() !== base.byId || ids.finish() !== base.ids,
    finish: () => {
      const nextById = byId.finish()
      const nextIds = ids.finish()
      if (nextById === base.byId && nextIds === base.ids) {
        return base
      }

      return {
        byId: nextById,
        ids: nextIds as Id[]
      }
    }
  }
}
