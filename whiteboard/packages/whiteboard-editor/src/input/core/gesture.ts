import type { Guide } from '@whiteboard/core/node'
import type { NodeId } from '@whiteboard/core/types'
import type { DrawPreview } from '@whiteboard/editor/local/draw'
import type {
  EdgeFeedbackEntry,
  EdgeGuide,
  MarqueeFeedbackState,
  MindmapPreviewState,
  NodePreviewEntry
} from '@whiteboard/editor/local/feedback/types'

export type GestureKind =
  | 'selection-move'
  | 'selection-marquee'
  | 'selection-transform'
  | 'edge-connect'
  | 'edge-move'
  | 'edge-label'
  | 'edge-route'
  | 'draw'
  | 'mindmap-drag'

export type InteractionDraft = {
  nodePatches?: readonly NodePreviewEntry[]
  edgePatches?: readonly EdgeFeedbackEntry[]
  frameHoverId?: NodeId
  marquee?: MarqueeFeedbackState
  guides?: readonly Guide[]
  edgeGuide?: EdgeGuide
  drawPreview?: DrawPreview | null
  hiddenNodeIds?: readonly NodeId[]
  mindmap?: MindmapPreviewState
}

export type ActiveGesture = {
  kind: GestureKind
  draft: InteractionDraft
}

export const createGesture = (
  kind: GestureKind,
  draft: InteractionDraft = {}
): ActiveGesture => ({
  kind,
  draft
})
