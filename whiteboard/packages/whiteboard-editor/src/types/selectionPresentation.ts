import type { ShapeKind } from '@whiteboard/core/node'
import type { Node, NodeId, Rect } from '@whiteboard/core/types'
import type {
  SelectionNodeSummary,
  SelectionNodeTypeSummary
} from '../selection'
export type {
  SelectionNodeSummary,
  SelectionNodeTypeSummary
} from '../selection'

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
  types: readonly SelectionNodeTypeSummary[]
}

export type SelectionToolbarContext = {
  selectionKey: string
  selectionKind: ToolbarSelectionKind
  nodeIds: readonly NodeId[]
  nodes: readonly Node[]
  nodeSummary: SelectionNodeSummary
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
  locked: SelectionNodeSummary['lock']
}

export type SelectionOverlay =
  | {
      kind: 'selection'
      interactive: boolean
      frame: boolean
      handles: boolean
      canResize: boolean
    }
  | {
      kind: 'node'
      nodeId: NodeId
      handles: boolean
    }

export type SelectionPresentation =
  | {
      kind: 'none'
    }
  | {
      kind: 'node' | 'nodes' | 'group' | 'mixed'
      geometry: {
        box: Rect
        transformBox?: Rect
      }
      overlay: SelectionOverlay
      toolbar?: SelectionToolbarContext
    }
