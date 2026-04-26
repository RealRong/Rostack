import { store } from '@shared/core'
import type { LocalHistoryApi, LocalHistoryState } from '@shared/mutation'
import type { SliceExportResult } from '@whiteboard/core/document'
import type { Guide } from '@whiteboard/core/node'
import type {
  SelectionAffordance,
  SelectionSummary,
  SelectionTarget
} from '@whiteboard/core/selection'
import type {
  Document,
  EdgeId,
  MindmapId,
  NodeId,
  NodeModel,
  Point,
  Rect,
  Viewport
} from '@whiteboard/core/types'
import type {
  CommittedEdgeView,
  CommittedNodeView,
  Query as EditorSceneQueryRuntime,
  RuntimeStores,
  SpatialKind,
  SpatialQueryStats,
  SpatialRecord
} from '@whiteboard/editor-scene'
import type { EditorActions as EditorWrite } from '@whiteboard/editor/action/types'
import type { MindmapChrome } from '@whiteboard/editor/session/presentation/mindmapChrome'
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
  SelectionMembers,
  SelectionNodeStats,
  SelectionOverlay,
  SelectionToolbarContext,
  SelectionToolbarNodeScope
} from '@whiteboard/editor/types/selectionPresentation'
import type { Tool } from '@whiteboard/editor/types/tool'
import type { IntentResult } from '@whiteboard/engine'
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
  history: LocalHistoryState
  draw: DrawState
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
  | {
      kind: 'group'
      id: string
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
  dispose: () => void
}

export type EditorDocumentSource = {
  get: () => Document
  bounds: () => Rect
  slice: (input: {
    nodeIds?: readonly NodeId[]
    edgeIds?: readonly EdgeId[]
  }) => SliceExportResult | undefined
  node: {
    get: (id: NodeId) => CommittedNodeView | undefined
    ids: () => readonly NodeId[]
  }
  edge: {
    get: (id: EdgeId) => CommittedEdgeView | undefined
    ids: () => readonly EdgeId[]
  }
}

export type EditorSceneSource = {
  revision: () => number
  query: EditorSceneQueryRuntime
  stores: RuntimeStores
  host: {
    pick: ScenePickRuntime
    visible: (
      options?: Parameters<EditorSceneQueryRuntime['spatial']['rect']>[1]
    ) => ReturnType<EditorSceneQueryRuntime['spatial']['rect']>
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
  history: LocalHistoryApi<IntentResult>
  draw: store.ReadStore<DrawState>
}

export type EditorSessionSource = {
  tool: store.ReadStore<Tool> & ToolRead
  draw: store.ReadStore<DrawState>
  edit: store.ReadStore<EditSession>
  selection: store.ReadStore<SelectionTarget> & {
    target: store.ReadStore<SelectionTarget>
    members: store.ReadStore<SelectionMembers>
    summary: store.ReadStore<SelectionSummary>
    affordance: store.ReadStore<SelectionAffordance>
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
  history: LocalHistoryApi<IntentResult>
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
