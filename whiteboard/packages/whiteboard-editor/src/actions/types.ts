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
  EdgeMarker,
  EdgePatch,
  EdgeTextMode,
  EdgeType,
  MindmapCreateInput,
  MindmapInsertInput,
  MindmapLayoutSpec,
  MindmapNodeId,
  MindmapTopicData,
  NodeTemplate,
  NodeUpdateInput,
  Origin,
  Point
} from '@whiteboard/core/types'
import type { IntentResult } from '@whiteboard/engine/types/result'
import type { ClipboardPacket } from '@whiteboard/editor/clipboard'
import type {
  BrushStylePatch,
  DrawState
} from '@whiteboard/editor/schema/draw-state'
import type {
  DrawMode,
  DrawSlot
} from '@whiteboard/editor/schema/draw-mode'
import type {
  EditCaret,
  EditField
} from '@whiteboard/editor/schema/edit'
import type {
  InsertTemplate,
  Tool
} from '@whiteboard/editor/schema/tool'
import type {
  PreviewInput
} from '@whiteboard/editor-scene'
import type {
  EditorHoverState
} from '@whiteboard/editor/state/document'
import type {
  EdgeLabelPatch,
  MindmapBorderPatch,
  MindmapBranchPatch
} from '@whiteboard/editor/write/types'

export type ClipboardTarget =
  | 'selection'
  | {
      nodeIds?: readonly string[]
      edgeIds?: readonly string[]
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
  composing: (composing: boolean) => void
  caret: (caret: EditCaret) => void
  cancel: () => void
  commit: () => void
}

export type NodeActions = {
  create: (input: {
    position: Point
    template: NodeTemplate
  }) => IntentResult<{ nodeId: string }>
  patch: (
    ids: readonly string[],
    update: NodeUpdateInput,
    options?: {
      origin?: Origin
    }
  ) => IntentResult | undefined
  move: (input: {
    ids: readonly string[]
    delta: Point
  }) => IntentResult
  align: (
    ids: readonly string[],
    mode: import('@whiteboard/core/node').NodeAlignMode
  ) => IntentResult
  distribute: (
    ids: readonly string[],
    mode: import('@whiteboard/core/node').NodeDistributeMode
  ) => IntentResult
  delete: (ids: string[]) => IntentResult
  duplicate: (ids: string[]) => IntentResult<{
    nodeIds: readonly string[]
    edgeIds: readonly string[]
  }>
  lock: {
    set: (nodeIds: readonly string[], locked: boolean) => IntentResult
    toggle: (nodeIds: readonly string[]) => IntentResult
  }
  shape: {
    set: (nodeIds: readonly string[], kind: string) => IntentResult
  }
  style: {
    fill: (nodeIds: readonly string[], value: string) => IntentResult
    fillOpacity: (nodeIds: readonly string[], value?: number) => IntentResult
    stroke: (nodeIds: readonly string[], value: string) => IntentResult
    strokeWidth: (nodeIds: readonly string[], value: number) => IntentResult
    strokeOpacity: (nodeIds: readonly string[], value?: number) => IntentResult
    strokeDash: (nodeIds: readonly string[], value?: readonly number[]) => IntentResult
    opacity: (nodeIds: readonly string[], value: number) => IntentResult
    textColor: (nodeIds: readonly string[], value: string) => IntentResult
  }
  text: {
    commit: (input: {
      nodeId: string
      field: 'text' | 'title'
      value: string
    }) => IntentResult | undefined
    color: (nodeIds: readonly string[], color: string) => IntentResult
    size: (input: {
      nodeIds: readonly string[]
      value?: number
    }) => IntentResult
    weight: (nodeIds: readonly string[], weight?: number) => IntentResult
    italic: (nodeIds: readonly string[], italic: boolean) => IntentResult
    align: (
      nodeIds: readonly string[],
      align?: 'left' | 'center' | 'right'
    ) => IntentResult
  }
}

export type EdgeActions = {
  create: (input: {
    from: EdgeEnd
    to: EdgeEnd
    template: EdgeTemplate
  }) => IntentResult<{ edgeId: string }>
  patch: (
    edgeIds: readonly string[],
    patch: EdgePatch
  ) => IntentResult | undefined
  move: (input: {
    ids: readonly string[]
    delta: Point
  }) => IntentResult
  reconnectCommit: (input: {
    edgeId: string
    end: 'source' | 'target'
    target: EdgeEnd
    patch?: {
      type?: EdgeType
      points?: EdgePatch['points']
    }
  }) => IntentResult
  delete: (ids: string[]) => IntentResult
  points: {
    set: (edgeId: string, points?: EdgePatch['points']) => IntentResult
    insertPoint: (edgeId: string, index: number, point: Point) => IntentResult
    movePoint: (edgeId: string, index: number, point: Point) => IntentResult
    removePoint: (edgeId: string, index: number) => IntentResult
    clear: (edgeId: string) => IntentResult
  }
  label: {
    add: (edgeId: string) => string | undefined
    patch: (
      edgeId: string,
      labelId: string,
      patch: EdgeLabelPatch
    ) => IntentResult | undefined
    remove: (edgeId: string, labelId: string) => IntentResult | undefined
  }
  style: {
    color: (edgeIds: readonly string[], value?: string) => IntentResult | undefined
    opacity: (edgeIds: readonly string[], value?: number) => IntentResult | undefined
    width: (edgeIds: readonly string[], value?: number) => IntentResult | undefined
    dash: (edgeIds: readonly string[], value?: EdgeDash) => IntentResult | undefined
    start: (edgeIds: readonly string[], value?: EdgeMarker) => IntentResult | undefined
    end: (edgeIds: readonly string[], value?: EdgeMarker) => IntentResult | undefined
    swapMarkers: (edgeIds: readonly string[]) => IntentResult | undefined
  }
  type: {
    set: (edgeIds: readonly string[], value: EdgeType) => IntentResult | undefined
  }
  lock: {
    set: (edgeIds: readonly string[], locked: boolean) => IntentResult | undefined
    toggle: (edgeIds: readonly string[]) => IntentResult | undefined
  }
  textMode: {
    set: (edgeIds: readonly string[], value?: EdgeTextMode) => IntentResult | undefined
  }
}

export type MindmapActions = {
  create: (
    payload: MindmapCreateInput,
    options?: {
      focus?: 'edit-root' | 'select-root' | 'none'
    }
  ) => IntentResult<{
    mindmapId: string
    rootId: MindmapNodeId
  }>
  delete: (ids: string[]) => IntentResult
  patch: (
    id: string,
    input: import('@whiteboard/core/types').MindmapTreePatch
  ) => IntentResult
  insert: (
    id: string,
    input: MindmapInsertInput,
    options?: {
      behavior?: MindmapInsertBehavior
    }
  ) => IntentResult<{ nodeId: MindmapNodeId }>
  moveSubtree: (
    id: string,
    input: import('@whiteboard/core/types').MindmapMoveSubtreeInput
  ) => IntentResult
  removeSubtree: (
    id: string,
    input: import('@whiteboard/core/types').MindmapRemoveSubtreeInput
  ) => IntentResult
  cloneSubtree: (
    id: string,
    input: import('@whiteboard/core/types').MindmapCloneSubtreeInput
  ) => IntentResult<{
    nodeId: MindmapNodeId
    map: Record<MindmapNodeId, MindmapNodeId>
  }>
  insertRelative: (input: {
    id: string
    targetNodeId: MindmapNodeId
    relation: MindmapInsertRelation
    side?: 'left' | 'right'
    payload?: MindmapTopicData
    behavior?: MindmapInsertBehavior
  }) => IntentResult<{ nodeId: MindmapNodeId }> | undefined
  moveByDrop: (input: {
    id: string
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
    nodeId: string
    position: Point
    origin?: Point
    threshold?: number
  }) => IntentResult | undefined
  style: {
    branch: (input: {
      id: string
      nodeIds: readonly MindmapNodeId[]
      patch: MindmapBranchPatch
      scope?: 'node' | 'subtree'
    }) => IntentResult | undefined
    topic: (input: {
      nodeIds: readonly string[]
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

export type HoverSessionActions = {
  get: () => EditorHoverState
  set: (state: EditorHoverState) => void
  clear: () => void
  edgeGuide: {
    get: () => PreviewInput['edgeGuide'] | undefined
    set: (value: PreviewInput['edgeGuide'] | undefined) => void
    clear: () => void
  }
}

export type PreviewSessionActions = {
  get: () => PreviewInput
  reset: () => void
  clear: () => void
}

export type EditorSessionActions = {
  tool: ToolActions
  draw: DrawActions
  selection: SelectionActions
  edit: EditActions
  hover: HoverSessionActions
  preview: PreviewSessionActions
}

export type EditorDocumentActions = {
  node: NodeActions
  edge: EdgeActions
  mindmap: MindmapActions
  clipboard: ClipboardActions
  history: HistoryActions
}

export type EditorActions = {
  app: AppActions
  viewport: ViewportActions
  session: EditorSessionActions
  document: EditorDocumentActions
}

export type EditorSelectionActions = SelectionActions
export type EditorEditActions = EditActions
export type EditorNodeActions = NodeActions
export type EditorEdgeActions = EdgeActions
