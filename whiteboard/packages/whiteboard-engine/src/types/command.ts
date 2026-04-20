import type {
  CanvasItemRef,
  Document,
  EdgeEnd,
  EdgeId,
  EdgeInput,
  EdgeLabelAnchor,
  EdgeLabelUpdateInput,
  EdgeRoutePointAnchor,
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
  Point
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
import type { CommandResult } from '@whiteboard/engine/types/result'

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

export type DocumentCommand =
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

export type CanvasCommand =
  | {
      type: 'canvas.delete'
      refs: readonly CanvasItemRef[]
    }
  | {
      type: 'canvas.duplicate'
      refs: readonly CanvasItemRef[]
    }
  | {
      type: 'canvas.order.move'
      refs: readonly CanvasItemRef[]
      mode: OrderMode
    }

export type NodeCommand =
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

export type GroupCommand =
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

export type EdgeCommand =
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
      type: 'edge.reconnect'
      edgeId: EdgeId
      end: 'source' | 'target'
      target: EdgeEnd
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
      route: import('@whiteboard/core/types').EdgeRouteInput
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

export type MindmapCommand =
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
      type: 'mindmap.root.move'
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

export type Command =
  | DocumentCommand
  | CanvasCommand
  | NodeCommand
  | GroupCommand
  | EdgeCommand
  | MindmapCommand

export type EngineCommand = Command

export type ReplaceDocumentCommand = Extract<
  Command,
  { type: 'document.replace' }
>

export type CommandOutput<C extends Command> =
  C extends { type: 'document.insert' | 'canvas.duplicate' }
    ? Omit<SliceInsertResult, 'operations'>
    : C extends { type: 'node.create' }
      ? { nodeId: NodeId }
      : C extends { type: 'node.duplicate' }
        ? {
            nodeIds: readonly NodeId[]
            edgeIds: readonly EdgeId[]
          }
        : C extends { type: 'group.merge' }
          ? { groupId: GroupId }
          : C extends { type: 'group.ungroup' }
            ? {
                nodeIds: readonly NodeId[]
                edgeIds: readonly EdgeId[]
              }
            : C extends { type: 'edge.create' }
              ? { edgeId: EdgeId }
              : C extends { type: 'edge.label.insert' }
                ? { labelId: string }
                : C extends { type: 'edge.route.insert' }
                  ? { pointId: string }
                  : C extends { type: 'mindmap.create' }
                    ? {
                        mindmapId: MindmapId
                        rootId: MindmapNodeId
                      }
                    : C extends { type: 'mindmap.topic.insert' }
                      ? { nodeId: MindmapNodeId }
                      : C extends { type: 'mindmap.topic.clone' }
                        ? {
                            nodeId: MindmapNodeId
                            map: Record<MindmapNodeId, MindmapNodeId>
                          }
                        : void

export type ExecuteOptions = {
  origin?: Origin
}

export type BatchApplyOptions = ExecuteOptions

export type ExecuteResult<
  C extends Command = Command
> = CommandResult<CommandOutput<C>>
