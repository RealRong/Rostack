import { store } from '@shared/core'
import type { SliceExportResult } from '@whiteboard/core/document'
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
  Capture,
  DocumentFrame,
  DrawPreview,
  EditorScene,
  PreviewInput
} from '@whiteboard/editor-scene'
import type { EditorActions as EditorWrite } from '@whiteboard/editor/action/types'
import type { SnapRuntime } from '@whiteboard/editor/input/core/snap'
import type { EdgeGuide } from '@whiteboard/editor/preview/types'
import type { DrawState } from '@whiteboard/editor/session/draw/state'
import type { EditSession } from '@whiteboard/editor/session/edit'
import type { EditorStateDocument } from '@whiteboard/editor/state-engine/document'
import type { EditorDispatchInput } from '@whiteboard/editor/state-engine/intents'
import type { EditorStateRuntime } from '@whiteboard/editor/state-engine/runtime'
import type { PointerMode } from '@whiteboard/editor/input/core/types'
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
  EditorSelectionView,
  SelectionEdgeStats,
  SelectionMembers,
  SelectionNodeStats,
  SelectionOverlay,
  SelectionToolbarContext,
  SelectionToolbarEdgeScope,
  SelectionToolbarNodeScope
} from '@whiteboard/editor/types/selectionPresentation'
import type { NodeTypeSupport } from '@whiteboard/editor/types/node'
import type { Tool } from '@whiteboard/editor/types/tool'
import type { EditorWrite as EditorMutationWrite } from '@whiteboard/editor/write'
import type { BoardConfig } from '@whiteboard/engine/config'

export type { EditorScene } from '@whiteboard/editor-scene'

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

export type EditorViewportStateRead = {
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
  value: store.ReadStore<Viewport>
  zoom: store.ReadStore<number>
  center: store.ReadStore<Point>
}

export type EditorViewportRuntime = {
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
  setRect: EditorStateRuntime['viewport']['setRect']
  setLimits: EditorStateRuntime['viewport']['setLimits']
}

export type EditorState = {
  tool: ToolRead
  draw: store.ReadStore<DrawState>
  edit: store.ReadStore<EditSession | null>
  selection: store.ReadStore<SelectionTarget>
  interaction: store.ReadStore<EditorInteractionState>
  preview: store.ReadStore<PreviewInput>
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
  selection: EditorSceneUiSelection
  chrome: EditorSceneUiChrome
  mindmap: EditorSceneUiMindmap
}

export type EditorSceneFacade = EditorScene & {
  ui: EditorSceneUi
  capture(): Capture
}

export type EditorRuntime = {
  viewport: EditorViewportRuntime
  config: BoardConfig
  nodeType: NodeTypeSupport
  snap: SnapRuntime
}

export type Editor = {
  scene: EditorSceneFacade
  document: DocumentFrame
  input: EditorInputHost
  actions: EditorWrite
  write: EditorMutationWrite
  read: () => EditorStateDocument
  runtime: EditorRuntime
  dispatch: (command: EditorDispatchInput | readonly EditorDispatchInput[]) => void
  dispose: () => void
}

export type ClipboardDocumentSource = Pick<DocumentFrame, 'slice'>
export type EditorSliceResult = SliceExportResult | undefined
