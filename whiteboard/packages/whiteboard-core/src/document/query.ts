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

const EMPTY_ORDER: CanvasItemRef[] = []

const isTopLevelNode = (
  document: Pick<Document, 'mindmaps'>,
  node: Node | undefined
) => {
  if (!node) return false
  if (!node.owner) return true
  if (node.owner.kind !== 'mindmap') return false
  return document.mindmaps[node.owner.id]?.root === node.id
}

const isCanvasItemRefEqual = (
  left: CanvasItemRef,
  right: CanvasItemRef
) => left.kind === right.kind && left.id === right.id

const appendMissingCanvasRefs = (
  ordered: CanvasItemRef[],
  visited: readonly CanvasItemRef[],
  refs: readonly CanvasItemRef[]
) => {
  refs.forEach((ref) => {
    if (visited.some((entry) => isCanvasItemRefEqual(entry, ref))) {
      return
    }
    ordered.push(ref)
  })
}

export const listCanvasItemRefs = (
  document: Pick<Document, 'nodes' | 'edges' | 'canvas' | 'mindmaps'>
): CanvasItemRef[] => {
  const order = document.canvas.order ?? EMPTY_ORDER
  if (!order.length) {
    return [
      ...Object.values(document.nodes)
        .filter((node) => isTopLevelNode(document, node))
        .map((node) => ({ kind: 'node', id: node.id }) as const),
      ...Object.keys(document.edges).map((id) => ({ kind: 'edge', id }) as const)
    ]
  }

  const ordered: CanvasItemRef[] = []
  const visited: CanvasItemRef[] = []

  order.forEach((ref) => {
    if (ref.kind === 'node') {
      if (!isTopLevelNode(document, document.nodes[ref.id])) {
        return
      }
    } else if (!document.edges[ref.id]) {
      return
    }

    ordered.push(ref)
    visited.push(ref)
  })

  appendMissingCanvasRefs(
    ordered,
    visited,
    Object.values(document.nodes)
      .filter((node) => isTopLevelNode(document, node))
      .map((node) => ({ kind: 'node', id: node.id }) as const)
  )
  appendMissingCanvasRefs(
    ordered,
    visited,
    Object.keys(document.edges).map((id) => ({ kind: 'edge', id }) as const)
  )

  return ordered
}

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
  document: Pick<Document, 'nodes' | 'edges' | 'canvas' | 'mindmaps'>
): Node[] => listCanvasItemRefs(document)
  .filter((ref): ref is Extract<CanvasItemRef, { kind: 'node' }> => ref.kind === 'node')
  .map((ref) => document.nodes[ref.id])
  .filter((node): node is Node => Boolean(node))

export const listEdges = (
  document: Pick<Document, 'nodes' | 'edges' | 'canvas' | 'mindmaps'>
): Edge[] => listCanvasItemRefs(document)
  .filter((ref): ref is Extract<CanvasItemRef, { kind: 'edge' }> => ref.kind === 'edge')
  .map((ref) => document.edges[ref.id])
  .filter((edge): edge is Edge => Boolean(edge))

export const listGroups = (
  document: Pick<Document, 'groups'>
): Group[] => Object.values(document.groups)

const readCanvasItemGroupId = (
  document: Pick<Document, 'nodes' | 'edges'>,
  ref: CanvasItemRef
): GroupId | undefined => (
  ref.kind === 'node'
    ? document.nodes[ref.id]?.groupId
    : document.edges[ref.id]?.groupId
)

export const listGroupCanvasItemRefs = (
  document: Pick<Document, 'nodes' | 'edges' | 'canvas' | 'mindmaps'>,
  groupId: GroupId
): CanvasItemRef[] => listCanvasItemRefs(document)
  .filter((ref) => readCanvasItemGroupId(document, ref) === groupId)

export const listGroupNodeIds = (
  document: Pick<Document, 'nodes' | 'edges' | 'canvas' | 'mindmaps'>,
  groupId: GroupId
): NodeId[] => listGroupCanvasItemRefs(document, groupId)
  .filter((ref): ref is Extract<CanvasItemRef, { kind: 'node' }> => ref.kind === 'node')
  .map((ref) => ref.id)

export const listGroupEdgeIds = (
  document: Pick<Document, 'nodes' | 'edges' | 'canvas' | 'mindmaps'>,
  groupId: GroupId
): EdgeId[] => listGroupCanvasItemRefs(document, groupId)
  .filter((ref): ref is Extract<CanvasItemRef, { kind: 'edge' }> => ref.kind === 'edge')
  .map((ref) => ref.id)

export const getMindmap = (
  document: Pick<Document, 'mindmaps'>,
  id: MindmapId
) => document.mindmaps[id]
