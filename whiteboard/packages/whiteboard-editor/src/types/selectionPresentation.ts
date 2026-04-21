import type { SelectionAffordance, SelectionSummary, SelectionTarget } from '@whiteboard/core/selection'
import type { SelectionTransformPlan, ShapeKind } from '@whiteboard/core/node'
import type {
  Edge,
  EdgeDash,
  EdgeId,
  EdgeMarker,
  EdgeTextMode,
  EdgeType,
  MindmapId,
  MindmapNodeFrameKind,
  MindmapNodeId,
  NodeModel,
  NodeId,
  Rect
} from '@whiteboard/core/types'
import type {
  MindmapBranchLineKind,
  MindmapStrokeStyle
} from '@whiteboard/core/mindmap'
import type { NodeFamily } from '@whiteboard/editor/types/node'

export type SelectionNodeTypeInfo = {
  key: string
  name: string
  family: NodeFamily
  icon: string
  count: number
  nodeIds: readonly NodeId[]
}

export type SelectionEdgeTypeInfo = {
  key: string
  name: string
  count: number
  edgeIds: readonly EdgeId[]
  edgeType?: EdgeType
}

export type SelectionMembers = {
  key: string
  target: SelectionTarget
  nodes: readonly NodeModel[]
  edges: readonly Edge[]
  primaryNode?: NodeModel
  primaryEdge?: Edge
}

export type SelectionNodeStats = {
  ids: readonly NodeId[]
  count: number
  hasGroup: boolean
  lock: 'none' | 'mixed' | 'all'
  types: readonly SelectionNodeTypeInfo[]
}

export type SelectionEdgeStats = {
  ids: readonly EdgeId[]
  count: number
  types: readonly SelectionEdgeTypeInfo[]
}

export type SelectionModel = {
  members: SelectionMembers
  summary: SelectionSummary
  affordance: SelectionAffordance
}

export type SelectionToolbarNodeKind =
  | 'shape'
  | 'text'
  | 'sticky'
  | 'frame'
  | 'draw'
  | 'group'
  | 'mixed'

export type SelectionToolbarScopeKind =
  | 'nodes'
  | 'node-type'
  | 'edges'
  | 'edge-type'

export type SelectionToolbarLockState =
  | 'none'
  | 'mixed'
  | 'all'

export type SelectionToolbarMindmapScope = {
  treeId?: MindmapId
  nodeIds: readonly MindmapNodeId[]
  primaryNodeId?: MindmapNodeId
  canEditBranch: boolean
  branchColor?: string
  branchLine?: MindmapBranchLineKind
  branchWidth?: number
  branchStroke?: MindmapStrokeStyle
  canEditBorder: boolean
  borderKind?: MindmapNodeFrameKind
}

export type SelectionToolbarNodeScope = {
  kind: SelectionToolbarNodeKind
  nodeIds: readonly NodeId[]
  nodes: readonly NodeModel[]
  primaryNode?: NodeModel
  canChangeShapeKind: boolean
  canEditFontSize: boolean
  canEditFontWeight: boolean
  canEditFontStyle: boolean
  canEditTextAlign: boolean
  canEditTextColor: boolean
  canEditFill: boolean
  canEditFillOpacity: boolean
  canEditStroke: boolean
  canEditStrokeOpacity: boolean
  canEditStrokeDash: boolean
  canEditNodeOpacity: boolean
  shapeKind?: ShapeKind
  shapeKindValue?: ShapeKind
  fontSize?: number
  fontWeight?: number
  fontStyle?: 'normal' | 'italic'
  textAlign?: 'left' | 'center' | 'right'
  textColor?: string
  fill?: string
  fillOpacity?: number
  stroke?: string
  strokeWidth?: number
  strokeOpacity?: number
  strokeDash?: readonly number[]
  opacity?: number
  mindmap?: SelectionToolbarMindmapScope
}

export type SelectionToolbarEdgeScope = {
  edgeIds: readonly EdgeId[]
  edges: readonly Edge[]
  primaryEdgeId?: EdgeId
  single: boolean
  lock: SelectionToolbarLockState
  type?: EdgeType
  color?: string
  opacity?: number
  width?: number
  dash?: EdgeDash
  start?: EdgeMarker
  end?: EdgeMarker
  textMode?: EdgeTextMode
  labelCount: number
}

export type SelectionToolbarScope = {
  key: string
  kind: SelectionToolbarScopeKind
  label: string
  count: number
  target: SelectionTarget
  icon?: string
  edgeType?: EdgeType
  node?: SelectionToolbarNodeScope
  edge?: SelectionToolbarEdgeScope
}

export type SelectionToolbarContext = {
  box: Rect
  key: string
  selectionKind: 'nodes' | 'edges' | 'mixed'
  target: SelectionTarget
  nodes: readonly NodeModel[]
  edges: readonly Edge[]
  scopes: readonly SelectionToolbarScope[]
  defaultScopeKey: string
  locked: SelectionToolbarLockState
}

export type SelectionOverlay =
  | {
      kind: 'node'
      nodeId: NodeId
      handles: boolean
    }
  | {
      kind: 'selection'
      box: Rect
      interactive: boolean
      frame: boolean
      handles: boolean
      transformPlan?: SelectionTransformPlan<NodeModel>
    }
