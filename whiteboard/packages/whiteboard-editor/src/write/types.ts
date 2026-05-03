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
  Origin,
  Point,
  CanvasOrderAnchor
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
import type { IntentResult } from '@whiteboard/engine/types/result'

export type OrderStepDirection = 'forward' | 'backward'

export type DocumentWrite = {
  replace: (document: Document) => IntentResult
  insert: (
    slice: Slice,
    options?: SliceInsertOptions
  ) => IntentResult<Pick<SliceInsertResult, 'roots' | 'allNodeIds' | 'allEdgeIds'>>
  background: {
    set: (background?: Document['background']) => IntentResult
  }
}

export type CanvasWrite = {
  delete: (refs: readonly CanvasItemRef[]) => IntentResult
  duplicate: (
    refs: readonly CanvasItemRef[]
  ) => IntentResult<Pick<SliceInsertResult, 'roots' | 'allNodeIds' | 'allEdgeIds'>>
  selection: {
    move: (input: {
      nodeIds: readonly NodeId[]
      edgeIds: readonly EdgeId[]
      delta: Point
    }) => IntentResult
  }
  order: {
    move: (
      refs: readonly CanvasItemRef[],
      to: CanvasOrderAnchor
    ) => IntentResult
    step: (
      refs: readonly CanvasItemRef[],
      direction: OrderStepDirection
    ) => IntentResult
  }
}

export type NodeUpdateWrite = {
  update: (
    id: NodeId,
    input: NodeUpdateInput
  ) => IntentResult
  updateMany: (
    updates: readonly {
      id: NodeId
      input: NodeUpdateInput
    }[],
    options?: {
      origin?: Origin
    }
  ) => IntentResult
}

export type NodeTextWrite = {
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

export type NodeLockWrite = {
  set: (nodeIds: readonly NodeId[], locked: boolean) => IntentResult
  toggle: (nodeIds: readonly NodeId[]) => IntentResult
}

export type NodeShapeWrite = {
  set: (nodeIds: readonly NodeId[], kind: string) => IntentResult
}

export type NodeStyleWrite = {
  fill: (nodeIds: readonly NodeId[], value: string) => IntentResult
  fillOpacity: (nodeIds: readonly NodeId[], value?: number) => IntentResult
  stroke: (nodeIds: readonly NodeId[], value: string) => IntentResult
  strokeWidth: (nodeIds: readonly NodeId[], value: number) => IntentResult
  strokeOpacity: (nodeIds: readonly NodeId[], value?: number) => IntentResult
  strokeDash: (nodeIds: readonly NodeId[], value?: readonly number[]) => IntentResult
  opacity: (nodeIds: readonly NodeId[], value: number) => IntentResult
  textColor: (nodeIds: readonly NodeId[], value: string) => IntentResult
}

export type NodeWrite = {
  create: (input: {
    position: Point
    template: NodeTemplate
  }) => IntentResult<{ nodeId: NodeId }>
  update: NodeUpdateWrite['update']
  updateMany: NodeUpdateWrite['updateMany']
  move: (input: {
    ids: readonly NodeId[]
    delta: Point
  }) => IntentResult
  align: (ids: readonly NodeId[], mode: NodeAlignMode) => IntentResult
  distribute: (ids: readonly NodeId[], mode: NodeDistributeMode) => IntentResult
  delete: (ids: readonly NodeId[]) => IntentResult
  deleteCascade: (ids: readonly NodeId[]) => IntentResult
  duplicate: (ids: readonly NodeId[]) => IntentResult<{
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
  }) => IntentResult<{ groupId: GroupId }>
  order: {
    move: (
      ids: readonly GroupId[],
      to: CanvasOrderAnchor
    ) => IntentResult
    step: (
      ids: readonly GroupId[],
      direction: OrderStepDirection
    ) => IntentResult
  }
  ungroup: (
    ids: readonly GroupId[]
  ) => IntentResult<{
    nodeIds: readonly NodeId[]
    edgeIds: readonly EdgeId[]
  }>
}

export type EdgePointsWrite = {
  insert: (
    edgeId: EdgeId,
    point: Point,
    to?: EdgeRoutePointAnchor
  ) => IntentResult<{ pointId: string }>
  set: (
    edgeId: EdgeId,
    points?: Point[]
  ) => IntentResult
  update: (
    edgeId: EdgeId,
    pointId: string,
    fields: {
      x?: number
      y?: number
    }
  ) => IntentResult
  move: (
    edgeId: EdgeId,
    pointId: string,
    to: EdgeRoutePointAnchor
  ) => IntentResult
  delete: (edgeId: EdgeId, pointId: string) => IntentResult
  clear: (edgeId: EdgeId) => IntentResult
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
  ) => IntentResult<{ labelId: string }>
  update: (
    edgeId: EdgeId,
    labelId: string,
    input: EdgeLabelUpdateInput
  ) => IntentResult
  move: (
    edgeId: EdgeId,
    labelId: string,
    to: EdgeLabelAnchor
  ) => IntentResult
  delete: (edgeId: EdgeId, labelId: string) => IntentResult
}

export type EdgeStyleWrite = {
  color: (edgeIds: readonly EdgeId[], value?: string) => IntentResult | undefined
  opacity: (edgeIds: readonly EdgeId[], value?: number) => IntentResult | undefined
  width: (edgeIds: readonly EdgeId[], value?: number) => IntentResult | undefined
  dash: (edgeIds: readonly EdgeId[], value?: EdgeDash) => IntentResult | undefined
  start: (edgeIds: readonly EdgeId[], value?: EdgeMarker) => IntentResult | undefined
  end: (edgeIds: readonly EdgeId[], value?: EdgeMarker) => IntentResult | undefined
  swapMarkers: (edgeIds: readonly EdgeId[]) => IntentResult | undefined
}

export type EdgeTypeWrite = {
  set: (edgeIds: readonly EdgeId[], value: EdgeType) => IntentResult | undefined
}

export type EdgeLockWrite = {
  set: (edgeIds: readonly EdgeId[], locked: boolean) => IntentResult | undefined
  toggle: (edgeIds: readonly EdgeId[]) => IntentResult | undefined
}

export type EdgeTextModeWrite = {
  set: (edgeIds: readonly EdgeId[], value?: EdgeTextMode) => IntentResult | undefined
}

export type EdgeWrite = {
  create: (input: {
    from: EdgeEnd
    to: EdgeEnd
    template: EdgeTemplate
  }) => IntentResult<{ edgeId: EdgeId }>
  update: (id: EdgeId, input: EdgeUpdateInput) => IntentResult
  updateMany: (
    updates: readonly {
      id: EdgeId
      input: EdgeUpdateInput
    }[]
  ) => IntentResult
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
      points?: Point[]
    }
  }) => IntentResult
  delete: (ids: readonly EdgeId[]) => IntentResult
  label: EdgeLabelWrite
  points: EdgePointsWrite
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
  ) => IntentResult<{
    mindmapId: MindmapId
    rootId: MindmapNodeId
  }>
  delete: (ids: readonly MindmapId[]) => IntentResult
  layout: {
    set: (id: MindmapId, layout: Partial<MindmapLayoutSpec>) => IntentResult
  }
  move: (id: MindmapId, position: Point) => IntentResult
  topic: {
    insert: (
      id: MindmapId,
      input: MindmapInsertInput
    ) => IntentResult<{ nodeId: MindmapNodeId }>
    move: (
      id: MindmapId,
      input: MindmapMoveSubtreeInput
    ) => IntentResult
    delete: (
      id: MindmapId,
      input: MindmapRemoveSubtreeInput
    ) => IntentResult
    clone: (
      id: MindmapId,
      input: MindmapCloneSubtreeInput
    ) => IntentResult<{
      nodeId: MindmapNodeId
      map: Record<MindmapNodeId, MindmapNodeId>
    }>
    update: (
      id: MindmapId,
      updates: readonly {
        topicId: NodeId
        input: MindmapTopicUpdateInput
      }[]
    ) => IntentResult
    collapse: {
      set: (
        id: MindmapId,
        topicId: NodeId,
        collapsed?: boolean
      ) => IntentResult
    }
  }
  branch: {
    update: (
      id: MindmapId,
      updates: readonly {
        topicId: NodeId
        input: MindmapBranchUpdateInput
      }[]
    ) => IntentResult
  }
}

export type HistoryWrite = {
  undo: () => IntentResult
  redo: () => IntentResult
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
