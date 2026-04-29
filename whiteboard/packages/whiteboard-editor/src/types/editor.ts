import { store } from '@shared/core'
import type { HistoryPort } from '@shared/mutation'
import type { SliceExportResult } from '@whiteboard/core/document'
import type { Guide } from '@whiteboard/core/node'
import type {
  SelectionAffordance,
  SelectionSummary,
  SelectionTarget
} from '@whiteboard/core/selection'
import type {
  Document,
  MindmapId,
  NodeId,
  Point,
  Rect,
  Viewport
} from '@whiteboard/core/types'
import type {
  DocumentQuery,
  DrawPreview,
  EdgeGuidePreview,
  Query,
  RuntimeStores,
  SpatialKind,
  SpatialQueryStats,
  SpatialRecord
} from '@whiteboard/editor-scene'
import type { EditorActions as EditorWrite } from '@whiteboard/editor/action/types'
import type { EditSession } from '@whiteboard/editor/session/edit'
import type { DrawState } from '@whiteboard/editor/session/draw/state'
import type { EdgeGuide } from '@whiteboard/editor/session/preview/types'
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
  SelectionEdgeStats,
  SelectionMembers,
  SelectionNodeStats,
  SelectionOverlay,
  SelectionToolbarContext,
  SelectionToolbarEdgeScope,
  SelectionToolbarNodeScope
} from '@whiteboard/editor/types/selectionPresentation'
import type { Tool } from '@whiteboard/editor/types/tool'
import type { IntentResult } from '@whiteboard/engine'
import type { EngineCommit } from '@whiteboard/engine/types/engineWrite'

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

export type ToolRead = {
  get: () => Tool
  subscribe: (listener: () => void) => store.Unsubscribe
  type: () => Tool['type']
  value: () => import('@whiteboard/editor/session/draw/model').DrawMode | undefined
  is: (type: Tool['type'], value?: string) => boolean
}

export type SessionViewportRead = {
  get: () => Viewport
  subscribe: (listener: () => void) => store.Unsubscribe
  pointer: (input: {
    clientX: number
    clientY: number
  }) => {
    screen: Point
    world: Point
  }
  worldToScreen: (point: Point) => Point
  worldRect: () => Rect
  screenPoint: (clientX: number, clientY: number) => Point
  size: () => {
    width: number
    height: number
  }
}

export type EditorState = {
  tool: ToolRead
  draw: store.ReadStore<DrawState>
  edit: store.ReadStore<EditSession>
  selection: store.ReadStore<SelectionTarget>
  interaction: store.ReadStore<EditorInteractionState>
  viewport: SessionViewportRead & {
    value: store.ReadStore<Viewport>
    zoom: store.ReadStore<number>
    center: store.ReadStore<Point>
  }
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
  NonNullable<ReturnType<Query['chrome']['marquee']>>

export type SelectedEdgeChrome =
  NonNullable<ReturnType<Query['edge']['chrome']>>

export type MindmapChrome = {
  addChildTargets: ReturnType<Query['mindmap']['addChildTargets']>
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
      id: string
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

export type EditorSceneApi = {
  revision: () => number
  query: Query
  stores: RuntimeStores
  host: {
    pick: ScenePickRuntime
    visible: (
      options?: Parameters<Query['spatial']['rect']>[1]
    ) => ReturnType<Query['spatial']['rect']>
  }
}

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

export type EditorEvents = {
  change: (listener: (document: Document, commit: EngineCommit) => void) => store.Unsubscribe
  dispose: (listener: () => void) => store.Unsubscribe
}

export type Editor = {
  document: DocumentQuery
  scene: EditorSceneApi
  state: EditorState
  derived: EditorDerived
  history: HistoryPort<IntentResult>
  input: EditorInputHost
  write: EditorWrite
  events: EditorEvents
  dispose: () => void
}

export type ClipboardDocumentSource = Pick<DocumentQuery, 'slice'>
export type EditorSliceResult = SliceExportResult | undefined
