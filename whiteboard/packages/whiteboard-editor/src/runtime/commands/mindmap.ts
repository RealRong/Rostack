import type { EngineInstance } from '@whiteboard/engine'
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
  EditorNodeDocumentCommands,
  EditorRead
} from '../../types/editor'

type MindmapWriteHost = {
  read: EditorRead
  document: {
    mindmap: EngineInstance['commands']['mindmap']
    node: {
      document: EditorNodeDocumentCommands
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
  editor: MindmapWriteHost
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
  editor: MindmapWriteHost
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
  editor: MindmapWriteHost
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
  editor: MindmapWriteHost
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

  return editor.document.node.document.update(nodeId, {
    fields: {
      position: {
        x: position.x,
        y: position.y
      }
    }
  })
}

export const createMindmapWrite = ({
  engine,
  writerHost
}: {
  engine: EngineInstance
  writerHost: MindmapWriteHost
}): EditorMindmapCommands => ({
  ...engine.commands.mindmap,
  insertByPlacement: (input) => insertMindmapByPlacement({
    editor: writerHost,
    ...input
  }),
  moveByDrop: (input) => moveMindmapByDrop({
    editor: writerHost,
    ...input
  }),
  moveRoot: (input) => moveMindmapRoot({
    editor: writerHost,
    ...input
  })
})
