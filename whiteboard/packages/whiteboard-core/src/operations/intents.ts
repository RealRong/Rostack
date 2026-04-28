import type {
  CanvasItemRef,
  Document,
  EdgeEnd,
  EdgeId,
  EdgeInput,
  EdgeLabelAnchor,
  EdgeLabelUpdateInput,
  EdgeRouteInput,
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
  OrderMode,
  Origin,
  Point,
  Size
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

export type { OrderMode } from '@whiteboard/core/types'

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
      type: 'document.replace'
      document: Document
    }
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
      type: 'canvas.order.move'
      refs: readonly CanvasItemRef[]
      mode: OrderMode
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
      size?: Size
      fontSize?: number
      wrapWidth?: number
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
      mode: OrderMode
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
        route?: EdgeRouteInput
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
      type: 'edge.route.insert'
      edgeId: EdgeId
      point: {
        x: number
        y: number
      }
      to?: EdgeRoutePointAnchor
    }
  | {
      type: 'edge.route.update'
      edgeId: EdgeId
      pointId: string
      fields: {
        x?: number
        y?: number
      }
    }
  | {
      type: 'edge.route.set'
      edgeId: EdgeId
      route: EdgeRouteInput
    }
  | {
      type: 'edge.route.move'
      edgeId: EdgeId
      pointId: string
      to: EdgeRoutePointAnchor
    }
  | {
      type: 'edge.route.delete'
      edgeId: EdgeId
      pointId: string
    }
  | {
      type: 'edge.route.clear'
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

export interface WhiteboardIntentTable {
  'document.replace': {
    intent: Extract<DocumentIntent, { type: 'document.replace' }>
    output: void
  }
  'document.insert': {
    intent: Extract<DocumentIntent, { type: 'document.insert' }>
    output: Omit<SliceInsertResult, 'operations'>
  }
  'document.background.set': {
    intent: Extract<DocumentIntent, { type: 'document.background.set' }>
    output: void
  }
  'canvas.delete': {
    intent: Extract<CanvasIntent, { type: 'canvas.delete' }>
    output: void
  }
  'canvas.duplicate': {
    intent: Extract<CanvasIntent, { type: 'canvas.duplicate' }>
    output: Omit<SliceInsertResult, 'operations'>
  }
  'canvas.selection.move': {
    intent: Extract<CanvasIntent, { type: 'canvas.selection.move' }>
    output: void
  }
  'canvas.order.move': {
    intent: Extract<CanvasIntent, { type: 'canvas.order.move' }>
    output: void
  }
  'node.create': {
    intent: Extract<NodeIntent, { type: 'node.create' }>
    output: { nodeId: NodeId }
  }
  'node.update': {
    intent: Extract<NodeIntent, { type: 'node.update' }>
    output: void
  }
  'node.move': {
    intent: Extract<NodeIntent, { type: 'node.move' }>
    output: void
  }
  'node.text.commit': {
    intent: Extract<NodeIntent, { type: 'node.text.commit' }>
    output: void
  }
  'node.align': {
    intent: Extract<NodeIntent, { type: 'node.align' }>
    output: void
  }
  'node.distribute': {
    intent: Extract<NodeIntent, { type: 'node.distribute' }>
    output: void
  }
  'node.delete': {
    intent: Extract<NodeIntent, { type: 'node.delete' }>
    output: void
  }
  'node.deleteCascade': {
    intent: Extract<NodeIntent, { type: 'node.deleteCascade' }>
    output: void
  }
  'node.duplicate': {
    intent: Extract<NodeIntent, { type: 'node.duplicate' }>
    output: {
      nodeIds: readonly NodeId[]
      edgeIds: readonly EdgeId[]
    }
  }
  'group.merge': {
    intent: Extract<GroupIntent, { type: 'group.merge' }>
    output: { groupId: GroupId }
  }
  'group.order.move': {
    intent: Extract<GroupIntent, { type: 'group.order.move' }>
    output: void
  }
  'group.ungroup': {
    intent: Extract<GroupIntent, { type: 'group.ungroup' }>
    output: {
      nodeIds: readonly NodeId[]
      edgeIds: readonly EdgeId[]
    }
  }
  'edge.create': {
    intent: Extract<EdgeIntent, { type: 'edge.create' }>
    output: { edgeId: EdgeId }
  }
  'edge.update': {
    intent: Extract<EdgeIntent, { type: 'edge.update' }>
    output: void
  }
  'edge.move': {
    intent: Extract<EdgeIntent, { type: 'edge.move' }>
    output: void
  }
  'edge.reconnect.commit': {
    intent: Extract<EdgeIntent, { type: 'edge.reconnect.commit' }>
    output: void
  }
  'edge.delete': {
    intent: Extract<EdgeIntent, { type: 'edge.delete' }>
    output: void
  }
  'edge.label.insert': {
    intent: Extract<EdgeIntent, { type: 'edge.label.insert' }>
    output: { labelId: string }
  }
  'edge.label.update': {
    intent: Extract<EdgeIntent, { type: 'edge.label.update' }>
    output: void
  }
  'edge.label.move': {
    intent: Extract<EdgeIntent, { type: 'edge.label.move' }>
    output: void
  }
  'edge.label.delete': {
    intent: Extract<EdgeIntent, { type: 'edge.label.delete' }>
    output: void
  }
  'edge.route.insert': {
    intent: Extract<EdgeIntent, { type: 'edge.route.insert' }>
    output: { pointId: string }
  }
  'edge.route.update': {
    intent: Extract<EdgeIntent, { type: 'edge.route.update' }>
    output: void
  }
  'edge.route.set': {
    intent: Extract<EdgeIntent, { type: 'edge.route.set' }>
    output: void
  }
  'edge.route.move': {
    intent: Extract<EdgeIntent, { type: 'edge.route.move' }>
    output: void
  }
  'edge.route.delete': {
    intent: Extract<EdgeIntent, { type: 'edge.route.delete' }>
    output: void
  }
  'edge.route.clear': {
    intent: Extract<EdgeIntent, { type: 'edge.route.clear' }>
    output: void
  }
  'mindmap.create': {
    intent: Extract<MindmapIntent, { type: 'mindmap.create' }>
    output: {
      mindmapId: MindmapId
      rootId: MindmapNodeId
    }
  }
  'mindmap.delete': {
    intent: Extract<MindmapIntent, { type: 'mindmap.delete' }>
    output: void
  }
  'mindmap.layout.set': {
    intent: Extract<MindmapIntent, { type: 'mindmap.layout.set' }>
    output: void
  }
  'mindmap.move': {
    intent: Extract<MindmapIntent, { type: 'mindmap.move' }>
    output: void
  }
  'mindmap.topic.insert': {
    intent: Extract<MindmapIntent, { type: 'mindmap.topic.insert' }>
    output: { nodeId: MindmapNodeId }
  }
  'mindmap.topic.move': {
    intent: Extract<MindmapIntent, { type: 'mindmap.topic.move' }>
    output: void
  }
  'mindmap.topic.delete': {
    intent: Extract<MindmapIntent, { type: 'mindmap.topic.delete' }>
    output: void
  }
  'mindmap.topic.clone': {
    intent: Extract<MindmapIntent, { type: 'mindmap.topic.clone' }>
    output: {
      nodeId: MindmapNodeId
      map: Record<MindmapNodeId, MindmapNodeId>
    }
  }
  'mindmap.topic.update': {
    intent: Extract<MindmapIntent, { type: 'mindmap.topic.update' }>
    output: void
  }
  'mindmap.topic.collapse.set': {
    intent: Extract<MindmapIntent, { type: 'mindmap.topic.collapse.set' }>
    output: void
  }
  'mindmap.branch.update': {
    intent: Extract<MindmapIntent, { type: 'mindmap.branch.update' }>
    output: void
  }
}

export type WhiteboardIntentKind = keyof WhiteboardIntentTable & string

export type WhiteboardMutationTable = {
  [K in WhiteboardIntentKind]: {
    intent: WhiteboardIntentTable[K]['intent']
    output: WhiteboardIntentTable[K]['output']
  }
}

export type WhiteboardIntent<K extends WhiteboardIntentKind = WhiteboardIntentKind> =
  WhiteboardIntentTable[K]['intent']

export type WhiteboardIntentOutput<K extends WhiteboardIntentKind = WhiteboardIntentKind> =
  WhiteboardIntentTable[K]['output']

export type ReplaceDocumentIntent = Extract<
  WhiteboardIntent,
  { type: 'document.replace' }
>
