import type { NodeOutlineAnchorOptions } from '../node/outline'
import type {
  Edge,
  EdgeAnchor,
  EdgeEnd,
  EdgeId,
  NodeGeometry,
  EdgePatch,
  Node,
  NodeId,
  Operation,
  Point,
  Result
} from './core'

export type AnchorSnapOptions = NodeOutlineAnchorOptions

export type EdgeConnectTarget = {
  nodeId: NodeId
  anchor?: EdgeAnchor
  pointWorld?: Point
}

export type EdgeConnectConfig = {
  anchorSnapMin: number
  anchorSnapRatio: number
}

export type EdgeConnectCandidate = {
  nodeId: NodeId
  node: Node
  geometry: NodeGeometry
}

export type EdgeConnectResult = {
  nodeId: NodeId
  anchor: EdgeAnchor
  pointWorld: Point
}

export type ResolvedEdgeEnd = {
  end: EdgeEnd
  point: Point
  anchor?: EdgeAnchor
}

export type ResolvedEdgeEnds = {
  source: ResolvedEdgeEnd
  target: ResolvedEdgeEnd
}

export type EdgeNodeCanvasSnapshot = {
  node: Node
  geometry: NodeGeometry
}

export type ResolveEdgeEndsInput = {
  edge: Edge
  source?: EdgeNodeCanvasSnapshot
  target?: EdgeNodeCanvasSnapshot
}

export type EdgePathEnd = {
  point: Point
  side?: EdgeAnchor['side']
}

export type EdgePathInput = {
  edge: Edge
  source: EdgePathEnd
  target: EdgePathEnd
}

export type EdgePathSegment = {
  from: Point
  to: Point
  insertIndex: number
  insertPoint?: Point
  hitPoints?: readonly Point[]
}

export type EdgePathResult = {
  points: Point[]
  segments: EdgePathSegment[]
  svgPath: string
  label?: Point
}

export type EdgeRouter = (input: EdgePathInput) => EdgePathResult

export type EdgeHandle =
  | {
      kind: 'end'
      end: 'source' | 'target'
      point: Point
    }
  | {
      kind: 'anchor'
      index: number
      point: Point
      mode: 'fixed' | 'grow'
    }
  | {
      kind: 'insert'
      insertIndex: number
      point: Point
    }

export type EdgeView = {
  ends: ResolvedEdgeEnds
  path: EdgePathResult
  handles: readonly EdgeHandle[]
}

export type EdgeRectHitMode = 'touch' | 'contain'

export type EdgeRelations = {
  edgeById: Map<EdgeId, Edge>
  edgeIds: EdgeId[]
  nodeToEdgeIds: Map<NodeId, Set<EdgeId>>
}

export type ResolveEdgePathFromRectsInput = ResolveEdgeEndsInput

export type ResolvedEdgePathFromRects = {
  ends: ResolvedEdgeEnds
  path: EdgePathResult
}

export type EdgeCreateOperationResult =
  Result<{
    operation: Extract<Operation, { type: 'edge.create' }>
    edgeId: EdgeId
  }, 'invalid'>

export type InsertRoutePointResult =
  Result<{
    patch: EdgePatch
    index: number
    point: Point
  }, 'invalid'>
