import type {
  Point,
  Rect
} from '@whiteboard/core/types'
import type {
  SpatialKey,
  SpatialKind,
  SpatialRead,
  SpatialQueryOptions,
  SpatialQueryResult,
  SpatialQueryState,
  SpatialRecord
} from './contracts'
import {
  querySpatialPointState,
  querySpatialRectState,
  readSpatialIndexStats
} from './kernel'
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

const toQueryResult = (input: {
  state: SpatialIndexState
  query: SpatialQueryState
  kinds?: readonly SpatialKind[]
}): SpatialQueryResult => {
  const records = collectRecords({
    state: input.state,
    keys: input.query.keys,
    kinds: input.kinds
  })
  const oversizedKeys = new Set(input.query.oversizedKeys)

  return {
    records,
    stats: {
      cells: input.query.cells,
      candidates: records.length,
      oversized: records.reduce(
        (count, record) => count + (oversizedKeys.has(record.key) ? 1 : 0),
        0
      )
    }
  }
}

const queryRect = (input: {
  state: SpatialIndexState
  rect: Rect
  options?: SpatialQueryOptions
}): SpatialQueryResult => toQueryResult({
  state: input.state,
  query: querySpatialRectState(input.state, input.rect),
  kinds: input.options?.kinds
})

const queryPoint = (input: {
  state: SpatialIndexState
  point: Point
  options?: SpatialQueryOptions
}): readonly SpatialRecord[] => toQueryResult({
  state: input.state,
  query: querySpatialPointState(input.state, input.point),
  kinds: input.options?.kinds
}).records

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
    options
  }).records,
  point: (point, options) => queryPoint({
    state: input.state(),
    point,
    options
  }),
  candidates: (rect, options) => queryRect({
    state: input.state(),
    rect,
    options
  }),
  stats: () => readSpatialIndexStats(input.state())
})
