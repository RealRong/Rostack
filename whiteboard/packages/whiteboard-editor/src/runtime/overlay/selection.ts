import { rectFromPoints } from '@whiteboard/core/geometry'
import type { Guide } from '@whiteboard/core/node'
import type { Rect } from '@whiteboard/core/types'
import type { EditorViewportRuntime } from '../editor/types'
import {
  EMPTY_EDGE_PATCHES
} from './edge'
import {
  EMPTY_NODE_PATCHES,
  EMPTY_NODE_SELECTION_OVERLAY
} from './node'
import type {
  MarqueeFeedback,
  MarqueeOverlayState,
  SelectionOverlayState
} from './types'

export const EMPTY_GUIDES: readonly Guide[] = []

export const EMPTY_SELECTION_OVERLAY: SelectionOverlayState = {
  node: EMPTY_NODE_SELECTION_OVERLAY,
  edge: EMPTY_EDGE_PATCHES,
  guides: EMPTY_GUIDES
}

export const isMarqueeEqual = (
  left: MarqueeOverlayState | undefined,
  right: MarqueeOverlayState | undefined
) => (
  left === right
  || (
    left?.match === right?.match
    && left?.worldRect.x === right?.worldRect.x
    && left?.worldRect.y === right?.worldRect.y
    && left?.worldRect.width === right?.worldRect.width
    && left?.worldRect.height === right?.worldRect.height
  )
)

export const isMarqueeFeedbackEqual = (
  left: MarqueeFeedback | undefined,
  right: MarqueeFeedback | undefined
) => (
  left === right
  || (
    left?.match === right?.match
    && left?.rect.x === right?.rect.x
    && left?.rect.y === right?.rect.y
    && left?.rect.width === right?.rect.width
    && left?.rect.height === right?.rect.height
  )
)

export const isSelectionOverlayStateEqual = (
  left: SelectionOverlayState,
  right: SelectionOverlayState
) => (
  left.node.patches === right.node.patches
  && left.node.hovered === right.node.hovered
  && left.edge === right.edge
  && isMarqueeEqual(left.marquee, right.marquee)
  && left.guides === right.guides
)

export const normalizeSelectionOverlayState = (
  state: SelectionOverlayState
): SelectionOverlayState => {
  const nodePatches = state.node.patches.length > 0
    ? state.node.patches
    : EMPTY_NODE_PATCHES
  const edge = state.edge.length > 0
    ? state.edge
    : EMPTY_EDGE_PATCHES
  const guides = state.guides.length > 0
    ? state.guides
    : EMPTY_GUIDES
  const marquee = state.marquee

  if (
    nodePatches === EMPTY_NODE_PATCHES
    && state.node.hovered === undefined
    && edge === EMPTY_EDGE_PATCHES
    && guides === EMPTY_GUIDES
    && marquee === undefined
  ) {
    return EMPTY_SELECTION_OVERLAY
  }

  return {
    node:
      nodePatches === EMPTY_NODE_PATCHES && state.node.hovered === undefined
        ? EMPTY_NODE_SELECTION_OVERLAY
        : {
            patches: nodePatches,
            hovered: state.node.hovered
          },
    edge,
    marquee,
    guides
  }
}

export const projectWorldRect = (
  viewport: Pick<EditorViewportRuntime, 'worldToScreen'>,
  worldRect: Rect
): Rect => {
  const topLeft = viewport.worldToScreen({
    x: worldRect.x,
    y: worldRect.y
  })
  const bottomRight = viewport.worldToScreen({
    x: worldRect.x + worldRect.width,
    y: worldRect.y + worldRect.height
  })

  return rectFromPoints(topLeft, bottomRight)
}
