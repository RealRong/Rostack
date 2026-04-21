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
import { store } from '@shared/core'
import type {
  DrawPreview
} from '@whiteboard/editor/session/draw/state'
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

export type TextPreviewPatch = Omit<NodePreviewPatch, 'rotation'>

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
}

export type NodePreviewProjection = {
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

export type EdgePreviewProjection = {
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

export type MarqueePreview = {
  rect: Rect
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
  enter?: readonly MindmapEnterPreview[]
}

export type MindmapEnterPreview = {
  treeId: NodeId
  nodeId: MindmapNodeId
  parentId: MindmapNodeId
  route: readonly Point[]
  fromRect: Rect
  toRect: Rect
  startedAt: number
  durationMs: number
}

export type SelectionPreviewState = {
  node: NodeSelectionPreviewState
  edge: readonly EdgeFeedbackEntry[]
  marquee?: MarqueePreviewState
  guides: readonly Guide[]
}

export type EditorInputPreviewState = {
  node: NodePreviewState
  edge: EdgePreviewState
  draw: {
    preview: DrawPreview | null
    hidden: readonly NodeId[]
  }
  selection: SelectionPreviewState
  mindmap: {
    preview?: MindmapPreviewState
  }
}

export type EditorInputPreviewSelectors = {
  node: store.KeyedReadStore<NodeId, NodePreviewProjection>
  edge: store.KeyedReadStore<EdgeId, EdgePreviewProjection>
  draw: store.ReadStore<DrawPreview | null>
  marquee: store.ReadStore<MarqueePreview | undefined>
  mindmapPreview: store.ReadStore<MindmapPreviewState | undefined>
  edgeGuide: store.ReadStore<EdgeGuide>
  snap: store.ReadStore<readonly Guide[]>
}

export type EditorInputPreviewWrite = {
  set: (
    next:
      | EditorInputPreviewState
      | ((current: EditorInputPreviewState) => EditorInputPreviewState)
  ) => void
  reset: () => void
}

export type EditorInputPreview = {
  state: store.ReadStore<EditorInputPreviewState>
  selectors: EditorInputPreviewSelectors
  write: EditorInputPreviewWrite
}
