import type { HistoryState } from '@whiteboard/core/kernel'
import type { SelectionInput, SelectionTarget } from '@whiteboard/core/selection'
import type { ReadStore, Unsubscribe } from '@shared/core'
import type {
  Document,
  Viewport
} from '@whiteboard/core/types'
import type { DrawState } from '@whiteboard/editor/local/draw/state'
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
  AppActions,
  AppConfig,
  ClipboardCommands,
  DrawCommands,
  HistoryCommands,
  MindmapCommands,
  SelectionApi,
  SessionEditActions,
  SessionSelectionActions,
  ToolActions,
  ViewportActions
} from '@whiteboard/editor/types/commands'
import type { NodeCommands as RuntimeNodeCommands } from '@whiteboard/editor/command/node/types'
import type { EdgeCommands as RuntimeEdgeCommands } from '@whiteboard/editor/command/edge'
import type { SelectionModelRead } from '@whiteboard/editor/query/selection/model'
import type {
  ViewportInputRuntime,
  ViewportRead
} from '@whiteboard/editor/local/viewport/runtime'
import type {
  EditCaret,
  EditField,
  EditSession
} from '@whiteboard/editor/local/session/edit'
import type { Commit } from '@whiteboard/engine/types/commit'
import type { EditorQueryRead } from '@whiteboard/editor/query'

export type EditorPointerDispatchResult = {
  handled: boolean
  continuePointer: boolean
}

export type EditorInput = {
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

export type EditorState = {
  tool: ReadStore<Tool>
  draw: ReadStore<DrawState>
  edit: ReadStore<EditSession>
  selection: ReadStore<SelectionTarget>
  interaction: ReadStore<EditorInteractionState>
  viewport: ReadStore<Viewport>
}

export type EditorChromePresentation = {
  marquee: ReturnType<EditorQueryRead['feedback']['marquee']['get']>
  draw: ReturnType<EditorQueryRead['feedback']['draw']['get']>
  edgeGuide: ReturnType<EditorQueryRead['feedback']['edgeGuide']['get']>
  snap: ReturnType<EditorQueryRead['feedback']['snap']['get']>
  selection: ReturnType<EditorQueryRead['selection']['overlay']['get']>
}

export type EditorPanelPresentation = {
  nodeToolbar: ReturnType<EditorQueryRead['selection']['nodeToolbar']['get']>
  edgeToolbar: ReturnType<EditorQueryRead['edge']['toolbar']['get']>
  history: HistoryState
  draw: DrawState
}

export type EditorPublicRead = EditorQueryRead & {
  chrome: ReadStore<EditorChromePresentation>
  panel: ReadStore<EditorPanelPresentation>
  selectionModel: SelectionModelRead
}

export type EditorSelectionActions = {
  replace: SessionSelectionActions['replace']
  add: SessionSelectionActions['add']
  remove: SessionSelectionActions['remove']
  toggle: SessionSelectionActions['toggle']
  selectAll: SessionSelectionActions['selectAll']
  clear: SessionSelectionActions['clear']
  frame: SelectionApi['frame']
  order: SelectionApi['order']
  group: SelectionApi['group']
  ungroup: SelectionApi['ungroup']
  delete: SelectionApi['delete']
  duplicate: SelectionApi['duplicate']
}

export type EditorEditActions = SessionEditActions & {
  cancel: () => void
  commit: () => void
}

export type EditorNodeActions = Omit<
  RuntimeNodeCommands,
  'update' | 'updateMany'
>

export type EditorEdgeActions = Pick<
  RuntimeEdgeCommands,
  'create' | 'patch' | 'move' | 'reconnect' | 'delete' | 'route' | 'label' | 'style' | 'type' | 'textMode'
>

export type EditorActions = {
  app: AppActions
  tool: ToolActions
  viewport: Pick<
    ViewportActions,
    'set' | 'panBy' | 'zoomTo' | 'fit' | 'reset' | 'setRect' | 'setLimits'
  >
  draw: DrawCommands
  selection: EditorSelectionActions
  edit: EditorEditActions
  interaction: EditorInput
  node: EditorNodeActions
  edge: EditorEdgeActions
  mindmap: MindmapCommands
  clipboard: ClipboardCommands
  history: HistoryCommands
}

export type EditorEvents = {
  change: (listener: (document: Document, commit: Commit) => void) => Unsubscribe
  history: (listener: (state: HistoryState) => void) => Unsubscribe
  selection: (listener: (selection: SelectionTarget) => void) => Unsubscribe
  dispose: (listener: () => void) => Unsubscribe
}

export type Editor = {
  store: EditorState
  read: EditorPublicRead
  actions: EditorActions
  events: EditorEvents
}
