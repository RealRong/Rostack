import type { Guide, NodeProjectionPatch as CoreNodeProjectionPatch } from '@whiteboard/core/node'
import type { MindmapDragDropTarget } from '@whiteboard/core/mindmap'
import type {
  EdgeId,
  EdgePatch,
  MindmapNodeId,
  NodeId,
  Point,
  Rect
} from '@whiteboard/core/types'
import type { KeyedReadStore, ReadStore } from '@whiteboard/engine'
import type { DrawPreview } from '../../types/draw'

export type NodePatch = CoreNodeProjectionPatch

export type NodePatchEntry = {
  id: NodeId
  patch: NodePatch
}

export type NodeSelectionOverlayState = {
  patches: readonly NodePatchEntry[]
  frameHoverId?: NodeId
}

export type NodeTextOverlayState = {
  patches: readonly NodePatchEntry[]
}

export type NodeOverlayState = {
  text: NodeTextOverlayState
}

export type NodeOverlayProjection = {
  patch?: NodePatch
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

export type EdgeGuide = {
  line?: {
    from: Point
    to: Point
  }
  snap?: Point
}

export type EdgeOverlayState = {
  interaction: readonly EdgeOverlayEntry[]
  guide?: EdgeGuide
}

export type MarqueeOverlayState = {
  worldRect: Rect
  match: import('@whiteboard/core/selection').MarqueeMatch
}

export type MarqueeFeedback = {
  rect: Rect
  match: import('@whiteboard/core/selection').MarqueeMatch
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
