import type { NodeId } from '@whiteboard/core/types'
import type { DrawPreview } from '../../types/draw'
import {
  isTextPreviewPatchEqual,
  readTextPreviewEntry,
  replaceTextPreviewEntry
} from './node'
import type {
  EdgeGuide,
  EdgeOverlayEntry,
  EditorOverlay,
  MindmapDragFeedback,
  TextPreviewPatch
} from './types'
import {
  updateOverlayBranch,
  updateOverlayNestedBranch
} from './update'

export type PreviewCommands = {
  draw: {
    setPreview: (preview: DrawPreview | null) => void
    setHidden: (nodeIds: readonly NodeId[]) => void
    clear: () => void
  }
  node: {
    text: {
      set: (nodeId: NodeId, patch?: TextPreviewPatch) => void
      clear: (nodeId: NodeId) => void
      clearSize: (nodeId: NodeId) => void
    }
  }
  edge: {
    setInteraction: (entries: readonly EdgeOverlayEntry[]) => void
    setGuide: (guide?: EdgeGuide) => void
    clearPatches: () => void
    clearGuide: () => void
    clear: () => void
  }
  mindmap: {
    setDrag: (drag?: MindmapDragFeedback) => void
    clear: () => void
  }
}

const EMPTY_EDGE_PATCHES = [] as const
const EMPTY_NODE_IDS: readonly NodeId[] = []

const mergeTextPreviewPatch = (
  current: Parameters<PreviewCommands['node']['text']['set']>[1],
  patch: Parameters<PreviewCommands['node']['text']['set']>[1]
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

  if (
    !next.position
    && !next.size
    && next.fontSize === undefined
    && next.mode === undefined
    && next.wrapWidth === undefined
    && next.handle === undefined
  ) {
    return undefined
  }

  return next
}

export const createPreviewCommands = ({
  overlay
}: {
  overlay: Pick<EditorOverlay, 'set'>
}): PreviewCommands => ({
  draw: {
    setPreview: (preview) => updateOverlayNestedBranch(
      overlay,
      'draw',
      'preview',
      (current) => current === preview ? current : preview
    ),
    setHidden: (nodeIds) => updateOverlayNestedBranch(
      overlay,
      'draw',
      'hidden',
      (current) => current === nodeIds ? current : nodeIds
    ),
    clear: () => updateOverlayBranch(overlay, 'draw', (current) => (
      current.preview === null && current.hidden.length === 0
        ? current
        : {
            preview: null,
            hidden: EMPTY_NODE_IDS
          }
    ))
  },
  node: {
    text: {
      set: (nodeId, patch) => {
        updateOverlayNestedBranch(overlay, 'node', 'text', (current) => {
          const currentPatch = readTextPreviewEntry(current.patches, nodeId)
          const nextPatch = mergeTextPreviewPatch(currentPatch, patch)
          if (isTextPreviewPatchEqual(currentPatch, nextPatch)) {
            return current
          }

          return {
            patches: replaceTextPreviewEntry(current.patches, nodeId, nextPatch)
          }
        })
      },
      clear: (nodeId) => {
        updateOverlayNestedBranch(overlay, 'node', 'text', (current) => (
          readTextPreviewEntry(current.patches, nodeId)
            ? {
                patches: replaceTextPreviewEntry(current.patches, nodeId, undefined)
              }
            : current
        ))
      },
      clearSize: (nodeId) => {
        updateOverlayNestedBranch(overlay, 'node', 'text', (current) => {
          const patch = readTextPreviewEntry(current.patches, nodeId)
          if (!patch?.size) {
            return current
          }

          const nextPatch = {
            position: patch.position,
            fontSize: patch.fontSize,
            mode: patch.mode,
            wrapWidth: patch.wrapWidth,
            handle: patch.handle
          }

          return {
            patches: replaceTextPreviewEntry(
              current.patches,
              nodeId,
              !nextPatch.position
              && nextPatch.fontSize === undefined
              && nextPatch.mode === undefined
              && nextPatch.wrapWidth === undefined
              && nextPatch.handle === undefined
                ? undefined
                : nextPatch
            )
          }
        })
      }
    }
  },
  edge: {
    setInteraction: (entries) => updateOverlayNestedBranch(
      overlay,
      'edge',
      'interaction',
      (current) => current === entries ? current : entries
    ),
    setGuide: (guide) => updateOverlayNestedBranch(
      overlay,
      'edge',
      'guide',
      (current) => current === guide ? current : guide
    ),
    clearPatches: () => updateOverlayNestedBranch(
      overlay,
      'edge',
      'interaction',
      (current) => current.length === 0 ? current : EMPTY_EDGE_PATCHES
    ),
    clearGuide: () => updateOverlayNestedBranch(
      overlay,
      'edge',
      'guide',
      (current) => current === undefined ? current : undefined
    ),
    clear: () => updateOverlayBranch(overlay, 'edge', (current) => (
      current.interaction.length === 0 && current.guide === undefined
        ? current
        : {
            interaction: EMPTY_EDGE_PATCHES,
            guide: undefined
          }
    ))
  },
  mindmap: {
    setDrag: (drag) => updateOverlayNestedBranch(
      overlay,
      'mindmap',
      'drag',
      (current) => current === drag ? current : drag
    ),
    clear: () => updateOverlayBranch(overlay, 'mindmap', (current) => (
      current.drag === undefined
        ? current
        : {}
    ))
  }
})
