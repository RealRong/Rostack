import { store } from '@shared/core'
import type { Guide } from '@whiteboard/core/node'
import type {
  SelectionAffordance,
  SelectionSummary
} from '@whiteboard/core/selection'
import type { MindmapId } from '@whiteboard/core/types'
import type { DrawPreview } from '@whiteboard/editor-scene'
import type { EdgeGuide } from '@whiteboard/editor/preview/types'
import type {
  EditorMarqueePreview,
  EditorSelectionEdgeRead,
  EditorSelectionNodeRead,
  EditorState,
  MindmapChrome,
  SelectedEdgeChrome
} from '@whiteboard/editor/types/editor'
import type {
  EditorSelectionView,
  SelectionMembers,
  SelectionOverlay,
  SelectionToolbarContext
} from '@whiteboard/editor/types/selectionPresentation'

export type EditorSceneDerived = {
  selection: {
    members: store.ReadStore<SelectionMembers>
    summary: store.ReadStore<SelectionSummary>
    affordance: store.ReadStore<SelectionAffordance>
    view: store.ReadStore<EditorSelectionView>
    edge: {
      chrome: store.ReadStore<SelectedEdgeChrome | undefined>
    }
  }
  chrome: {
    marquee: store.ReadStore<EditorMarqueePreview | undefined>
    draw: store.ReadStore<DrawPreview | null>
    edgeGuide: store.ReadStore<EdgeGuide>
    snap: store.ReadStore<readonly Guide[]>
  }
  mindmap: {
    chrome: store.KeyedReadStore<MindmapId, MindmapChrome | undefined>
  }
}

export type EditorPolicyDerived = {
  selection: {
    toolbar: store.ReadStore<SelectionToolbarContext | undefined>
    overlay: store.ReadStore<SelectionOverlay | undefined>
    node: EditorSelectionNodeRead
    edge: EditorSelectionEdgeRead
  }
}

export type EditorDerived = {
  scene: EditorSceneDerived
  editor: EditorPolicyDerived
}
