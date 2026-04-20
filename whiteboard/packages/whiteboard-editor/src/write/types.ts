import type {
  NodeAlignMode,
  NodeDistributeMode
} from '@whiteboard/core/node'
import type {
  CanvasItemRef,
  Document,
  Edge,
  EdgeDash,
  EdgeEnd,
  EdgeId,
  EdgeLabelAnchor,
  EdgeLabelUpdateInput,
  EdgeMarker,
  EdgeRoutePointAnchor,
  EdgeRouteInput,
  EdgeTemplate,
  EdgeTextMode,
  EdgeType,
  EdgeUpdateInput,
  GroupId,
  MindmapBranchUpdateInput,
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
  MindmapTopicUpdateInput,
  MindmapTree,
  NodeTemplate,
  NodeId,
  NodeUpdateInput,
  OrderMode,
  Origin,
  Point,
  Size
} from '@whiteboard/core/types'
import type {
  MindmapBranchLineKind,
  MindmapStrokeStyle
} from '@whiteboard/core/mindmap'
import type {
  Slice,
  SliceInsertOptions,
  SliceInsertResult
} from '@whiteboard/core/document'
import type { CommandResult } from '@whiteboard/engine/types/result'

export type { OrderMode } from '@whiteboard/core/types'

export type DocumentWrite = {
  replace: (document: Document) => CommandResult
  insert: (
    slice: Slice,
    options?: SliceInsertOptions
  ) => CommandResult<Omit<SliceInsertResult, 'operations'>>
  background: {
    set: (background?: Document['background']) => CommandResult
  }
}

export type CanvasWrite = {
  delete: (refs: readonly CanvasItemRef[]) => CommandResult
  duplicate: (
    refs: readonly CanvasItemRef[]
  ) => CommandResult<Omit<SliceInsertResult, 'operations'>>
  selection: {
    move: (input: {
      nodeIds: readonly NodeId[]
      edgeIds: readonly EdgeId[]
      delta: Point
    }) => CommandResult
  }
  order: {
    move: (
      refs: readonly CanvasItemRef[],
      mode: OrderMode
    ) => CommandResult
  }
}

export type NodeUpdateWrite = {
  update: (
    id: NodeId,
    input: NodeUpdateInput
  ) => CommandResult
  updateMany: (
    updates: readonly {
      id: NodeId
      input: NodeUpdateInput
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
  create: (input: {
    position: Point
    template: NodeTemplate
  }) => CommandResult<{ nodeId: NodeId }>
  update: NodeUpdateWrite['update']
  updateMany: NodeUpdateWrite['updateMany']
  move: (input: {
    ids: readonly NodeId[]
    delta: Point
  }) => CommandResult
  align: (ids: readonly NodeId[], mode: NodeAlignMode) => CommandResult
  distribute: (ids: readonly NodeId[], mode: NodeDistributeMode) => CommandResult
  delete: (ids: readonly NodeId[]) => CommandResult
  deleteCascade: (ids: readonly NodeId[]) => CommandResult
  duplicate: (ids: readonly NodeId[]) => CommandResult<{
    nodeIds: readonly NodeId[]
    edgeIds: readonly EdgeId[]
  }>
  lock: NodeLockWrite
  shape: NodeShapeWrite
  style: NodeStyleWrite
  text: NodeTextWrite
}

export type GroupWrite = {
  merge: (target: {
    nodeIds?: readonly NodeId[]
    edgeIds?: readonly EdgeId[]
  }) => CommandResult<{ groupId: GroupId }>
  order: {
    move: (
      ids: readonly GroupId[],
      mode: OrderMode
    ) => CommandResult
  }
  ungroup: (
    ids: readonly GroupId[]
  ) => CommandResult<{
    nodeIds: readonly NodeId[]
    edgeIds: readonly EdgeId[]
  }>
}

export type EdgeRouteWrite = {
  insert: (
    edgeId: EdgeId,
    point: Point,
    to?: EdgeRoutePointAnchor
  ) => CommandResult<{ pointId: string }>
  set: (
    edgeId: EdgeId,
    route: EdgeRouteInput
  ) => CommandResult
  update: (
    edgeId: EdgeId,
    pointId: string,
    fields: {
      x?: number
      y?: number
    }
  ) => CommandResult
  move: (
    edgeId: EdgeId,
    pointId: string,
    to: EdgeRoutePointAnchor
  ) => CommandResult
  delete: (edgeId: EdgeId, pointId: string) => CommandResult
  clear: (edgeId: EdgeId) => CommandResult
}

export type EdgeLabelPatch = Partial<NonNullable<EdgeLabelUpdateInput['fields']>> & {
  style?: Record<string, unknown>
  data?: Record<string, unknown>
}

export type EdgeLabelWrite = {
  insert: (
    edgeId: EdgeId,
    label?: {
      text?: string
      t?: number
      offset?: number
      style?: Record<string, unknown>
      data?: Record<string, unknown>
    },
    to?: EdgeLabelAnchor
  ) => CommandResult<{ labelId: string }>
  update: (
    edgeId: EdgeId,
    labelId: string,
    input: EdgeLabelUpdateInput
  ) => CommandResult
  move: (
    edgeId: EdgeId,
    labelId: string,
    to: EdgeLabelAnchor
  ) => CommandResult
  delete: (edgeId: EdgeId, labelId: string) => CommandResult
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
  create: (input: {
    from: EdgeEnd
    to: EdgeEnd
    template: EdgeTemplate
  }) => CommandResult<{ edgeId: EdgeId }>
  update: (id: EdgeId, input: EdgeUpdateInput) => CommandResult
  updateMany: (
    updates: readonly {
      id: EdgeId
      input: EdgeUpdateInput
    }[]
  ) => CommandResult
  move: (input: {
    ids: readonly EdgeId[]
    delta: Point
  }) => CommandResult
  reconnectCommit: (input: {
    edgeId: EdgeId
    end: 'source' | 'target'
    target: EdgeEnd
    patch?: {
      type?: EdgeType
      route?: EdgeRouteInput
    }
  }) => CommandResult
  delete: (ids: readonly EdgeId[]) => CommandResult
  label: EdgeLabelWrite
  route: EdgeRouteWrite
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

export type MindmapWrite = {
  create: (
    input: MindmapCreateInput
  ) => CommandResult<{
    mindmapId: MindmapId
    rootId: MindmapNodeId
  }>
  delete: (ids: readonly MindmapId[]) => CommandResult
  layout: {
    set: (id: MindmapId, layout: Partial<MindmapLayoutSpec>) => CommandResult
  }
  root: {
    move: (id: MindmapId, position: Point) => CommandResult
  }
  topic: {
    insert: (
      id: MindmapId,
      input: MindmapInsertInput
    ) => CommandResult<{ nodeId: MindmapNodeId }>
    move: (
      id: MindmapId,
      input: MindmapMoveSubtreeInput
    ) => CommandResult
    delete: (
      id: MindmapId,
      input: MindmapRemoveSubtreeInput
    ) => CommandResult
    clone: (
      id: MindmapId,
      input: MindmapCloneSubtreeInput
    ) => CommandResult<{
      nodeId: MindmapNodeId
      map: Record<MindmapNodeId, MindmapNodeId>
    }>
    update: (
      id: MindmapId,
      updates: readonly {
        topicId: NodeId
        input: MindmapTopicUpdateInput
      }[]
    ) => CommandResult
    collapse: {
      set: (
        id: MindmapId,
        topicId: NodeId,
        collapsed?: boolean
      ) => CommandResult
    }
  }
  branch: {
    update: (
      id: MindmapId,
      updates: readonly {
        topicId: NodeId
        input: MindmapBranchUpdateInput
      }[]
    ) => CommandResult
  }
}

export type HistoryWrite = {
  undo: () => CommandResult
  redo: () => CommandResult
  clear: () => void
}

export type EditorWrite = {
  document: DocumentWrite
  canvas: CanvasWrite
  node: NodeWrite
  group: GroupWrite
  edge: EdgeWrite
  mindmap: MindmapWrite
  history: HistoryWrite
}

export type MindmapInsertByPlacementInput = {
  id: NodeId
  tree: MindmapTree
  targetNodeId: MindmapNodeId
  placement: 'left' | 'right' | 'up' | 'down'
  layout: MindmapLayoutSpec
  payload?: MindmapTopicData
}
