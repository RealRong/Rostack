import type { HistoryApi, HistoryState } from '@whiteboard/history'
import type { SelectionTarget } from '@whiteboard/core/selection'
import { store } from '@shared/core'
import type {
  Document,
  Viewport
} from '@whiteboard/core/types'
import type { EditorActions } from '@whiteboard/editor/action/types'
import type { DrawState } from '@whiteboard/editor/session/draw/state'
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
import type { EditSession } from '@whiteboard/editor/session/edit'
import type { EditorQuery } from '@whiteboard/editor/query'
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

export type EditorChromePresentation = {
  marquee: ReturnType<EditorQuery['chrome']['marquee']['get']>
  draw: ReturnType<EditorQuery['chrome']['draw']['get']>
  edgeGuide: ReturnType<EditorQuery['chrome']['edgeGuide']['get']>
  snap: ReturnType<EditorQuery['chrome']['snap']['get']>
  selection: ReturnType<EditorQuery['selection']['overlay']['get']>
}

export type EditorPanelPresentation = {
  selectionToolbar: ReturnType<EditorQuery['selection']['toolbar']['get']>
  history: HistoryState
  draw: DrawState
}

export type EditorRead = {
  document: Pick<EditorQuery['document'], 'background' | 'bounds'> & {
    get: () => Document
  }
  group: Pick<EditorQuery['group'], 'exactIds'>
  history: HistoryApi
  mindmap: Pick<EditorQuery['mindmap'], 'scene' | 'chrome' | 'navigate'>
  node: Pick<EditorQuery['node'], 'render'>
  edge: Pick<EditorQuery['edge'], 'render' | 'selectedChrome'>
  scene: Pick<EditorQuery['scene'], 'list'>
  selection: Pick<EditorQuery['selection'], 'node' | 'summary'>
  tool: EditorQuery['tool']
  viewport: EditorQuery['viewport']
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
