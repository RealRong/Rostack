import type { Equality } from '../equality'
import {
  batch
} from './batch'
import {
  createTableStore
} from './table'
import {
  createValueStore
} from './value'
import type {
  FamilyPatch,
  FamilyStore,
  StoreFamily
} from './types'

const EMPTY_IDS: readonly never[] = Object.freeze([])

export const createFamilyStore = <Key, Value>({
  initial,
  isEqual
}: {
  initial?: StoreFamily<Key, Value>
  isEqual?: Equality<Value>
} = {}): FamilyStore<Key, Value> => {
  const ids = createValueStore<readonly Key[]>(
    initial?.ids ?? (EMPTY_IDS as readonly Key[])
  )
  const byId = createTableStore<Key, Value>({
    initial: initial?.byId,
    ...(isEqual ? {
      isEqual
    } : {})
  })

  const replace = (
    next: StoreFamily<Key, Value>
  ) => {
    batch(() => {
      byId.write.replace(next.byId)
      ids.set(next.ids)
    })
  }

  const apply = (
    patch: FamilyPatch<Key, Value>
  ) => {
    if (
      patch.ids === undefined
      && !patch.set?.length
      && !patch.remove?.length
    ) {
      return
    }

    batch(() => {
      byId.write.apply({
        set: patch.set,
        remove: patch.remove
      })
      if (patch.ids !== undefined) {
        ids.set(patch.ids)
      }
    })
  }

  const clear = () => {
    batch(() => {
      byId.write.clear()
      ids.set(EMPTY_IDS as readonly Key[])
    })
  }

  return {
    ids,
    byId,
    read: {
      family: () => ({
        ids: ids.get(),
        byId: byId.read.all()
      }),
      get: key => byId.read.get(key)
    },
    write: {
      replace,
      apply,
      clear
    },
    project: {
      field: (select, projectedEqual) => byId.project.field(
        select,
        projectedEqual
      )
    }
  }
}
