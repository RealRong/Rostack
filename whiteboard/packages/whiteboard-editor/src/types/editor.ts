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
  SceneItem,
  SpatialKind,
  SpatialQueryStats,
  SpatialRecord
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
import type {
  SelectedEdgeChrome,
  SelectedEdgeRoutePoint
} from '@whiteboard/editor/session/edge'
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

export type ScenePickKind = Extract<
  SpatialKind,
  'node' | 'edge' | 'mindmap'
>

export type ScenePickRequest = {
  client: Point
  screen: Point
  world: Point
  radius?: number
  kinds?: readonly ScenePickKind[]
}

export type ScenePickTarget =
  | {
      kind: 'node'
      id: NodeId
    }
  | {
      kind: 'edge'
      id: EdgeId
    }
  | {
      kind: 'mindmap'
      id: MindmapId
    }

export type ScenePickStats = SpatialQueryStats & {
  hits: number
  latency: number
}

export type ScenePickCandidateResult = {
  rect: Rect
  records: readonly SpatialRecord[]
  stats: SpatialQueryStats
}

export type ScenePickResult = {
  rect: Rect
  target?: ScenePickTarget
  stats: ScenePickStats
}

export type ScenePickRuntimeResult = {
  request: ScenePickRequest
  result: ScenePickResult
}

export type ScenePickRuntime = {
  schedule: (request: ScenePickRequest) => void
  get: () => ScenePickRuntimeResult | undefined
  subscribe: (listener: () => void) => store.Unsubscribe
  clear: () => void
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

export type EdgeRenderStyle = {
  color?: Edge['style'] extends infer TStyle
    ? TStyle extends {
        color?: infer TValue
      }
      ? TValue
      : never
    : never
  width: number
  opacity: number
  dash?: Edge['style'] extends infer TStyle
    ? TStyle extends {
        dash?: infer TValue
      }
      ? TValue
      : never
    : never
  start?: Edge['style'] extends infer TStyle
    ? TStyle extends {
        start?: infer TValue
      }
      ? TValue
      : never
    : never
  end?: Edge['style'] extends infer TStyle
    ? TStyle extends {
        end?: infer TValue
      }
      ? TValue
      : never
    : never
}

export type EdgeRenderBucketId = string

export type EdgeStaticPath = {
  id: EdgeId
  svgPath: string
}

export type EdgeStaticBucket = {
  id: EdgeRenderBucketId
  style: EdgeRenderStyle
  paths: readonly EdgeStaticPath[]
}

export type EdgeStaticRenderModel = {
  buckets: readonly EdgeStaticBucket[]
}

export type EdgeActiveRenderItem = {
  id: EdgeId
  svgPath: string
  box?: {
    x: number
    y: number
    width: number
    height: number
    pad: number
  }
  style: EdgeRenderStyle
  state: {
    hovered: boolean
    focused: boolean
    selected: boolean
    editing: boolean
  }
}

export type EdgeActiveRenderModel = {
  edges: readonly EdgeActiveRenderItem[]
}

export type EdgeLabelRenderItem = {
  edgeId: EdgeId
  labelId: string
  point: Point
  angle: number
  text: string
  displayText: string
  editing: boolean
  selected: boolean
  style: NonNullable<Edge['labels']>[number]['style']
  maskRect: {
    x: number
    y: number
    width: number
    height: number
    radius: number
    angle: number
    center: Point
  }
  caret?: EditSession extends infer TEdit
    ? TEdit extends {
        kind: 'edge-label'
        caret?: infer TCaret
      }
      ? TCaret
      : never
    : never
}

export type EdgeLabelRenderModel = {
  labels: readonly EdgeLabelRenderItem[]
}

export type EdgeOverlayPreviewPath = {
  svgPath: string
  style?: Edge['style']
}

export type EdgeOverlayEndpointHandle = {
  edgeId: EdgeId
  end: 'source' | 'target'
  point: Point
}

export type EdgeOverlayRenderModel = {
  previewPath?: EdgeOverlayPreviewPath
  snapPoint?: Point
  endpointHandles: readonly EdgeOverlayEndpointHandle[]
  routePoints: readonly SelectedEdgeRoutePoint[]
}

export type EdgeRenderRuntime = {
  static: store.ReadStore<EdgeStaticRenderModel>
  active: store.ReadStore<EdgeActiveRenderModel>
  labels: store.ReadStore<EdgeLabelRenderModel>
  overlay: store.ReadStore<EdgeOverlayRenderModel>
}

export type EdgeInteractionState = {
  hovered?: EdgeId
  focused?: EdgeId
  selected: readonly EdgeId[]
  editing?: EdgeId
}

export type EdgeInteractionRead = {
  get: () => EdgeInteractionState
  subscribe: (listener: () => void) => store.Unsubscribe
}

export type EdgeHitQuery = {
  pick: (input: {
    point: Point
    threshold?: number
    excludeIds?: readonly EdgeId[]
  }) => EdgeId | undefined
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
  edge: {
    render: EdgeRenderRuntime
    hit: EdgeHitQuery
    interaction: EdgeInteractionRead
  }
  pick: {
    rect: (point: Point, radius?: number) => Rect
    candidates: (input: {
      point: Point
      radius?: number
      kinds?: readonly ScenePickKind[]
    }) => ScenePickCandidateResult
    resolve: (input: {
      point: Point
      radius?: number
      kinds?: readonly ScenePickKind[]
    }) => ScenePickResult
    runtime: ScenePickRuntime
  }
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
