import type {
  RecordId
} from '@dataview/core/contracts'
import type {
  Selection
} from '@dataview/engine/active/shared/selection'

const EMPTY_ORDER = [] as readonly string[]
const EMPTY_SELECTIONS = new Map<string, Selection>()
const EMPTY_KEYS_BY_ID = new Map<RecordId, readonly string[]>()
const EMPTY_KEYS = [] as readonly string[]

export interface Partition<K extends string> {
  order: readonly K[]
  get: (key: K) => Selection | undefined
  keys: (id: RecordId) => readonly K[]
}

const SELECTIONS_CACHE = new WeakMap<object, ReadonlyMap<string, Selection>>()
const KEYS_CACHE = new WeakMap<object, ReadonlyMap<RecordId, readonly string[]>>()

export const createPartition = <K extends string>(input: {
  order: readonly K[]
  byKey: ReadonlyMap<K, Selection>
  keysById: ReadonlyMap<RecordId, readonly K[]>
  previous?: Partition<K>
}): Partition<K> => {
  if (
    input.previous
    && input.previous.order === input.order
    && readPartitionSelections(input.previous) === input.byKey
    && readPartitionKeysById(input.previous) === input.keysById
  ) {
    return input.previous
  }

  const partition: Partition<K> = {
    order: input.order,
    get: key => input.byKey.get(key),
    keys: id => input.keysById.get(id) ?? EMPTY_KEYS as readonly K[]
  }

  SELECTIONS_CACHE.set(
    partition as unknown as object,
    input.byKey as unknown as ReadonlyMap<string, Selection>
  )
  KEYS_CACHE.set(
    partition as unknown as object,
    input.keysById as unknown as ReadonlyMap<RecordId, readonly string[]>
  )

  return partition
}

export const EMPTY_PARTITION = createPartition({
  order: EMPTY_ORDER,
  byKey: EMPTY_SELECTIONS,
  keysById: EMPTY_KEYS_BY_ID
})

export const readPartitionSelections = <K extends string>(
  partition: Partition<K>
): ReadonlyMap<K, Selection> => (
  SELECTIONS_CACHE.get(partition as unknown as object) as ReadonlyMap<K, Selection> | undefined
) ?? EMPTY_SELECTIONS as unknown as ReadonlyMap<K, Selection>

export const readPartitionKeysById = <K extends string>(
  partition: Partition<K>
): ReadonlyMap<RecordId, readonly K[]> => (
  KEYS_CACHE.get(partition as unknown as object) as ReadonlyMap<RecordId, readonly K[]> | undefined
) ?? EMPTY_KEYS_BY_ID as unknown as ReadonlyMap<RecordId, readonly K[]>
