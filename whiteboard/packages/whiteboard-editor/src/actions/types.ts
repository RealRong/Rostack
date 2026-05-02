import type {
  ContainerRect,
  ViewportLimits
} from '@whiteboard/core/geometry'
import type { SelectionInput } from '@whiteboard/core/selection'
import type {
  Document,
  EdgeTemplate,
  EdgeDash,
  EdgeEnd,
  EdgeId,
  EdgeMarker,
  EdgePatch,
  EdgeRouteInput,
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
import type { IntentResult } from '@whiteboard/engine/types/result'
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
  EditField
} from '@whiteboard/editor/session/edit'
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

export type MindmapInsertRelation =
  | 'child'
  | 'sibling'
  | 'parent'

export type AppActions = {
  replace: (document: Document) => IntentResult
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

export type ViewportActions = {
  set: (viewport: import('@whiteboard/core/types').Viewport) => void
  panBy: (delta: Point) => void
  panScreenBy: (delta: Point) => void
  zoomTo: (zoom: number, anchor?: Point) => void
  fit: (bounds: import('@whiteboard/core/types').Rect, padding?: number) => void
  reset: () => void
  wheel: (input: import('@whiteboard/core/geometry').WheelInput, wheelSensitivity?: number) => void
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
    mode: 'front' | 'back' | 'forward' | 'backward'
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
  composing: (composing: boolean) => void
  caret: (caret: EditCaret) => void
  cancel: () => void
  commit: () => void
}

export type NodeActions = {
  create: (input: {
    position: Point
    template: NodeTemplate
  }) => IntentResult<{ nodeId: NodeId }>
  patch: (
    ids: readonly NodeId[],
    update: NodeUpdateInput,
    options?: {
      origin?: Origin
    }
  ) => IntentResult | undefined
  move: (input: {
    ids: readonly NodeId[]
    delta: Point
  }) => IntentResult
  align: (
    ids: readonly NodeId[],
    mode: import('@whiteboard/core/node').NodeAlignMode
  ) => IntentResult
  distribute: (
    ids: readonly NodeId[],
    mode: import('@whiteboard/core/node').NodeDistributeMode
  ) => IntentResult
  delete: (ids: NodeId[]) => IntentResult
  duplicate: (ids: NodeId[]) => IntentResult<{
    nodeIds: readonly NodeId[]
    edgeIds: readonly EdgeId[]
  }>
  lock: {
    set: (nodeIds: readonly NodeId[], locked: boolean) => IntentResult
    toggle: (nodeIds: readonly NodeId[]) => IntentResult
  }
  shape: {
    set: (nodeIds: readonly NodeId[], kind: string) => IntentResult
  }
  style: {
    fill: (nodeIds: readonly NodeId[], value: string) => IntentResult
    fillOpacity: (nodeIds: readonly NodeId[], value?: number) => IntentResult
    stroke: (nodeIds: readonly NodeId[], value: string) => IntentResult
    strokeWidth: (nodeIds: readonly NodeId[], value: number) => IntentResult
    strokeOpacity: (nodeIds: readonly NodeId[], value?: number) => IntentResult
    strokeDash: (nodeIds: readonly NodeId[], value?: readonly number[]) => IntentResult
    opacity: (nodeIds: readonly NodeId[], value: number) => IntentResult
    textColor: (nodeIds: readonly NodeId[], value: string) => IntentResult
  }
  text: {
    commit: (input: {
      nodeId: NodeId
      field: 'text' | 'title'
      value: string
    }) => IntentResult | undefined
    color: (nodeIds: readonly NodeId[], color: string) => IntentResult
    size: (input: {
      nodeIds: readonly NodeId[]
      value?: number
    }) => IntentResult
    weight: (nodeIds: readonly NodeId[], weight?: number) => IntentResult
    italic: (nodeIds: readonly NodeId[], italic: boolean) => IntentResult
    align: (
      nodeIds: readonly NodeId[],
      align?: 'left' | 'center' | 'right'
    ) => IntentResult
  }
}

export type EdgeActions = {
  create: (input: {
    from: EdgeEnd
    to: EdgeEnd
    template: EdgeTemplate
  }) => IntentResult<{ edgeId: EdgeId }>
  patch: (
    edgeIds: readonly EdgeId[],
    patch: EdgePatch
  ) => IntentResult | undefined
  move: (input: {
    ids: readonly EdgeId[]
    delta: Point
  }) => IntentResult
  reconnectCommit: (input: {
    edgeId: EdgeId
    end: 'source' | 'target'
    target: EdgeEnd
    patch?: {
      type?: EdgeType
      route?: import('@whiteboard/core/types').EdgeRouteInput
    }
  }) => IntentResult
  delete: (ids: EdgeId[]) => IntentResult
  route: {
    set: (edgeId: EdgeId, route: EdgeRouteInput) => IntentResult
    insertPoint: (edgeId: EdgeId, index: number, point: Point) => IntentResult
    movePoint: (edgeId: EdgeId, index: number, point: Point) => IntentResult
    removePoint: (edgeId: EdgeId, index: number) => IntentResult
    clear: (edgeId: EdgeId) => IntentResult
  }
  label: {
    add: (edgeId: EdgeId) => string | undefined
    patch: (
      edgeId: EdgeId,
      labelId: string,
      patch: EdgeLabelPatch
    ) => IntentResult | undefined
    remove: (edgeId: EdgeId, labelId: string) => IntentResult | undefined
  }
  style: {
    color: (edgeIds: readonly EdgeId[], value?: string) => IntentResult | undefined
    opacity: (edgeIds: readonly EdgeId[], value?: number) => IntentResult | undefined
    width: (edgeIds: readonly EdgeId[], value?: number) => IntentResult | undefined
    dash: (edgeIds: readonly EdgeId[], value?: EdgeDash) => IntentResult | undefined
    start: (edgeIds: readonly EdgeId[], value?: EdgeMarker) => IntentResult | undefined
    end: (edgeIds: readonly EdgeId[], value?: EdgeMarker) => IntentResult | undefined
    swapMarkers: (edgeIds: readonly EdgeId[]) => IntentResult | undefined
  }
  type: {
    set: (edgeIds: readonly EdgeId[], value: EdgeType) => IntentResult | undefined
  }
  lock: {
    set: (edgeIds: readonly EdgeId[], locked: boolean) => IntentResult | undefined
    toggle: (edgeIds: readonly EdgeId[]) => IntentResult | undefined
  }
  textMode: {
    set: (edgeIds: readonly EdgeId[], value?: EdgeTextMode) => IntentResult | undefined
  }
}

export type MindmapActions = {
  create: (
    payload: MindmapCreateInput,
    options?: {
      focus?: 'edit-root' | 'select-root' | 'none'
    }
  ) => IntentResult<{
    mindmapId: MindmapId
    rootId: MindmapNodeId
  }>
  delete: (ids: MindmapId[]) => IntentResult
  patch: (
    id: MindmapId,
    input: import('@whiteboard/core/types').MindmapTreePatch
  ) => IntentResult
  insert: (
    id: MindmapId,
    input: MindmapInsertInput,
    options?: {
      behavior?: MindmapInsertBehavior
    }
  ) => IntentResult<{ nodeId: MindmapNodeId }>
  moveSubtree: (
    id: MindmapId,
    input: import('@whiteboard/core/types').MindmapMoveSubtreeInput
  ) => IntentResult
  removeSubtree: (
    id: MindmapId,
    input: import('@whiteboard/core/types').MindmapRemoveSubtreeInput
  ) => IntentResult
  cloneSubtree: (
    id: MindmapId,
    input: import('@whiteboard/core/types').MindmapCloneSubtreeInput
  ) => IntentResult<{
    nodeId: MindmapNodeId
    map: Record<MindmapNodeId, MindmapNodeId>
  }>
  insertRelative: (input: {
    id: MindmapId
    targetNodeId: MindmapNodeId
    relation: MindmapInsertRelation
    side?: 'left' | 'right'
    payload?: MindmapTopicData
    behavior?: MindmapInsertBehavior
  }) => IntentResult<{ nodeId: MindmapNodeId }> | undefined
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
  }) => IntentResult | undefined
  moveRoot: (input: {
    nodeId: NodeId
    position: Point
    origin?: Point
    threshold?: number
  }) => IntentResult | undefined
  style: {
    branch: (input: {
      id: MindmapId
      nodeIds: readonly MindmapNodeId[]
      patch: MindmapBranchPatch
      scope?: 'node' | 'subtree'
    }) => IntentResult | undefined
    topic: (input: {
      nodeIds: readonly NodeId[]
      patch: MindmapBorderPatch
    }) => IntentResult | undefined
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
  undo: () => IntentResult
  redo: () => IntentResult
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
