import type { ShapeKind } from '@whiteboard/core/node'
import type { Node, NodeId, Rect } from '@whiteboard/core/types'
import type {
  SelectionNodeInfo,
  SelectionNodeTypeInfo
} from '../selection/nodeSummary'
export type {
  SelectionNodeInfo,
  SelectionNodeTypeInfo
} from '../selection/nodeSummary'

export type ToolbarSelectionKind =
  | 'shape'
  | 'text'
  | 'sticky'
  | 'frame'
  | 'draw'
  | 'group'
  | 'mixed'

export type SelectionToolbarFilter = {
  label: string
  types: readonly SelectionNodeTypeInfo[]
}

export type SelectionToolbarContext = {
  box: Rect
  selectionKey: string
  selectionKind: ToolbarSelectionKind
  nodeIds: readonly NodeId[]
  nodes: readonly Node[]
  primaryNode?: Node
  filter?: SelectionToolbarFilter
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
  locked: SelectionNodeInfo['lock']
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
      transformBox?: Rect
      interactive: boolean
      frame: boolean
      handles: boolean
      canResize: boolean
    }
