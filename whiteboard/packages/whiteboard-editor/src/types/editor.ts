import type { HistoryState } from '@whiteboard/core/kernel'
import type { SelectionInput, SelectionTarget } from '@whiteboard/core/selection'
import type { ReadStore } from '@shared/core'
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
  ClipboardCommands,
  DrawCommands,
  HistoryCommands,
  MindmapCommands,
  SelectionApi,
  ToolActions,
  ViewportActions
} from '@whiteboard/editor/types/commands'
import type { NodeCommands as RuntimeNodeCommands } from '@whiteboard/editor/command/node/types'
import type { EdgeCommands as RuntimeEdgeCommands } from '@whiteboard/editor/command/edge'
import type {
  ViewportRead
} from '@whiteboard/editor/local/viewport/runtime'
import type {
  EditCaret,
  EditField,
  EditLayout,
  EditSession
} from '@whiteboard/editor/local/session/edit'
import type { EditorQuery } from '@whiteboard/editor/query'
import type { Unsubscribe } from '@shared/core'
import type { Commit } from '@whiteboard/engine/types/commit'

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
  tool: ReadStore<Tool>
  draw: ReadStore<DrawState>
  edit: ReadStore<EditSession>
  selection: ReadStore<SelectionTarget>
  interaction: ReadStore<EditorInteractionState>
  viewport: ReadStore<Viewport>
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
  document: Pick<EditorQuery['document'], 'background' | 'bounds'>
  group: Pick<EditorQuery['group'], 'exactIds'>
  history: EditorQuery['history']
  mindmap: Pick<EditorQuery['mindmap'], 'render'>
  node: Pick<EditorQuery['node'], 'render'>
  edge: Pick<EditorQuery['edge'], 'render' | 'selectedChrome'>
  scene: Pick<EditorQuery['scene'], 'list'>
  selection: Pick<EditorQuery['selection'], 'node' | 'box'>
  tool: EditorQuery['tool']
  viewport: EditorQuery['viewport']
  chrome: ReadStore<EditorChromePresentation>
  panel: ReadStore<EditorPanelPresentation>
}

export type EditorSelectionActions = {
  replace: (input: SelectionInput) => void
  add: (input: SelectionInput) => void
  remove: (input: SelectionInput) => void
  toggle: (input: SelectionInput) => void
  selectAll: () => void
  clear: () => void
  frame: SelectionApi['frame']
  order: SelectionApi['order']
  group: SelectionApi['group']
  ungroup: SelectionApi['ungroup']
  delete: SelectionApi['delete']
  duplicate: SelectionApi['duplicate']
}

export type EditorEditActions = {
  startNode: (
    nodeId: string,
    field: EditField,
    options?: {
      caret?: EditCaret
    }
  ) => void
  startEdgeLabel: (
    edgeId: string,
    labelId: string,
    options?: {
      caret?: EditCaret
    }
  ) => void
  input: (text: string) => void
  layout: (patch: Partial<EditLayout>) => void
  caret: (caret: EditCaret) => void
  cancel: () => void
  commit: () => void
}

export type EditorNodeActions = Omit<
  RuntimeNodeCommands,
  'update' | 'updateMany'
>

export type EditorEdgeActions = Pick<
  RuntimeEdgeCommands,
  'create' | 'patch' | 'move' | 'reconnect' | 'delete' | 'route' | 'label' | 'style' | 'type' | 'lock' | 'textMode'
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
  node: EditorNodeActions
  edge: EditorEdgeActions
  mindmap: MindmapCommands
  clipboard: ClipboardCommands
  history: HistoryCommands
}

export type EditorEvents = {
  change: (listener: (document: Document, commit: Commit) => void) => Unsubscribe
  dispose: (listener: () => void) => Unsubscribe
}

export type Editor = {
  store: EditorStore
  read: EditorRead
  actions: EditorActions
  input: EditorInputHost
  events: EditorEvents
}
