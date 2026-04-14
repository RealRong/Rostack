import type {
  Guide,
  ResizeDirection,
  TextWidthMode
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
import type { KeyedReadStore, ReadStore } from '@shared/core'
import type { DrawPreview } from '@whiteboard/editor/local/draw'
import type { MarqueeMatch } from '@whiteboard/editor/input/selection/shared'

export type NodePatch = Pick<
  NodeFieldPatch,
  'position' | 'size' | 'rotation'
>

export type NodePatchEntry = {
  id: NodeId
  patch: NodePatch
}

export type TextPreviewPatch = {
  position?: Point
  size?: Size
  fontSize?: number
  mode?: TextWidthMode
  wrapWidth?: number
  handle?: ResizeDirection
}

export type TextPreviewEntry = {
  id: NodeId
  patch: TextPreviewPatch
}

export type NodeSelectionFeedbackState = {
  patches: readonly NodePatchEntry[]
  frameHoverId?: NodeId
}

export type NodeTextFeedbackState = {
  patches: readonly TextPreviewEntry[]
}

export type NodeFeedbackState = {
  text: NodeTextFeedbackState
}

export type NodeFeedbackProjection = {
  patch?: NodePatch
  text?: TextPreviewPatch
  hovered: boolean
  hidden: boolean
}

export type EdgeFeedbackEntry = {
  id: EdgeId
  patch?: EdgePatch
  activeRouteIndex?: number
}

export type EdgeFeedbackProjection = {
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

export type EdgeFeedbackState = {
  interaction: readonly EdgeFeedbackEntry[]
  guide?: EdgeGuide
}

export type MarqueeFeedbackState = {
  worldRect: Rect
  match: MarqueeMatch
}

export type MarqueeFeedback = {
  rect: Rect
  match: MarqueeMatch
}

type MindmapDragPreview = {
  nodeId: MindmapNodeId
  ghost: Rect
  drop?: MindmapDragDropTarget
}

export type MindmapDragFeedback = {
  treeId: NodeId
  kind: 'root' | 'subtree'
  baseOffset: Point
  preview?: MindmapDragPreview
}

export type SelectionFeedbackState = {
  node: NodeSelectionFeedbackState
  edge: readonly EdgeFeedbackEntry[]
  marquee?: MarqueeFeedbackState
  guides: readonly Guide[]
}

export type SelectionPreviewState = {
  nodePatches: readonly NodePatchEntry[]
  edgePatches: readonly EdgeFeedbackEntry[]
  frameHoverId?: NodeId
  marquee?: MarqueeFeedbackState
  guides: readonly Guide[]
}

export type EditorFeedbackState = {
  node: NodeFeedbackState
  edge: EdgeFeedbackState
  draw: {
    preview: DrawPreview | null
    hidden: readonly NodeId[]
  }
  selection: SelectionFeedbackState
  mindmap: {
    drag?: MindmapDragFeedback
  }
}

export type EditorFeedbackSelectors = {
  node: KeyedReadStore<NodeId, NodeFeedbackProjection>
  edge: KeyedReadStore<EdgeId, EdgeFeedbackProjection>
  draw: ReadStore<DrawPreview | null>
  marquee: ReadStore<MarqueeFeedback | undefined>
  mindmapDrag: ReadStore<MindmapDragFeedback | undefined>
  edgeGuide: ReadStore<EdgeGuide>
  snap: ReadStore<readonly Guide[]>
}

export type EditorFeedbackRuntime = Pick<ReadStore<EditorFeedbackState>, 'get' | 'subscribe'> & {
  set: (
    next:
      | EditorFeedbackState
      | ((current: EditorFeedbackState) => EditorFeedbackState)
  ) => void
  reset: () => void
  selectors: EditorFeedbackSelectors
}
