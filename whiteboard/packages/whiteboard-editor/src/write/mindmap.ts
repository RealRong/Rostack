import type { Engine } from '@whiteboard/engine'
import {
  DEFAULT_ROOT_MOVE_THRESHOLD,
  resolveInsertPlan,
  shouldMoveMindmapRoot as shouldCommitMindmapRootMove,
  shouldMoveMindmapSubtree,
  type MindmapInsertPlacement,
  type MindmapLayoutConfig
} from '@whiteboard/core/mindmap'
import type {
  MindmapInsertPayload,
  MindmapNodeData,
  MindmapNodeId,
  MindmapTree,
  NodeId,
  Point,
  Size
} from '@whiteboard/core/types'
import type {
  EditorRead
} from '../types/editor'
import type { MindmapCommands } from '../types/commands'
import type { NodeCommands } from './node/types'

type MindmapHost = {
  read: EditorRead
  commands: Pick<
    MindmapCommands,
    'create' | 'delete' | 'insert' | 'moveSubtree' | 'removeSubtree' | 'cloneSubtree' | 'updateNode'
  >
  node: Pick<NodeCommands, 'update'>
}

type MindmapExecute = Engine['execute']

const DEFAULT_MINDMAP_SIDE: 'left' | 'right' = 'right'

const createLayoutHint = ({
  anchorId,
  nodeSize,
  layout
}: {
  anchorId: MindmapNodeId
  nodeSize: Size
  layout: MindmapLayoutConfig
}) => ({
  nodeSize,
  mode: layout.mode,
  options: layout.options,
  anchorId
})

const readNodePosition = ({
  editor,
  nodeId
}: {
  editor: MindmapHost
  nodeId: NodeId
}) => editor.read.mindmap.rootPosition.get(nodeId)

export const insertMindmapByPlacement = ({
  editor,
  id,
  tree,
  targetNodeId,
  placement,
  nodeSize,
  layout,
  payload
}: {
  editor: MindmapHost
  id: NodeId
  tree: MindmapTree
  targetNodeId: MindmapNodeId
  placement: MindmapInsertPlacement
  nodeSize: Size
  layout: MindmapLayoutConfig
  payload?: MindmapNodeData | MindmapInsertPayload
}) => {
  const normalizedPayload: MindmapNodeData | MindmapInsertPayload = payload ?? {
    kind: 'text',
    text: ''
  }
  const hint = createLayoutHint({
    anchorId: targetNodeId,
    nodeSize,
    layout
  })
  const plan = resolveInsertPlan({
    tree,
    targetNodeId,
    placement,
    layoutSide: layout.options?.side,
    defaultSide: DEFAULT_MINDMAP_SIDE
  })

  if (plan.mode === 'child') {
    return editor.commands.insert(id, {
      kind: 'child',
      parentId: plan.parentId,
      payload: normalizedPayload,
      options: {
        index: plan.index,
        side: plan.side,
        layout: hint
      }
    })
  }

  if (plan.mode === 'sibling') {
    return editor.commands.insert(id, {
      kind: 'sibling',
      nodeId: plan.nodeId,
      position: plan.position,
      payload: normalizedPayload,
      options: {
        layout: hint
      }
    })
  }

  if (plan.mode === 'towardRoot') {
    return editor.commands.insert(id, {
      kind: 'parent',
      nodeId: plan.nodeId,
      payload: normalizedPayload,
      options: {
        layout: hint
      }
    })
  }

  return undefined
}

export const moveMindmapByDrop = ({
  editor,
  id,
  nodeId,
  drop,
  origin,
  nodeSize,
  layout
}: {
  editor: MindmapHost
  id: NodeId
  nodeId: MindmapNodeId
  drop: {
    parentId: MindmapNodeId
    index: number
    side?: 'left' | 'right'
  }
  origin?: {
    parentId?: MindmapNodeId
    index?: number
  }
  nodeSize: Size
  layout: MindmapLayoutConfig
}) => {
  if (!shouldMoveMindmapSubtree({
    drop,
    origin
  })) {
    return undefined
  }

  return editor.commands.moveSubtree(id, {
    nodeId,
    parentId: drop.parentId,
    index: drop.index,
    side: drop.side,
    layout: createLayoutHint({
      anchorId: drop.parentId,
      nodeSize,
      layout
    })
  })
}

export const moveMindmapRoot = ({
  editor,
  nodeId,
  position,
  origin,
  threshold = DEFAULT_ROOT_MOVE_THRESHOLD
}: {
  editor: MindmapHost
  nodeId: NodeId
  position: Point
  origin?: Point
  threshold?: number
}) => {
  const previous = origin ?? readNodePosition({
    editor,
    nodeId
  })
  if (!shouldCommitMindmapRootMove({
    origin: previous,
    position,
    threshold
  })) {
    return undefined
  }

  return editor.node.update(nodeId, {
    fields: {
      position: {
        x: position.x,
        y: position.y
      }
    }
  })
}

const createMindmapCoreCommands = (
  execute: MindmapExecute
): Pick<
  MindmapCommands,
  'create' | 'delete' | 'insert' | 'moveSubtree' | 'removeSubtree' | 'cloneSubtree' | 'updateNode'
> => ({
  create: (payload) => execute({
    type: 'mindmap.create',
    payload
  }),
  delete: (ids) => execute({
    type: 'mindmap.delete',
    ids
  }),
  insert: (id, input) => execute({
    type: 'mindmap.insert',
    id,
    input
  }),
  moveSubtree: (id, input) => execute({
    type: 'mindmap.move',
    id,
    input
  }),
  removeSubtree: (id, input) => execute({
    type: 'mindmap.remove',
    id,
    input
  }),
  cloneSubtree: (id, input) => execute({
    type: 'mindmap.clone',
    id,
    input
  }),
  updateNode: (id, input) => execute({
    type: 'mindmap.patchNode',
    id,
    input
  })
})

export const createMindmapCommands = ({
  execute,
  read,
  node
}: {
  execute: MindmapExecute
  read: EditorRead
  node: Pick<NodeCommands, 'update'>
}): MindmapCommands => {
  const commands = createMindmapCoreCommands(execute)

  return {
    ...commands,
    insertByPlacement: (input) => insertMindmapByPlacement({
      editor: {
        read,
        commands,
        node
      },
      ...input
    }),
    moveByDrop: (input) => moveMindmapByDrop({
      editor: {
        read,
        commands,
        node
      },
      ...input
    }),
    moveRoot: (input) => moveMindmapRoot({
      editor: {
        read,
        commands,
        node
      },
      ...input
    })
  }
}
