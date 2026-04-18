import type {
  ContainerRect,
  ViewportLimits
} from '@whiteboard/core/geometry'
import type { SelectionInput } from '@whiteboard/core/selection'
import type {
  HistoryConfig as KernelHistoryConfig
} from '@whiteboard/core/kernel'
import type {
  Document,
  EdgeTemplate,
  EdgeDash,
  EdgeEnd,
  EdgeId,
  EdgeMarker,
  EdgePatch,
  EdgeTextMode,
  EdgeType,
  MindmapCreateInput,
  MindmapId,
  MindmapInsertInput,
  MindmapLayoutSpec,
  MindmapNodeId,
  MindmapTopicData,
  NodeTemplate,
  NodeId,
  NodeUpdateInput,
  Origin,
  Point
} from '@whiteboard/core/types'
import type { CommandResult } from '@whiteboard/engine/types/result'
import type { ClipboardPacket } from '@whiteboard/editor/clipboard/packet'
import type {
  BrushStylePatch,
  DrawState
} from '@whiteboard/editor/session/draw/state'
import type {
  DrawMode,
  DrawSlot
} from '@whiteboard/editor/session/draw/model'
import type {
  EditCaret,
  EditField,
  EditLayout
} from '@whiteboard/editor/session/edit'
import type { ViewportCommands } from '@whiteboard/editor/session/viewport'
import type {
  InsertTemplate,
  Tool
} from '@whiteboard/editor/types/tool'
import type {
  EdgeLabelPatch,
  MindmapBorderPatch,
  MindmapBranchPatch
} from '@whiteboard/editor/write/types'

export type ClipboardTarget =
  | 'selection'
  | {
      nodeIds?: readonly NodeId[]
      edgeIds?: readonly EdgeId[]
    }

export type ClipboardOptions = {
  origin?: Point
}

export type AppConfig = {
  history?: KernelHistoryConfig
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

export type AppActions = {
  replace: (document: Document) => CommandResult
  configure: (config: AppConfig) => void
}

export type ToolActions = {
  set: (tool: Tool) => void
  select: () => void
  draw: (mode: DrawMode) => void
  edge: (template: EdgeTemplate) => void
  insert: (template: InsertTemplate) => void
  hand: () => void
}

export type DrawActions = {
  set: (state: DrawState) => void
  slot: (slot: DrawSlot) => void
  patch: (patch: BrushStylePatch) => void
}

export type ViewportActions = ViewportCommands & {
  setRect: (rect: ContainerRect) => void
  setLimits: (limits: ViewportLimits) => void
}

export type SelectionActions = {
  replace: (input: SelectionInput) => void
  add: (input: SelectionInput) => void
  remove: (input: SelectionInput) => void
  toggle: (input: SelectionInput) => void
  selectAll: () => void
  clear: () => void
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
    mode: import('@whiteboard/core/types').OrderMode
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
    bounds: import('@whiteboard/core/types').Rect,
    options?: {
      padding?: number
    }
  ) => boolean
}

export type EditActions = {
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
  layout: (patch: Partial<EditLayout>) => void
  caret: (caret: EditCaret) => void
  cancel: () => void
  commit: () => void
}

export type NodeActions = {
  create: (input: {
    position: Point
    template: NodeTemplate
  }) => CommandResult<{ nodeId: NodeId }>
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
  align: (
    ids: readonly NodeId[],
    mode: import('@whiteboard/core/node').NodeAlignMode
  ) => CommandResult
  distribute: (
    ids: readonly NodeId[],
    mode: import('@whiteboard/core/node').NodeDistributeMode
  ) => CommandResult
  delete: (ids: NodeId[]) => CommandResult
  duplicate: (ids: NodeId[]) => CommandResult<{
    nodeIds: readonly NodeId[]
    edgeIds: readonly EdgeId[]
  }>
  lock: {
    set: (nodeIds: readonly NodeId[], locked: boolean) => CommandResult
    toggle: (nodeIds: readonly NodeId[]) => CommandResult
  }
  shape: {
    set: (nodeIds: readonly NodeId[], kind: string) => CommandResult
  }
  style: {
    fill: (nodeIds: readonly NodeId[], value: string) => CommandResult
    fillOpacity: (nodeIds: readonly NodeId[], value?: number) => CommandResult
    stroke: (nodeIds: readonly NodeId[], value: string) => CommandResult
    strokeWidth: (nodeIds: readonly NodeId[], value: number) => CommandResult
    strokeOpacity: (nodeIds: readonly NodeId[], value?: number) => CommandResult
    strokeDash: (nodeIds: readonly NodeId[], value?: readonly number[]) => CommandResult
    opacity: (nodeIds: readonly NodeId[], value: number) => CommandResult
    textColor: (nodeIds: readonly NodeId[], value: string) => CommandResult
  }
  text: {
    commit: (input: {
      nodeId: NodeId
      field: 'text' | 'title'
      value: string
      size?: import('@whiteboard/core/types').Size
      fontSize?: number
      wrapWidth?: number
    }) => CommandResult | undefined
    color: (nodeIds: readonly NodeId[], color: string) => CommandResult
    size: (input: {
      nodeIds: readonly NodeId[]
      value?: number
    }) => CommandResult
    weight: (nodeIds: readonly NodeId[], weight?: number) => CommandResult
    italic: (nodeIds: readonly NodeId[], italic: boolean) => CommandResult
    align: (
      nodeIds: readonly NodeId[],
      align?: 'left' | 'center' | 'right'
    ) => CommandResult
  }
}

export type EdgeActions = {
  create: (input: {
    from: EdgeEnd
    to: EdgeEnd
    template: EdgeTemplate
  }) => CommandResult<{ edgeId: EdgeId }>
  patch: (
    edgeIds: readonly EdgeId[],
    patch: EdgePatch
  ) => CommandResult | undefined
  move: (input: {
    ids: readonly EdgeId[]
    delta: Point
  }) => CommandResult
  reconnect: (
    edgeId: EdgeId,
    end: 'source' | 'target',
    target: EdgeEnd
  ) => CommandResult
  delete: (ids: EdgeId[]) => CommandResult
  route: {
    insert: (edgeId: EdgeId, point: Point) => CommandResult<{ index: number }>
    move: (edgeId: EdgeId, index: number, point: Point) => CommandResult
    remove: (edgeId: EdgeId, index: number) => CommandResult
    clear: (edgeId: EdgeId) => CommandResult
  }
  label: {
    add: (edgeId: EdgeId) => string | undefined
    patch: (
      edgeId: EdgeId,
      labelId: string,
      patch: EdgeLabelPatch
    ) => CommandResult | undefined
    remove: (edgeId: EdgeId, labelId: string) => CommandResult | undefined
  }
  style: {
    color: (edgeIds: readonly EdgeId[], value?: string) => CommandResult | undefined
    opacity: (edgeIds: readonly EdgeId[], value?: number) => CommandResult | undefined
    width: (edgeIds: readonly EdgeId[], value?: number) => CommandResult | undefined
    dash: (edgeIds: readonly EdgeId[], value?: EdgeDash) => CommandResult | undefined
    start: (edgeIds: readonly EdgeId[], value?: EdgeMarker) => CommandResult | undefined
    end: (edgeIds: readonly EdgeId[], value?: EdgeMarker) => CommandResult | undefined
    swapMarkers: (edgeIds: readonly EdgeId[]) => CommandResult | undefined
  }
  type: {
    set: (edgeIds: readonly EdgeId[], value: EdgeType) => CommandResult | undefined
  }
  lock: {
    set: (edgeIds: readonly EdgeId[], locked: boolean) => CommandResult | undefined
    toggle: (edgeIds: readonly EdgeId[]) => CommandResult | undefined
  }
  textMode: {
    set: (edgeIds: readonly EdgeId[], value?: EdgeTextMode) => CommandResult | undefined
  }
}

export type MindmapActions = {
  create: (
    payload: MindmapCreateInput,
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
    input: import('@whiteboard/core/types').MindmapTreePatch
  ) => CommandResult
  insert: (
    id: MindmapId,
    input: MindmapInsertInput,
    options?: {
      behavior?: MindmapInsertBehavior
    }
  ) => CommandResult<{ nodeId: MindmapNodeId }>
  moveSubtree: (
    id: MindmapId,
    input: import('@whiteboard/core/types').MindmapMoveSubtreeInput
  ) => CommandResult
  removeSubtree: (
    id: MindmapId,
    input: import('@whiteboard/core/types').MindmapRemoveSubtreeInput
  ) => CommandResult
  cloneSubtree: (
    id: MindmapId,
    input: import('@whiteboard/core/types').MindmapCloneSubtreeInput
  ) => CommandResult<{
    nodeId: MindmapNodeId
    map: Record<MindmapNodeId, MindmapNodeId>
  }>
  insertByPlacement: (input: {
    id: NodeId
    tree: import('@whiteboard/core/types').MindmapTree
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
  style: {
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
}

export type ClipboardActions = {
  copy: (target?: ClipboardTarget) => ClipboardPacket | undefined
  cut: (target?: ClipboardTarget) => ClipboardPacket | undefined
  paste: (
    packet: ClipboardPacket,
    options?: ClipboardOptions
  ) => boolean
}

export type HistoryActions = {
  undo: () => CommandResult
  redo: () => CommandResult
  clear: () => void
}

export type EditorActions = {
  app: AppActions
  tool: ToolActions
  viewport: ViewportActions
  draw: DrawActions
  selection: SelectionActions
  edit: EditActions
  node: NodeActions
  edge: EdgeActions
  mindmap: MindmapActions
  clipboard: ClipboardActions
  history: HistoryActions
}

export type EditorSelectionActions = SelectionActions
export type EditorEditActions = EditActions
export type EditorNodeActions = NodeActions
export type EditorEdgeActions = EdgeActions
