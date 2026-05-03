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
  EdgeLabelAnchor,
  EdgeLabelUpdateInput,
  EdgeMarker,
  EdgeRoutePointAnchor,
  EdgeTemplate,
  EdgeTextMode,
  EdgeType,
  EdgeUpdateInput,
  MindmapBranchUpdateInput,
  MindmapCloneSubtreeInput,
  MindmapCreateInput,
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
      nodeIds: readonly string[]
      edgeIds: readonly string[]
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
    id: string,
    input: NodeUpdateInput
  ) => IntentResult
  updateMany: (
    updates: readonly {
      id: string
      input: NodeUpdateInput
    }[],
    options?: {
      origin?: Origin
    }
  ) => IntentResult
}

export type NodeTextWrite = {
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

export type NodeLockWrite = {
  set: (nodeIds: readonly string[], locked: boolean) => IntentResult
  toggle: (nodeIds: readonly string[]) => IntentResult
}

export type NodeShapeWrite = {
  set: (nodeIds: readonly string[], kind: string) => IntentResult
}

export type NodeStyleWrite = {
  fill: (nodeIds: readonly string[], value: string) => IntentResult
  fillOpacity: (nodeIds: readonly string[], value?: number) => IntentResult
  stroke: (nodeIds: readonly string[], value: string) => IntentResult
  strokeWidth: (nodeIds: readonly string[], value: number) => IntentResult
  strokeOpacity: (nodeIds: readonly string[], value?: number) => IntentResult
  strokeDash: (nodeIds: readonly string[], value?: readonly number[]) => IntentResult
  opacity: (nodeIds: readonly string[], value: number) => IntentResult
  textColor: (nodeIds: readonly string[], value: string) => IntentResult
}

export type NodeWrite = {
  create: (input: {
    position: Point
    template: NodeTemplate
  }) => IntentResult<{ nodeId: string }>
  update: NodeUpdateWrite['update']
  updateMany: NodeUpdateWrite['updateMany']
  move: (input: {
    ids: readonly string[]
    delta: Point
  }) => IntentResult
  align: (ids: readonly string[], mode: NodeAlignMode) => IntentResult
  distribute: (ids: readonly string[], mode: NodeDistributeMode) => IntentResult
  delete: (ids: readonly string[]) => IntentResult
  deleteCascade: (ids: readonly string[]) => IntentResult
  duplicate: (ids: readonly string[]) => IntentResult<{
    nodeIds: readonly string[]
    edgeIds: readonly string[]
  }>
  lock: NodeLockWrite
  shape: NodeShapeWrite
  style: NodeStyleWrite
  text: NodeTextWrite
}

export type GroupWrite = {
  merge: (target: {
    nodeIds?: readonly string[]
    edgeIds?: readonly string[]
  }) => IntentResult<{ groupId: string }>
  order: {
    move: (
      ids: readonly string[],
      to: CanvasOrderAnchor
    ) => IntentResult
    step: (
      ids: readonly string[],
      direction: OrderStepDirection
    ) => IntentResult
  }
  ungroup: (
    ids: readonly string[]
  ) => IntentResult<{
    nodeIds: readonly string[]
    edgeIds: readonly string[]
  }>
}

export type EdgePointsWrite = {
  insert: (
    edgeId: string,
    point: Point,
    to?: EdgeRoutePointAnchor
  ) => IntentResult<{ pointId: string }>
  set: (
    edgeId: string,
    points?: Edge['points']
  ) => IntentResult
  update: (
    edgeId: string,
    pointId: string,
    fields: {
      x?: number
      y?: number
    }
  ) => IntentResult
  move: (
    edgeId: string,
    pointId: string,
    to: EdgeRoutePointAnchor
  ) => IntentResult
  delete: (edgeId: string, pointId: string) => IntentResult
  clear: (edgeId: string) => IntentResult
}

export type EdgeLabelPatch = Partial<NonNullable<EdgeLabelUpdateInput['fields']>> & {
  style?: Record<string, unknown>
  data?: Record<string, unknown>
}

export type EdgeLabelWrite = {
  insert: (
    edgeId: string,
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
    edgeId: string,
    labelId: string,
    input: EdgeLabelUpdateInput
  ) => IntentResult
  move: (
    edgeId: string,
    labelId: string,
    to: EdgeLabelAnchor
  ) => IntentResult
  delete: (edgeId: string, labelId: string) => IntentResult
}

export type EdgeStyleWrite = {
  color: (edgeIds: readonly string[], value?: string) => IntentResult | undefined
  opacity: (edgeIds: readonly string[], value?: number) => IntentResult | undefined
  width: (edgeIds: readonly string[], value?: number) => IntentResult | undefined
  dash: (edgeIds: readonly string[], value?: EdgeDash) => IntentResult | undefined
  start: (edgeIds: readonly string[], value?: EdgeMarker) => IntentResult | undefined
  end: (edgeIds: readonly string[], value?: EdgeMarker) => IntentResult | undefined
  swapMarkers: (edgeIds: readonly string[]) => IntentResult | undefined
}

export type EdgeTypeWrite = {
  set: (edgeIds: readonly string[], value: EdgeType) => IntentResult | undefined
}

export type EdgeLockWrite = {
  set: (edgeIds: readonly string[], locked: boolean) => IntentResult | undefined
  toggle: (edgeIds: readonly string[]) => IntentResult | undefined
}

export type EdgeTextModeWrite = {
  set: (edgeIds: readonly string[], value?: EdgeTextMode) => IntentResult | undefined
}

export type EdgeWrite = {
  create: (input: {
    from: EdgeEnd
    to: EdgeEnd
    template: EdgeTemplate
  }) => IntentResult<{ edgeId: string }>
  update: (id: string, input: EdgeUpdateInput) => IntentResult
  updateMany: (
    updates: readonly {
      id: string
      input: EdgeUpdateInput
    }[]
  ) => IntentResult
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
      points?: Edge['points']
    }
  }) => IntentResult
  delete: (ids: readonly string[]) => IntentResult
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
    mindmapId: string
    rootId: MindmapNodeId
  }>
  delete: (ids: readonly string[]) => IntentResult
  layout: {
    set: (id: string, layout: Partial<MindmapLayoutSpec>) => IntentResult
  }
  move: (id: string, position: Point) => IntentResult
  topic: {
    insert: (
      id: string,
      input: MindmapInsertInput
    ) => IntentResult<{ nodeId: MindmapNodeId }>
    move: (
      id: string,
      input: MindmapMoveSubtreeInput
    ) => IntentResult
    delete: (
      id: string,
      input: MindmapRemoveSubtreeInput
    ) => IntentResult
    clone: (
      id: string,
      input: MindmapCloneSubtreeInput
    ) => IntentResult<{
      nodeId: MindmapNodeId
      map: Record<MindmapNodeId, MindmapNodeId>
    }>
    update: (
      id: string,
      updates: readonly {
        topicId: string
        input: MindmapTopicUpdateInput
      }[]
    ) => IntentResult
    collapse: {
      set: (
        id: string,
        topicId: string,
        collapsed?: boolean
      ) => IntentResult
    }
  }
  branch: {
    update: (
      id: string,
      updates: readonly {
        topicId: string
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
  id: string
  tree: MindmapTree
  targetNodeId: MindmapNodeId
  placement: 'left' | 'right' | 'up' | 'down'
  layout: MindmapLayoutSpec
  payload?: MindmapTopicData
}
