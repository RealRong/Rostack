import { isPointEqual } from '@whiteboard/core/geometry'
import { isEdgePatchEqual } from '@whiteboard/core/edge'
import type { EdgeId } from '@whiteboard/core/types'
import type {
  EdgeGuide,
  EdgeOverlayEntry,
  EdgeOverlayProjection,
  EdgeOverlayState,
  EditorOverlayState
} from './types'

export const EMPTY_EDGE_PATCHES: readonly EdgeOverlayEntry[] = []
export const EMPTY_EDGE_GUIDE: EdgeGuide = {}
export const EMPTY_EDGE_OVERLAY: EdgeOverlayState = {
  interaction: EMPTY_EDGE_PATCHES
}
export const EMPTY_EDGE_OVERLAY_PROJECTION: EdgeOverlayProjection = {}
export const EMPTY_EDGE_OVERLAY_MAP = new Map<EdgeId, EdgeOverlayProjection>()

export const isEdgeGuideEqual = (
  left: EdgeGuide,
  right: EdgeGuide
) => (
  isPointEqual(left.line?.from, right.line?.from)
  && isPointEqual(left.line?.to, right.line?.to)
  && isPointEqual(left.snap, right.snap)
)

export const isEdgeProjectionEqual = (
  left: EdgeOverlayProjection,
  right: EdgeOverlayProjection
) => (
  isEdgePatchEqual(left.patch, right.patch)
  && left.activeRouteIndex === right.activeRouteIndex
)

const isEdgeGuideEmpty = (
  guide: EdgeGuide | undefined
) => (
  guide === undefined
  || (!guide.line && !guide.snap)
)

export const normalizeEdgeOverlayState = (
  state: EdgeOverlayState
): EdgeOverlayState => {
  const interaction = state.interaction.length > 0
    ? state.interaction
    : EMPTY_EDGE_PATCHES
  const guide = isEdgeGuideEmpty(state.guide)
    ? undefined
    : state.guide

  if (
    interaction === EMPTY_EDGE_PATCHES
    && guide === undefined
  ) {
    return EMPTY_EDGE_OVERLAY
  }

  return {
    interaction,
    guide
  }
}

export const toEdgeOverlayMap = (
  state: EditorOverlayState
) => {
  if (
    state.selection.edge.length === 0
    && state.edge.interaction.length === 0
  ) {
    return EMPTY_EDGE_OVERLAY_MAP
  }

  const next = new Map<EdgeId, EdgeOverlayProjection>()

  const writeEntry = (
    entry: EdgeOverlayEntry
  ) => {
    const current = next.get(entry.id)
    const patch = current?.patch
      ? {
          ...current.patch,
          ...entry.patch
        }
      : entry.patch
    const activeRouteIndex = entry.activeRouteIndex ?? current?.activeRouteIndex

    if (!patch && activeRouteIndex === undefined) {
      return
    }

    next.set(entry.id, {
      patch,
      activeRouteIndex
    })
  }

  for (let index = 0; index < state.selection.edge.length; index += 1) {
    writeEntry(state.selection.edge[index]!)
  }

  for (let index = 0; index < state.edge.interaction.length; index += 1) {
    writeEntry(state.edge.interaction[index]!)
  }

  return next.size > 0
    ? next
    : EMPTY_EDGE_OVERLAY_MAP
}
