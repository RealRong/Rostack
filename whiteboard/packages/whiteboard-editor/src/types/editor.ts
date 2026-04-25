import { store } from '@shared/core'
import type { SliceExportResult } from '@whiteboard/core/document'
import type { EdgeView as CoreEdgeView } from '@whiteboard/core/edge'
import type { Guide } from '@whiteboard/core/node'
import type { SelectionTarget } from '@whiteboard/core/selection'
import type {
  Document,
  Edge,
  EdgeId,
  MindmapId,
  Node,
  NodeId,
  NodeModel,
  Point,
  Rect,
  Viewport
} from '@whiteboard/core/types'
import type { HistoryApi } from '@whiteboard/history'
import type {
  MindmapView,
  Read as EditorSceneQueryRuntime,
  SceneItem
} from '@whiteboard/editor-scene'
import type { EditorActions as EditorWrite } from '@whiteboard/editor/action/types'
import type {
  DocumentEdgeItem,
  DocumentNodeItem
} from '@whiteboard/editor/document/source'
import type { EditorEdgeView } from '@whiteboard/editor/scene/edge'
import type { MindmapChrome } from '@whiteboard/editor/scene/mindmap'
import type {
  EditorNodeView,
  GraphNodeGeometry,
  NodeCapability
} from '@whiteboard/editor/scene/node'
import type { SelectedEdgeChrome } from '@whiteboard/editor/session/edge'
import type { EditSession } from '@whiteboard/editor/session/edit'
import type { SessionRead, ToolRead } from '@whiteboard/editor/session/read'
import type {
  DrawPreview,
  DrawState
} from '@whiteboard/editor/session/draw/state'
import type {
  EdgeGuide,
  MarqueePreview
} from '@whiteboard/editor/session/preview/types'
import type {
  ContextMenuInput,
  ContextMenuIntent,
  KeyboardInput,
  PointerDownInput,
  PointerMoveInput,
  PointerUpInput,
  WheelInput
} from '@whiteboard/editor/types/input'
import type { PointerMode } from '@whiteboard/editor/input/core/types'
import type {
  EditorSelectionView,
  SelectionNodeStats,
  SelectionOverlay,
  SelectionToolbarContext,
  SelectionToolbarNodeScope
} from '@whiteboard/editor/types/selectionPresentation'
import type { Tool } from '@whiteboard/editor/types/tool'
import type { EngineWrite } from '@whiteboard/engine/types/engineWrite'

export type EditorPointerDispatchResult = {
  handled: boolean
  continuePointer: boolean
}

export type EditorInputHost = {
  pointerMode: (phase: 'move' | 'up') => PointerMode
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

export type EditorSessionState = {
  tool: store.ReadStore<Tool>
  draw: store.ReadStore<DrawState>
  edit: store.ReadStore<EditSession>
  selection: store.ReadStore<SelectionTarget>
  interaction: store.ReadStore<EditorInteractionState>
  viewport: store.ReadStore<Viewport>
}

export type EntitySource<TKey, TValue> = {
  get: (id: TKey) => TValue | undefined
  getMany: (ids: readonly TKey[]) => readonly TValue[]
  ids: () => readonly TKey[]
  read: store.KeyedReadStore<TKey, TValue | undefined>
}

export type EditorSelectionNodeRead = {
  selected: store.KeyedReadStore<NodeId, boolean>
  stats: store.ReadStore<SelectionNodeStats>
  scope: store.ReadStore<SelectionToolbarNodeScope | undefined>
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
  history: ReturnType<HistoryApi['get']>
  draw: DrawState
}

export type EditorMindmapRead = {
  view: store.KeyedReadStore<MindmapId, MindmapView | undefined>
  navigate: (input: {
    id: MindmapId
    fromNodeId: NodeId
    direction: 'parent' | 'first-child' | 'prev-sibling' | 'next-sibling'
  }) => NodeId | undefined
  id: (value: string) => MindmapId | undefined
  structure: (
    value: MindmapId | NodeId | string
  ) => MindmapView['structure'] | undefined
}

export type EditorSceneQuery = {
  rect: EditorSceneQueryRuntime['spatial']['rect']
  visible: (
    options?: Parameters<EditorSceneQueryRuntime['spatial']['rect']>[1]
  ) => ReturnType<EditorSceneQueryRuntime['spatial']['rect']>
}

export type SceneGeometryCache = {
  node: (nodeId: NodeId) => (GraphNodeGeometry & {
    node: NodeModel
  }) | undefined
  edge: (edgeId: EdgeId) => CoreEdgeView | undefined
  order: (item: SceneItem | {
    kind: SceneItem['kind']
    id: string
  }) => number
}

export type SceneScope = {
  move: (target: SelectionTarget) => {
    nodes: readonly Node[]
    edges: readonly Edge[]
  }
  relatedEdges: (nodeIds: readonly NodeId[]) => readonly EdgeId[]
  bounds: (target: SelectionTarget) => Rect | undefined
}

export type EditorDocumentSource = {
  get: () => Document
  background: store.ReadStore<Document['background'] | undefined>
  bounds: () => Rect
  nodes: EntitySource<NodeId, DocumentNodeItem>
  edges: EntitySource<EdgeId, DocumentEdgeItem>
  slice: (input: {
    nodeIds?: readonly NodeId[]
    edgeIds?: readonly EdgeId[]
  }) => SliceExportResult | undefined
}

export type EditorSceneSource = {
  revision: () => number
  items: store.ReadStore<readonly SceneItem[]>
  query: EditorSceneQuery
  geometry: SceneGeometryCache
  scope: SceneScope
  frame: EditorSceneQueryRuntime['frame']
  group: {
    exact: (target: SelectionTarget) => readonly string[]
    ofNode: (nodeId: string) => string | undefined
    ofEdge: (edgeId: string) => string | undefined
  }
  mindmap: EditorMindmapRead
  nodes: EntitySource<NodeId, EditorNodeView> & {
    capability: store.KeyedReadStore<NodeId, NodeCapability | undefined>
  }
  edges: EntitySource<EdgeId, EditorEdgeView> & {
    geometry: store.KeyedReadStore<EdgeId, CoreEdgeView | undefined>
  }
}

export type EditorChromeSource = store.ReadStore<EditorChromePresentation> & {
  marquee: store.ReadStore<MarqueePreview | undefined>
  draw: store.ReadStore<DrawPreview | null>
  edgeGuide: store.ReadStore<EdgeGuide>
  snap: store.ReadStore<readonly Guide[]>
  selection: store.ReadStore<SelectionOverlay | undefined>
}

export type EditorPanelSource = store.ReadStore<EditorPanelPresentation> & {
  selectionToolbar: store.ReadStore<SelectionToolbarContext | undefined>
  history: HistoryApi
  draw: store.ReadStore<DrawState>
}

export type EditorSessionSource = {
  tool: store.ReadStore<Tool> & ToolRead
  draw: store.ReadStore<DrawState>
  edit: store.ReadStore<EditSession>
  selection: store.ReadStore<SelectionTarget> & {
    target: store.ReadStore<SelectionTarget>
    view: store.ReadStore<EditorSelectionView>
    node: EditorSelectionNodeRead
    edge: {
      chrome: store.ReadStore<SelectedEdgeChrome | undefined>
    }
  }
  interaction: store.ReadStore<EditorInteractionState>
  viewport: SessionRead['viewport'] & {
    value: store.ReadStore<Viewport>
    zoom: store.ReadStore<number>
    center: store.ReadStore<Point>
  }
  chrome: EditorChromeSource
  panel: EditorPanelSource
  history: HistoryApi
  mindmap: {
    chrome: store.KeyedReadStore<MindmapId, MindmapChrome | undefined>
  }
}

export type EditorEvents = {
  change: (listener: (document: Document, write: EngineWrite) => void) => store.Unsubscribe
  dispose: (listener: () => void) => store.Unsubscribe
}

export type Editor = {
  document: EditorDocumentSource
  scene: EditorSceneSource
  session: EditorSessionSource
  write: EditorWrite
  input: EditorInputHost
  events: EditorEvents
  dispose: () => void
}
