import type { NodeOutlineAnchorOptions } from '@whiteboard/core/node/outline'
import type {
  Edge,
  EdgeAnchor,
  EdgeEnd,
  EdgeId,
  Node,
  NodeId,
  NodeGeometry,
  Point
} from '@whiteboard/core/types/model'
import type { EdgePatch, Operation } from '@whiteboard/core/types/operations'
import type { Result } from '@whiteboard/core/types/result'

export type AnchorSnapOptions = NodeOutlineAnchorOptions

export type EdgeConnectTarget = {
  nodeId: NodeId
  anchor?: EdgeAnchor
  pointWorld?: Point
}

export type EdgeConnectConfig = {
  connectQueryRadius: number
  activationPaddingScreen: number
  outlineSnapMin: number
  outlineSnapRatio: number
  handleSnapScreen: number
}

export type EdgeConnectCandidate = {
  nodeId: NodeId
  node: Node
  geometry: NodeGeometry
}

export type ConnectMode =
  | 'free'
  | 'outline'
  | 'handle'

export type EdgeConnectResult = {
  nodeId: NodeId
  anchor: EdgeAnchor
  pointWorld: Point
}

export type ConnectResolution =
  | {
      mode: 'free'
      pointWorld: Point
    }
  | {
      mode: 'outline'
      nodeId: NodeId
      pointWorld: Point
      anchor: EdgeAnchor
    }
  | {
      mode: 'handle'
      nodeId: NodeId
      pointWorld: Point
      anchor: EdgeAnchor
      side: EdgeAnchor['side']
    }

export type EdgeConnectEvaluation = {
  focusedNodeId?: NodeId
  resolution: ConnectResolution
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
  role: 'insert' | 'control'
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
      kind: 'segment'
      role: EdgePathSegment['role']
      insertIndex: number
      segmentIndex: number
      axis: 'x' | 'y'
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
