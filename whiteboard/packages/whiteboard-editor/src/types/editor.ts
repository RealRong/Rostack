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
import type {
  MindmapCloneSubtreeInput,
  MindmapCreateOptions,
  MindmapInsertOptions,
  MindmapMoveSubtreeInput,
  MindmapRemoveSubtreeInput,
  MindmapUpdateNodeInput
} from '@whiteboard/engine'
import type { CommandResult } from '@engine-types/result'
import type {
  Document,
  Edge,
  EdgeEnd,
  EdgeId,
  EdgeInput,
  EdgePatch,
  MindmapId,
  MindmapNodeData,
  MindmapNodeId,
  MindmapTree,
  NodeId,
  NodeInput,
  NodeUpdateInput,
  Origin,
  Point,
  Rect,
  Size,
  Viewport
} from '@whiteboard/core/types'
import type { MindmapLayoutConfig } from './mindmap'
import type {
  NodeAlignMode,
  NodeDistributeMode
} from '@whiteboard/core/node'
import type {
  DrawPreferences,
  BrushStylePatch,
  DrawSlot
} from './draw'
import type {
  ContextMenuInput,
  ContextMenuIntent,
  KeyboardInput,
  PointerDownInput,
  PointerMoveInput,
  PointerSample,
  PointerUpInput,
  WheelInput
} from './input'
import type {
  Tool
} from './tool'
import type {
  DrawKind,
  EdgePresetKey,
  InsertPresetKey
} from './tool'
import type { RuntimeRead } from '../runtime/read'
import type { SelectionModelRead } from '../runtime/read/selection'
import type {
  ViewportCommands,
  ViewportInputRuntime,
  ViewportRead
} from '../runtime/viewport'
import type {
  EditCaret,
  EditField,
  EditLayout,
  EditSession
} from '../runtime/state/edit'
import type { TextPreviewPatch } from '../runtime/overlay/types'
import type { ClipboardPacket } from '../clipboard/packet'
import type { Commit } from '@engine-types/commit'

export type EditorClipboardTarget =
  | 'selection'
  | {
      nodeIds?: readonly NodeId[]
      edgeIds?: readonly EdgeId[]
    }

export type EditorClipboardOptions = {
  origin?: Point
}

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

export type EditorViewportActions = ViewportCommands & {
  setRect: (rect: ContainerRect) => void
  setLimits: (limits: ViewportLimits) => void
}

export type EditorMindmapCommands = {
  create: (payload?: MindmapCreateOptions) => CommandResult<{
    mindmapId: MindmapId
    rootId: MindmapNodeId
  }>
  delete: (ids: MindmapId[]) => CommandResult
  insert: (
    id: MindmapId,
    input: MindmapInsertOptions
  ) => CommandResult<{ nodeId: MindmapNodeId }>
  moveSubtree: (
    id: MindmapId,
    input: MindmapMoveSubtreeInput
  ) => CommandResult
  removeSubtree: (
    id: MindmapId,
    input: MindmapRemoveSubtreeInput
  ) => CommandResult
  cloneSubtree: (
    id: MindmapId,
    input: MindmapCloneSubtreeInput
  ) => CommandResult<{
    nodeId: MindmapNodeId
    map: Record<MindmapNodeId, MindmapNodeId>
  }>
  updateNode: (
    id: MindmapId,
    input: MindmapUpdateNodeInput
  ) => CommandResult
  insertByPlacement: (input: {
    id: NodeId
    tree: MindmapTree
    targetNodeId: MindmapNodeId
    placement: 'left' | 'right' | 'up' | 'down'
    nodeSize: Size
    layout: MindmapLayoutConfig
    payload?: MindmapNodeData
  }) => CommandResult<{ nodeId: MindmapNodeId }> | undefined
  moveByDrop: (input: {
    id: NodeId
    nodeId: MindmapNodeId
    drop: {
      parentId: MindmapNodeId
      index: number
      side?: 'left' | 'right'
    }
    origin?: {
      parentId?: MindmapNodeId
      index?: number
    }
    nodeSize: Size
    layout: MindmapLayoutConfig
  }) => CommandResult | undefined
  moveRoot: (input: {
    nodeId: NodeId
    position: Point
    origin?: Point
    threshold?: number
  }) => CommandResult | undefined
}

export type EditorOrderMode =
  | 'front'
  | 'back'
  | 'forward'
  | 'backward'

export type EditorEdgeLabelPatch = NonNullable<Edge['labels']>[number] extends infer Label
  ? Label extends {
      text?: string
      t?: number
      offset?: number
      style?: infer Style
    }
    ? {
        text?: string
        t?: number
        offset?: number
        style?: Partial<NonNullable<Style>>
      }
    : never
  : never

export type EditorClipboardApi = {
  copy: (target?: EditorClipboardTarget) => ClipboardPacket | undefined
  cut: (target?: EditorClipboardTarget) => ClipboardPacket | undefined
  paste: (
    packet: ClipboardPacket,
    options?: EditorClipboardOptions
  ) => boolean
}

export type EditorSelectionApi = {
  duplicate: (
    target: SelectionInput,
    options?: {
      selectInserted?: boolean
    }
  ) => boolean
  delete: (
    target: SelectionInput,
    options?: {
      clearSelection?: boolean
    }
  ) => boolean
  order: (
    target: SelectionInput,
    mode: EditorOrderMode
  ) => boolean
  group: (
    target: SelectionInput,
    options?: {
      selectResult?: boolean
    }
  ) => boolean
  ungroup: (
    target: SelectionInput,
    options?: {
      fallbackSelection?: 'members' | 'none'
    }
  ) => boolean
  frame: (
    bounds: Rect,
    options?: {
      padding?: number
    }
  ) => boolean
}

export type EditorNodesApi = {
  create: (payload: NodeInput) => CommandResult<{ nodeId: NodeId }>
  patch: (
    ids: readonly NodeId[],
    update: NodeUpdateInput,
    options?: {
      origin?: Origin
    }
  ) => CommandResult | undefined
  move: (input: {
    ids: readonly NodeId[]
    delta: Point
  }) => CommandResult
  align: (ids: readonly NodeId[], mode: NodeAlignMode) => CommandResult
  distribute: (ids: readonly NodeId[], mode: NodeDistributeMode) => CommandResult
  remove: (ids: NodeId[]) => CommandResult
  duplicate: (ids: NodeId[]) => CommandResult<{
    nodeIds: readonly NodeId[]
    edgeIds: readonly EdgeId[]
  }>
}

export type MindmapNodePatch = Parameters<EditorMindmapCommands['updateNode']>[1]

export type EditorEdgesApi = {
  create: (payload: EdgeInput) => CommandResult<{ edgeId: EdgeId }>
  patch: (
    edgeIds: readonly EdgeId[],
    patch: EdgePatch
  ) => CommandResult | undefined
  move: (edgeId: EdgeId, delta: Point) => CommandResult
  reconnect: (
    edgeId: EdgeId,
    end: 'source' | 'target',
    target: EdgeEnd
  ) => CommandResult
  remove: (ids: EdgeId[]) => CommandResult
  route: {
    insert: (edgeId: EdgeId, point: Point) => CommandResult<{ index: number }>
    move: (edgeId: EdgeId, index: number, point: Point) => CommandResult
    remove: (edgeId: EdgeId, index: number) => CommandResult
    clear: (edgeId: EdgeId) => CommandResult
  }
  labels: {
    add: (edgeId: EdgeId) => string | undefined
    patch: (
      edgeId: EdgeId,
      labelId: string,
      patch: EditorEdgeLabelPatch
    ) => CommandResult | undefined
    remove: (edgeId: EdgeId, labelId: string) => CommandResult | undefined
  }
}

export type EditorSessionToolActions = {
  set: (tool: Tool) => void
}

export type EditorSessionSelectionActions = {
  replace: (input: SelectionInput) => void
  add: (input: SelectionInput) => void
  remove: (input: SelectionInput) => void
  toggle: (input: SelectionInput) => void
  selectAll: () => void
  clear: () => void
}

export type EditorSessionEditActions = {
  startNode: (
    nodeId: NodeId,
    field: EditField,
    options?: {
      caret?: EditCaret
    }
  ) => void
  startEdgeLabel: (
    edgeId: EdgeId,
    labelId: string,
    options?: {
      caret?: EditCaret
    }
  ) => void
  input: (text: string) => void
  caret: (caret: EditCaret) => void
  measure: (patch: Partial<EditLayout>) => void
  clear: () => void
}

export type EditorSessionActions = {
  tool: EditorSessionToolActions
  selection: EditorSessionSelectionActions
  edit: EditorSessionEditActions
}

export type EditorHistoryApi = {
  get: () => HistoryState
  undo: () => CommandResult
  redo: () => CommandResult
  clear: () => void
}

export type EditorDrawActions = {
  set: (preferences: DrawPreferences) => void
  slot: (slot: DrawSlot) => void
  patch: (patch: BrushStylePatch) => void
}

export type EditorViewActions = {
  viewport: EditorViewportActions
  pointer: {
    set: (sample: PointerSample) => void
    clear: () => void
  }
  space: {
    set: (value: boolean) => void
  }
  draw: EditorDrawActions
  preview: {
    nodeText: {
      set: (nodeId: NodeId, patch?: TextPreviewPatch) => void
      clear: (nodeId: NodeId) => void
      clearSize: (nodeId: NodeId) => void
    }
  }
}

export type EditorDocumentApi = {
  replace: (document: Document) => CommandResult
  history: EditorHistoryApi
  selection: EditorSelectionApi
  nodes: EditorNodesApi
  edges: EditorEdgesApi
  mindmaps: EditorMindmapCommands
  clipboard: EditorClipboardApi
}

export type EditorSessionApi = EditorSessionActions

export type EditorViewApi = EditorViewActions

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
  load: EditorDocumentApi['replace']
  export: () => Document
  configure: (config: EditorConfig) => void
  dispose: () => void
}

export type EditorToolActions = {
  set: EditorSessionToolActions['set']
  select: () => void
  draw: (kind: DrawKind) => void
  edge: (preset: EdgePresetKey) => void
  insert: (preset: InsertPresetKey) => void
  hand: () => void
}

export type EditorSelectionActions = {
  set: EditorSessionSelectionActions['replace']
  add: EditorSessionSelectionActions['add']
  remove: EditorSessionSelectionActions['remove']
  toggle: EditorSessionSelectionActions['toggle']
  all: EditorSessionSelectionActions['selectAll']
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
  remove: EditorNodesApi['remove']
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
  remove: EditorEdgesApi['remove']
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
    set: ViewportCommands['set']
    pan: ViewportCommands['panBy']
    zoom: ViewportCommands['zoomTo']
    fit: ViewportCommands['fit']
    reset: ViewportCommands['reset']
    rect: (rect: ContainerRect) => void
    limits: (limits: ViewportLimits) => void
  }
  draw: EditorDrawActions
  selection: EditorSelectionActions
  edit: EditorEditActions
  interaction: EditorInteractionActions
  node: EditorNodeActions
  edge: EditorEdgeActions
  mindmap: {
    create: EditorMindmapCommands['create']
    remove: EditorMindmapCommands['delete']
    insert: EditorMindmapCommands['insert']
    move: EditorMindmapCommands['moveSubtree']
    removeNode: EditorMindmapCommands['removeSubtree']
    clone: EditorMindmapCommands['cloneSubtree']
    patchNode: EditorMindmapCommands['updateNode']
    insertByPlace: EditorMindmapCommands['insertByPlacement']
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
