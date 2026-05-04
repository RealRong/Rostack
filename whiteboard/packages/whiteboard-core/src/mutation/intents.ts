import type {
  CanvasItemRef,
  Document,
  Edge,
  EdgeEnd,
  EdgeId,
  EdgeInput,
  EdgeLabelAnchor,
  EdgeLabelUpdateInput,
  EdgeRoutePointAnchor,
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
  MindmapNodeId,
  MindmapRemoveSubtreeInput,
  MindmapTopicUpdateInput,
  NodeId,
  NodeInput,
  NodeUpdateInput,
  Origin,
  Point,
  CanvasOrderAnchor
} from '@whiteboard/core/types'
import type {
  Slice,
  SliceInsertOptions,
  SliceInsertResult
} from '@whiteboard/core/document'
import type {
  NodeAlignMode,
  NodeDistributeMode
} from '@whiteboard/core/node'

export type NodeBatchUpdate = {
  id: NodeId
  input: NodeUpdateInput
}

export type EdgeBatchUpdate = {
  id: EdgeId
  input: EdgeUpdateInput
}

export type MindmapTopicBatchUpdate = {
  topicId: NodeId
  input: MindmapTopicUpdateInput
}

export type MindmapBranchBatchUpdate = {
  topicId: NodeId
  input: MindmapBranchUpdateInput
}

export type DocumentIntent =
  | {
      type: 'document.insert'
      slice: Slice
      options?: SliceInsertOptions
    }
  | {
      type: 'document.background.set'
      background?: Document['background']
    }

export type CanvasIntent =
  | {
      type: 'canvas.delete'
      refs: readonly CanvasItemRef[]
    }
  | {
      type: 'canvas.duplicate'
      refs: readonly CanvasItemRef[]
    }
  | {
      type: 'canvas.selection.move'
      nodeIds: readonly NodeId[]
      edgeIds: readonly EdgeId[]
      delta: Point
    }
  | {
      type: 'document.order.move'
      refs: readonly CanvasItemRef[]
      to: CanvasOrderAnchor
    }

export type NodeIntent =
  | {
      type: 'node.create'
      input: NodeInput
    }
  | {
      type: 'node.update'
      updates: readonly NodeBatchUpdate[]
      origin?: Origin
    }
  | {
      type: 'node.move'
      ids: readonly NodeId[]
      delta: Point
    }
  | {
      type: 'node.text.commit'
      nodeId: NodeId
      field: 'text' | 'title'
      value: string
    }
  | {
      type: 'node.align'
      ids: readonly NodeId[]
      mode: NodeAlignMode
    }
  | {
      type: 'node.distribute'
      ids: readonly NodeId[]
      mode: NodeDistributeMode
    }
  | {
      type: 'node.delete'
      ids: readonly NodeId[]
    }
  | {
      type: 'node.deleteCascade'
      ids: readonly NodeId[]
    }
  | {
      type: 'node.duplicate'
      ids: readonly NodeId[]
    }

export type GroupIntent =
  | {
      type: 'group.merge'
      target: {
        nodeIds?: readonly NodeId[]
        edgeIds?: readonly EdgeId[]
      }
    }
  | {
      type: 'group.order.move'
      ids: readonly GroupId[]
      to: CanvasOrderAnchor
    }
  | {
      type: 'group.ungroup'
      ids: readonly GroupId[]
    }

export type EdgeIntent =
  | {
      type: 'edge.create'
      input: EdgeInput
    }
  | {
      type: 'edge.update'
      updates: readonly EdgeBatchUpdate[]
    }
  | {
      type: 'edge.move'
      ids: readonly EdgeId[]
      delta: Point
    }
  | {
      type: 'edge.reconnect.commit'
      edgeId: EdgeId
      end: 'source' | 'target'
      target: EdgeEnd
      patch?: {
        type?: EdgeType
        points?: Edge['points']
      }
    }
  | {
      type: 'edge.delete'
      ids: readonly EdgeId[]
    }
  | {
      type: 'edge.label.insert'
      edgeId: EdgeId
      label: {
        text?: string
        t?: number
        offset?: number
        style?: Record<string, unknown>
        data?: Record<string, unknown>
      }
      to?: EdgeLabelAnchor
    }
  | {
      type: 'edge.label.update'
      edgeId: EdgeId
      labelId: string
      input: EdgeLabelUpdateInput
    }
  | {
      type: 'edge.label.move'
      edgeId: EdgeId
      labelId: string
      to: EdgeLabelAnchor
    }
  | {
      type: 'edge.label.delete'
      edgeId: EdgeId
      labelId: string
    }
  | {
      type: 'edge.points.insert'
      edgeId: EdgeId
      point: {
        x: number
        y: number
      }
      to?: EdgeRoutePointAnchor
    }
  | {
      type: 'edge.points.update'
      edgeId: EdgeId
      pointId: string
      fields: {
        x?: number
        y?: number
      }
    }
  | {
      type: 'edge.points.set'
      edgeId: EdgeId
      points?: Edge['points']
    }
  | {
      type: 'edge.points.move'
      edgeId: EdgeId
      pointId: string
      to: EdgeRoutePointAnchor
    }
  | {
      type: 'edge.points.delete'
      edgeId: EdgeId
      pointId: string
    }
  | {
      type: 'edge.points.clear'
      edgeId: EdgeId
    }

export type MindmapIntent =
  | {
      type: 'mindmap.create'
      input: MindmapCreateInput
    }
  | {
      type: 'mindmap.delete'
      ids: readonly MindmapId[]
    }
  | {
      type: 'mindmap.layout.set'
      id: MindmapId
      layout: Partial<MindmapLayoutSpec>
    }
  | {
      type: 'mindmap.move'
      id: MindmapId
      position: Point
    }
  | {
      type: 'mindmap.topic.insert'
      id: MindmapId
      input: MindmapInsertInput
    }
  | {
      type: 'mindmap.topic.move'
      id: MindmapId
      input: MindmapMoveSubtreeInput
    }
  | {
      type: 'mindmap.topic.delete'
      id: MindmapId
      input: MindmapRemoveSubtreeInput
    }
  | {
      type: 'mindmap.topic.clone'
      id: MindmapId
      input: MindmapCloneSubtreeInput
    }
  | {
      type: 'mindmap.topic.update'
      id: MindmapId
      updates: readonly MindmapTopicBatchUpdate[]
    }
  | {
      type: 'mindmap.topic.collapse.set'
      id: MindmapId
      topicId: NodeId
      collapsed?: boolean
    }
  | {
      type: 'mindmap.branch.update'
      id: MindmapId
      updates: readonly MindmapBranchBatchUpdate[]
    }

export type WhiteboardIntent =
  | DocumentIntent
  | CanvasIntent
  | NodeIntent
  | GroupIntent
  | EdgeIntent
  | MindmapIntent

export type WhiteboardIntentKind = WhiteboardIntent['type']
