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
  Capture,
  DocumentFrame,
  DrawPreview,
  EdgeGuidePreview,
  EditorScene,
  PreviewInput
} from '@whiteboard/editor-scene'
import type { EditorActions as EditorWrite } from '@whiteboard/editor/action/types'
import type { EditSession } from '@whiteboard/editor/session/edit'
import type { DrawState } from '@whiteboard/editor/session/draw/state'
import type {
  EdgeGuide
} from '@whiteboard/editor/session/preview/types'
import type { EditorCommand } from '@whiteboard/editor/state-engine/intents'
import type { EditorInteractionStateValue } from '@whiteboard/editor/state-engine/document'
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
  edit: store.ReadStore<EditSession | null>
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
  NonNullable<ReturnType<EditorScene['overlay']['marquee']>>

export type SelectedEdgeChrome =
  NonNullable<ReturnType<EditorScene['edges']['chrome']>>

export type MindmapChrome = {
  addChildTargets: ReturnType<EditorScene['mindmaps']['addChildTargets']>
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

export type EditorProjectionStores = EditorScene['stores'] & {
  runtime: {
    editor: {
      tool: store.ReadStore<Tool>
      draw: store.ReadStore<DrawState>
      selection: store.ReadStore<SelectionTarget>
      edit: store.ReadStore<EditSession | null>
      interaction: store.ReadStore<EditorInteractionStateValue>
      preview: store.ReadStore<PreviewInput>
      viewport: store.ReadStore<Viewport>
    }
  }
}

export type EditorProjectionRuntimeFrame = EditorScene['runtime'] & {
  editor: {
    tool(): Tool
    draw(): DrawState
    selection(): SelectionTarget
    edit(): EditSession | null
    interaction(): EditorInteractionStateValue
    preview(): PreviewInput
    viewport: {
      get(): Viewport
      pointer(input: {
        clientX: number
        clientY: number
      }): {
        screen: Point
        world: Point
      }
      worldToScreen(point: Point): Point
      worldRect(): Rect
      screenPoint(clientX: number, clientY: number): Point
      size(): {
        width: number
        height: number
      }
    }
  }
}

export type EditorProjection = Omit<EditorScene, 'stores' | 'runtime'> & {
  stores: EditorProjectionStores
  runtime: EditorProjectionRuntimeFrame
  derived: EditorDerived
}

export type EditorSceneStoresApi = EditorScene['stores']

export type EditorSceneEditorApi = {
  tool: ToolRead
  draw: store.ReadStore<DrawState>
  selection: store.ReadStore<SelectionTarget>
  edit: store.ReadStore<EditSession | null>
  interaction: store.ReadStore<EditorInteractionState>
  preview: store.ReadStore<PreviewInput>
  viewport: store.ReadStore<Viewport> & {
    pointer(input: {
      clientX: number
      clientY: number
    }): {
      screen: Point
      world: Point
    }
    worldToScreen(point: Point): Point
    worldRect(): Rect
    screenPoint(clientX: number, clientY: number): Point
    size(): {
      width: number
      height: number
    }
  }
}

export type EditorSceneSelectionApi = {
  members: store.ReadStore<SelectionMembers>
  summary: store.ReadStore<SelectionSummary>
  affordance: store.ReadStore<SelectionAffordance>
  view: store.ReadStore<EditorSelectionView>
  node: EditorSelectionNodeRead
  edge: EditorSelectionEdgeRead & {
    chrome: store.ReadStore<SelectedEdgeChrome | undefined>
  }
}

export type EditorSceneChromeApi = {
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

export type EditorSceneMindmapApi = {
  chrome: {
    addChildTargets: store.KeyedReadStore<MindmapId, MindmapChrome | undefined>
  }
}

export type EditorSceneApi = {
  document: DocumentFrame
  stores: EditorSceneStoresApi
  editor: EditorSceneEditorApi
  viewport: EditorScene['viewport']
  nodes: EditorScene['nodes']
  edges: EditorScene['edges']
  mindmaps: EditorScene['mindmaps']
  groups: EditorScene['groups']
  hit: EditorScene['hit']
  pick: EditorScene['pick']
  snap: EditorScene['snap']
  spatial: EditorScene['spatial']
  selection: EditorSceneSelectionApi
  chrome: EditorSceneChromeApi
  mindmap: EditorSceneMindmapApi
  capture(): Capture
  bounds: EditorScene['bounds']
}

export type Editor = {
  scene: EditorSceneApi
  history: HistoryPort<IntentResult>
  input: EditorInputHost
  write: EditorWrite
  dispatch: (command: EditorCommand | readonly EditorCommand[]) => void
  dispose: () => void
}

export type ClipboardDocumentSource = Pick<DocumentFrame, 'slice'>
export type EditorSliceResult = SliceExportResult | undefined
