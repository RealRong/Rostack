import type { NodeId } from '@whiteboard/core/types'
import type { DrawPreview } from '@whiteboard/editor/local/draw'
import {
  clearNodeTextPreview,
  clearNodeTextPreviewSize,
  updateNodeTextPreview
} from '@whiteboard/editor/local/feedback/node'
import type {
  EdgeGuide,
  EdgeFeedbackEntry,
  EditorFeedbackRuntime,
  MindmapPreviewState,
  TextPreviewPatch
} from '@whiteboard/editor/local/feedback/types'
import {
  updateFeedbackBranch,
  updateFeedbackNestedBranch
} from '@whiteboard/editor/local/feedback/update'

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
    setInteraction: (entries: readonly EdgeFeedbackEntry[]) => void
    setGuide: (guide?: EdgeGuide) => void
    clearPatches: () => void
    clearGuide: () => void
    clear: () => void
  }
  mindmap: {
    setPreview: (preview?: MindmapPreviewState) => void
    clear: () => void
  }
}

const EMPTY_EDGE_FEEDBACK_ENTRIES = [] as const
const EMPTY_HIDDEN_NODE_IDS: readonly NodeId[] = []

export const createLocalFeedbackActions = ({
  feedback
}: {
  feedback: Pick<EditorFeedbackRuntime, 'set'>
}): LocalFeedbackActions => ({
  draw: {
    setPreview: (preview) => updateFeedbackNestedBranch(
      feedback,
      'draw',
      'preview',
      (current) => current === preview ? current : preview
    ),
    setHidden: (nodeIds) => updateFeedbackNestedBranch(
      feedback,
      'draw',
      'hidden',
      (current) => current === nodeIds ? current : nodeIds
    ),
    clear: () => updateFeedbackBranch(feedback, 'draw', (current) => (
      current.preview === null && current.hidden.length === 0
        ? current
        : {
            preview: null,
            hidden: EMPTY_HIDDEN_NODE_IDS
          }
    ))
  },
  node: {
    text: {
      set: (nodeId, patch) => updateFeedbackNestedBranch(
        feedback,
        'node',
        'text',
        (current) => updateNodeTextPreview(current, nodeId, patch)
      ),
      clear: (nodeId) => updateFeedbackNestedBranch(
        feedback,
        'node',
        'text',
        (current) => clearNodeTextPreview(current, nodeId)
      ),
      clearSize: (nodeId) => updateFeedbackNestedBranch(
        feedback,
        'node',
        'text',
        (current) => clearNodeTextPreviewSize(current, nodeId)
      )
    }
  },
  edge: {
    setInteraction: (entries) => updateFeedbackNestedBranch(
      feedback,
      'edge',
      'interaction',
      (current) => current === entries ? current : entries
    ),
    setGuide: (guide) => updateFeedbackNestedBranch(
      feedback,
      'edge',
      'guide',
      (current) => current === guide ? current : guide
    ),
    clearPatches: () => updateFeedbackNestedBranch(
      feedback,
      'edge',
      'interaction',
      (current) => current.length === 0 ? current : EMPTY_EDGE_FEEDBACK_ENTRIES
    ),
    clearGuide: () => updateFeedbackNestedBranch(
      feedback,
      'edge',
      'guide',
      (current) => current === undefined ? current : undefined
    ),
    clear: () => updateFeedbackBranch(feedback, 'edge', (current) => (
      current.interaction.length === 0 && current.guide === undefined
        ? current
        : {
            interaction: EMPTY_EDGE_FEEDBACK_ENTRIES,
            guide: undefined
          }
    ))
  },
  mindmap: {
    setPreview: (preview) => updateFeedbackNestedBranch(
      feedback,
      'mindmap',
      'preview',
      (current) => current === preview ? current : preview
    ),
    clear: () => updateFeedbackBranch(feedback, 'mindmap', (current) => (
      current.preview === undefined
        ? current
        : {}
    ))
  }
})
