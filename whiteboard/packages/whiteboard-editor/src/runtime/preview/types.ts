import type { NodeId } from '@whiteboard/core/types'
import type { DrawPreview } from '../../types/draw'
import type {
  EdgeGuide,
  EdgeOverlayEntry,
  MindmapDragFeedback
} from '../overlay'
import type { TextPreviewPatch } from '../overlay/types'

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
