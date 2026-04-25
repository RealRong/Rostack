import { geometry as geometryApi } from '@whiteboard/core/geometry'
import type {
  Point,
  Rect
} from '@whiteboard/core/types'
import type {
  SpatialIndexStats,
  SpatialKey,
  SpatialQueryState,
  SpatialRecord
} from './contracts'
import type {
  GridCellKey,
  SpatialIndexState
} from './state'

const floorCell = (
  value: number,
  cellSize: number
) => Math.floor(value / cellSize)

const toGridCellKey = (
  x: number,
  y: number
): GridCellKey => `${x}:${y}` as GridCellKey

const readRectCells = (
  rect: Rect,
  cellSize: number
) => {
  const startX = floorCell(rect.x, cellSize)
  const endX = floorCell(rect.x + Math.max(0, rect.width), cellSize)
  const startY = floorCell(rect.y, cellSize)
  const endY = floorCell(rect.y + Math.max(0, rect.height), cellSize)
  const cells: GridCellKey[] = []

  for (let x = startX; x <= endX; x += 1) {
    for (let y = startY; y <= endY; y += 1) {
      cells.push(toGridCellKey(x, y))
    }
  }

  return cells
}

const readPointCell = (
  point: Point,
  cellSize: number
) => toGridCellKey(
  floorCell(point.x, cellSize),
  floorCell(point.y, cellSize)
)

const removeCellMembership = (
  state: Pick<SpatialIndexState, 'grid' | 'cellsByRecord' | 'oversized'>,
  key: SpatialKey
) => {
  const previousCells = state.cellsByRecord.get(key)
  if (previousCells) {
    previousCells.forEach((cellKey) => {
      const bucket = state.grid.get(cellKey)
      if (!bucket) {
        return
      }

      bucket.delete(key)
      if (bucket.size === 0) {
        state.grid.delete(cellKey)
      }
    })
    state.cellsByRecord.delete(key)
  }

  state.oversized.delete(key)
}

const addCellMembership = (
  state: Pick<SpatialIndexState, 'grid' | 'cellsByRecord'>,
  key: SpatialKey,
  cells: readonly GridCellKey[]
) => {
  state.cellsByRecord.set(key, cells)
  cells.forEach((cellKey) => {
    let bucket = state.grid.get(cellKey)
    if (!bucket) {
      bucket = new Set()
      state.grid.set(cellKey, bucket)
    }
    bucket.add(key)
  })
}

const isOversizedRecord = (
  state: Pick<SpatialIndexState, 'config'>,
  record: SpatialRecord,
  cells: readonly GridCellKey[]
) => (
  cells.length > state.config.maxCellsPerRecord
  || record.bounds.width > state.config.oversizedWorldSize
  || record.bounds.height > state.config.oversizedWorldSize
)

export const indexSpatialRecord = (
  state: Pick<
    SpatialIndexState,
    'grid'
    | 'cellsByRecord'
    | 'oversized'
    | 'config'
  >,
  record: SpatialRecord
) => {
  removeCellMembership(state, record.key)

  const cells = readRectCells(record.bounds, state.config.cellSize)
  if (isOversizedRecord(state, record, cells)) {
    state.oversized.add(record.key)
    return
  }

  addCellMembership(state, record.key, cells)
}

export const removeSpatialRecordIndex = (
  state: Pick<SpatialIndexState, 'grid' | 'cellsByRecord' | 'oversized'>,
  key: SpatialKey
) => {
  removeCellMembership(state, key)
}

const addRectCandidates = (
  state: Pick<SpatialIndexState, 'grid' | 'records'>,
  rect: Rect,
  cells: readonly GridCellKey[],
  target: Set<SpatialKey>
) => {
  cells.forEach((cellKey) => {
    const bucket = state.grid.get(cellKey)
    if (!bucket) {
      return
    }

    bucket.forEach((key) => {
      const record = state.records.get(key)
      if (
        record
        && geometryApi.rect.intersects(record.bounds, rect)
      ) {
        target.add(key)
      }
    })
  })
}

const addPointCandidates = (
  state: Pick<SpatialIndexState, 'grid' | 'records' | 'config'>,
  point: Point,
  target: Set<SpatialKey>
) => {
  const bucket = state.grid.get(readPointCell(point, state.config.cellSize))
  if (!bucket) {
    return
  }

  bucket.forEach((key) => {
    const record = state.records.get(key)
    if (
      record
      && geometryApi.rect.containsPoint(point, record.bounds)
    ) {
      target.add(key)
    }
  })
}

const readOversizedRectMatches = (
  state: Pick<SpatialIndexState, 'oversized' | 'records'>,
  rect: Rect,
  target: Set<SpatialKey>
) => {
  const oversizedKeys: SpatialKey[] = []

  state.oversized.forEach((key) => {
    const record = state.records.get(key)
    if (
      record
      && geometryApi.rect.intersects(record.bounds, rect)
    ) {
      target.add(key)
      oversizedKeys.push(key)
    }
  })

  return oversizedKeys
}

const readOversizedPointMatches = (
  state: Pick<SpatialIndexState, 'oversized' | 'records'>,
  point: Point,
  target: Set<SpatialKey>
) => {
  const oversizedKeys: SpatialKey[] = []

  state.oversized.forEach((key) => {
    const record = state.records.get(key)
    if (
      record
      && geometryApi.rect.containsPoint(point, record.bounds)
    ) {
      target.add(key)
      oversizedKeys.push(key)
    }
  })

  return oversizedKeys
}

export const querySpatialRectState = (
  state: Pick<
    SpatialIndexState,
    'grid'
    | 'records'
    | 'oversized'
    | 'config'
  >,
  rect: Rect
): SpatialQueryState => {
  const cells = readRectCells(rect, state.config.cellSize)
  const keys = new Set<SpatialKey>()

  addRectCandidates(state, rect, cells, keys)
  const oversizedKeys = readOversizedRectMatches(state, rect, keys)

  return {
    keys: [...keys],
    cells: cells.length,
    oversizedKeys
  }
}

export const querySpatialPointState = (
  state: Pick<
    SpatialIndexState,
    'grid'
    | 'records'
    | 'oversized'
    | 'config'
  >,
  point: Point
): SpatialQueryState => {
  const keys = new Set<SpatialKey>()

  addPointCandidates(state, point, keys)
  const oversizedKeys = readOversizedPointMatches(state, point, keys)

  return {
    keys: [...keys],
    cells: 1,
    oversizedKeys
  }
}

export const readSpatialIndexStats = (
  state: Pick<
    SpatialIndexState,
    'records'
    | 'grid'
    | 'oversized'
  >
): SpatialIndexStats => ({
  records: state.records.size,
  cells: state.grid.size,
  oversized: state.oversized.size
})
