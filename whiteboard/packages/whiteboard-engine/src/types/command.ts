import type {
  MindmapBranchPatch,
  CanvasItemRef,
  Document,
  EdgeEnd,
  EdgeId,
  EdgeInput,
  EdgePatch,
  GroupId,
  MindmapCloneSubtreeInput,
  MindmapCreateInput,
  MindmapId,
  MindmapInsertInput,
  MindmapMoveSubtreeInput,
  MindmapNodeId,
  MindmapRemoveSubtreeInput,
  MindmapTopicPatch,
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
  update: NodeUpdateInput
}

export type NodeMoveInput = {
  ids: readonly NodeId[]
  delta: Point
}

export type NodeUpdateManyOptions = {
  origin?: Origin
}

export type EdgeBatchUpdate = {
  id: EdgeId
  patch: EdgePatch
}

export type EdgeMoveInput = {
  ids: readonly EdgeId[]
  delta: Point
}

export type Command =
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
      type: 'canvas.delete'
      refs: CanvasItemRef[]
    }
  | {
      type: 'canvas.duplicate'
      refs: CanvasItemRef[]
    }
  | {
      type: 'document.background'
      background?: Document['background']
    }
  | {
      type: 'canvas.order'
      mode: OrderMode
      refs: CanvasItemRef[]
    }
  | {
      type: 'node.create'
      input: NodeInput
    }
  | {
      type: 'node.move'
      ids: readonly NodeId[]
      delta: Point
    }
  | {
      type: 'node.patch'
      updates: readonly NodeBatchUpdate[]
      origin?: Origin
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
      ids: NodeId[]
    }
  | {
      type: 'node.deleteCascade'
      ids: NodeId[]
    }
  | {
      type: 'node.duplicate'
      ids: NodeId[]
    }
  | {
      type: 'group.merge'
      target: {
        nodeIds?: readonly NodeId[]
        edgeIds?: readonly EdgeId[]
      }
    }
  | {
      type: 'group.order'
      mode: OrderMode
      ids: GroupId[]
    }
  | {
      type: 'group.ungroup'
      id: GroupId
    }
  | {
      type: 'group.ungroupMany'
      ids: GroupId[]
    }
  | {
      type: 'edge.create'
      input: EdgeInput
    }
  | {
      type: 'edge.move'
    } & EdgeMoveInput
  | {
      type: 'edge.reconnect'
      edgeId: EdgeId
      end: 'source' | 'target'
      target: EdgeEnd
    }
  | {
      type: 'edge.patch'
      updates: readonly EdgeBatchUpdate[]
    }
  | {
      type: 'edge.delete'
      ids: EdgeId[]
    }
  | {
      type: 'edge.route.insert'
      edgeId: EdgeId
      point: Point
    }
  | {
      type: 'edge.route.move'
      edgeId: EdgeId
      index: number
      point: Point
    }
  | {
      type: 'edge.route.remove'
      edgeId: EdgeId
      index: number
    }
  | {
      type: 'edge.route.clear'
      edgeId: EdgeId
    }
  | {
      type: 'mindmap.create'
      input: MindmapCreateInput
    }
  | {
      type: 'mindmap.delete'
      ids: MindmapId[]
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
      type: 'mindmap.layout'
      id: MindmapId
      patch: Partial<import('@whiteboard/core/types').MindmapLayoutSpec>
    }
  | {
      type: 'mindmap.topic.patch'
      id: MindmapId
      topicIds: NodeId[]
      patch: MindmapTopicPatch
    }
  | {
      type: 'mindmap.branch.patch'
      id: MindmapId
      topicIds: NodeId[]
      patch: MindmapBranchPatch
    }
  | {
      type: 'mindmap.topic.collapse'
      id: MindmapId
      topicId: NodeId
      collapsed?: boolean
    }

export type EngineCommand = Command

export type ReplaceDocumentCommand = Extract<
  Command,
  { type: 'document.replace' }
>

export type DocumentCommand = Extract<Command, { type: `document.${string}` }>
export type CanvasCommand = Extract<Command, { type: `canvas.${string}` }>
export type NodeCommand = Extract<Command, { type: `node.${string}` }>
export type GroupCommand = Extract<Command, { type: `group.${string}` }>
export type EdgeCommand = Extract<Command, { type: `edge.${string}` }>
export type MindmapCommand = Extract<Command, { type: `mindmap.${string}` }>

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
          : C extends { type: 'group.ungroup' | 'group.ungroupMany' }
            ? {
                nodeIds: readonly NodeId[]
                edgeIds: readonly EdgeId[]
              }
            : C extends { type: 'edge.create' }
              ? { edgeId: EdgeId }
              : C extends { type: 'edge.route.insert' }
                ? { index: number }
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
