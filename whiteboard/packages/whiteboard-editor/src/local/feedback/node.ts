import { isPointEqual, isSizeEqual } from '@whiteboard/core/geometry'
import type { NodeId } from '@whiteboard/core/types'
import type {
  EditorFeedbackState,
  NodeFeedbackProjection,
  NodeFeedbackState,
  NodePatch,
  NodePatchEntry,
  NodeSelectionFeedbackState,
  NodeTextFeedbackState,
  TextPreviewEntry,
  TextPreviewPatch
} from '@whiteboard/editor/local/feedback/types'
import { mergeEntryById } from '@whiteboard/editor/local/feedback/merge'

export const EMPTY_NODE_PATCHES: readonly NodePatchEntry[] = []
export const EMPTY_TEXT_PREVIEW_PATCHES: readonly TextPreviewEntry[] = []
export const EMPTY_NODE_HIDDEN: readonly NodeId[] = []

export const EMPTY_NODE_SELECTION_FEEDBACK: NodeSelectionFeedbackState = {
  patches: EMPTY_NODE_PATCHES
}

const EMPTY_NODE_TEXT_FEEDBACK: NodeTextFeedbackState = {
  patches: EMPTY_TEXT_PREVIEW_PATCHES
}

export const EMPTY_NODE_FEEDBACK: NodeFeedbackState = {
  text: EMPTY_NODE_TEXT_FEEDBACK
}

export const EMPTY_NODE_FEEDBACK_PROJECTION: NodeFeedbackProjection = {
  hovered: false,
  hidden: false
}

const EMPTY_NODE_FEEDBACK_MAP = new Map<NodeId, NodeFeedbackProjection>()

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

const toNodeTextFeedbackState = (
  patches: readonly TextPreviewEntry[]
): NodeTextFeedbackState => patches.length > 0
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
  state: NodeTextFeedbackState,
  nodeId: NodeId,
  patch: TextPreviewPatch | undefined
): NodeTextFeedbackState => {
  const currentPatch = readTextPreviewEntry(state.patches, nodeId)
  const nextPatch = mergeTextPreviewPatch(currentPatch, patch)
  if (isTextPreviewPatchEqual(currentPatch, nextPatch)) {
    return state
  }

  return toNodeTextFeedbackState(
    replaceTextPreviewEntry(state.patches, nodeId, nextPatch)
  )
}

export const clearNodeTextPreview = (
  state: NodeTextFeedbackState,
  nodeId: NodeId
): NodeTextFeedbackState => {
  if (!readTextPreviewEntry(state.patches, nodeId)) {
    return state
  }

  return toNodeTextFeedbackState(
    replaceTextPreviewEntry(state.patches, nodeId, undefined)
  )
}

export const clearNodeTextPreviewSize = (
  state: NodeTextFeedbackState,
  nodeId: NodeId
): NodeTextFeedbackState => {
  const patch = readTextPreviewEntry(state.patches, nodeId)
  if (!patch?.size) {
    return state
  }

  return toNodeTextFeedbackState(
    replaceTextPreviewEntry(
      state.patches,
      nodeId,
      hasTextPreviewPatch({
        position: patch.position,
        fontSize: patch.fontSize,
        mode: patch.mode,
        wrapWidth: patch.wrapWidth,
        handle: patch.handle
      })
        ? {
            position: patch.position,
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
  left: NodeFeedbackState,
  right: NodeFeedbackState
) => left.text.patches === right.text.patches

export const isNodeProjectionEqual = (
  left: NodeFeedbackProjection,
  right: NodeFeedbackProjection
) => (
  isNodePatchEqual(left.patch, right.patch)
  && isTextPreviewPatchEqual(left.text, right.text)
  && left.hovered === right.hovered
  && left.hidden === right.hidden
)

export const normalizeNodeFeedbackState = (
  state: NodeFeedbackState
): NodeFeedbackState => {
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
  state: EditorFeedbackState
) => {
  if (
    state.selection.node.patches.length === 0
    && state.node.text.patches.length === 0
    && state.draw.hidden.length === 0
    && state.selection.node.frameHoverId === undefined
  ) {
    return EMPTY_NODE_FEEDBACK_MAP
  }

  const next = new Map<NodeId, NodeFeedbackProjection>()
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
    mergeEntryById(next, entry.id, (current) => ({
      patch: current?.patch
        ? {
            ...current.patch,
            ...entry.patch
          }
        : entry.patch,
      text: current?.text,
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
