import type {
  RecordId
} from '@dataview/core/types'
import type {
  Selection
} from '@dataview/engine/active/shared/selection'

const EMPTY_ORDER = [] as readonly string[]
const EMPTY_SELECTIONS = new Map<never, Selection>()
const EMPTY_KEYS_BY_ID = new Map<RecordId, readonly never[]>()

export interface Partition<K extends string> {
  order: readonly K[]
  get: (key: K) => Selection | undefined
  keys: (id: RecordId) => readonly K[]
}

class PartitionState<K extends string> implements Partition<K> {
  constructor(
    readonly order: readonly K[],
    readonly byKey: ReadonlyMap<K, Selection>,
    readonly keysById: ReadonlyMap<RecordId, readonly K[]>
  ) {}

  get = (key: K): Selection | undefined => this.byKey.get(key)

  keys = (id: RecordId): readonly K[] => this.keysById.get(id) ?? []
}

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

  return new PartitionState(
    input.order,
    input.byKey,
    input.keysById
  )
}

export const EMPTY_PARTITION = createPartition({
  order: EMPTY_ORDER,
  byKey: EMPTY_SELECTIONS,
  keysById: EMPTY_KEYS_BY_ID
})

export const readPartitionSelections = <K extends string>(
  partition: Partition<K>
): ReadonlyMap<K, Selection> => partition instanceof PartitionState
  ? partition.byKey
  : EMPTY_SELECTIONS

export const readPartitionKeysById = <K extends string>(
  partition: Partition<K>
): ReadonlyMap<RecordId, readonly K[]> => partition instanceof PartitionState
  ? partition.keysById
  : EMPTY_KEYS_BY_ID
