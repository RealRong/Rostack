import type {
  MindmapCloneSubtreeInput as CoreMindmapCloneSubtreeInput,
  MindmapCommandOptions,
  MindmapId,
  MindmapInsertPayload,
  MindmapNodeData,
  MindmapNodeId,
  MindmapMoveSubtreeInput as CoreMindmapMoveSubtreeInput,
  MindmapUpdateNodeInput as CoreMindmapUpdateNodeInput,
  MindmapRemoveSubtreeInput as CoreMindmapRemoveSubtreeInput
} from '@whiteboard/core/types'

export type { MindmapLayoutConfig, MindmapLayoutMode } from '@whiteboard/core/mindmap'

export type MindmapCreateOptions = {
  id?: MindmapId
  rootId?: MindmapNodeId
  rootData?: MindmapNodeData
}

export type MindmapCloneSubtreeInput = CoreMindmapCloneSubtreeInput

export type MindmapInsertOptions =
  | {
      kind: 'child'
      parentId: MindmapNodeId
      payload?: MindmapNodeData | MindmapInsertPayload
      options?: MindmapCommandOptions
    }
  | {
      kind: 'sibling'
      nodeId: MindmapNodeId
      position: 'before' | 'after'
      payload?: MindmapNodeData | MindmapInsertPayload
      options?: Pick<MindmapCommandOptions, 'layout'>
    }
  | {
      kind: 'parent'
      nodeId: MindmapNodeId
      payload?: MindmapNodeData | MindmapInsertPayload
      options?: Pick<MindmapCommandOptions, 'side' | 'layout'>
    }

export type MindmapInsertCommand = {
  type: 'insert'
  id: MindmapId
  input: MindmapInsertOptions
}

export type MindmapMoveSubtreeInput = CoreMindmapMoveSubtreeInput & {
  layout?: MindmapCommandOptions['layout']
}

export type MindmapMoveCommand = {
  type: 'move.subtree'
  id: MindmapId
  input: MindmapMoveSubtreeInput
}

export type MindmapRemoveSubtreeInput = CoreMindmapRemoveSubtreeInput

export type MindmapUpdateNodeInput = CoreMindmapUpdateNodeInput

export type MindmapUpdateCommand = {
  type: 'update.node'
  id: MindmapId
  input: MindmapUpdateNodeInput
}

export type MindmapApplyCommand =
  | {
      type: 'create'
      payload?: MindmapCreateOptions
    }
  | {
      type: 'delete'
      ids: MindmapId[]
    }
  | MindmapInsertCommand
  | MindmapMoveCommand
  | {
      type: 'remove'
      id: MindmapId
      input: MindmapRemoveSubtreeInput
    }
  | {
      type: 'clone.subtree'
      id: MindmapId
      input: MindmapCloneSubtreeInput
    }
  | MindmapUpdateCommand
