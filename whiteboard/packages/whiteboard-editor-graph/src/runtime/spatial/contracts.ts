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

export interface SpatialPatchScope {
  reset: boolean
  graph: boolean
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

export const createSpatialPatchScope = (
  input: Partial<SpatialPatchScope> = {}
): SpatialPatchScope => ({
  reset: input.reset ?? false,
  graph: input.graph ?? false
})

export const normalizeSpatialPatchScope = (
  scope: SpatialPatchScope | undefined
): SpatialPatchScope => createSpatialPatchScope(scope)

export const mergeSpatialPatchScope = (
  current: SpatialPatchScope | undefined,
  next: SpatialPatchScope
): SpatialPatchScope => createSpatialPatchScope({
  reset: (current?.reset ?? false) || next.reset,
  graph: (current?.graph ?? false) || next.graph
})

export const hasSpatialPatchScope = (
  scope: SpatialPatchScope | undefined
): boolean => Boolean(
  scope?.reset
  || scope?.graph
)
