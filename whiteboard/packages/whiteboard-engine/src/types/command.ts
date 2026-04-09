import type {
  CanvasItemRef,
  Document,
  EdgeEnd,
  EdgeId,
  EdgeInput,
  EdgePatch,
  GroupId,
  MindmapId,
  MindmapNodeId,
  NodeId,
  NodeInput,
  NodeUpdateInput,
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
import type {
  MindmapApplyCommand,
  MindmapCloneSubtreeInput,
  MindmapCreateOptions,
  MindmapInsertOptions,
  MindmapMoveSubtreeInput,
  MindmapRemoveSubtreeInput,
  MindmapUpdateNodeInput
} from './mindmap'
import type { HistoryState } from '@whiteboard/core/kernel'
import type { CommandResult } from './result'

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

export type CanvasOrderMode =
  | 'set'
  | 'front'
  | 'back'
  | 'forward'
  | 'backward'

export type DocumentWriteCommand =
  | {
      type: 'insert'
      slice: Slice
      options?: SliceInsertOptions
    }
  | {
      type: 'delete'
      refs: CanvasItemRef[]
    }
  | {
      type: 'duplicate'
      refs: CanvasItemRef[]
    }
  | {
      type: 'background'
      background?: Document['background']
    }
  | {
      type: 'order'
      mode: CanvasOrderMode
      refs: CanvasItemRef[]
    }

export type NodeWriteCommand =
  | {
      type: 'create'
      payload: NodeInput
    }
  | {
      type: 'move'
      ids: readonly NodeId[]
      delta: Point
    }
  | {
      type: 'updateMany'
      updates: readonly NodeBatchUpdate[]
    }
  | {
      type: 'align'
      ids: readonly NodeId[]
      mode: NodeAlignMode
    }
  | {
      type: 'distribute'
      ids: readonly NodeId[]
      mode: NodeDistributeMode
    }
  | {
      type: 'delete'
      ids: NodeId[]
    }
  | {
      type: 'deleteCascade'
      ids: NodeId[]
    }
  | {
      type: 'duplicate'
      ids: NodeId[]
    }

export type GroupWriteCommand =
  | {
      type: 'merge'
      target: {
        nodeIds?: readonly NodeId[]
        edgeIds?: readonly EdgeId[]
      }
    }
  | {
      type: 'order'
      mode: CanvasOrderMode
      ids: GroupId[]
    }
  | {
      type: 'ungroup'
      id: GroupId
    }
  | {
      type: 'ungroupMany'
      ids: GroupId[]
    }

export type EdgeBatchUpdate = {
  id: EdgeId
  patch: EdgePatch
}

export type EdgeWriteCommand =
  | {
      type: 'create'
      payload: EdgeInput
    }
  | {
      type: 'move'
      edgeId: EdgeId
      delta: Point
    }
  | {
      type: 'updateMany'
      updates: readonly EdgeBatchUpdate[]
    }
  | {
      type: 'delete'
      ids: EdgeId[]
    }
  | {
      type: 'route'
      mode: 'insert' | 'move' | 'remove' | 'clear'
      edgeId: EdgeId
      index?: number
      point?: Point
    }

export type MindmapWriteCommand = MindmapApplyCommand

export type WriteDomain =
  | 'document'
  | 'node'
  | 'group'
  | 'edge'
  | 'mindmap'

export type WriteCommandMap = {
  document: DocumentWriteCommand
  node: NodeWriteCommand
  group: GroupWriteCommand
  edge: EdgeWriteCommand
  mindmap: MindmapWriteCommand
}

export type WriteInput<
  D extends WriteDomain = WriteDomain,
  C extends WriteCommandMap[D] = WriteCommandMap[D]
> = {
  domain: D
  command: C
  origin?: Origin
}

export type DocumentWriteOutput<C extends DocumentWriteCommand = DocumentWriteCommand> =
  C extends { type: 'insert' }
    ? Omit<SliceInsertResult, 'operations'>
    : C extends { type: 'duplicate' }
      ? Omit<SliceInsertResult, 'operations'>
    : void

export type NodeWriteOutput<C extends NodeWriteCommand = NodeWriteCommand> =
  C extends { type: 'create' }
    ? { nodeId: NodeId }
    : C extends { type: 'duplicate' }
      ? {
          nodeIds: readonly NodeId[]
          edgeIds: readonly EdgeId[]
        }
      : void

export type GroupWriteOutput<C extends GroupWriteCommand = GroupWriteCommand> =
  C extends { type: 'merge' }
    ? { groupId: GroupId }
    : C extends ({ type: 'ungroup' } | { type: 'ungroupMany' })
      ? {
          nodeIds: readonly NodeId[]
          edgeIds: readonly EdgeId[]
        }
      : void

export type EdgeWriteOutput<C extends EdgeWriteCommand = EdgeWriteCommand> =
  C extends { type: 'create' }
    ? { edgeId: EdgeId }
    : C extends { type: 'route'; mode: 'insert' }
      ? { index: number }
      : void

export type MindmapWriteOutput<C extends MindmapWriteCommand = MindmapWriteCommand> =
  C extends { type: 'create' }
    ? {
        mindmapId: MindmapId
        rootId: MindmapNodeId
      }
    : C extends { type: 'insert' }
      ? { nodeId: MindmapNodeId }
      : C extends { type: 'clone.subtree' }
        ? {
            nodeId: MindmapNodeId
            map: Record<MindmapNodeId, MindmapNodeId>
          }
        : void

export type WriteOutput<
  D extends WriteDomain,
  C extends WriteCommandMap[D] = WriteCommandMap[D]
> =
  D extends 'document'
    ? DocumentWriteOutput<Extract<C, DocumentWriteCommand>>
    : D extends 'node'
      ? NodeWriteOutput<Extract<C, NodeWriteCommand>>
      : D extends 'group'
        ? GroupWriteOutput<Extract<C, GroupWriteCommand>>
      : D extends 'edge'
      ? EdgeWriteOutput<Extract<C, EdgeWriteCommand>>
      : D extends 'mindmap'
        ? MindmapWriteOutput<Extract<C, MindmapWriteCommand>>
        : never

export type MindmapCommands = {
  create: (payload?: MindmapCreateOptions) => CommandResult<{
    mindmapId: MindmapId
    rootId: MindmapNodeId
  }>
  delete: (ids: MindmapId[]) => CommandResult
  insert: (
    id: MindmapId,
    input: MindmapInsertOptions
  ) => CommandResult<{ nodeId: MindmapNodeId }>
  moveSubtree: (
    id: MindmapId,
    input: MindmapMoveSubtreeInput
  ) => CommandResult
  removeSubtree: (id: MindmapId, input: MindmapRemoveSubtreeInput) => CommandResult
  cloneSubtree: (
    id: MindmapId,
    input: MindmapCloneSubtreeInput
  ) => CommandResult<{
    nodeId: MindmapNodeId
    map: Record<MindmapNodeId, MindmapNodeId>
  }>
  updateNode: (id: MindmapId, input: MindmapUpdateNodeInput) => CommandResult
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
      mode: CanvasOrderMode
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
      mode: CanvasOrderMode
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
      payload?: MindmapCreateOptions
    }
  | {
      type: 'mindmap.delete'
      ids: MindmapId[]
    }
  | {
      type: 'mindmap.insert'
      id: MindmapId
      input: MindmapInsertOptions
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

export type ExecuteOptions = {
  origin?: Origin
}

export type ExecuteResult<
  C extends EngineCommand = EngineCommand
> = CommandResult<
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
>

export type EngineCommands = {
  document: {
    replace: (document: Document) => CommandResult
    insert: (
      slice: Slice,
      options?: SliceInsertOptions
    ) => CommandResult<Omit<SliceInsertResult, 'operations'>>
    delete: (refs: CanvasItemRef[]) => CommandResult
    duplicate: (refs: CanvasItemRef[]) => CommandResult<Omit<SliceInsertResult, 'operations'>>
    background: {
      set: (background?: Document['background']) => CommandResult
    }
  }
  canvas: {
    delete: (refs: CanvasItemRef[]) => CommandResult
    duplicate: (refs: CanvasItemRef[]) => CommandResult<Omit<SliceInsertResult, 'operations'>>
    order: {
      set: (refs: CanvasItemRef[]) => CommandResult
      bringToFront: (refs: CanvasItemRef[]) => CommandResult
      sendToBack: (refs: CanvasItemRef[]) => CommandResult
      bringForward: (refs: CanvasItemRef[]) => CommandResult
      sendBackward: (refs: CanvasItemRef[]) => CommandResult
    }
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
  history: {
    get: () => HistoryState
    undo: () => CommandResult
    redo: () => CommandResult
    clear: () => void
  }
  edge: {
    create: (payload: EdgeInput) => CommandResult<{ edgeId: EdgeId }>
    move: (edgeId: EdgeId, delta: Point) => CommandResult
    reconnect: (
      edgeId: EdgeId,
      end: 'source' | 'target',
      target: EdgeEnd
    ) => CommandResult
    update: (id: EdgeId, patch: EdgePatch) => CommandResult
    updateMany: (updates: readonly EdgeBatchUpdate[]) => CommandResult
    delete: (ids: EdgeId[]) => CommandResult
    route: {
      insert: (edgeId: EdgeId, point: Point) => CommandResult<{ index: number }>
      move: (edgeId: EdgeId, index: number, point: Point) => CommandResult
      remove: (edgeId: EdgeId, index: number) => CommandResult
      clear: (edgeId: EdgeId) => CommandResult
    }
  }
  node: {
    create: (payload: NodeInput) => CommandResult<{ nodeId: NodeId }>
    move: (input: NodeMoveInput) => CommandResult
    update: (id: NodeId, update: NodeUpdateInput) => CommandResult
    updateMany: (
      updates: readonly NodeBatchUpdate[],
      options?: NodeUpdateManyOptions
    ) => CommandResult
    align: (
      ids: readonly NodeId[],
      mode: NodeAlignMode
    ) => CommandResult
    distribute: (
      ids: readonly NodeId[],
      mode: NodeDistributeMode
    ) => CommandResult
    delete: (ids: NodeId[]) => CommandResult
    deleteCascade: (ids: NodeId[]) => CommandResult
    duplicate: (ids: NodeId[]) => CommandResult<{
      nodeIds: readonly NodeId[]
      edgeIds: readonly EdgeId[]
    }>
  }
  mindmap: MindmapCommands
}
