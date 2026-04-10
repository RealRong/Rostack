import type {
  Edge,
  EdgeId,
  Node,
  NodeId,
  Point,
  Rect
} from './model'
import type { Operation } from './operations'

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
  operations: Operation[]
  roots: SliceRoots
  allNodeIds: readonly NodeId[]
  allEdgeIds: readonly EdgeId[]
}
