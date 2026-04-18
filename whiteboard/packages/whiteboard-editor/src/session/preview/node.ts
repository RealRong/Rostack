import { isPointEqual, isSizeEqual } from '@whiteboard/core/geometry'
import type { NodeId } from '@whiteboard/core/types'
import type {
  EditorInputPreviewState,
  NodePreviewProjection,
  NodePreviewState,
  NodePatch,
  NodePreviewEntry,
  NodePreviewPatch,
  NodeSelectionPreviewState,
  NodeTextPreviewState,
  TextPreviewEntry,
  TextPreviewPatch
} from '@whiteboard/editor/input/preview/types'
import { mergeEntryById } from '@whiteboard/editor/input/preview/merge'

export const EMPTY_NODE_PATCHES: readonly NodePreviewEntry[] = []
export const EMPTY_TEXT_PREVIEW_PATCHES: readonly TextPreviewEntry[] = []
export const EMPTY_NODE_HIDDEN: readonly NodeId[] = []

export const EMPTY_NODE_SELECTION_FEEDBACK: NodeSelectionPreviewState = {
  patches: EMPTY_NODE_PATCHES
}

const EMPTY_NODE_TEXT_FEEDBACK: NodeTextPreviewState = {
  patches: EMPTY_TEXT_PREVIEW_PATCHES
}

export const EMPTY_NODE_FEEDBACK: NodePreviewState = {
  text: EMPTY_NODE_TEXT_FEEDBACK
}

export const EMPTY_NODE_FEEDBACK_PROJECTION: NodePreviewProjection = {
  hovered: false,
  hidden: false
}

const EMPTY_NODE_FEEDBACK_MAP = new Map<NodeId, NodePreviewProjection>()

const isNodePatchEqual = (
  left: NodePatch | undefined,
  right: NodePatch | undefined
) => (
  isPointEqual(left?.position, right?.position)
  && isSizeEqual(left?.size, right?.size)
  && left?.rotation === right?.rotation
)

const isTextPreviewPatchEqual = (
  left: TextPreviewPatch | undefined,
  right: TextPreviewPatch | undefined
) => (
  isPointEqual(left?.position, right?.position)
  && isSizeEqual(left?.size, right?.size)
  && left?.fontSize === right?.fontSize
  && left?.mode === right?.mode
  && left?.wrapWidth === right?.wrapWidth
  && left?.handle === right?.handle
)

const toNodeGeometryPatch = (
  patch: NodePreviewPatch
): NodePatch | undefined => {
  if (
    !patch.position
    && !patch.size
    && patch.rotation === undefined
  ) {
    return undefined
  }

  return {
    position: patch.position,
    size: patch.size,
    rotation: patch.rotation
  }
}

const toNodeSelectionTextPreview = (
  patch: NodePreviewPatch
): TextPreviewPatch | undefined => {
  if (
    patch.fontSize === undefined
    && patch.mode === undefined
    && patch.wrapWidth === undefined
    && patch.handle === undefined
  ) {
    return undefined
  }

  return {
    fontSize: patch.fontSize,
    mode: patch.mode,
    wrapWidth: patch.wrapWidth,
    handle: patch.handle
  }
}

const readEntryPatch = <TPatch, TEntry extends {
  id: NodeId
  patch: TPatch
}>(
  patches: readonly TEntry[],
  nodeId: NodeId
): TPatch | undefined => {
  for (let index = 0; index < patches.length; index += 1) {
    const entry = patches[index]!
    if (entry.id === nodeId) {
      return entry.patch
    }
  }

  return undefined
}

const replaceEntryPatch = <TPatch, TEntry extends {
  id: NodeId
  patch: TPatch
}>({
  patches,
  nodeId,
  patch,
  isEqual,
  createEntry
}: {
  patches: readonly TEntry[]
  nodeId: NodeId
  patch: TPatch | undefined
  isEqual: (left: TPatch, right: TPatch) => boolean
  createEntry: (nodeId: NodeId, patch: TPatch) => TEntry
}): readonly TEntry[] => {
  let changed = false
  const next: TEntry[] = []

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

    if (isEqual(entry.patch, patch)) {
      next.push(entry)
      continue
    }

    next.push(createEntry(nodeId, patch))
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
    createEntry(nodeId, patch)
  ]
}

const readTextPreviewEntry = (
  patches: readonly TextPreviewEntry[],
  nodeId: NodeId
): TextPreviewPatch | undefined => readEntryPatch(patches, nodeId)

const replaceTextPreviewEntry = (
  patches: readonly TextPreviewEntry[],
  nodeId: NodeId,
  patch: TextPreviewPatch | undefined
): readonly TextPreviewEntry[] => replaceEntryPatch({
  patches,
  nodeId,
  patch,
  isEqual: isTextPreviewPatchEqual,
  createEntry: (id, nextPatch) => ({
    id,
    patch: nextPatch
  })
})

const hasTextPreviewPatch = (
  patch: TextPreviewPatch | undefined
) => Boolean(
  patch?.position
  || patch?.size
  || patch?.fontSize !== undefined
  || patch?.mode !== undefined
  || patch?.wrapWidth !== undefined
  || patch?.handle !== undefined
)

const toNodeTextPreviewState = (
  patches: readonly TextPreviewEntry[]
): NodeTextPreviewState => patches.length > 0
  ? {
      patches
    }
  : EMPTY_NODE_TEXT_FEEDBACK

const mergeTextPreviewPatch = (
  current: TextPreviewPatch | undefined,
  patch: TextPreviewPatch | undefined
) => {
  if (!current && !patch) {
    return undefined
  }

  const next = {
    position: patch?.position ?? current?.position,
    size: patch?.size ?? current?.size,
    fontSize: patch?.fontSize ?? current?.fontSize,
    mode: patch?.mode ?? current?.mode,
    wrapWidth: patch?.wrapWidth ?? current?.wrapWidth,
    handle: patch?.handle ?? current?.handle
  }

  return hasTextPreviewPatch(next)
    ? next
    : undefined
}

export const updateNodeTextPreview = (
  state: NodeTextPreviewState,
  nodeId: NodeId,
  patch: TextPreviewPatch | undefined
): NodeTextPreviewState => {
  const currentPatch = readTextPreviewEntry(state.patches, nodeId)
  const nextPatch = mergeTextPreviewPatch(currentPatch, patch)
  if (isTextPreviewPatchEqual(currentPatch, nextPatch)) {
    return state
  }

  return toNodeTextPreviewState(
    replaceTextPreviewEntry(state.patches, nodeId, nextPatch)
  )
}

export const clearNodeTextPreview = (
  state: NodeTextPreviewState,
  nodeId: NodeId
): NodeTextPreviewState => {
  if (!readTextPreviewEntry(state.patches, nodeId)) {
    return state
  }

  return toNodeTextPreviewState(
    replaceTextPreviewEntry(state.patches, nodeId, undefined)
  )
}

export const clearNodeTextPreviewSize = (
  state: NodeTextPreviewState,
  nodeId: NodeId
): NodeTextPreviewState => {
  const patch = readTextPreviewEntry(state.patches, nodeId)
  if (!patch?.size && !patch?.position) {
    return state
  }

  return toNodeTextPreviewState(
    replaceTextPreviewEntry(
      state.patches,
      nodeId,
      hasTextPreviewPatch({
        fontSize: patch.fontSize,
        mode: patch.mode,
        wrapWidth: patch.wrapWidth,
        handle: patch.handle
      })
        ? {
            fontSize: patch.fontSize,
            mode: patch.mode,
            wrapWidth: patch.wrapWidth,
            handle: patch.handle
          }
        : undefined
    )
  )
}

export const isNodeFeedbackStateEqual = (
  left: NodePreviewState,
  right: NodePreviewState
) => left.text.patches === right.text.patches

export const isNodeProjectionEqual = (
  left: NodePreviewProjection,
  right: NodePreviewProjection
) => (
  isNodePatchEqual(left.patch, right.patch)
  && isTextPreviewPatchEqual(left.text, right.text)
  && left.hovered === right.hovered
  && left.hidden === right.hidden
)

export const normalizeNodeFeedbackState = (
  state: NodePreviewState
): NodePreviewState => {
  const textPatches = state.text.patches.length > 0
    ? state.text.patches
    : EMPTY_TEXT_PREVIEW_PATCHES

  if (textPatches === EMPTY_TEXT_PREVIEW_PATCHES) {
    return EMPTY_NODE_FEEDBACK
  }

  return {
    text:
      textPatches === EMPTY_TEXT_PREVIEW_PATCHES
        ? EMPTY_NODE_TEXT_FEEDBACK
        : {
            patches: textPatches
          }
  }
}

export const toNodeFeedbackMap = (
  state: EditorInputPreviewState
) => {
  if (
    state.selection.node.patches.length === 0
    && state.node.text.patches.length === 0
    && state.draw.hidden.length === 0
    && state.selection.node.frameHoverId === undefined
  ) {
    return EMPTY_NODE_FEEDBACK_MAP
  }

  const next = new Map<NodeId, NodePreviewProjection>()
  const hiddenSet = new Set(state.draw.hidden)

  for (let index = 0; index < state.node.text.patches.length; index += 1) {
    const entry = state.node.text.patches[index]!
    mergeEntryById(next, entry.id, (current) => ({
      ...current,
      text: entry.patch,
      hovered: current?.hovered ?? false,
      hidden: hiddenSet.has(entry.id)
    }))
  }

  for (let index = 0; index < state.selection.node.patches.length; index += 1) {
    const entry = state.selection.node.patches[index]!
    const geometryPatch = toNodeGeometryPatch(entry.patch)
    const textPatch = toNodeSelectionTextPreview(entry.patch)

    mergeEntryById(next, entry.id, (current) => ({
      patch: current?.patch && geometryPatch
        ? {
            ...current.patch,
            ...geometryPatch
          }
        : geometryPatch ?? current?.patch,
      text: current?.text && textPatch
        ? {
            ...current.text,
            ...textPatch
          }
        : textPatch ?? current?.text,
      hovered: state.selection.node.frameHoverId === entry.id,
      hidden: hiddenSet.has(entry.id)
    }))
  }

  const frameHoverId = state.selection.node.frameHoverId
  if (frameHoverId !== undefined) {
    mergeEntryById(next, frameHoverId, (current) => ({
      patch: current?.patch,
      text: current?.text,
      hovered: true,
      hidden: hiddenSet.has(frameHoverId)
    }))
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
