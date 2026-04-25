import type {
  SpatialKey,
  SpatialRecord
} from './contracts'

export type GridCellKey = `${number}:${number}`

export interface SpatialGridConfig {
  cellSize: number
  maxCellsPerRecord: number
  oversizedWorldSize: number
}

export const DEFAULT_SPATIAL_GRID_CONFIG: SpatialGridConfig = {
  cellSize: 256,
  maxCellsPerRecord: 24,
  oversizedWorldSize: 4096
}

export interface SpatialIndexState {
  records: Map<SpatialKey, SpatialRecord>
  orderByKey: Map<SpatialKey, number>
  grid: Map<GridCellKey, Set<SpatialKey>>
  cellsByRecord: Map<SpatialKey, readonly GridCellKey[]>
  oversized: Set<SpatialKey>
  config: SpatialGridConfig
}

export const createSpatialState = (
  config: SpatialGridConfig = DEFAULT_SPATIAL_GRID_CONFIG
): SpatialIndexState => ({
  records: new Map(),
  orderByKey: new Map(),
  grid: new Map(),
  cellsByRecord: new Map(),
  oversized: new Set(),
  config: {
    ...config
  }
})

export const resetSpatialState = (
  state: SpatialIndexState
) => {
  state.records.clear()
  state.orderByKey.clear()
  state.grid.clear()
  state.cellsByRecord.clear()
  state.oversized.clear()
}
