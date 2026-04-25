import type {
  Point,
  Rect
} from '@whiteboard/core/types'
import type {
  SpatialKey,
  SpatialKind,
  SpatialRead,
  SpatialRecord
} from './contracts'
import type { SpatialIndexState } from './state'

const sortRecords = (
  left: SpatialRecord,
  right: SpatialRecord
): number => (
  left.order - right.order
  || left.key.localeCompare(right.key)
)

const collectRecords = (input: {
  state: SpatialIndexState
  keys: readonly SpatialKey[]
  kinds?: readonly SpatialKind[]
}): readonly SpatialRecord[] => {
  const allowedKinds = input.kinds
    ? new Set(input.kinds)
    : undefined
  const records = input.keys.flatMap((key) => {
    const record = input.state.records.get(key)
    if (!record) {
      return []
    }
    if (allowedKinds && !allowedKinds.has(record.kind)) {
      return []
    }
    return [record]
  })

  records.sort(sortRecords)
  return records
}

const queryAll = (input: {
  state: SpatialIndexState
  kinds?: readonly SpatialKind[]
}): readonly SpatialRecord[] => collectRecords({
  state: input.state,
  keys: [...input.state.records.keys()],
  kinds: input.kinds
})

const queryRect = (input: {
  state: SpatialIndexState
  rect: Rect
  kinds?: readonly SpatialKind[]
}): readonly SpatialRecord[] => collectRecords({
  state: input.state,
  keys: input.state.tree.rect(input.rect),
  kinds: input.kinds
})

const queryPoint = (input: {
  state: SpatialIndexState
  point: Point
  kinds?: readonly SpatialKind[]
}): readonly SpatialRecord[] => collectRecords({
  state: input.state,
  keys: input.state.tree.point(input.point),
  kinds: input.kinds
})

export const createSpatialRead = (input: {
  state: () => SpatialIndexState
}): SpatialRead => ({
  get: (key) => input.state().records.get(key),
  all: (options) => queryAll({
    state: input.state(),
    kinds: options?.kinds
  }),
  rect: (rect, options) => queryRect({
    state: input.state(),
    rect,
    kinds: options?.kinds
  }),
  point: (point, options) => queryPoint({
    state: input.state(),
    point,
    kinds: options?.kinds
  })
})
