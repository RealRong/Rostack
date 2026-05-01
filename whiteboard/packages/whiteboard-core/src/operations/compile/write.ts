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
  MutationProgramWriter,
  MutationTreeSubtreeSnapshot,
} from '@shared/mutation'
import {
  CANVAS_ORDER_STRUCTURE,
  canvasRefKey,
  edgeLabelsStructure,
  edgeRoutePointsStructure,
  mindmapTreeStructure,
  toStructuralOrderedAnchor,
  type WhiteboardMindmapTreeValue,
} from '@whiteboard/core/operations/targets'

const toOrderedAnchor = (
  input: MutationOrderedAnchor | EdgeLabelAnchor | EdgeRoutePointAnchor
): MutationOrderedAnchor => (
  'kind' in input
  && (input.kind === 'before' || input.kind === 'after')
  && !('itemId' in input)
)
  ? toStructuralOrderedAnchor(input)
  : input as MutationOrderedAnchor

export const writeDocumentCreate = (
  program: MutationProgramWriter<string>,
  value: Document
) => {
  program.entity.create({
    table: 'document',
    id: 'document'
  }, value)
}

export const writeDocumentPatch = (
  program: MutationProgramWriter<string>,
  patch: DocumentPatch
) => {
  program.entity.patch({
    table: 'document',
    id: 'document'
  }, patch)
}

export const writeNodeCreate = (
  program: MutationProgramWriter<string>,
  value: Node
) => {
  program.entity.create({
    table: 'node',
    id: value.id
  }, value)
}

export const writeNodePatch = (
  program: MutationProgramWriter<string>,
  id: NodeId,
  patch: NodePatch
) => {
  program.entity.patch({
    table: 'node',
    id
  }, patch)
}

export const writeNodeDelete = (
  program: MutationProgramWriter<string>,
  id: NodeId
) => {
  program.entity.delete({
    table: 'node',
    id
  })
}

export const writeEdgeCreate = (
  program: MutationProgramWriter<string>,
  value: Edge
) => {
  program.entity.create({
    table: 'edge',
    id: value.id
  }, value)
}

export const writeEdgePatch = (
  program: MutationProgramWriter<string>,
  id: EdgeId,
  patch: EdgePatch
) => {
  program.entity.patch({
    table: 'edge',
    id
  }, patch)
}

export const writeEdgeDelete = (
  program: MutationProgramWriter<string>,
  id: EdgeId
) => {
  program.entity.delete({
    table: 'edge',
    id
  })
}

export const writeGroupCreate = (
  program: MutationProgramWriter<string>,
  value: Group
) => {
  program.entity.create({
    table: 'group',
    id: value.id
  }, value)
}

export const writeGroupPatch = (
  program: MutationProgramWriter<string>,
  id: GroupId,
  patch: GroupPatch
) => {
  program.entity.patch({
    table: 'group',
    id
  }, patch)
}

export const writeGroupDelete = (
  program: MutationProgramWriter<string>,
  id: GroupId
) => {
  program.entity.delete({
    table: 'group',
    id
  })
}

export const writeMindmapCreate = (
  program: MutationProgramWriter<string>,
  value: MindmapRecord
) => {
  program.entity.create({
    table: 'mindmap',
    id: value.id
  }, value)
}

export const writeMindmapPatch = (
  program: MutationProgramWriter<string>,
  id: MindmapId,
  patch: Partial<Omit<MindmapRecord, 'id'>>
) => {
  program.entity.patch({
    table: 'mindmap',
    id
  }, patch)
}

export const writeMindmapDelete = (
  program: MutationProgramWriter<string>,
  id: MindmapId
) => {
  program.entity.delete({
    table: 'mindmap',
    id
  })
}

export const writeCanvasOrderMove = (
  program: MutationProgramWriter<string>,
  ref: { kind: 'node' | 'edge' | 'mindmap'; id: string },
  to: MutationOrderedAnchor
) => {
  program.ordered.move(
    CANVAS_ORDER_STRUCTURE,
    canvasRefKey(ref),
    to
  )
}

export const writeCanvasOrderSplice = (
  program: MutationProgramWriter<string>,
  refs: readonly { kind: 'node' | 'edge' | 'mindmap'; id: string }[],
  to: MutationOrderedAnchor
) => {
  program.ordered.splice(
    CANVAS_ORDER_STRUCTURE,
    refs.map((ref) => canvasRefKey(ref)),
    to
  )
}

export const writeCanvasOrderDelete = (
  program: MutationProgramWriter<string>,
  ref: { kind: 'node' | 'edge' | 'mindmap'; id: string }
) => {
  program.ordered.delete(
    CANVAS_ORDER_STRUCTURE,
    canvasRefKey(ref)
  )
}

export const writeEdgeLabelInsert = (
  program: MutationProgramWriter<string>,
  edgeId: EdgeId,
  label: EdgeLabel,
  to: EdgeLabelAnchor | MutationOrderedAnchor
) => {
  program.ordered.insert(
    edgeLabelsStructure(edgeId),
    label.id,
    label,
    toOrderedAnchor(to)
  )
}

export const writeEdgeLabelMove = (
  program: MutationProgramWriter<string>,
  edgeId: EdgeId,
  labelId: string,
  to: EdgeLabelAnchor | MutationOrderedAnchor
) => {
  program.ordered.move(
    edgeLabelsStructure(edgeId),
    labelId,
    toOrderedAnchor(to)
  )
}

export const writeEdgeLabelPatch = (
  program: MutationProgramWriter<string>,
  edgeId: EdgeId,
  labelId: string,
  patch: EdgeLabelPatch
) => {
  program.ordered.patch(
    edgeLabelsStructure(edgeId),
    labelId,
    patch
  )
}

export const writeEdgeLabelDelete = (
  program: MutationProgramWriter<string>,
  edgeId: EdgeId,
  labelId: string
) => {
  program.ordered.delete(
    edgeLabelsStructure(edgeId),
    labelId
  )
}

export const writeEdgeRouteInsert = (
  program: MutationProgramWriter<string>,
  edgeId: EdgeId,
  point: EdgeRoutePoint,
  to: EdgeRoutePointAnchor | MutationOrderedAnchor
) => {
  program.ordered.insert(
    edgeRoutePointsStructure(edgeId),
    point.id,
    point,
    toOrderedAnchor(to)
  )
}

export const writeEdgeRouteMove = (
  program: MutationProgramWriter<string>,
  edgeId: EdgeId,
  pointId: string,
  to: EdgeRoutePointAnchor | MutationOrderedAnchor
) => {
  program.ordered.move(
    edgeRoutePointsStructure(edgeId),
    pointId,
    toOrderedAnchor(to)
  )
}

export const writeEdgeRoutePatch = (
  program: MutationProgramWriter<string>,
  edgeId: EdgeId,
  pointId: string,
  patch: Partial<Omit<EdgeRoutePoint, 'id'>>
) => {
  program.ordered.patch(
    edgeRoutePointsStructure(edgeId),
    pointId,
    patch
  )
}

export const writeEdgeRouteDelete = (
  program: MutationProgramWriter<string>,
  edgeId: EdgeId,
  pointId: string
) => {
  program.ordered.delete(
    edgeRoutePointsStructure(edgeId),
    pointId
  )
}

export const writeMindmapTreeInsert = (
  program: MutationProgramWriter<string>,
  input: {
    mindmapId: MindmapId
    nodeId: NodeId
    parentId?: NodeId
    index?: number
    value?: WhiteboardMindmapTreeValue
  }
) => {
  program.tree.insert(
    mindmapTreeStructure(input.mindmapId),
    input.nodeId,
    input.parentId,
    input.index,
    input.value
  )
}

export const writeMindmapTreeMove = (
  program: MutationProgramWriter<string>,
  input: {
    mindmapId: MindmapId
    nodeId: NodeId
    parentId?: NodeId
    index?: number
  }
) => {
  program.tree.move(
    mindmapTreeStructure(input.mindmapId),
    input.nodeId,
    input.parentId,
    input.index
  )
}

export const writeMindmapTreeDelete = (
  program: MutationProgramWriter<string>,
  mindmapId: MindmapId,
  nodeId: NodeId
) => {
  program.tree.delete(
    mindmapTreeStructure(mindmapId),
    nodeId
  )
}

export const writeMindmapTreeRestore = (
  program: MutationProgramWriter<string>,
  mindmapId: MindmapId,
  snapshot: MutationTreeSubtreeSnapshot<WhiteboardMindmapTreeValue>
) => {
  program.tree.restore(
    mindmapTreeStructure(mindmapId),
    snapshot
  )
}

export const writeMindmapTreePatch = (
  program: MutationProgramWriter<string>,
  mindmapId: MindmapId,
  nodeId: NodeId,
  patch: Partial<WhiteboardMindmapTreeValue>
) => {
  program.tree.patch(
    mindmapTreeStructure(mindmapId),
    nodeId,
    patch
  )
}
