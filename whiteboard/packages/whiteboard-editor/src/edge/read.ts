import { edge as edgeApi } from '@whiteboard/core/edge'
import type {
  Edge,
  EdgeId,
  NodeId
} from '@whiteboard/core/types'
import type {
  NodeView,
  Query as EditorSceneQuery
} from '@whiteboard/editor-scene'
import type { NodeTypeSupport } from '@whiteboard/editor/types/node'
import { resolveNodeEditorCapability } from '@whiteboard/editor/types/node'

export type EdgeCapability = {
  move: boolean
  reconnectSource: boolean
  reconnectTarget: boolean
  editRoute: boolean
  editLabel: boolean
}

const EDGE_CAPABILITY_BASE = {
  reconnectSource: true,
  reconnectTarget: true,
  editRoute: true,
  editLabel: true
} as const

export const resolveEdgeCapability = (input: {
  edge: Edge
  readNodeLocked: (nodeId: NodeId) => boolean
}): EdgeCapability => {
  const locked = Boolean(input.edge.locked)
  const relationLocked = [input.edge.source, input.edge.target].some((end) => (
    edgeApi.guard.isNodeEnd(end) && input.readNodeLocked(end.nodeId)
  ))
  const canEdit = !locked

  return {
    ...EDGE_CAPABILITY_BASE,
    reconnectSource: canEdit && !relationLocked,
    reconnectTarget: canEdit && !relationLocked,
    editRoute: canEdit,
    editLabel: canEdit,
    move:
      canEdit
      && edgeApi.guard.isPointEnd(input.edge.source)
      && edgeApi.guard.isPointEnd(input.edge.target)
  }
}

export const readEdgeModel = (
  query: Pick<EditorSceneQuery, 'edge'>,
  edgeId: EdgeId
): Edge | undefined => query.edge.get(edgeId)?.base.edge

export const readEdgeCapability = (
  query: Pick<EditorSceneQuery, 'edge' | 'node'>,
  edgeId: EdgeId
): EdgeCapability | undefined => {
  const edge = readEdgeModel(query, edgeId)
  return edge
    ? resolveEdgeCapability({
        edge,
        readNodeLocked: (nodeId) => Boolean(query.node.get(nodeId)?.base.node.locked)
      })
    : undefined
}

export const readEditableEdgeView = (
  query: Pick<EditorSceneQuery, 'edge' | 'node'>,
  edgeId: EdgeId
) => {
  const view = query.edge.get(edgeId)
  const capability = readEdgeCapability(query, edgeId)
  return view && capability?.editRoute
    ? view
    : undefined
}

export const readConnectableNode = (
  query: Pick<EditorSceneQuery, 'node'>,
  nodeType: NodeTypeSupport,
  nodeId: NodeId
): NodeView | undefined => {
  const current = query.node.get(nodeId)
  if (
    !current
    || current.base.node.locked
    || !resolveNodeEditorCapability(current.base.node, nodeType).connect
  ) {
    return undefined
  }

  return current
}
