import { store } from '@shared/core'
import type { Guide } from '@whiteboard/core/node'
import type {
  SelectionAffordance,
  SelectionSummary,
  SelectionTarget
} from '@whiteboard/core/selection'
import type {
  MindmapId,
  NodeId,
  Point,
  Rect,
  Viewport
} from '@whiteboard/core/types'
import type {
  DrawPreview,
  EditorScene
} from '@whiteboard/editor-scene'
import type { EditorPreviewState } from '@whiteboard/editor/state/preview'
import type { EdgeGuide } from '@whiteboard/editor/state/preview-types'
import type { DrawState } from '@whiteboard/editor/schema/draw-state'
import type { EditSession } from '@whiteboard/editor/schema/edit'
import type { DrawMode } from '@whiteboard/editor/schema/draw-mode'
import type { Tool } from '@whiteboard/editor/schema/tool'
import type { EditorViewport, ViewportPointer } from '@whiteboard/editor/state/viewport'
import type {
  EditorSelectionView,
  SelectionEdgeStats,
  SelectionMembers,
  SelectionNodeStats,
  SelectionOverlay,
  SelectionToolbarContext,
  SelectionToolbarEdgeScope,
  SelectionToolbarNodeScope
} from '@whiteboard/editor/scene-ui/schema'

export type EditorInteractionState = Readonly<{
  busy: boolean
  chrome: boolean
  transforming: boolean
  drawing: boolean
  panning: boolean
  selecting: boolean
  editingEdge: boolean
  space: boolean
}>

export type EditorBackgroundView =
  | {
      type: 'none'
    }
  | {
      type: 'dot' | 'line'
      color: string
      step: number
      offset: Point
    }

export type ToolRead = {
  get: () => Tool
  subscribe: (listener: () => void) => store.Unsubscribe
  type: () => Tool['type']
  value: () => DrawMode | undefined
  is: (type: Tool['type'], value?: string) => boolean
}

export type EditorViewportStateRead = {
  get: () => Viewport
  subscribe: (listener: () => void) => store.Unsubscribe
  pointer: (input: {
    clientX: number
    clientY: number
  }) => ViewportPointer
  worldToScreen: (point: Point) => Point
  worldRect: () => Rect
  screenPoint: (clientX: number, clientY: number) => Point
  size: () => {
    width: number
    height: number
  }
  value: store.ReadStore<Viewport>
  zoom: store.ReadStore<number>
  center: store.ReadStore<Point>
}

export type EditorState = {
  tool: ToolRead
  draw: store.ReadStore<DrawState>
  edit: store.ReadStore<EditSession | null>
  selection: store.ReadStore<SelectionTarget>
  interaction: store.ReadStore<EditorInteractionState>
  preview: store.ReadStore<EditorPreviewState>
  viewport: EditorViewportStateRead
}

export type EditorSelectionNodeRead = {
  selected: store.KeyedReadStore<NodeId, boolean>
  stats: store.ReadStore<SelectionNodeStats>
  scope: store.ReadStore<SelectionToolbarNodeScope | undefined>
}

export type EditorSelectionEdgeRead = {
  stats: store.ReadStore<SelectionEdgeStats>
  scope: store.ReadStore<SelectionToolbarEdgeScope | undefined>
}

export type EditorMarqueePreview =
  NonNullable<ReturnType<EditorScene['overlay']['marquee']>>

export type SelectedEdgeChrome =
  NonNullable<ReturnType<EditorScene['edges']['chrome']>>

export type MindmapChrome = {
  addChildTargets: ReturnType<EditorScene['mindmaps']['addChildTargets']>
}

export type EditorSceneUiSelection = {
  members: store.ReadStore<SelectionMembers>
  summary: store.ReadStore<SelectionSummary>
  affordance: store.ReadStore<SelectionAffordance>
  view: store.ReadStore<EditorSelectionView>
  node: EditorSelectionNodeRead
  edge: EditorSelectionEdgeRead & {
    chrome: store.ReadStore<SelectedEdgeChrome | undefined>
  }
}

export type EditorSceneUiChrome = {
  selection: {
    marquee: store.ReadStore<EditorMarqueePreview | undefined>
    snapGuides: store.ReadStore<readonly Guide[]>
    toolbar: store.ReadStore<SelectionToolbarContext | undefined>
    overlay: store.ReadStore<SelectionOverlay | undefined>
  }
  draw: {
    preview: store.ReadStore<DrawPreview | null>
  }
  edge: {
    guide: store.ReadStore<EdgeGuide>
  }
}

export type EditorSceneUiMindmap = {
  addChildTargets: store.KeyedReadStore<MindmapId, MindmapChrome | undefined>
}

export type EditorSceneUi = {
  state: EditorState
  background: store.ReadStore<EditorBackgroundView>
  selection: EditorSceneUiSelection
  chrome: EditorSceneUiChrome
  mindmap: EditorSceneUiMindmap
}
