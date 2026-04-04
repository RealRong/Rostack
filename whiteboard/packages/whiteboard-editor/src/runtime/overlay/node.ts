import { isPointEqual } from '@whiteboard/core/geometry'
import type { NodeId } from '@whiteboard/core/types'
import type {
  EditorOverlayState,
  NodeOverlayProjection,
  NodeOverlayState,
  NodePatch,
  NodePatchEntry,
  NodeSelectionOverlayState,
  NodeTextOverlayState
} from './types'

export const EMPTY_NODE_PATCHES: readonly NodePatchEntry[] = []
export const EMPTY_NODE_HIDDEN: readonly NodeId[] = []

export const EMPTY_NODE_SELECTION_OVERLAY: NodeSelectionOverlayState = {
  patches: EMPTY_NODE_PATCHES
}

const EMPTY_NODE_TEXT_OVERLAY: NodeTextOverlayState = {
  patches: EMPTY_NODE_PATCHES
}

export const EMPTY_NODE_OVERLAY: NodeOverlayState = {
  text: EMPTY_NODE_TEXT_OVERLAY
}

export const EMPTY_NODE_OVERLAY_PROJECTION: NodeOverlayProjection = {
  hovered: false,
  hidden: false
}

const EMPTY_NODE_OVERLAY_MAP = new Map<NodeId, NodeOverlayProjection>()

const isSameSize = (
  left: { width: number, height: number } | undefined,
  right: { width: number, height: number } | undefined
) => (
  left?.width === right?.width
  && left?.height === right?.height
)

export const isNodePatchEqual = (
  left: NodePatch | undefined,
  right: NodePatch | undefined
) => (
  isPointEqual(left?.position, right?.position)
  && isSameSize(left?.size, right?.size)
  && left?.rotation === right?.rotation
)

export const readNodePatchEntry = (
  patches: readonly NodePatchEntry[],
  nodeId: NodeId
): NodePatch | undefined => {
  for (let index = 0; index < patches.length; index += 1) {
    const entry = patches[index]!
    if (entry.id === nodeId) {
      return entry.patch
    }
  }

  return undefined
}

export const replaceNodePatchEntry = (
  patches: readonly NodePatchEntry[],
  nodeId: NodeId,
  patch: NodePatch | undefined
): readonly NodePatchEntry[] => {
  let changed = false
  const next: NodePatchEntry[] = []

  for (let index = 0; index < patches.length; index += 1) {
    const entry = patches[index]!
    if (entry.id !== nodeId) {
      next.push(entry)
      continue
    }

    if (!patch) {
      changed = true
      continue
    }

    if (isNodePatchEqual(entry.patch, patch)) {
      next.push(entry)
      continue
    }

    next.push({
      id: nodeId,
      patch
    })
    changed = true
  }

  if (!patch) {
    return changed
      ? next
      : patches
  }

  const hasPatch = patches.some((entry) => entry.id === nodeId)
  if (hasPatch) {
    return changed
      ? next
      : patches
  }

  return [
    ...patches,
    {
      id: nodeId,
      patch
    }
  ]
}

export const isNodeOverlayStateEqual = (
  left: NodeOverlayState,
  right: NodeOverlayState
) => left.text.patches === right.text.patches

export const isNodeProjectionEqual = (
  left: NodeOverlayProjection,
  right: NodeOverlayProjection
) => (
  isNodePatchEqual(left.patch, right.patch)
  && left.hovered === right.hovered
  && left.hidden === right.hidden
)

export const normalizeNodeOverlayState = (
  state: NodeOverlayState
): NodeOverlayState => {
  const textPatches = state.text.patches.length > 0
    ? state.text.patches
    : EMPTY_NODE_PATCHES

  if (textPatches === EMPTY_NODE_PATCHES) {
    return EMPTY_NODE_OVERLAY
  }

  return {
    text:
      textPatches === EMPTY_NODE_PATCHES
        ? EMPTY_NODE_TEXT_OVERLAY
        : {
            patches: textPatches
          }
  }
}

export const toNodeOverlayMap = (
  state: EditorOverlayState
) => {
  if (
    state.selection.node.patches.length === 0
    && state.node.text.patches.length === 0
    && state.draw.hidden.length === 0
    && state.selection.node.frameHoverId === undefined
  ) {
    return EMPTY_NODE_OVERLAY_MAP
  }

  const next = new Map<NodeId, NodeOverlayProjection>()
  const hiddenSet = new Set(state.draw.hidden)

  for (let index = 0; index < state.node.text.patches.length; index += 1) {
    const entry = state.node.text.patches[index]!
    next.set(entry.id, {
      patch: entry.patch,
      hovered: false,
      hidden: hiddenSet.has(entry.id)
    })
  }

  for (let index = 0; index < state.selection.node.patches.length; index += 1) {
    const entry = state.selection.node.patches[index]!
    const current = next.get(entry.id)
    next.set(entry.id, {
      patch: current?.patch
        ? {
            ...current.patch,
            ...entry.patch
          }
        : entry.patch,
      hovered: state.selection.node.frameHoverId === entry.id,
      hidden: hiddenSet.has(entry.id)
    })
  }

  if (state.selection.node.frameHoverId !== undefined) {
    const current = next.get(state.selection.node.frameHoverId)
    next.set(state.selection.node.frameHoverId, {
      patch: current?.patch,
      hovered: true,
      hidden: hiddenSet.has(state.selection.node.frameHoverId)
    })
  }

  for (let index = 0; index < state.draw.hidden.length; index += 1) {
    const nodeId = state.draw.hidden[index]!
    if (next.has(nodeId)) {
      continue
    }

    next.set(nodeId, {
      hovered: false,
      hidden: true
    })
  }

  return next
}
