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
import type { DrawPreview } from '../../draw'
import type { MarqueeMatch } from '../../interactions/selection/marqueeState'

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

export type NodeSelectionOverlayState = {
  patches: readonly NodePatchEntry[]
  frameHoverId?: NodeId
}

export type NodeTextOverlayState = {
  patches: readonly TextPreviewEntry[]
}

export type NodeOverlayState = {
  text: NodeTextOverlayState
}

export type NodeOverlayProjection = {
  patch?: NodePatch
  text?: TextPreviewPatch
  hovered: boolean
  hidden: boolean
}

export type EdgeOverlayEntry = {
  id: EdgeId
  patch?: EdgePatch
  activeRouteIndex?: number
}

export type EdgeOverlayProjection = {
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

export type EdgeOverlayState = {
  interaction: readonly EdgeOverlayEntry[]
  guide?: EdgeGuide
}

export type MarqueeOverlayState = {
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

export type SelectionOverlayState = {
  node: NodeSelectionOverlayState
  edge: readonly EdgeOverlayEntry[]
  marquee?: MarqueeOverlayState
  guides: readonly Guide[]
}

export type SelectionPreviewState = {
  nodePatches: readonly NodePatchEntry[]
  edgePatches: readonly EdgeOverlayEntry[]
  frameHoverId?: NodeId
  marquee?: MarqueeOverlayState
  guides: readonly Guide[]
}

export type EditorOverlayState = {
  node: NodeOverlayState
  edge: EdgeOverlayState
  draw: {
    preview: DrawPreview | null
    hidden: readonly NodeId[]
  }
  selection: SelectionOverlayState
  mindmap: {
    drag?: MindmapDragFeedback
  }
}

export type EditorOverlay = Pick<ReadStore<EditorOverlayState>, 'get' | 'subscribe'> & {
  set: (
    next:
      | EditorOverlayState
      | ((current: EditorOverlayState) => EditorOverlayState)
  ) => void
  reset: () => void
  selectors: {
    node: KeyedReadStore<NodeId, NodeOverlayProjection>
    edge: KeyedReadStore<EdgeId, EdgeOverlayProjection>
    feedback: {
      draw: ReadStore<DrawPreview | null>
      marquee: ReadStore<MarqueeFeedback | undefined>
      mindmapDrag: ReadStore<MindmapDragFeedback | undefined>
      edgeGuide: ReadStore<EdgeGuide>
      snap: ReadStore<readonly Guide[]>
    }
  }
}
