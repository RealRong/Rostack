import { geometry as geometryApi } from '@whiteboard/core/geometry'
import type { NodeId } from '@whiteboard/core/types'
import type {
  NodePresentation,
  NodePresentationEntry,
  NodePreviewState,
  NodePreviewEntry,
  NodeSelectionPreviewState,
  NodeTextPreviewState,
  TextPreviewEntry,
  TextPreviewPatch
} from '@whiteboard/editor/session/preview/types'

export const EMPTY_NODE_PATCHES: readonly NodePreviewEntry[] = []
export const EMPTY_TEXT_PREVIEW_PATCHES: readonly TextPreviewEntry[] = []
export const EMPTY_NODE_PRESENTATIONS: readonly NodePresentationEntry[] = []
export const EMPTY_NODE_HIDDEN: readonly NodeId[] = []

export const EMPTY_NODE_SELECTION_FEEDBACK: NodeSelectionPreviewState = {
  patches: EMPTY_NODE_PATCHES
}

const EMPTY_NODE_TEXT_FEEDBACK: NodeTextPreviewState = {
  patches: EMPTY_TEXT_PREVIEW_PATCHES
}

export const EMPTY_NODE_FEEDBACK: NodePreviewState = {
  text: EMPTY_NODE_TEXT_FEEDBACK,
  presentation: EMPTY_NODE_PRESENTATIONS
}

const isNodePresentationEqual = (
  left: NodePresentation | undefined,
  right: NodePresentation | undefined
) => geometryApi.equal.point(left?.position, right?.position)

const isTextPreviewPatchEqual = (
  left: TextPreviewPatch | undefined,
  right: TextPreviewPatch | undefined
) => (
  geometryApi.equal.point(left?.position, right?.position)
  && geometryApi.equal.size(left?.size, right?.size)
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
) => (
  left.text.patches === right.text.patches
  && left.presentation === right.presentation
)

export const normalizeNodeFeedbackState = (
  state: NodePreviewState
): NodePreviewState => {
  const textPatches = state.text.patches.length > 0
    ? state.text.patches
    : EMPTY_TEXT_PREVIEW_PATCHES
  const presentation = state.presentation.length > 0
    ? state.presentation
    : EMPTY_NODE_PRESENTATIONS

  if (
    textPatches === EMPTY_TEXT_PREVIEW_PATCHES
    && presentation === EMPTY_NODE_PRESENTATIONS
  ) {
    return EMPTY_NODE_FEEDBACK
  }

  return {
    text:
      textPatches === EMPTY_TEXT_PREVIEW_PATCHES
        ? EMPTY_NODE_TEXT_FEEDBACK
        : {
            patches: textPatches
          },
    presentation
  }
}

export const updateNodePresentation = (
  state: NodePreviewState,
  nodeId: NodeId,
  presentation: NodePresentation | undefined
): NodePreviewState => {
  const current = state.presentation.find((entry) => entry.id === nodeId)?.presentation
  if (isNodePresentationEqual(current, presentation)) {
    return state
  }

  const next = state.presentation.filter((entry) => entry.id !== nodeId)
  if (presentation?.position) {
    next.push({
      id: nodeId,
      presentation
    })
  }

  return normalizeNodeFeedbackState({
    ...state,
    presentation: next
  })
}

export const clearNodePresentation = (
  state: NodePreviewState,
  nodeId: NodeId
): NodePreviewState => updateNodePresentation(state, nodeId, undefined)
