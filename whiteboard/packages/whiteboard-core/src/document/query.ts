import type {
  CanvasItemRef,
  Document,
  Edge,
  EdgeId,
  Group,
  GroupId,
  MindmapId,
  Node,
  NodeId
} from '@whiteboard/core/types'

export const listCanvasItemRefs = (
  document: Pick<Document, 'canvas'>
): CanvasItemRef[] => document.canvas.order

export const getNode = (
  document: Pick<Document, 'nodes'>,
  id: NodeId
): Node | undefined => document.nodes[id]

export const getEdge = (
  document: Pick<Document, 'edges'>,
  id: EdgeId
): Edge | undefined => document.edges[id]

export const getGroup = (
  document: Pick<Document, 'groups'>,
  id: GroupId
): Group | undefined => document.groups[id]

export const hasNode = (
  document: Pick<Document, 'nodes'>,
  id: NodeId
): boolean => Boolean(document.nodes[id])

export const hasEdge = (
  document: Pick<Document, 'edges'>,
  id: EdgeId
): boolean => Boolean(document.edges[id])

export const hasGroup = (
  document: Pick<Document, 'groups'>,
  id: GroupId
): boolean => Boolean(document.groups[id])

export const listNodes = (
  document: Pick<Document, 'nodes'>
): Node[] => Object.values(document.nodes)

export const listEdges = (
  document: Pick<Document, 'edges'>
): Edge[] => Object.values(document.edges)

export const listGroups = (
  document: Pick<Document, 'groups'>
): Group[] => Object.values(document.groups)

const readCanvasItemGroupId = (
  document: Pick<Document, 'nodes' | 'edges'>,
  ref: CanvasItemRef
): GroupId | undefined => (
  ref.kind === 'node'
    ? document.nodes[ref.id]?.groupId
    : ref.kind === 'edge'
      ? document.edges[ref.id]?.groupId
      : undefined
)

export const listGroupCanvasItemRefs = (
  document: Pick<Document, 'nodes' | 'edges' | 'canvas'>,
  groupId: GroupId
): CanvasItemRef[] => listCanvasItemRefs(document)
  .filter((ref) => readCanvasItemGroupId(document, ref) === groupId)

export const listGroupNodeIds = (
  document: Pick<Document, 'nodes' | 'edges' | 'canvas'>,
  groupId: GroupId
): NodeId[] => listGroupCanvasItemRefs(document, groupId)
  .filter((ref): ref is Extract<CanvasItemRef, { kind: 'node' }> => ref.kind === 'node')
  .map((ref) => ref.id)

export const listGroupEdgeIds = (
  document: Pick<Document, 'nodes' | 'edges' | 'canvas'>,
  groupId: GroupId
): EdgeId[] => listGroupCanvasItemRefs(document, groupId)
  .filter((ref): ref is Extract<CanvasItemRef, { kind: 'edge' }> => ref.kind === 'edge')
  .map((ref) => ref.id)

export const getMindmap = (
  document: Pick<Document, 'mindmaps'>,
  id: MindmapId
) => document.mindmaps[id]
