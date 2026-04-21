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

const isCanvasNode = (
  _document: Pick<Document, 'mindmaps'>,
  node: Node | undefined
) => {
  if (!node) return false
  return !node.owner
}

const isCanvasMindmap = (
  document: Pick<Document, 'mindmaps'>,
  mindmapId: MindmapId
) => Boolean(document.mindmaps[mindmapId])

const appendMissingSceneRefs = (
  ordered: CanvasItemRef[],
  visited: readonly CanvasItemRef[],
  document: Pick<Document, 'nodes' | 'edges' | 'mindmaps'>
) => {
  appendMissingCanvasRefs(
    ordered,
    visited,
    Object.values(document.nodes)
      .filter((node) => isCanvasNode(document, node))
      .map((node) => ({ kind: 'node', id: node.id }) as const)
  )
  appendMissingCanvasRefs(
    ordered,
    visited,
    Object.keys(document.mindmaps).map((id) => ({ kind: 'mindmap', id }) as const)
  )
  appendMissingCanvasRefs(
    ordered,
    visited,
    Object.keys(document.edges).map((id) => ({ kind: 'edge', id }) as const)
  )
}

const listMindmapNodeIds = (
  document: Pick<Document, 'mindmaps'>,
  mindmapId: MindmapId
) => {
  const record = document.mindmaps[mindmapId]
  if (!record) {
    return []
  }

  const result: NodeId[] = []
  const stack: NodeId[] = [record.root]
  const visited = new Set<NodeId>()

  while (stack.length > 0) {
    const current = stack.pop()!
    if (visited.has(current)) {
      continue
    }

    visited.add(current)
    result.push(current)

    const children = record.children[current] ?? []
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push(children[index]!)
    }
  }

  return result
}

const listVisibleNodesFromCanvasRef = (
  document: Pick<Document, 'nodes' | 'mindmaps'>,
  ref: CanvasItemRef
): Node[] => {
  if (ref.kind === 'node') {
    const node = document.nodes[ref.id]
    return node ? [node] : []
  }

  if (ref.kind === 'mindmap') {
    return listMindmapNodeIds(document, ref.id)
      .map((nodeId) => document.nodes[nodeId])
      .filter((node): node is Node => Boolean(node))
  }

  return []
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
    const ordered: CanvasItemRef[] = []
    appendMissingSceneRefs(ordered, EMPTY_ORDER, document)
    return ordered
  }

  const ordered: CanvasItemRef[] = []
  const visited: CanvasItemRef[] = []

  order.forEach((ref) => {
    if (ref.kind === 'node') {
      if (!isCanvasNode(document, document.nodes[ref.id])) {
        return
      }
    } else if (ref.kind === 'mindmap') {
      if (!isCanvasMindmap(document, ref.id)) {
        return
      }
    } else if (!document.edges[ref.id]) {
      return
    }

    ordered.push(ref)
    visited.push(ref)
  })

  appendMissingSceneRefs(ordered, visited, document)

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
  .flatMap((ref) => listVisibleNodesFromCanvasRef(document, ref))

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
    : ref.kind === 'edge'
      ? document.edges[ref.id]?.groupId
      : undefined
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
