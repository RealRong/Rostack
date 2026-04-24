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

export const queryRect = (input: {
  state: SpatialIndexState
  worldRect: Rect
  kinds?: readonly SpatialKind[]
}): readonly SpatialRecord[] => collectRecords({
  state: input.state,
  keys: input.state.tree.rect(input.worldRect),
  kinds: input.kinds
})

export const queryPoint = (input: {
  state: SpatialIndexState
  worldPoint: Point
  kinds?: readonly SpatialKind[]
}): readonly SpatialRecord[] => collectRecords({
  state: input.state,
  keys: input.state.tree.point(input.worldPoint),
  kinds: input.kinds
})

export const createSpatialRead = (input: {
  state: () => SpatialIndexState
}): SpatialRead => ({
  get: (key) => input.state().records.get(key),
  rect: (worldRect, options) => queryRect({
    state: input.state(),
    worldRect,
    kinds: options?.kinds
  }),
  point: (worldPoint, options) => queryPoint({
    state: input.state(),
    worldPoint,
    kinds: options?.kinds
  })
})
