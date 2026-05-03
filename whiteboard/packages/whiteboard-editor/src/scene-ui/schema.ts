import type {
  SelectionAffordance,
  SelectionAffordanceMoveHit,
  SelectionAffordanceOwner,
  SelectionSummary,
  SelectionTarget
} from '@whiteboard/core/selection'
import type {
  SelectionTransformHandlePlan,
  SelectionTransformPlan,
  ShapeKind
} from '@whiteboard/core/node'
import type {
  Edge,
  EdgeDash,
  EdgeMarker,
  EdgeTextMode,
  EdgeType,
  MindmapNodeFrameKind,
  MindmapNodeId,
  NodeModel,
  Rect
} from '@whiteboard/core/types'
import type {
  MindmapBranchLineKind,
  MindmapStrokeStyle
} from '@whiteboard/core/mindmap'
import type { NodeFamily } from '@whiteboard/editor/node'

export type SelectionNodeTypeInfo = {
  key: string
  name: string
  family: NodeFamily
  icon: string
  count: number
  nodeIds: readonly string[]
}

export type SelectionEdgeTypeInfo = {
  key: string
  name: string
  count: number
  edgeIds: readonly string[]
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
  ids: readonly string[]
  count: number
  hasGroup: boolean
  lock: 'none' | 'mixed' | 'all'
  types: readonly SelectionNodeTypeInfo[]
}

export type SelectionEdgeStats = {
  ids: readonly string[]
  count: number
  types: readonly SelectionEdgeTypeInfo[]
}

export type SelectionModel = {
  members: SelectionMembers
  summary: SelectionSummary
  affordance: SelectionAffordance
}

export type EditorSelectionSummaryView = {
  box?: Rect
  count: number
  nodeCount: number
  edgeCount: number
  groupIds: readonly string[]
}

export type EditorSelectionAffordanceView = {
  owner: SelectionAffordanceOwner
  ownerNodeId?: string
  displayBox?: Rect
  moveHit: SelectionAffordanceMoveHit
  canMove: boolean
  canResize: boolean
  canRotate: boolean
  handles: readonly SelectionTransformHandlePlan[]
}

export type EditorSelectionView = {
  target: SelectionTarget
  kind: 'none' | 'nodes' | 'edges' | 'mixed'
  summary: EditorSelectionSummaryView
  affordance: EditorSelectionAffordanceView
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
  treeId?: string
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
  nodeIds: readonly string[]
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
  edgeIds: readonly string[]
  edges: readonly Edge[]
  primaryEdgeId?: string
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
      nodeId: string
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
