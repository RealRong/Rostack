import type {
  NodeAlignMode,
  NodeDistributeMode
} from '@whiteboard/core/node'
import type {
  Edge,
  EdgeDash,
  EdgeEnd,
  EdgeId,
  EdgeInput,
  EdgeMarker,
  EdgePatch,
  EdgeTextMode,
  EdgeType,
  MindmapCloneSubtreeInput,
  MindmapCreateInput,
  MindmapId,
  MindmapInsertInput,
  MindmapLayoutSpec,
  MindmapMoveSubtreeInput,
  MindmapNodeFrameKind,
  MindmapNodeId,
  MindmapRemoveSubtreeInput,
  MindmapTopicData,
  MindmapTree,
  MindmapTreePatch,
  NodeId,
  NodeInput,
  NodeUpdateInput,
  OrderMode,
  Origin,
  Point,
  Size
} from '@whiteboard/core/types'
import type {
  CanvasItemRef,
  Document,
  GroupId
} from '@whiteboard/core/types'
import type {
  MindmapBranchLineKind,
  MindmapStrokeStyle
} from '@whiteboard/core/mindmap'
import type { Slice } from '@whiteboard/core/document'
import type {
  SliceInsertOptions,
  SliceInsertResult
} from '@whiteboard/core/document'
import type { CommandResult } from '@whiteboard/engine/types/result'

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

export type DocumentWrite = {
  replace: (document: Document) => CommandResult
  insert: (
    slice: Slice,
    options?: SliceInsertOptions
  ) => CommandResult<Omit<SliceInsertResult, 'operations'>>
  delete: (refs: CanvasItemRef[]) => CommandResult
  duplicate: (refs: CanvasItemRef[]) => CommandResult<Omit<SliceInsertResult, 'operations'>>
  order: (refs: CanvasItemRef[], mode: OrderMode) => CommandResult
  background: {
    set: (background?: Document['background']) => CommandResult
  }
  group: {
    merge: (target: {
      nodeIds?: readonly NodeId[]
      edgeIds?: readonly EdgeId[]
    }) => CommandResult<{ groupId: GroupId }>
    order: {
      set: (ids: GroupId[]) => CommandResult
      bringToFront: (ids: GroupId[]) => CommandResult
      sendToBack: (ids: GroupId[]) => CommandResult
      bringForward: (ids: GroupId[]) => CommandResult
      sendBackward: (ids: GroupId[]) => CommandResult
    }
    ungroup: (id: GroupId) => CommandResult<{
      nodeIds: readonly NodeId[]
      edgeIds: readonly EdgeId[]
    }>
    ungroupMany: (ids: GroupId[]) => CommandResult<{
      nodeIds: readonly NodeId[]
      edgeIds: readonly EdgeId[]
    }>
  }
}

export type NodePatchWrite = {
  update: (id: NodeId, update: NodeUpdateInput) => CommandResult
  updateMany: (
    updates: readonly {
      id: NodeId
      update: NodeUpdateInput
    }[],
    options?: {
      origin?: Origin
    }
  ) => CommandResult
}

export type NodeTextWrite = {
  commit: (input: {
    nodeId: NodeId
    field: 'text' | 'title'
    value: string
    size?: Size
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

export type NodeLockWrite = {
  set: (nodeIds: readonly NodeId[], locked: boolean) => CommandResult
  toggle: (nodeIds: readonly NodeId[]) => CommandResult
}

export type NodeShapeWrite = {
  set: (nodeIds: readonly NodeId[], kind: string) => CommandResult
}

export type NodeStyleWrite = {
  fill: (nodeIds: readonly NodeId[], value: string) => CommandResult
  fillOpacity: (nodeIds: readonly NodeId[], value?: number) => CommandResult
  stroke: (nodeIds: readonly NodeId[], value: string) => CommandResult
  strokeWidth: (nodeIds: readonly NodeId[], value: number) => CommandResult
  strokeOpacity: (nodeIds: readonly NodeId[], value?: number) => CommandResult
  strokeDash: (nodeIds: readonly NodeId[], value?: readonly number[]) => CommandResult
  opacity: (nodeIds: readonly NodeId[], value: number) => CommandResult
  textColor: (nodeIds: readonly NodeId[], value: string) => CommandResult
}

export type NodeWrite = {
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
  delete: (ids: NodeId[]) => CommandResult
  deleteCascade: (ids: NodeId[]) => CommandResult
  duplicate: (ids: NodeId[]) => CommandResult<{
    nodeIds: readonly NodeId[]
    edgeIds: readonly EdgeId[]
  }>
  update: NodePatchWrite['update']
  updateMany: NodePatchWrite['updateMany']
  lock: NodeLockWrite
  shape: NodeShapeWrite
  style: NodeStyleWrite
  text: NodeTextWrite
}

export type EdgeRouteWrite = {
  insert: (edgeId: EdgeId, point: Point) => CommandResult<{ index: number }>
  move: (edgeId: EdgeId, index: number, point: Point) => CommandResult
  remove: (edgeId: EdgeId, index: number) => CommandResult
  clear: (edgeId: EdgeId) => CommandResult
}

export type EdgeLabelWrite = {
  add: (edgeId: EdgeId) => string | undefined
  patch: (
    edgeId: EdgeId,
    labelId: string,
    patch: EdgeLabelPatch
  ) => CommandResult | undefined
  remove: (edgeId: EdgeId, labelId: string) => CommandResult | undefined
}

export type EdgeStyleWrite = {
  color: (edgeIds: readonly EdgeId[], value?: string) => CommandResult | undefined
  opacity: (edgeIds: readonly EdgeId[], value?: number) => CommandResult | undefined
  width: (edgeIds: readonly EdgeId[], value?: number) => CommandResult | undefined
  dash: (edgeIds: readonly EdgeId[], value?: EdgeDash) => CommandResult | undefined
  start: (edgeIds: readonly EdgeId[], value?: EdgeMarker) => CommandResult | undefined
  end: (edgeIds: readonly EdgeId[], value?: EdgeMarker) => CommandResult | undefined
  swapMarkers: (edgeIds: readonly EdgeId[]) => CommandResult | undefined
}

export type EdgeTypeWrite = {
  set: (edgeIds: readonly EdgeId[], value: EdgeType) => CommandResult | undefined
}

export type EdgeLockWrite = {
  set: (edgeIds: readonly EdgeId[], locked: boolean) => CommandResult | undefined
  toggle: (edgeIds: readonly EdgeId[]) => CommandResult | undefined
}

export type EdgeTextModeWrite = {
  set: (edgeIds: readonly EdgeId[], value?: EdgeTextMode) => CommandResult | undefined
}

export type EdgeWrite = {
  create: (payload: EdgeInput) => CommandResult<{ edgeId: EdgeId }>
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
  update: (id: EdgeId, patch: EdgePatch) => CommandResult
  updateMany: (
    updates: readonly {
      id: EdgeId
      patch: EdgePatch
    }[]
  ) => CommandResult
  delete: (ids: EdgeId[]) => CommandResult
  route: EdgeRouteWrite
  label: EdgeLabelWrite
  style: EdgeStyleWrite
  type: EdgeTypeWrite
  lock: EdgeLockWrite
  textMode: EdgeTextModeWrite
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

export type MindmapStyleWrite = {
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

export type MindmapWrite = {
  create: (
    payload?: MindmapCreateInput
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
    input: MindmapInsertInput
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
  insertByPlacement: (input: {
    id: NodeId
    tree: MindmapTree
    targetNodeId: MindmapNodeId
    placement: 'left' | 'right' | 'up' | 'down'
    layout: MindmapLayoutSpec
    payload?: MindmapTopicData
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
  style: MindmapStyleWrite
}

export type HistoryWrite = {
  undo: () => CommandResult
  redo: () => CommandResult
  clear: () => void
}

export type EditorWrite = {
  document: DocumentWrite
  node: NodeWrite
  edge: EdgeWrite
  mindmap: MindmapWrite
  history: HistoryWrite
}
