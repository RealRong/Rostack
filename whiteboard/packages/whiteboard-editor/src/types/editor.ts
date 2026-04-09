import type {
  ContainerRect,
  ViewportLimits
} from '@whiteboard/core/geometry'
import type {
  ClipboardPacket,
} from '@whiteboard/core/document'
import type { HistoryConfig as KernelHistoryConfig } from '@whiteboard/core/kernel'
import type { SelectionInput, SelectionTarget } from '@whiteboard/core/selection'
import type { ReadStore } from '@shared/store'
import type { EngineInstance } from '@engine-types/instance'
import type { CommandResult } from '@engine-types/result'
import type {
  Edge,
  EdgeEnd,
  EdgeDash,
  EdgeId,
  EdgeMarker,
  EdgeTextMode,
  EdgeType,
  MindmapNodeData,
  MindmapNodeId,
  MindmapTree,
  NodeId,
  Origin,
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

export type EditorRead = RuntimeRead

export type EditorViewportActions = ViewportCommands & {
  setRect: (rect: ContainerRect) => void
  setLimits: (limits: ViewportLimits) => void
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

export type EditorCanvasOrderMode =
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

export type EditorBoardActions = Pick<EngineCommands['document'], 'replace'>

export type EditorHistoryActions = EngineCommands['history']

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
    mode: EditorCanvasOrderMode
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

export type EditorNodePatch = {
  fields?: Partial<{
    position: Point
    size: Size
    locked: boolean
  }>
  style?: Partial<{
    fill: string
    fillOpacity: number
    stroke: string
    strokeWidth: number
    strokeOpacity: number
    strokeDash: readonly number[]
    opacity: number
    color: string
    fontSize: number
    fontWeight: number
    fontStyle: 'normal' | 'italic'
    textAlign: 'left' | 'center' | 'right'
  }>
  data?: Partial<{
    text: string
    title: string
    kind: string
    background: string
  }>
}

export type EditorNodesApi = {
  create: EngineNodeCommands['create']
  patch: (
    ids: readonly NodeId[],
    patch: EditorNodePatch,
    options?: {
      measuredSizeById?: Readonly<Record<NodeId, Size>>
      origin?: Origin
    }
  ) => CommandResult | undefined
  move: EngineNodeCommands['move']
  align: EngineNodeCommands['align']
  distribute: EngineNodeCommands['distribute']
  remove: EngineNodeCommands['deleteCascade']
  duplicate: EngineNodeCommands['duplicate']
}

export type EditorEdgePatch = {
  fields?: Partial<{
    source: EdgeEnd
    target: EdgeEnd
    type: EdgeType
    textMode: EdgeTextMode
  }>
  style?: Partial<{
    color: string
    width: number
    dash: EdgeDash
    start: EdgeMarker
    end: EdgeMarker
  }>
}

export type MindmapNodePatch = Parameters<EditorMindmapCommands['updateNode']>[1]

export type EditorEdgesApi = {
  create: EngineCommands['edge']['create']
  patch: (
    edgeIds: readonly EdgeId[],
    patch: EditorEdgePatch
  ) => CommandResult | undefined
  move: EngineCommands['edge']['move']
  reconnect: EngineCommands['edge']['reconnect']
  remove: EngineCommands['edge']['delete']
  route: EngineCommands['edge']['route']
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

export type EditorDocumentApi = {
  replace: EditorBoardActions['replace']
  history: EditorHistoryActions
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

export type Editor = {
  read: EditorRead
  state: EditorState
  document: EditorDocumentApi
  session: EditorSessionApi
  view: EditorViewApi
  input: EditorInput
  configure: (config: EditorConfig) => void
  dispose: () => void
}
