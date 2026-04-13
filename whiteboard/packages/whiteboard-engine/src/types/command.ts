import type {
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
  MindmapUpdateNodeInput,
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
import type { CommandResult } from './result'

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

export type EngineCommand =
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
      type: 'document.delete'
      refs: CanvasItemRef[]
    }
  | {
      type: 'document.duplicate'
      refs: CanvasItemRef[]
    }
  | {
      type: 'document.background.set'
      background?: Document['background']
    }
  | {
      type: 'document.order'
      mode: OrderMode
      refs: CanvasItemRef[]
    }
  | {
      type: 'node.create'
      payload: NodeInput
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
      payload: EdgeInput
    }
  | {
      type: 'edge.move'
      edgeId: EdgeId
      delta: Point
    }
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
      payload?: MindmapCreateInput
    }
  | {
      type: 'mindmap.delete'
      ids: MindmapId[]
    }
  | {
      type: 'mindmap.insert'
      id: MindmapId
      input: MindmapInsertInput
    }
  | {
      type: 'mindmap.move'
      id: MindmapId
      input: MindmapMoveSubtreeInput
    }
  | {
      type: 'mindmap.remove'
      id: MindmapId
      input: MindmapRemoveSubtreeInput
    }
  | {
      type: 'mindmap.clone'
      id: MindmapId
      input: MindmapCloneSubtreeInput
    }
  | {
      type: 'mindmap.patchNode'
      id: MindmapId
      input: MindmapUpdateNodeInput
    }

export type ReplaceDocumentCommand = Extract<
  EngineCommand,
  { type: 'document.replace' }
>

export type TranslateCommand = Exclude<EngineCommand, ReplaceDocumentCommand>

export type DocumentCommand = Extract<EngineCommand, { type: `document.${string}` }>
export type NodeCommand = Extract<EngineCommand, { type: `node.${string}` }>
export type GroupCommand = Extract<EngineCommand, { type: `group.${string}` }>
export type EdgeCommand = Extract<EngineCommand, { type: `edge.${string}` }>
export type MindmapCommand = Extract<EngineCommand, { type: `mindmap.${string}` }>

export type CommandOutput<C extends EngineCommand> =
  C extends { type: 'document.insert' | 'document.duplicate' }
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
                  : C extends { type: 'mindmap.insert' }
                    ? { nodeId: MindmapNodeId }
                    : C extends { type: 'mindmap.clone' }
                      ? {
                          nodeId: MindmapNodeId
                          map: Record<MindmapNodeId, MindmapNodeId>
                        }
                      : void

export type ExecuteOptions = {
  origin?: Origin
}

export type ExecuteResult<
  C extends EngineCommand = EngineCommand
> = CommandResult<CommandOutput<C>>
