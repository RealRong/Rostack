import type { Guide } from '@whiteboard/core/node'
import type { NodeId } from '@whiteboard/core/types'
import type { DrawPreview } from '@whiteboard/editor/session/draw'
import type {
  EdgeFeedbackEntry,
  EdgeGuide,
  MarqueePreviewState,
  MindmapPreviewState,
  NodePreviewEntry
} from '@whiteboard/editor/session/preview/types'

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
  marquee?: MarqueePreviewState
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
