import type {
  Guide,
  TransformPreviewPatch
} from '@whiteboard/core/node'
import type { ConnectResolution } from '@whiteboard/core/edge'
import type { MindmapDragDropTarget } from '@whiteboard/core/mindmap'
import type {
  Edge,
  EdgePatch,
  MindmapNodeId,
  NodeFieldPatch,
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
  id: string
  patch: NodePreviewPatch
}

export type NodePresentation = {
  position?: Point
}

export type NodePresentationEntry = {
  id: string
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
  id: string
  patch: TextPreviewPatch
}

export type NodeSelectionPreviewState = {
  patches: readonly NodePreviewEntry[]
  frameHoverId?: string
}

export type NodeTextPreviewState = {
  patches: readonly TextPreviewEntry[]
}

export type NodePreviewState = {
  text: NodeTextPreviewState
  presentation: readonly NodePresentationEntry[]
}

export type EdgeFeedbackEntry = {
  id: string
  patch?: EdgePatch
  activeRouteIndex?: number
}

export type EdgeConnectFeedback = {
  focusedNodeId?: string
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
  treeId: string
  nodeId: MindmapNodeId
  ghost: Rect
  drop?: MindmapDragDropTarget
}

export type MindmapRootMovePreview = {
  treeId: string
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
