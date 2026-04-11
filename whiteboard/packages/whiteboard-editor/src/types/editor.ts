import type {
  ContainerRect,
  ViewportLimits
} from '@whiteboard/core/geometry'
import type {
  HistoryConfig as KernelHistoryConfig,
  HistoryState
} from '@whiteboard/core/kernel'
import type { SelectionInput, SelectionTarget } from '@whiteboard/core/selection'
import type { ReadStore, Unsubscribe } from '@shared/core'
import type { CommandResult } from '@engine-types/result'
import type {
  Document,
  EdgeId,
  NodeId,
  Size,
  Viewport
} from '@whiteboard/core/types'
import type { MindmapLayoutConfig } from './mindmap'
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
  ClipboardCommands,
  ClipboardOptions,
  ClipboardTarget,
  DrawCommands,
  EdgeApi,
  EdgeLabelPatch,
  HistoryCommands,
  MindmapCommands,
  NodeApi,
  OrderMode,
  SelectionApi,
  SessionActions,
  SessionEditActions,
  SessionSelectionActions,
  SessionToolActions,
  ToolActions,
  ViewActions,
  ViewportActions
} from './commands'
import type { RuntimeRead } from '../runtime/read'
import type { SelectionModelRead } from '../runtime/read/selection'
import type {
  ViewportInputRuntime,
  ViewportRead
} from '../runtime/viewport'
import type {
  EditCaret,
  EditField,
  EditLayout,
  EditSession
} from '../runtime/state/edit'
import type { ClipboardPacket } from '../clipboard/packet'
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

export type EditorViewportActions = ViewportActions
export type EditorMindmapCommands = MindmapCommands
export type EditorOrderMode = OrderMode
export type EditorEdgeLabelPatch = EdgeLabelPatch
export type EditorClipboardApi = ClipboardCommands
export type EditorSelectionApi = SelectionApi
export type EditorNodesApi = NodeApi
export type MindmapNodePatch = Parameters<EditorMindmapCommands['updateNode']>[1]
export type EditorEdgesApi = EdgeApi
export type EditorSessionToolActions = SessionToolActions
export type EditorSessionSelectionActions = SessionSelectionActions
export type EditorSessionEditActions = SessionEditActions
export type EditorSessionActions = SessionActions
export type EditorHistoryApi = HistoryCommands
export type EditorDrawActions = DrawCommands
export type EditorViewActions = ViewActions

export type EditorConfig = {
  mindmapLayout: MindmapLayoutConfig
  history?: KernelHistoryConfig
}

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

export type EditorAppActions = {
  reset: () => void
  replace: (document: Document) => CommandResult
  export: () => Document
  configure: (config: EditorConfig) => void
  dispose: () => void
}

export type EditorToolActions = ToolActions

export type EditorSelectionActions = {
  replace: EditorSessionSelectionActions['replace']
  add: EditorSessionSelectionActions['add']
  remove: EditorSessionSelectionActions['remove']
  toggle: EditorSessionSelectionActions['toggle']
  selectAll: EditorSessionSelectionActions['selectAll']
  clear: EditorSessionSelectionActions['clear']
  frame: EditorSelectionApi['frame']
  order: (
    mode: EditorOrderMode,
    target?: SelectionInput
  ) => boolean
  group: (
    options?: Parameters<EditorSelectionApi['group']>[1]
  ) => boolean
  ungroup: (
    options?: Parameters<EditorSelectionApi['ungroup']>[1]
  ) => boolean
  delete: (
    options?: Parameters<EditorSelectionApi['delete']>[1]
  ) => boolean
  duplicate: (
    options?: Parameters<EditorSelectionApi['duplicate']>[1]
  ) => boolean
}

export type EditorEditActions = EditorSessionEditActions & {
  cancel: () => void
  commit: () => void
}

export type EditorInteractionActions = EditorInput

export type EditorNodeActions = {
  create: EditorNodesApi['create']
  patch: EditorNodesApi['patch']
  move: EditorNodesApi['move']
  align: EditorNodesApi['align']
  distribute: EditorNodesApi['distribute']
  delete: (ids: NodeId[]) => CommandResult
  deleteCascade: (ids: NodeId[]) => CommandResult
  duplicate: EditorNodesApi['duplicate']
  lock: (ids: readonly NodeId[], value: boolean) => CommandResult
  text: {
    commit: (input: {
      nodeId: NodeId
      field: EditField
      value: string
      size?: Size
    }) => CommandResult | undefined
    color: (ids: readonly NodeId[], color: string) => CommandResult
    size: (input: {
      nodeIds: readonly NodeId[]
      value?: number
      sizeById?: Readonly<Record<NodeId, Size>>
    }) => CommandResult
    weight: (ids: readonly NodeId[], value?: number) => CommandResult
    italic: (ids: readonly NodeId[], value: boolean) => CommandResult
    align: (
      ids: readonly NodeId[],
      value?: 'left' | 'center' | 'right'
    ) => CommandResult
  }
  style: {
    fill: (ids: readonly NodeId[], value: string) => CommandResult
    stroke: (ids: readonly NodeId[], value: string) => CommandResult
  }
  shape: {
    set: (ids: readonly NodeId[], kind: string) => CommandResult
  }
}

export type EditorEdgeActions = {
  create: EditorEdgesApi['create']
  patch: EditorEdgesApi['patch']
  move: EditorEdgesApi['move']
  reconnect: EditorEdgesApi['reconnect']
  delete: EditorEdgesApi['remove']
  route: EditorEdgesApi['route']
  label: {
    add: EditorEdgesApi['labels']['add']
    patch: EditorEdgesApi['labels']['patch']
    remove: EditorEdgesApi['labels']['remove']
    setText: (
      edgeId: EdgeId,
      labelId: string,
      text: string
    ) => CommandResult | undefined
  }
}

export type EditorActions = {
  app: EditorAppActions
  tool: EditorToolActions
  viewport: {
    set: EditorViewportActions['set']
    panBy: EditorViewportActions['panBy']
    zoomTo: EditorViewportActions['zoomTo']
    fit: EditorViewportActions['fit']
    reset: EditorViewportActions['reset']
    setRect: EditorViewportActions['setRect']
    setLimits: EditorViewportActions['setLimits']
  }
  draw: EditorDrawActions
  selection: EditorSelectionActions
  edit: EditorEditActions
  interaction: EditorInteractionActions
  node: EditorNodeActions
  edge: EditorEdgeActions
  mindmap: {
    create: EditorMindmapCommands['create']
    delete: EditorMindmapCommands['delete']
    insert: EditorMindmapCommands['insert']
    moveSubtree: EditorMindmapCommands['moveSubtree']
    removeSubtree: EditorMindmapCommands['removeSubtree']
    clone: EditorMindmapCommands['cloneSubtree']
    updateNode: EditorMindmapCommands['updateNode']
    insertByPlacement: EditorMindmapCommands['insertByPlacement']
    moveByDrop: EditorMindmapCommands['moveByDrop']
    moveRoot: EditorMindmapCommands['moveRoot']
  }
  clipboard: EditorClipboardApi
  history: EditorHistoryApi
}

export type EditorDocSelect = (() => RuntimeRead['document']) & {
  bounds: RuntimeRead['document']['bounds']
  background: () => RuntimeRead['document']['background']
}

export type EditorToolSelect = (() => EditorStore['tool']) & {
  is: RuntimeRead['tool']['is']
}

export type EditorViewportSelect = (() => EditorStore['viewport']) & {
  pointer: RuntimeRead['viewport']['pointer']
  worldToScreen: RuntimeRead['viewport']['worldToScreen']
  screenPoint: RuntimeRead['viewport']['screenPoint']
  size: RuntimeRead['viewport']['size']
}

export type EditorSelectionSelect = (() => EditorStore['selection']) & {
  box: () => RuntimeRead['selection']['box']
  summary: () => SelectionModelRead
  overlay: () => RuntimeRead['selection']['overlay']
  nodeToolbar: () => RuntimeRead['selection']['nodeToolbar']
  node: () => RuntimeRead['selection']['node']
}

export type EditorNodeSelect = {
  item: () => RuntimeRead['node']['item']
  view: () => RuntimeRead['node']['view']
  capability: () => RuntimeRead['node']['capability']
  bounds: RuntimeRead['node']['bounds']['get']
}

export type EditorEdgeSelect = {
  item: () => RuntimeRead['edge']['item']
  resolved: () => RuntimeRead['edge']['resolved']
  view: () => RuntimeRead['edge']['view']
  toolbar: () => RuntimeRead['edge']['toolbar']
  bounds: RuntimeRead['edge']['bounds']['get']
  box: RuntimeRead['edge']['box']
}

export type EditorMindmapSelect = {
  item: () => RuntimeRead['mindmap']['item']
  view: () => RuntimeRead['mindmap']['view']
}

export type EditorSelect = {
  scene: () => RuntimeRead['scene']['list']
  chrome: () => ReadStore<EditorChromePresentation>
  panel: () => ReadStore<EditorPanelPresentation>
  doc: EditorDocSelect
  history: () => RuntimeRead['history']
  draw: () => EditorStore['draw']
  tool: EditorToolSelect
  viewport: EditorViewportSelect
  edit: () => EditorStore['edit']
  interaction: () => EditorStore['interaction']
  selection: EditorSelectionSelect
  group: Pick<RuntimeRead['group'], 'exactIds' | 'nodeIds' | 'edgeIds'>
  node: EditorNodeSelect
  edge: EditorEdgeSelect
  mindmap: EditorMindmapSelect
}

export type EditorEvents = {
  change: (listener: (document: Document, commit: Commit) => void) => Unsubscribe
  history: (listener: (state: HistoryState) => void) => Unsubscribe
  selection: (listener: (selection: SelectionTarget) => void) => Unsubscribe
  dispose: (listener: () => void) => Unsubscribe
}

export type Editor = {
  store: EditorStore
  actions: EditorActions
  select: EditorSelect
  events: EditorEvents
}
