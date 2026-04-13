import type { NodeId } from '@whiteboard/core/types'
import type { DrawPreview } from '../draw'
import {
  clearNodeTextPreview,
  clearNodeTextPreviewSize,
  updateNodeTextPreview
} from '../feedback/node'
import type {
  EdgeGuide,
  EdgeOverlayEntry,
  EditorOverlay,
  MindmapDragFeedback,
  TextPreviewPatch
} from '../feedback/types'
import {
  updateOverlayBranch,
  updateOverlayNestedBranch
} from '../feedback/update'

export type LocalFeedbackActions = {
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

export const createLocalFeedbackActions = ({
  overlay
}: {
  overlay: Pick<EditorOverlay, 'set'>
}): LocalFeedbackActions => ({
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
      set: (nodeId, patch) => updateOverlayNestedBranch(
        overlay,
        'node',
        'text',
        (current) => updateNodeTextPreview(current, nodeId, patch)
      ),
      clear: (nodeId) => updateOverlayNestedBranch(
        overlay,
        'node',
        'text',
        (current) => clearNodeTextPreview(current, nodeId)
      ),
      clearSize: (nodeId) => updateOverlayNestedBranch(
        overlay,
        'node',
        'text',
        (current) => clearNodeTextPreviewSize(current, nodeId)
      )
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
