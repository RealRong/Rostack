import type {
  Edge,
  EdgeId,
  Node,
  NodeId,
  Point,
  Rect
} from '@whiteboard/core/types/model'

export type Slice = {
  version: 1
  nodes: Node[]
  edges: Edge[]
}

export type SliceRoots = {
  nodeIds: readonly NodeId[]
  edgeIds: readonly EdgeId[]
}

export type SliceExportResult = {
  slice: Slice
  roots: SliceRoots
  bounds: Rect
}

export type SliceInsertOptions = {
  origin?: Point
  delta?: Point
  roots?: SliceRoots
}

export type SliceInsertResult = {
  nodes: readonly Node[]
  edges: readonly Edge[]
  roots: SliceRoots
  allNodeIds: readonly NodeId[]
  allEdgeIds: readonly EdgeId[]
}
