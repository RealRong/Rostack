import type { HistoryState } from '@whiteboard/core/kernel'
import type { SelectionInput, SelectionTarget } from '@whiteboard/core/selection'
import type { ReadStore, Unsubscribe } from '@shared/core'
import type {
  Document,
  Viewport
} from '@whiteboard/core/types'
import type { DrawPreferences } from './draw'
import type {
  ContextMenuInput,
  ContextMenuIntent,
  KeyboardInput,
  PointerDownInput,
  PointerMoveInput,
  PointerUpInput,
  WheelInput
} from './input'
import type {
  Tool
} from './tool'
import type {
  AppActions,
  AppConfig,
  ClipboardCommands,
  ClipboardOptions,
  ClipboardTarget,
  DrawCommands,
  HistoryCommands,
  MindmapCommands,
  OrderMode,
  SelectionApi,
  SessionEditActions,
  SessionSelectionActions,
  ToolActions,
  ViewportActions
} from './commands'
import type { NodeCommands as RuntimeNodeCommands } from '../runtime/node/types'
import type { EdgeCommands as RuntimeEdgeCommands } from '../runtime/commands/edge'
import type { RuntimeRead } from '../runtime/read'
import type { SelectionModelRead } from '../runtime/read/selection'
import type {
  ViewportInputRuntime,
  ViewportRead
} from '../runtime/viewport'
import type {
  EditCaret,
  EditField,
  EditSession
} from '../runtime/state/edit'
import type { Commit } from '@engine-types/commit'

export type EditorClipboardTarget = ClipboardTarget
export type EditorClipboardOptions = ClipboardOptions

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
  draw: ReadStore<DrawPreferences>
  edit: ReadStore<EditSession>
  selection: ReadStore<SelectionTarget>
  interaction: ReadStore<EditorInteractionState>
  viewport: ReadStore<Viewport>
}

export type EditorRead = RuntimeRead

export type MindmapNodePatch = Parameters<MindmapCommands['updateNode']>[1]

export type EditorConfig = AppConfig

export type EditorStore = EditorState

export type EditorChromePresentation = {
  marquee: ReturnType<RuntimeRead['overlay']['feedback']['marquee']['get']>
  draw: ReturnType<RuntimeRead['overlay']['feedback']['draw']['get']>
  edgeGuide: ReturnType<RuntimeRead['overlay']['feedback']['edgeGuide']['get']>
  snap: ReturnType<RuntimeRead['overlay']['feedback']['snap']['get']>
  selection: ReturnType<RuntimeRead['selection']['overlay']['get']>
}

export type EditorPanelPresentation = {
  nodeToolbar: ReturnType<RuntimeRead['selection']['nodeToolbar']['get']>
  edgeToolbar: ReturnType<RuntimeRead['edge']['toolbar']['get']>
  history: HistoryState
  draw: DrawPreferences
}

export type EditorPublicRead = EditorRead & {
  chrome: ReadStore<EditorChromePresentation>
  panel: ReadStore<EditorPanelPresentation>
  selectionModel: SelectionModelRead
}

export type EditorAppActions = AppActions

export type EditorToolActions = ToolActions

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

export type EditorInteractionActions = EditorInput

export type EditorNodeActions = Omit<
  RuntimeNodeCommands,
  'update' | 'updateMany'
>

export type EditorEdgeActions = Pick<
  RuntimeEdgeCommands,
  'create' | 'patch' | 'move' | 'reconnect' | 'delete' | 'route' | 'label'
>

export type EditorActions = {
  app: EditorAppActions
  tool: EditorToolActions
  viewport: Pick<
    ViewportActions,
    'set' | 'panBy' | 'zoomTo' | 'fit' | 'reset' | 'setRect' | 'setLimits'
  >
  draw: DrawCommands
  selection: EditorSelectionActions
  edit: EditorEditActions
  interaction: EditorInteractionActions
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
  store: EditorStore
  read: EditorPublicRead
  actions: EditorActions
  events: EditorEvents
}
