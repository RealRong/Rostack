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
  | {
      type: 'group.create'
      target: {
        nodeIds?: readonly NodeId[]
        edgeIds?: readonly EdgeId[]
      }
    }
  | {
      type: 'group.ungroup'
      id: NodeId
    }
  | {
      type: 'group.ungroupMany'
      ids: NodeId[]
    }
  | {
      type: 'order'
      mode: 'set' | 'front' | 'back' | 'forward' | 'backward'
      ids: NodeId[]
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
      type: 'order'
      mode: 'set' | 'front' | 'back' | 'forward' | 'backward'
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
  | 'edge'
  | 'mindmap'

export type WriteCommandMap = {
  document: DocumentWriteCommand
  node: NodeWriteCommand
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
    : void

export type NodeWriteOutput<C extends NodeWriteCommand = NodeWriteCommand> =
  C extends { type: 'create' }
    ? { nodeId: NodeId }
    : C extends { type: 'duplicate' }
      ? {
          nodeIds: readonly NodeId[]
          edgeIds: readonly EdgeId[]
        }
      : C extends { type: 'group.create' }
        ? { groupId: GroupId }
        : C extends ({ type: 'group.ungroup' } | { type: 'group.ungroupMany' })
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

export type EngineCommands = {
  document: {
    replace: (document: Document) => CommandResult
    insert: (
      slice: Slice,
      options?: SliceInsertOptions
    ) => CommandResult<Omit<SliceInsertResult, 'operations'>>
    background: {
      set: (background?: Document['background']) => CommandResult
    }
  }
  canvas: {
    order: {
      set: (refs: CanvasItemRef[]) => CommandResult
      bringToFront: (refs: CanvasItemRef[]) => CommandResult
      sendToBack: (refs: CanvasItemRef[]) => CommandResult
      bringForward: (refs: CanvasItemRef[]) => CommandResult
      sendBackward: (refs: CanvasItemRef[]) => CommandResult
    }
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
    order: {
      set: (ids: EdgeId[]) => CommandResult
      bringToFront: (ids: EdgeId[]) => CommandResult
      sendToBack: (ids: EdgeId[]) => CommandResult
      bringForward: (ids: EdgeId[]) => CommandResult
      sendBackward: (ids: EdgeId[]) => CommandResult
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
    group: {
      create: (target: {
        nodeIds?: readonly NodeId[]
        edgeIds?: readonly EdgeId[]
      }) => CommandResult<{ groupId: GroupId }>
      ungroup: (id: NodeId) => CommandResult<{
        nodeIds: readonly NodeId[]
        edgeIds: readonly EdgeId[]
      }>
      ungroupMany: (ids: NodeId[]) => CommandResult<{
        nodeIds: readonly NodeId[]
        edgeIds: readonly EdgeId[]
      }>
    }
    order: {
      set: (ids: NodeId[]) => CommandResult
      bringToFront: (ids: NodeId[]) => CommandResult
      sendToBack: (ids: NodeId[]) => CommandResult
      bringForward: (ids: NodeId[]) => CommandResult
      sendBackward: (ids: NodeId[]) => CommandResult
    }
  }
  mindmap: MindmapCommands
}
