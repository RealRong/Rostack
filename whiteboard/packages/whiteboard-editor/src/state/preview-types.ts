import type {
  Guide,
  TransformPreviewPatch
} from '@whiteboard/core/node'
import type { ConnectResolution } from '@whiteboard/core/edge'
import type { MindmapDragDropTarget } from '@whiteboard/core/mindmap'
import type {
  Edge,
  EdgeId,
  EdgePatch,
  MindmapNodeId,
  NodeFieldPatch,
  NodeId,
  Point,
  Rect
} from '@whiteboard/core/types'
import type { Size } from '@whiteboard/core/types'
import type {
  DrawPreview
} from '@whiteboard/editor/schema/draw-state'
import type { MarqueeMatch } from '@whiteboard/editor/input/features/selection/marquee'

export type NodePatch = Pick<
  NodeFieldPatch,
  'position' | 'size' | 'rotation'
>

export type NodePreviewPatch = Omit<TransformPreviewPatch, 'id'>

export type NodePreviewEntry = {
  id: NodeId
  patch: NodePreviewPatch
}

export type NodePresentation = {
  position?: Point
}

export type NodePresentationEntry = {
  id: NodeId
  presentation: NodePresentation
}

export type NodeGeometryPreview = NodePatch

export type TextLayoutPreview = {
  fontSize?: number
  mode?: NodePreviewPatch['mode']
  wrapWidth?: number
  handle?: NodePreviewPatch['handle']
}

export type TextPreviewPatch = TextLayoutPreview & Pick<NodePreviewPatch, 'position' | 'size'>

export type TextPreviewEntry = {
  id: NodeId
  patch: TextPreviewPatch
}

export type NodeSelectionPreviewState = {
  patches: readonly NodePreviewEntry[]
  frameHoverId?: NodeId
}

export type NodeTextPreviewState = {
  patches: readonly TextPreviewEntry[]
}

export type NodePreviewState = {
  text: NodeTextPreviewState
  presentation: readonly NodePresentationEntry[]
}

export type EdgeFeedbackEntry = {
  id: EdgeId
  patch?: EdgePatch
  activeRouteIndex?: number
}

export type EdgeConnectFeedback = {
  focusedNodeId?: NodeId
  resolution: ConnectResolution
}

export type EdgeGuide = {
  path?: {
    svgPath: string
    style?: Edge['style']
  }
  connect?: EdgeConnectFeedback
}

export type EdgePreviewState = {
  interaction: readonly EdgeFeedbackEntry[]
  guide?: EdgeGuide
}

export type MarqueePreviewState = {
  worldRect: Rect
  match: MarqueeMatch
}

type MindmapSubtreeMovePreview = {
  treeId: NodeId
  nodeId: MindmapNodeId
  ghost: Rect
  drop?: MindmapDragDropTarget
}

export type MindmapRootMovePreview = {
  treeId: NodeId
  delta: Point
}

export type MindmapPreviewState = {
  rootMove?: MindmapRootMovePreview
  subtreeMove?: MindmapSubtreeMovePreview
}

export type SelectionPreviewState = {
  node: NodeSelectionPreviewState
  edge: readonly EdgeFeedbackEntry[]
  marquee?: MarqueePreviewState
  guides: readonly Guide[]
}
