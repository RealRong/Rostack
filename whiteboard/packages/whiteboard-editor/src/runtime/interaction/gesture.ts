import type { Point } from '@whiteboard/core/types'
import type { SelectionTarget } from '@whiteboard/core/selection'
import type {
  EdgeGuide,
  EdgeOverlayEntry,
  EdgeOverlayState,
  SelectionPreviewState
} from '../overlay'

export type MoveGesture = {
  kind: 'selection-move'
  start: {
    point: Point
    selection: SelectionTarget
  }
  draft: SelectionPreviewState
  meta: {
    selectionMode: 'keep' | 'restore'
  }
}

export type MarqueeGesture = {
  kind: 'selection-marquee'
  start: {
    point: Point
    initial: SelectionTarget
  }
  draft: SelectionPreviewState
  meta: {
    match: import('@whiteboard/core/selection').MarqueeMatch
  }
}

export type TransformGesture = {
  kind: 'selection-transform'
  start: {
    point: Point
    selection: SelectionTarget
  }
  draft: SelectionPreviewState
  meta: {
    mode: 'resize' | 'rotate'
  }
}

export type EdgeGestureDraft = {
  patches: readonly EdgeOverlayEntry[]
  guide?: EdgeGuide
}

export type EdgeConnectGesture = {
  kind: 'edge-connect'
  start: {
    point: Point
  }
  draft: EdgeGestureDraft
  meta: {
    mode: 'create' | 'reconnect'
  }
}

export type EdgeMoveGesture = {
  kind: 'edge-move'
  start: {
    point: Point
    edgeId: import('@whiteboard/core/types').EdgeId
  }
  draft: EdgeGestureDraft
  meta: {}
}

export type EdgeRouteGesture = {
  kind: 'edge-route'
  start: {
    point: Point
    edgeId: import('@whiteboard/core/types').EdgeId
    index: number
  }
  draft: EdgeGestureDraft
  meta: {}
}

export type ActiveGesture =
  | MoveGesture
  | MarqueeGesture
  | TransformGesture
  | EdgeConnectGesture
  | EdgeMoveGesture
  | EdgeRouteGesture

export const EMPTY_SELECTION_PREVIEW: SelectionPreviewState = {
  nodePatches: [],
  edgePatches: [],
  guides: []
}

export const EMPTY_EDGE_GESTURE_PREVIEW: EdgeGestureDraft = {
  patches: []
}

export const createMoveGesture = (
  input: Omit<MoveGesture, 'kind'>
): MoveGesture => ({
  kind: 'selection-move',
  ...input
})

export const createMarqueeGesture = (
  input: Omit<MarqueeGesture, 'kind'>
): MarqueeGesture => ({
  kind: 'selection-marquee',
  ...input
})

export const createTransformGesture = (
  input: Omit<TransformGesture, 'kind'>
): TransformGesture => ({
  kind: 'selection-transform',
  ...input
})

export const createEdgeConnectGesture = (
  input: Omit<EdgeConnectGesture, 'kind'>
): EdgeConnectGesture => ({
  kind: 'edge-connect',
  ...input
})

export const createEdgeMoveGesture = (
  input: Omit<EdgeMoveGesture, 'kind'>
): EdgeMoveGesture => ({
  kind: 'edge-move',
  ...input
})

export const createEdgeRouteGesture = (
  input: Omit<EdgeRouteGesture, 'kind'>
): EdgeRouteGesture => ({
  kind: 'edge-route',
  ...input
})

export const readSelectionGesturePreview = (
  gesture: ActiveGesture | null | undefined
): SelectionPreviewState => (
  gesture?.kind === 'selection-move'
  || gesture?.kind === 'selection-marquee'
  || gesture?.kind === 'selection-transform'
)
  ? gesture.draft
  : EMPTY_SELECTION_PREVIEW

export const readEdgeGestureOverlayState = (
  gesture: ActiveGesture | null | undefined
): EdgeOverlayState => (
  gesture?.kind === 'edge-connect'
  || gesture?.kind === 'edge-move'
  || gesture?.kind === 'edge-route'
)
  ? {
      interaction: gesture.draft.patches,
      guide: gesture.draft.guide
    }
  : {
      interaction: EMPTY_EDGE_GESTURE_PREVIEW.patches
    }
