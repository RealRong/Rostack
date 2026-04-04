import type {
  ContainerRect,
  ViewportLimits
} from '@whiteboard/core/geometry'
import type {
  ClipboardPacket,
} from '@whiteboard/core/document'
import type { HistoryConfig as KernelHistoryConfig } from '@whiteboard/core/kernel'
import type { SelectionInput, SelectionTarget } from '@whiteboard/core/selection'
import type { CommandResult, ReadStore } from '@whiteboard/engine'
import type {
  EdgeId,
  MindmapNodeData,
  MindmapNodeId,
  MindmapTree,
  NodeId,
  Point,
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
import type { EditField, EditTarget } from '../runtime/state/edit'
import type { EditorOverlay } from '../runtime/overlay'
import type {
  EdgeGuide,
  EdgeOverlayEntry,
  MindmapDragFeedback
} from '../runtime/overlay'

type EngineCommands = import('@whiteboard/engine').EngineInstance['commands']
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
  ownerId?: NodeId
}

export type EditorPointerDispatchResult = {
  handled: boolean
  continuePointer: boolean
}

export type EditorInput = {
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
  feedback: EditorOverlay['selectors']['feedback']
}

export type EditorViewportRead = ViewportRead & Pick<
  ViewportInputRuntime,
  'screenPoint' | 'size'
>

export type EditorRead = RuntimeRead

export type EditorViewportCommands = ViewportCommands & {
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
    size: Size
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
  setFontSize: (input: {
    nodeIds: readonly NodeId[]
    value?: number
    sizeById?: Readonly<Record<NodeId, Size>>
  }) => CommandResult
}

export type EditorNodeAppearanceCommands = {
  setFill: (nodeIds: readonly NodeId[], fill: string) => CommandResult
  setStroke: (nodeIds: readonly NodeId[], stroke: string) => CommandResult
  setStrokeWidth: (nodeIds: readonly NodeId[], width: number) => CommandResult
  setOpacity: (nodeIds: readonly NodeId[], opacity: number) => CommandResult
  setTextColor: (nodeIds: readonly NodeId[], color: string) => CommandResult
}

export type EditorNodeCommands = Omit<EngineNodeCommands, 'update' | 'updateMany'> & {
  document: EditorNodeDocumentCommands
  lock: EditorNodeLockCommands
  text: EditorNodeTextCommands
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

export type EditorCommands = Omit<EngineCommands, 'tool' | 'selection' | 'interaction' | 'edge' | 'viewport' | 'node' | 'mindmap'> & {
  tool: {
    set: (tool: Tool) => void
  }
  draw: {
    set: (preferences: DrawPreferences) => void
    slot: (slot: DrawSlot) => void
    patch: (patch: BrushStylePatch) => void
  }
  edit: {
    start: (nodeId: NodeId, field: EditField) => void
    clear: () => void
  }
  selection: {
    replace: (input: SelectionInput) => void
    add: (input: SelectionInput) => void
    remove: (input: SelectionInput) => void
    toggle: (input: SelectionInput) => void
    selectAll: () => void
    clear: () => void
  }
  viewport: EditorViewportCommands
  edge: EngineCommands['edge']
  node: EditorNodeCommands
  mindmap: EditorMindmapCommands
  clipboard: EditorClipboardCommands
}

export type EditorDocumentNodeTextWrite = Pick<
  EditorNodeTextCommands,
  'commit' | 'setColor' | 'setFontSize'
>

export type EditorDocumentNodeWrite = Omit<EditorNodeCommands, 'text'> & {
  text: EditorDocumentNodeTextWrite
}

export type EditorDocumentWrite = {
  doc: EngineCommands['document']
  history: Pick<EditorCommands, 'history'>['history']
  edge: EngineCommands['edge']
  node: EditorDocumentNodeWrite
  mindmap: EditorMindmapCommands
}

export type EditorSessionWrite = {
  tool: EditorCommands['tool']
  selection: EditorCommands['selection']
  edit: EditorCommands['edit']
}

export type EditorViewWrite = {
  viewport: EditorViewportCommands & Pick<ViewportInputRuntime, 'panScreenBy' | 'wheel'> & {
    set: (next: Viewport) => void
  }
  pointer: {
    set: (sample: PointerSample) => void
    clear: () => void
  }
  space: {
    set: (value: boolean) => void
  }
  draw: EditorCommands['draw']
}

export type EditorPreviewWrite = {
  draw: {
    setPreview: (preview: import('./draw').DrawPreview | null) => void
    setHidden: (nodeIds: readonly NodeId[]) => void
    clear: () => void
  }
  node: {
    text: {
      setSize: (nodeId: NodeId, size?: Size) => void
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
  write: EditorWriteApi
  commands: EditorCommands
  input: EditorInput
  configure: (config: {
    mindmapLayout: MindmapLayoutConfig
    history?: KernelHistoryConfig
  }) => void
  dispose: () => void
}
