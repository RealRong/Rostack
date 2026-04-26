import type {
  EdgeId,
  MindmapId,
  NodeId,
  Point,
  Rect
} from '@whiteboard/core/types'

export type SpatialKey =
  | `node:${NodeId}`
  | `edge:${EdgeId}`
  | `mindmap:${MindmapId}`

export type SpatialItemRef =
  | {
      kind: 'node'
      id: NodeId
    }
  | {
      kind: 'edge'
      id: EdgeId
    }
  | {
      kind: 'mindmap'
      id: MindmapId
    }

export type SpatialKind = SpatialItemRef['kind']

export interface SpatialRecord {
  key: SpatialKey
  kind: SpatialKind
  item: SpatialItemRef
  bounds: Rect
  order: number
}

export interface SpatialQueryOptions {
  kinds?: readonly SpatialKind[]
}

export interface SpatialQueryStats {
  cells: number
  candidates: number
  oversized: number
}

export interface SpatialIndexStats {
  records: number
  cells: number
  oversized: number
}

export interface SpatialQueryState {
  keys: readonly SpatialKey[]
  cells: number
  oversizedKeys: readonly SpatialKey[]
}

export interface SpatialQueryResult {
  records: readonly SpatialRecord[]
  stats: SpatialQueryStats
}

export interface SpatialRead {
  get(key: SpatialKey): SpatialRecord | undefined
  all(options?: SpatialQueryOptions): readonly SpatialRecord[]
  rect(
    rect: Rect,
    options?: SpatialQueryOptions
  ): readonly SpatialRecord[]
  point(
    point: Point,
    options?: SpatialQueryOptions
  ): readonly SpatialRecord[]
  candidates(
    rect: Rect,
    options?: SpatialQueryOptions
  ): SpatialQueryResult
  stats(): SpatialIndexStats
}
