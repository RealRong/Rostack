import type {
  ContainerRect,
  ViewportLimits
} from '@whiteboard/core/geometry'
import type {
  HistoryConfig as KernelHistoryConfig,
  HistoryState
} from '@whiteboard/core/kernel'
import type { SelectionInput } from '@whiteboard/core/selection'
import type {
  NodeAlignMode,
  NodeDistributeMode
} from '@whiteboard/core/node'
import type { CommandResult } from '@whiteboard/engine/types/result'
import type {
  Document,
  Edge,
  EdgeEnd,
  EdgeId,
  EdgeInput,
  EdgePatch,
  MindmapBranchLineKind,
  MindmapNodeFrameKind,
  MindmapStrokeStyle,
  MindmapCloneSubtreeInput,
  MindmapCreateInput,
  MindmapId,
  MindmapInsertInput,
  MindmapLayoutSpec,
  MindmapMoveSubtreeInput,
  MindmapNodeId,
  MindmapRemoveSubtreeInput,
  MindmapTree,
  MindmapTreePatch,
  MindmapTopicData,
  NodeId,
  NodeInput,
  NodeUpdateInput,
  OrderMode,
  Origin,
  Point,
  Rect,
  Size
} from '@whiteboard/core/types'
import type { ClipboardPacket } from '@whiteboard/editor/command/clipboard/packet'
import type {
  BrushStylePatch,
  DrawState
} from '@whiteboard/editor/local/draw/state'
import type { DrawMode, DrawSlot } from '@whiteboard/editor/local/draw/model'
import type { PointerSample } from '@whiteboard/editor/types/input'
import type {
  EdgePresetKey,
  InsertPresetKey,
  Tool
} from '@whiteboard/editor/types/tool'
import type {
  EditCaret,
  EditField,
  EditLayout
} from '@whiteboard/editor/local/session/edit'
import type { ViewportCommands } from '@whiteboard/editor/local/viewport/runtime'

export type { OrderMode } from '@whiteboard/core/types'

export type EdgeLabelPatch = NonNullable<Edge['labels']>[number] extends infer Label
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

export type ClipboardTarget =
  | 'selection'
  | {
      nodeIds?: readonly NodeId[]
      edgeIds?: readonly EdgeId[]
    }

export type ClipboardOptions = {
  origin?: Point
}

export type ClipboardCommands = {
  copy: (target?: ClipboardTarget) => ClipboardPacket | undefined
  cut: (target?: ClipboardTarget) => ClipboardPacket | undefined
  paste: (
    packet: ClipboardPacket,
    options?: ClipboardOptions
  ) => boolean
}

export type SelectionApi = {
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
    mode: OrderMode
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

export type NodeApi = {
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

export type EdgeApi = {
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
      patch: EdgeLabelPatch
    ) => CommandResult | undefined
    remove: (edgeId: EdgeId, labelId: string) => CommandResult | undefined
  }
}

export type MindmapCommands = {
  create: (
    payload?: MindmapCreateInput,
    options?: {
      focus?: 'edit-root' | 'select-root' | 'none'
    }
  ) => CommandResult<{
    mindmapId: MindmapId
    rootId: MindmapNodeId
  }>
  delete: (ids: MindmapId[]) => CommandResult
  patch: (
    id: MindmapId,
    input: MindmapTreePatch
  ) => CommandResult
  insert: (
    id: MindmapId,
    input: MindmapInsertInput,
    options?: {
      behavior?: MindmapInsertBehavior
    }
  ) => CommandResult<{ nodeId: MindmapNodeId }>
  navigate: (input: {
    id: MindmapId
    fromNodeId: MindmapNodeId
    direction: 'parent' | 'first-child' | 'prev-sibling' | 'next-sibling'
  }) => MindmapNodeId | undefined
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
  insertByPlacement: (input: {
    id: NodeId
    tree: MindmapTree
    targetNodeId: MindmapNodeId
    placement: 'left' | 'right' | 'up' | 'down'
    layout: MindmapLayoutSpec
    payload?: MindmapTopicData
    behavior?: MindmapInsertBehavior
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
    layout: MindmapLayoutSpec
  }) => CommandResult | undefined
  moveRoot: (input: {
    nodeId: NodeId
    position: Point
    origin?: Point
    threshold?: number
  }) => CommandResult | undefined
  style: MindmapStyleCommands
}

export type MindmapInsertFocus =
  | 'edit-new'
  | 'select-new'
  | 'keep-current'

export type MindmapInsertEnter =
  | 'none'
  | 'from-anchor'

export type MindmapInsertBehavior = {
  focus?: MindmapInsertFocus
  enter?: MindmapInsertEnter
}

export type MindmapBranchPatch = Partial<{
  color: string
  line: MindmapBranchLineKind
  width: number
  stroke: MindmapStrokeStyle
}>

export type MindmapBorderPatch = Partial<{
  frameKind: MindmapNodeFrameKind
  stroke: string
  strokeWidth: number
  fill: string
}>

export type MindmapStyleCommands = {
  branch: (input: {
    id: MindmapId
    nodeIds: readonly MindmapNodeId[]
    patch: MindmapBranchPatch
    scope?: 'node' | 'subtree'
  }) => CommandResult | undefined
  topic: (input: {
    nodeIds: readonly NodeId[]
    patch: MindmapBorderPatch
  }) => CommandResult | undefined
}

export type SessionToolActions = {
  set: (tool: Tool) => void
}

export type SessionSelectionActions = {
  replace: (input: SelectionInput) => void
  add: (input: SelectionInput) => void
  remove: (input: SelectionInput) => void
  toggle: (input: SelectionInput) => void
  selectAll: () => void
  clear: () => void
}

export type SessionEditActions = {
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
  layout: (patch: Partial<EditLayout>) => void
  clear: () => void
}

export type SessionActions = {
  tool: SessionToolActions
  selection: SessionSelectionActions
  edit: SessionEditActions
}

export type HistoryCommands = {
  get: () => HistoryState
  undo: () => CommandResult
  redo: () => CommandResult
  clear: () => void
}

export type DrawCommands = {
  set: (state: DrawState) => void
  slot: (slot: DrawSlot) => void
  patch: (patch: BrushStylePatch) => void
}

export type ViewportActions = ViewportCommands & {
  setRect: (rect: ContainerRect) => void
  setLimits: (limits: ViewportLimits) => void
}

export type ViewPointerActions = {
  set: (sample: PointerSample) => void
  clear: () => void
}

export type ViewSpaceActions = {
  set: (value: boolean) => void
}

export type ViewActions = {
  viewport: ViewportActions
  pointer: ViewPointerActions
  space: ViewSpaceActions
  draw: DrawCommands
}

export type ToolActions = {
  set: SessionToolActions['set']
  select: () => void
  draw: (mode: DrawMode) => void
  edge: (preset: EdgePresetKey) => void
  insert: (preset: InsertPresetKey) => void
  hand: () => void
}

export type AppConfig = {
  history?: KernelHistoryConfig
}

export type AppActions = {
  reset: () => void
  replace: (document: Document) => CommandResult
  export: () => Document
  configure: (config: AppConfig) => void
  dispose: () => void
}
