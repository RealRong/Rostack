import type {
  ContainerRect,
  ViewportLimits
} from '@whiteboard/core/geometry'
import type {
  ClipboardPacket,
} from '@whiteboard/core/document'
import type { HistoryConfig as KernelHistoryConfig } from '@whiteboard/core/kernel'
import type { ResizeDirection, TextWidthMode } from '@whiteboard/core/node'
import type { SelectionInput, SelectionTarget } from '@whiteboard/core/selection'
import type { ReadStore } from '@shared/store'
import type { CommandResult, EngineInstance } from '@whiteboard/engine'
import type {
  Edge,
  EdgeDash,
  EdgeId,
  EdgeMarker,
  EdgeTextMode,
  EdgeType,
  MindmapNodeData,
  MindmapNodeId,
  MindmapTree,
  NodeId,
  Point,
  Rect,
  Size,
  Viewport
} from '@whiteboard/core/types'
import type { MindmapLayoutConfig } from './mindmap'
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
import type { RuntimeRead } from '../runtime/read'
import type {
  ViewportCommands,
  ViewportInputRuntime,
  ViewportRead
} from '../runtime/viewport'
import type { EditCaret, EditField, EditTarget } from '../runtime/state/edit'
import type { EditorOverlay } from '../runtime/overlay'
import type {
  EdgeOverlayEntry,
  EdgeGuide,
  MindmapDragFeedback
} from '../runtime/overlay'
import type { TextPreviewPatch } from '../runtime/overlay/types'

type EngineCommands = EngineInstance['commands']
type EngineNodeCommands = EngineCommands['node']
type EngineMindmapCommands = EngineCommands['mindmap']

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
  edit: ReadStore<EditTarget>
  selection: ReadStore<SelectionTarget>
  interaction: ReadStore<EditorInteractionState>
  viewport: ReadStore<Viewport>
}

export type EditorOverlayRead = {
  node: EditorOverlay['selectors']['node']
  feedback: EditorOverlay['selectors']['feedback']
}

export type EditorViewportRead = ViewportRead & Pick<
  ViewportInputRuntime,
  'screenPoint' | 'size'
>

export type EditorRead = RuntimeRead

export type EditorViewportActions = ViewportCommands & {
  setRect: (rect: ContainerRect) => void
  setLimits: (limits: ViewportLimits) => void
}

export type EditorNodeDocumentCommands = {
  update: EngineNodeCommands['update']
  updateMany: EngineNodeCommands['updateMany']
}

export type EditorNodeLockCommands = {
  set: (nodeIds: readonly NodeId[], locked: boolean) => CommandResult
  toggle: (nodeIds: readonly NodeId[]) => CommandResult
}

export type EditorNodeTextCommands = {
  preview: (input: {
    nodeId: NodeId
    position?: Point
    size?: Size
    fontSize?: number
    mode?: TextWidthMode
    handle?: ResizeDirection
  }) => void
  clearPreview: (nodeId: NodeId) => void
  cancel: (input: {
    nodeId: NodeId
  }) => void
  commit: (input: {
    nodeId: NodeId
    field: 'text' | 'title'
    value: string
    size?: Size
  }) => CommandResult | undefined
  setColor: (nodeIds: readonly NodeId[], color: string) => CommandResult
  setSize: (input: {
    nodeIds: readonly NodeId[]
    value?: number
    sizeById?: Readonly<Record<NodeId, Size>>
  }) => CommandResult
  setWeight: (
    nodeIds: readonly NodeId[],
    weight?: number
  ) => CommandResult
  setItalic: (
    nodeIds: readonly NodeId[],
    italic: boolean
  ) => CommandResult
  setAlign: (
    nodeIds: readonly NodeId[],
    align?: 'left' | 'center' | 'right'
  ) => CommandResult
}

export type EditorNodeShapeCommands = {
  setKind: (nodeIds: readonly NodeId[], kind: string) => CommandResult
}

export type EditorNodeAppearanceCommands = {
  setFill: (nodeIds: readonly NodeId[], fill: string) => CommandResult
  setFillOpacity: (nodeIds: readonly NodeId[], opacity?: number) => CommandResult
  setStroke: (nodeIds: readonly NodeId[], stroke: string) => CommandResult
  setStrokeWidth: (nodeIds: readonly NodeId[], width: number) => CommandResult
  setStrokeOpacity: (nodeIds: readonly NodeId[], opacity?: number) => CommandResult
  setStrokeDash: (nodeIds: readonly NodeId[], dash?: readonly number[]) => CommandResult
  setOpacity: (nodeIds: readonly NodeId[], opacity: number) => CommandResult
  setTextColor: (nodeIds: readonly NodeId[], color: string) => CommandResult
}

export type EditorNodeCommands = Omit<EngineNodeCommands, 'update' | 'updateMany'> & {
  document: EditorNodeDocumentCommands
  lock: EditorNodeLockCommands
  text: EditorNodeTextCommands
  shape: EditorNodeShapeCommands
  appearance: EditorNodeAppearanceCommands
}

export type EditorMindmapCommands = EngineMindmapCommands & {
  insertByPlacement: (input: {
    id: NodeId
    tree: MindmapTree
    targetNodeId: MindmapNodeId
    placement: 'left' | 'right' | 'up' | 'down'
    nodeSize: Size
    layout: MindmapLayoutConfig
    payload?: MindmapNodeData
  }) => ReturnType<EngineMindmapCommands['insert']> | undefined
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
  }) => ReturnType<EngineMindmapCommands['moveSubtree']> | undefined
  moveRoot: (input: {
    nodeId: NodeId
    position: Point
    origin?: Point
    threshold?: number
  }) => CommandResult | undefined
}

export type EditorClipboardCommands = {
  export: (target?: EditorClipboardTarget) => ClipboardPacket | undefined
  cut: (target?: EditorClipboardTarget) => ClipboardPacket | undefined
  insert: (
    packet: ClipboardPacket,
    options?: EditorClipboardOptions
  ) => boolean
}

export type EditorCanvasOrderMode =
  | 'front'
  | 'back'
  | 'forward'
  | 'backward'

export type EditorCanvasActions = {
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
    mode: EditorCanvasOrderMode
  ) => boolean
}

export type EditorGroupsActions = {
  merge: (
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
  order: (
    groupIds: readonly string[],
    mode: EditorCanvasOrderMode
  ) => boolean
}

export type EditorNodesFramesActions = {
  createFromBounds: (
    bounds: Rect,
    options?: {
      padding?: number
    }
  ) => boolean
}

export type EditorNodesTextPatch = {
  color?: string
  size?: number
  weight?: number
  italic?: boolean
  align?: 'left' | 'center' | 'right'
}

export type EditorNodesTextActions = {
  set: (input: {
    nodeIds: readonly NodeId[]
    patch: EditorNodesTextPatch
    sizeById?: Readonly<Record<NodeId, Size>>
  }) => CommandResult | undefined
  commit: EditorNodeTextCommands['commit']
}

export type EditorNodesStylePatch = {
  fill?: string
  fillOpacity?: number
  stroke?: string
  strokeWidth?: number
  strokeOpacity?: number
  strokeDash?: readonly number[]
  opacity?: number
}

export type EditorNodesStyleActions = {
  set: (
    nodeIds: readonly NodeId[],
    patch: EditorNodesStylePatch
  ) => CommandResult | undefined
}

export type EditorNodesShapePatch = {
  kind?: string
}

export type EditorNodesShapeActions = {
  set: (
    nodeIds: readonly NodeId[],
    patch: EditorNodesShapePatch
  ) => CommandResult | undefined
}

export type EditorNodesActions = {
  create: EngineNodeCommands['create']
  move: EngineNodeCommands['move']
  align: EngineNodeCommands['align']
  distribute: EngineNodeCommands['distribute']
  delete: EngineNodeCommands['delete']
  deleteCascade: EngineNodeCommands['deleteCascade']
  duplicate: EngineNodeCommands['duplicate']
  update: EditorNodeDocumentCommands['update']
  updateMany: EditorNodeDocumentCommands['updateMany']
  text: EditorNodesTextActions
  style: EditorNodesStyleActions
  shape: EditorNodesShapeActions
  lock: EditorNodeLockCommands
  frames: EditorNodesFramesActions
}

export type EditorEdgesPatch = {
  type?: EdgeType
  textMode?: EdgeTextMode
}

export type EditorEdgesStylePatch = {
  color?: string
  width?: number
  dash?: EdgeDash
  start?: EdgeMarker
  end?: EdgeMarker
}

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

export type EditorEdgesStyleActions = {
  set: (
    edgeIds: readonly EdgeId[],
    patch: EditorEdgesStylePatch
  ) => CommandResult | undefined
  swapMarkers: (edgeId: EdgeId) => CommandResult | undefined
}

export type EditorEdgesLabelsActions = {
  add: (edgeId: EdgeId) => string | undefined
  update: (
    edgeId: EdgeId,
    labelId: string,
    patch: EditorEdgeLabelPatch
  ) => CommandResult | undefined
  remove: (edgeId: EdgeId, labelId: string) => CommandResult | undefined
}

export type EditorEdgesActions = {
  create: EngineCommands['edge']['create']
  move: EngineCommands['edge']['move']
  reconnect: EngineCommands['edge']['reconnect']
  delete: EngineCommands['edge']['delete']
  route: EngineCommands['edge']['route']
  set: (
    edgeIds: readonly EdgeId[],
    patch: EditorEdgesPatch
  ) => CommandResult | undefined
  style: EditorEdgesStyleActions
  labels: EditorEdgesLabelsActions
}

export type EditorBoardActions = Pick<EngineCommands['document'], 'replace'>

export type EditorHistoryActions = EngineCommands['history']

export type EditorDocumentActions = {
  board: EditorBoardActions
  history: EditorHistoryActions
  canvas: EditorCanvasActions
  nodes: EditorNodesActions
  edges: EditorEdgesActions
  groups: EditorGroupsActions
  mindmaps: EditorMindmapCommands
  clipboard: EditorClipboardCommands
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
  clear: () => void
}

export type EditorSessionActions = {
  tool: EditorSessionToolActions
  selection: EditorSessionSelectionActions
  edit: EditorSessionEditActions
}

export type EditorDrawActions = {
  set: (preferences: DrawPreferences) => void
  slot: (slot: DrawSlot) => void
  patch: (patch: BrushStylePatch) => void
}

export type EditorViewPreviewActions = {
  nodeText: {
    set: (nodeId: NodeId, patch?: TextPreviewPatch) => void
    clear: (nodeId: NodeId) => void
    clearSize: (nodeId: NodeId) => void
  }
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
  preview: EditorViewPreviewActions
}

export type EditorActions = {
  session: EditorSessionActions
  view: EditorViewActions
  document: EditorDocumentActions
}

export type EditorDocumentNodeTextWrite = Pick<
  EditorNodeTextCommands,
  'commit' | 'setColor' | 'setSize' | 'setWeight' | 'setItalic' | 'setAlign'
>

export type EditorDocumentNodeWrite = Omit<EditorNodeCommands, 'text'> & {
  text: EditorDocumentNodeTextWrite
}

export type EditorDocumentWrite = {
  doc: EngineCommands['document']
  history: EditorHistoryActions
  group: EngineCommands['group']
  edge: EngineCommands['edge']
  node: EditorDocumentNodeWrite
  mindmap: EditorMindmapCommands
}

export type EditorSessionWrite = EditorSessionActions

export type EditorViewWrite = {
  viewport: EditorViewportActions & Pick<ViewportInputRuntime, 'panScreenBy' | 'wheel'> & {
    set: (next: Viewport) => void
  }
  pointer: EditorViewActions['pointer']
  space: EditorViewActions['space']
  draw: EditorDrawActions
}

export type EditorPreviewWrite = {
  draw: {
    setPreview: (preview: import('./draw').DrawPreview | null) => void
    setHidden: (nodeIds: readonly NodeId[]) => void
    clear: () => void
  }
  node: {
    text: {
      set: (nodeId: NodeId, patch?: TextPreviewPatch) => void
      clear: (nodeId: NodeId) => void
      clearSize: (nodeId: NodeId) => void
    }
  }
  edge: {
    setInteraction: (entries: readonly EdgeOverlayEntry[]) => void
    setGuide: (guide?: EdgeGuide) => void
    clearPatches: () => void
    clearGuide: () => void
    clear: () => void
  }
  mindmap: {
    setDrag: (drag?: MindmapDragFeedback) => void
    clear: () => void
  }
}

export type EditorWriteTransaction = {
  document: EditorDocumentWrite
  session: EditorSessionWrite
  view: EditorViewWrite
  preview: EditorPreviewWrite
}

export type EditorWriteApi = EditorWriteTransaction & {
  batch: <T>(recipe: (tx: EditorWriteTransaction) => T) => T
}

export type Editor = {
  read: EditorRead
  state: EditorState
  actions: EditorActions
  input: EditorInput
  configure: (config: {
    mindmapLayout: MindmapLayoutConfig
    history?: KernelHistoryConfig
  }) => void
  dispose: () => void
}
