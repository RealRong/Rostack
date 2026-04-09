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
  EditorMindmapCommands,
  EditorRead
} from '../../types/editor'
import type { NodePatchWriter } from '../node/types'

type MindmapRuntimeHost = {
  read: EditorRead
  document: {
    mindmap: {
      create: EditorMindmapCommands['create']
      delete: EditorMindmapCommands['delete']
      insert: EditorMindmapCommands['insert']
      moveSubtree: EditorMindmapCommands['moveSubtree']
      removeSubtree: EditorMindmapCommands['removeSubtree']
      cloneSubtree: EditorMindmapCommands['cloneSubtree']
      updateNode: EditorMindmapCommands['updateNode']
    }
    node: {
      update: NodePatchWriter['update']
    }
  }
}

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
  editor: MindmapRuntimeHost
  nodeId: NodeId
}) => {
  const node = editor.read.index.node.get(nodeId)?.node
  return node && 'position' in node
    ? node.position
    : undefined
}

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
  editor: MindmapRuntimeHost
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
    return editor.document.mindmap.insert(id, {
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
    return editor.document.mindmap.insert(id, {
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
    return editor.document.mindmap.insert(id, {
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
  editor: MindmapRuntimeHost
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

  return editor.document.mindmap.moveSubtree(id, {
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
  editor: MindmapRuntimeHost
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

  return editor.document.node.update(nodeId, {
    fields: {
      position: {
        x: position.x,
        y: position.y
      }
    }
  })
}

export const createMindmapRuntime = ({
  engine,
  runtimeHost
}: {
  engine: Engine
  runtimeHost: MindmapRuntimeHost
}): EditorMindmapCommands => ({
  create: (payload) => engine.execute({
    type: 'mindmap.create',
    payload
  }),
  delete: (ids) => engine.execute({
    type: 'mindmap.delete',
    ids
  }),
  insert: (id, input) => engine.execute({
    type: 'mindmap.insert',
    id,
    input
  }),
  moveSubtree: (id, input) => engine.execute({
    type: 'mindmap.move',
    id,
    input
  }),
  removeSubtree: (id, input) => engine.execute({
    type: 'mindmap.remove',
    id,
    input
  }),
  cloneSubtree: (id, input) => engine.execute({
    type: 'mindmap.clone',
    id,
    input
  }),
  updateNode: (id, input) => engine.execute({
    type: 'mindmap.patchNode',
    id,
    input
  }),
  insertByPlacement: (input) => insertMindmapByPlacement({
    editor: runtimeHost,
    ...input
  }),
  moveByDrop: (input) => moveMindmapByDrop({
    editor: runtimeHost,
    ...input
  }),
  moveRoot: (input) => moveMindmapRoot({
    editor: runtimeHost,
    ...input
  })
})
