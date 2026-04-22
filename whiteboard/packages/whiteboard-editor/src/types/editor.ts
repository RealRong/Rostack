import { store } from '@shared/core'
import type { EdgeLabelMaskRect } from '@whiteboard/core/edge'
import type { Guide } from '@whiteboard/core/node'
import type { SelectionSummary, SelectionTarget } from '@whiteboard/core/selection'
import type {
  Document,
  Edge,
  EdgeId,
  MindmapId,
  NodeId,
  NodeModel,
  Point,
  Rect,
  Size,
  Viewport
} from '@whiteboard/core/types'
import type { HistoryApi, HistoryState } from '@whiteboard/history'
import type { EditorActions } from '@whiteboard/editor/action/types'
import type { DocumentRead, MindmapSceneItem } from '@whiteboard/editor/document/read'
import type { MindmapChrome } from '@whiteboard/editor/editor/mindmap'
import type {
  MarqueePreview,
  EdgeGuide
} from '@whiteboard/editor/session/preview/types'
import type {
  DrawPreview,
  DrawState
} from '@whiteboard/editor/session/draw/state'
import type {
  ContextMenuInput,
  ContextMenuIntent,
  KeyboardInput,
  PointerDownInput,
  PointerMoveInput,
  PointerUpInput,
  WheelInput
} from '@whiteboard/editor/types/input'
import type {
  Tool
} from '@whiteboard/editor/types/tool'
import type {
  EditCaret,
  EditField,
  EditSession
} from '@whiteboard/editor/session/edit'
import type { SessionRead } from '@whiteboard/editor/session/read'
import type { SelectedEdgeChrome } from '@whiteboard/editor/projection/edgeShared'
import type {
  SelectionNodeStats,
  SelectionOverlay,
  SelectionToolbarContext,
  SelectionToolbarNodeScope
} from '@whiteboard/editor/types/selectionPresentation'
import type { EngineWrite } from '@whiteboard/engine/types/engineWrite'

export type EditorPointerDispatchResult = {
  handled: boolean
  continuePointer: boolean
}

export type EditorInputHost = {
  contextMenu: (input: ContextMenuInput) => ContextMenuIntent | null
  pointerDown: (input: PointerDownInput) => EditorPointerDispatchResult
  pointerMove: (input: PointerMoveInput) => boolean
  pointerUp: (input: PointerUpInput) => boolean
  pointerCancel: (input: {
    pointerId: number
  }) => boolean
  pointerLeave: () => void
  wheel: (input: WheelInput) => boolean
  cancel: () => void
  keyDown: (input: KeyboardInput) => boolean
  keyUp: (input: KeyboardInput) => boolean
  blur: () => void
}

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

export type EditorStore = {
  tool: store.ReadStore<Tool>
  draw: store.ReadStore<DrawState>
  edit: store.ReadStore<EditSession>
  selection: store.ReadStore<SelectionTarget>
  interaction: store.ReadStore<EditorInteractionState>
  viewport: store.ReadStore<Viewport>
}

export type EditorNodeRender = {
  nodeId: NodeId
  node: NodeModel
  rect: Rect
  bounds: Rect
  rotation: number
  hovered: boolean
  hidden: boolean
  resizing: boolean
  patched: boolean
  selected: boolean
  edit: {
    field: EditField
    caret: EditCaret
  } | undefined
  canConnect: boolean
  canResize: boolean
  canRotate: boolean
}

export type EditorEdgeLabelRender = {
  id: string
  text: string
  displayText: string
  style: NonNullable<Edge['labels']>[number]['style']
  editable: boolean
  caret?: EditCaret
  point: Point
  angle: number
  size: Size
  maskRect: EdgeLabelMaskRect
}

export type EditorEdgeRender = {
  edgeId: EdgeId
  edge: Edge
  patched: boolean
  activeRouteIndex: number | undefined
  selected: boolean
  box: {
    rect: Rect
    pad: number
  }
  path: {
    svgPath: string
    points: readonly Point[]
  }
  labels: readonly EditorEdgeLabelRender[]
}

export type EditorChromePresentation = {
  marquee: MarqueePreview | undefined
  draw: DrawPreview | null
  edgeGuide: EdgeGuide
  snap: readonly Guide[]
  selection: SelectionOverlay | undefined
}

export type EditorPanelPresentation = {
  selectionToolbar: SelectionToolbarContext | undefined
  history: HistoryState
  draw: DrawState
}

export type EditorSelectionNodeRead = {
  selected: store.KeyedReadStore<NodeId, boolean>
  stats: store.ReadStore<SelectionNodeStats>
  scope: store.ReadStore<SelectionToolbarNodeScope | undefined>
}

export type EditorMindmapRead = {
  scene: store.KeyedReadStore<MindmapId, MindmapSceneItem | undefined>
  chrome: store.KeyedReadStore<MindmapId, MindmapChrome | undefined>
  navigate: (input: {
    id: MindmapId
    fromNodeId: NodeId
    direction: 'parent' | 'first-child' | 'prev-sibling' | 'next-sibling'
  }) => NodeId | undefined
}

export type EditorRead = {
  document: Pick<DocumentRead['document'], 'background' | 'bounds'> & {
    get: () => Document
  }
  group: {
    exactIds: (target: SelectionTarget) => readonly string[]
  }
  history: HistoryApi
  mindmap: EditorMindmapRead
  node: {
    render: store.KeyedReadStore<NodeId, EditorNodeRender | undefined>
  }
  edge: {
    render: store.KeyedReadStore<EdgeId, EditorEdgeRender | undefined>
    selectedChrome: store.ReadStore<SelectedEdgeChrome | undefined>
  }
  scene: {
    list: store.ReadStore<readonly {
      kind: 'mindmap' | 'node' | 'edge'
      id: string
    }[]>
  }
  selection: {
    node: EditorSelectionNodeRead
    summary: store.ReadStore<SelectionSummary>
  }
  tool: SessionRead['tool']
  viewport: SessionRead['viewport']
  chrome: store.ReadStore<EditorChromePresentation>
  panel: store.ReadStore<EditorPanelPresentation>
}

export type EditorEvents = {
  change: (listener: (document: Document, write: EngineWrite) => void) => store.Unsubscribe
  dispose: (listener: () => void) => store.Unsubscribe
}

export type Editor = {
  store: EditorStore
  read: EditorRead
  actions: EditorActions
  input: EditorInputHost
  events: EditorEvents
  dispose: () => void
}
