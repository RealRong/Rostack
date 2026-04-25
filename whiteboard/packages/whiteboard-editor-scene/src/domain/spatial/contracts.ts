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

export interface SpatialTree {
  insert(record: SpatialRecord): void
  update(previous: SpatialRecord, next: SpatialRecord): void
  remove(record: SpatialRecord): void
  rect(rect: Rect): readonly SpatialKey[]
  point(point: Point): readonly SpatialKey[]
}

export interface SpatialRead {
  get(key: SpatialKey): SpatialRecord | undefined
  all(options?: {
    kinds?: readonly SpatialKind[]
  }): readonly SpatialRecord[]
  rect(
    rect: Rect,
    options?: {
      kinds?: readonly SpatialKind[]
    }
  ): readonly SpatialRecord[]
  point(
    point: Point,
    options?: {
      kinds?: readonly SpatialKind[]
    }
  ): readonly SpatialRecord[]
}
