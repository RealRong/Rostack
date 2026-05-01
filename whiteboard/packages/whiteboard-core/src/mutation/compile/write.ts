import type {
  Document,
  DocumentPatch,
  Edge,
  EdgeId,
  EdgeLabel,
  EdgeLabelAnchor,
  EdgeLabelPatch,
  EdgePatch,
  EdgeRoutePoint,
  EdgeRoutePointAnchor,
  Group,
  GroupId,
  GroupPatch,
  MindmapId,
  MindmapRecord,
  Node,
  NodeId,
  NodePatch,
} from '@whiteboard/core/types'
import type {
  MutationOrderedAnchor,
  MutationTreeSubtreeSnapshot,
} from '@shared/mutation'
import {
  canvasRefKey,
  toMutationOrderedAnchor,
  type WhiteboardMindmapTreeValue,
} from '@whiteboard/core/mutation/targets'
import type {
  WhiteboardMutationPorts
} from './helpers'

const toOrderedAnchor = (
  input: MutationOrderedAnchor | EdgeLabelAnchor | EdgeRoutePointAnchor
): MutationOrderedAnchor => (
  'kind' in input
  && (input.kind === 'before' || input.kind === 'after')
  && !('itemId' in input)
)
  ? toMutationOrderedAnchor(input)
  : input as MutationOrderedAnchor

export const writeDocumentCreate = (
  program: WhiteboardMutationPorts,
  value: Document
) => {
  program.document.create(value)
}

export const writeDocumentPatch = (
  program: WhiteboardMutationPorts,
  patch: DocumentPatch
) => {
  program.document.patch(patch)
}

export const writeNodeCreate = (
  program: WhiteboardMutationPorts,
  value: Node
) => {
  program.node.create(value)
}

export const writeNodePatch = (
  program: WhiteboardMutationPorts,
  id: NodeId,
  patch: NodePatch
) => {
  program.node.patch(id, patch)
}

export const writeNodeDelete = (
  program: WhiteboardMutationPorts,
  id: NodeId
) => {
  program.node.delete(id)
}

export const writeEdgeCreate = (
  program: WhiteboardMutationPorts,
  value: Edge
) => {
  program.edge.create(value)
}

export const writeEdgePatch = (
  program: WhiteboardMutationPorts,
  id: EdgeId,
  patch: EdgePatch
) => {
  program.edge.patch(id, patch)
}

export const writeEdgeDelete = (
  program: WhiteboardMutationPorts,
  id: EdgeId
) => {
  program.edge.delete(id)
}

export const writeGroupCreate = (
  program: WhiteboardMutationPorts,
  value: Group
) => {
  program.group.create(value)
}

export const writeGroupPatch = (
  program: WhiteboardMutationPorts,
  id: GroupId,
  patch: GroupPatch
) => {
  program.group.patch(id, patch)
}

export const writeGroupDelete = (
  program: WhiteboardMutationPorts,
  id: GroupId
) => {
  program.group.delete(id)
}

export const writeMindmapCreate = (
  program: WhiteboardMutationPorts,
  value: MindmapRecord
) => {
  program.mindmap.create(value)
}

export const writeMindmapPatch = (
  program: WhiteboardMutationPorts,
  id: MindmapId,
  patch: Partial<Omit<MindmapRecord, 'id'>>
) => {
  program.mindmap.patch(id, patch)
}

export const writeMindmapDelete = (
  program: WhiteboardMutationPorts,
  id: MindmapId
) => {
  program.mindmap.delete(id)
}

export const writeCanvasOrderMove = (
  program: WhiteboardMutationPorts,
  ref: { kind: 'node' | 'edge' | 'mindmap'; id: string },
  to: MutationOrderedAnchor
) => {
  program.canvasOrder().move(canvasRefKey(ref), to)
}

export const writeCanvasOrderSplice = (
  program: WhiteboardMutationPorts,
  refs: readonly { kind: 'node' | 'edge' | 'mindmap'; id: string }[],
  to: MutationOrderedAnchor
) => {
  program.canvasOrder().splice(refs.map((ref) => canvasRefKey(ref)), to)
}

export const writeCanvasOrderDelete = (
  program: WhiteboardMutationPorts,
  ref: { kind: 'node' | 'edge' | 'mindmap'; id: string }
) => {
  program.canvasOrder().delete(canvasRefKey(ref))
}

export const writeEdgeLabelInsert = (
  program: WhiteboardMutationPorts,
  edgeId: EdgeId,
  label: EdgeLabel,
  to: EdgeLabelAnchor | MutationOrderedAnchor
) => {
  program.edgeLabels(edgeId).insert(label, toOrderedAnchor(to))
}

export const writeEdgeLabelMove = (
  program: WhiteboardMutationPorts,
  edgeId: EdgeId,
  labelId: string,
  to: EdgeLabelAnchor | MutationOrderedAnchor
) => {
  program.edgeLabels(edgeId).move(labelId, toOrderedAnchor(to))
}

export const writeEdgeLabelPatch = (
  program: WhiteboardMutationPorts,
  edgeId: EdgeId,
  labelId: string,
  patch: EdgeLabelPatch
) => {
  program.edgeLabels(edgeId).patch(labelId, patch)
}

export const writeEdgeLabelDelete = (
  program: WhiteboardMutationPorts,
  edgeId: EdgeId,
  labelId: string
) => {
  program.edgeLabels(edgeId).delete(labelId)
}

export const writeEdgeRouteInsert = (
  program: WhiteboardMutationPorts,
  edgeId: EdgeId,
  point: EdgeRoutePoint,
  to: EdgeRoutePointAnchor | MutationOrderedAnchor
) => {
  program.edgeRoute(edgeId).insert(point, toOrderedAnchor(to))
}

export const writeEdgeRouteMove = (
  program: WhiteboardMutationPorts,
  edgeId: EdgeId,
  pointId: string,
  to: EdgeRoutePointAnchor | MutationOrderedAnchor
) => {
  program.edgeRoute(edgeId).move(pointId, toOrderedAnchor(to))
}

export const writeEdgeRoutePatch = (
  program: WhiteboardMutationPorts,
  edgeId: EdgeId,
  pointId: string,
  patch: Partial<Omit<EdgeRoutePoint, 'id'>>
) => {
  program.edgeRoute(edgeId).patch(pointId, patch)
}

export const writeEdgeRouteDelete = (
  program: WhiteboardMutationPorts,
  edgeId: EdgeId,
  pointId: string
) => {
  program.edgeRoute(edgeId).delete(pointId)
}

export const writeMindmapTreeInsert = (
  program: WhiteboardMutationPorts,
  input: {
    mindmapId: MindmapId
    nodeId: NodeId
    parentId?: NodeId
    index?: number
    value?: WhiteboardMindmapTreeValue
  }
) => {
  program.mindmapTree(input.mindmapId).insert(
    input.nodeId,
    input.parentId,
    input.index,
    input.value
  )
}

export const writeMindmapTreeMove = (
  program: WhiteboardMutationPorts,
  input: {
    mindmapId: MindmapId
    nodeId: NodeId
    parentId?: NodeId
    index?: number
  }
) => {
  program.mindmapTree(input.mindmapId).move(
    input.nodeId,
    input.parentId,
    input.index
  )
}

export const writeMindmapTreeDelete = (
  program: WhiteboardMutationPorts,
  mindmapId: MindmapId,
  nodeId: NodeId
) => {
  program.mindmapTree(mindmapId).delete(nodeId)
}

export const writeMindmapTreeRestore = (
  program: WhiteboardMutationPorts,
  mindmapId: MindmapId,
  snapshot: MutationTreeSubtreeSnapshot<WhiteboardMindmapTreeValue>
) => {
  program.mindmapTree(mindmapId).restore(snapshot)
}

export const writeMindmapTreePatch = (
  program: WhiteboardMutationPorts,
  mindmapId: MindmapId,
  nodeId: NodeId,
  patch: Partial<WhiteboardMindmapTreeValue>
) => {
  program.mindmapTree(mindmapId).patch(nodeId, patch)
}
