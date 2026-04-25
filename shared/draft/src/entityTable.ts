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
  readonly order: DraftList<Id>

  get(id: Id): Entity | undefined
  has(id: Id): boolean

  ids(): readonly Id[]
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
  const order = list(base.order)
  const hasPatchChanges = options?.hasPatchChanges ?? defaultHasPatchChanges

  return {
    base,
    byId,
    order,
    get: (id) => byId.get(id),
    has: (id) => byId.has(id),
    ids: () => order.current(),
    list: () => order.current().flatMap((id) => {
      const entity = byId.get(id)
      return entity
        ? [entity]
        : []
    }),
    put: (entity) => {
      const existed = byId.has(entity.id)
      byId.set(entity.id, entity)
      if (!existed) {
        order.push(entity.id)
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
      const index = order.current().indexOf(id)
      if (index >= 0) {
        order.removeAt(index)
      }
      return current
    },
    changed: () => byId.finish() !== base.byId || order.finish() !== base.order,
    finish: () => {
      const nextById = byId.finish()
      const nextOrder = order.finish()
      if (nextById === base.byId && nextOrder === base.order) {
        return base
      }

      return {
        byId: nextById,
        order: nextOrder as Id[]
      }
    }
  }
}
