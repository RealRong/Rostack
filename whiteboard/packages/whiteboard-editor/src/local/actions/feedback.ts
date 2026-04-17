import type { NodeId } from '@whiteboard/core/types'
import {
  clearNodeTextPreview,
  clearNodeTextPreviewSize,
  updateNodeTextPreview
} from '@whiteboard/editor/local/feedback/node'
import type {
  EditorFeedbackRuntime,
  MindmapPreviewState,
  TextPreviewPatch
} from '@whiteboard/editor/local/feedback/types'
import {
  updateFeedbackBranch,
  updateFeedbackNestedBranch
} from '@whiteboard/editor/local/feedback/update'

export type LocalFeedbackActions = {
  node: {
    text: {
      set: (nodeId: NodeId, patch?: TextPreviewPatch) => void
      clear: (nodeId: NodeId) => void
      clearSize: (nodeId: NodeId) => void
    }
  }
  mindmap: {
    setPreview: (preview?: MindmapPreviewState) => void
    clear: () => void
  }
}

export const createLocalFeedbackActions = ({
  feedback
}: {
  feedback: Pick<EditorFeedbackRuntime, 'set'>
}): LocalFeedbackActions => ({
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
