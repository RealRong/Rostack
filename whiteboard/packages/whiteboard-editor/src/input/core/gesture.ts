import type {
  EdgeGuide,
  EdgeFeedbackEntry,
  EdgeFeedbackState,
  SelectionPreviewState
} from '@whiteboard/editor/local/feedback/types'

export type MoveGesture = {
  kind: 'selection-move'
  draft: SelectionPreviewState
}

export type MarqueeGesture = {
  kind: 'selection-marquee'
  draft: SelectionPreviewState
}

export type TransformGesture = {
  kind: 'selection-transform'
  draft: SelectionPreviewState
}

export type EdgeGestureDraft = {
  patches: readonly EdgeFeedbackEntry[]
  guide?: EdgeGuide
}

export type EdgeConnectGesture = {
  kind: 'edge-connect'
  draft: EdgeGestureDraft
}

export type EdgeMoveGesture = {
  kind: 'edge-move'
  draft: EdgeGestureDraft
}

export type EdgeLabelGesture = {
  kind: 'edge-label'
  draft: EdgeGestureDraft
}

export type EdgeRouteGesture = {
  kind: 'edge-route'
  draft: EdgeGestureDraft
}

export type ActiveGesture =
  | MoveGesture
  | MarqueeGesture
  | TransformGesture
  | EdgeConnectGesture
  | EdgeMoveGesture
  | EdgeLabelGesture
  | EdgeRouteGesture

export type SelectionGestureKind = ActiveGesture['kind'] & (
  | 'selection-move'
  | 'selection-marquee'
  | 'selection-transform'
)

export type EdgeGestureKind = ActiveGesture['kind'] & (
  | 'edge-connect'
  | 'edge-move'
  | 'edge-label'
  | 'edge-route'
)

export const EMPTY_SELECTION_PREVIEW: SelectionPreviewState = {
  nodePatches: [],
  edgePatches: [],
  guides: []
}

export const EMPTY_EDGE_GESTURE_PREVIEW: EdgeGestureDraft = {
  patches: []
}

export const createSelectionGesture = <
  TKind extends SelectionGestureKind
>(
  kind: TKind,
  draft: SelectionPreviewState
): Extract<ActiveGesture, { kind: TKind }> => ({
    kind,
    draft
  }) as Extract<ActiveGesture, { kind: TKind }>

export const createEdgeGesture = <
  TKind extends EdgeGestureKind
>(
  kind: TKind,
  draft: EdgeGestureDraft
): Extract<ActiveGesture, { kind: TKind }> => ({
    kind,
    draft
  }) as Extract<ActiveGesture, { kind: TKind }>

export const readSelectionGesturePreview = (
  gesture: ActiveGesture | null | undefined
): SelectionPreviewState => (
  gesture?.kind === 'selection-move'
  || gesture?.kind === 'selection-marquee'
  || gesture?.kind === 'selection-transform'
)
  ? gesture.draft
  : EMPTY_SELECTION_PREVIEW

export const readEdgeGestureFeedbackState = (
  gesture: ActiveGesture | null | undefined
): EdgeFeedbackState => (
  gesture?.kind === 'edge-connect'
  || gesture?.kind === 'edge-move'
  || gesture?.kind === 'edge-label'
  || gesture?.kind === 'edge-route'
)
  ? {
      interaction: gesture.draft.patches,
      guide: gesture.draft.guide
    }
  : {
      interaction: EMPTY_EDGE_GESTURE_PREVIEW.patches
    }
