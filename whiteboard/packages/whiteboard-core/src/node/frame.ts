import {
  isPointInRect,
  rectContains
} from '#whiteboard-core/geometry'
import type {
  Node,
  NodeId,
  Point,
  Rect
} from '#whiteboard-core/types'

type FrameNodeLike = Pick<Node, 'id' | 'type'>

type FrameRectReader<TNode extends FrameNodeLike> = (node: TNode) => Rect | undefined
type NodeRectReader<TNode extends FrameNodeLike> = (node: TNode) => Rect | undefined

const readArea = (rect: Rect) => rect.width * rect.height

const selectBetterFrame = (
  current: {
    id: NodeId
    area: number
    index: number
  } | undefined,
  next: {
    id: NodeId
    area: number
    index: number
  }
) => {
  if (!current) {
    return next
  }

  if (next.area < current.area) {
    return next
  }

  if (next.area > current.area) {
    return current
  }

  return next.index > current.index
    ? next
    : current
}

const buildNodeById = <TNode extends FrameNodeLike>(
  nodes: readonly TNode[]
): ReadonlyMap<NodeId, TNode> =>
  new Map(nodes.map((node) => [node.id, node] as const))

const buildDirectFrameMembership = <TNode extends FrameNodeLike>({
  nodes,
  getNodeRect,
  getFrameRect
}: {
  nodes: readonly TNode[]
  getNodeRect: NodeRectReader<TNode>
  getFrameRect: FrameRectReader<TNode>
}) => {
  const directFrameByNode = new Map<NodeId, NodeId>()

  nodes.forEach((node) => {
    const nodeRect = getNodeRect(node)
    if (!nodeRect) {
      return
    }

    let best: {
      id: NodeId
      area: number
      index: number
    } | undefined

    nodes.forEach((candidate, index) => {
      if (candidate.type !== 'frame' || candidate.id === node.id) {
        return
      }

      const frameRect = getFrameRect(candidate)
      if (!frameRect || !rectContains(frameRect, nodeRect)) {
        return
      }

      best = selectBetterFrame(best, {
        id: candidate.id,
        area: readArea(frameRect),
        index
      })
    })

    if (best) {
      directFrameByNode.set(node.id, best.id)
    }
  })

  return directFrameByNode
}

export const resolveFrameAtPoint = <TNode extends FrameNodeLike>({
  nodes,
  point,
  getFrameRect
}: {
  nodes: readonly TNode[]
  point: Point
  getFrameRect: FrameRectReader<TNode>
}): NodeId | undefined => {
  let best: {
    id: NodeId
    area: number
    index: number
  } | undefined

  nodes.forEach((node, index) => {
    if (node.type !== 'frame') {
      return
    }

    const rect = getFrameRect(node)
    if (!rect || !isPointInRect(point, rect)) {
      return
    }

    best = selectBetterFrame(best, {
      id: node.id,
      area: readArea(rect),
      index
    })
  })

  return best?.id
}

export const resolveNodeFrame = <TNode extends FrameNodeLike>({
  nodes,
  nodeId,
  getNodeRect,
  getFrameRect
}: {
  nodes: readonly TNode[]
  nodeId: NodeId
  getNodeRect: NodeRectReader<TNode>
  getFrameRect: FrameRectReader<TNode>
}): NodeId | undefined => {
  const node = buildNodeById(nodes).get(nodeId)
  if (!node) {
    return undefined
  }

  const directFrameByNode = buildDirectFrameMembership({
    nodes,
    getNodeRect,
    getFrameRect
  })

  return directFrameByNode.get(node.id)
}

export const collectFrameMembers = <TNode extends FrameNodeLike>({
  nodes,
  frameId,
  getNodeRect,
  getFrameRect,
  deep = false
}: {
  nodes: readonly TNode[]
  frameId: NodeId
  getNodeRect: NodeRectReader<TNode>
  getFrameRect: FrameRectReader<TNode>
  deep?: boolean
}): NodeId[] => {
  const nodeById = buildNodeById(nodes)
  const directFrameByNode = buildDirectFrameMembership({
    nodes,
    getNodeRect,
    getFrameRect
  })

  const directMembers = nodes
    .filter((node) => directFrameByNode.get(node.id) === frameId)
    .map((node) => node.id)

  if (!deep) {
    return directMembers
  }

  const result: NodeId[] = []
  const visited = new Set<NodeId>()
  const stack = [...directMembers].reverse()

  while (stack.length > 0) {
    const currentId = stack.pop()
    if (!currentId || visited.has(currentId)) {
      continue
    }

    visited.add(currentId)
    result.push(currentId)

    const current = nodeById.get(currentId)
    if (current?.type !== 'frame') {
      continue
    }

    const children = nodes
      .filter((node) => directFrameByNode.get(node.id) === currentId)
      .map((node) => node.id)

    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push(children[index]!)
    }
  }

  return result
}

export const expandFrameSelection = <TNode extends FrameNodeLike>({
  nodes,
  ids,
  getNodeRect,
  getFrameRect
}: {
  nodes: readonly TNode[]
  ids: readonly NodeId[]
  getNodeRect: NodeRectReader<TNode>
  getFrameRect: FrameRectReader<TNode>
}) => {
  const next = new Set(ids)

  ids.forEach((id) => {
    const members = collectFrameMembers({
      nodes,
      frameId: id,
      getNodeRect,
      getFrameRect,
      deep: true
    })

    members.forEach((memberId) => {
      next.add(memberId)
    })
  })

  return next
}

