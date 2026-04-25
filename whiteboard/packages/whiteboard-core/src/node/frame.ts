import { geometry as geometryApi } from '@whiteboard/core/geometry'
import type {
  Node,
  NodeId,
  Point,
  Rect
} from '@whiteboard/core/types'

type FrameNodeLike = Pick<Node, 'id' | 'type'>

type FrameRectReader<TNode extends FrameNodeLike> = (node: TNode) => Rect | undefined
type NodeRectReader<TNode extends FrameNodeLike> = (node: TNode) => Rect | undefined

export interface FrameQuery<TNode extends FrameNodeLike> {
  at(point: Point): NodeId | undefined
  parent(nodeId: NodeId): NodeId | undefined
  children(frameId: NodeId): readonly NodeId[]
  descendants(frameId: NodeId): readonly NodeId[]
}

export interface FrameCandidate {
  id: NodeId
  rect: Rect
  order: number
}

const area = (rect: Rect) => rect.width * rect.height

const pick = (
  current: {
    id: NodeId
    area: number
    order: number
  } | undefined,
  next: {
    id: NodeId
    area: number
    order: number
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

  return next.order > current.order
    ? next
    : current
}

const contains = (
  outer: Rect,
  inner: Rect
) => geometryApi.rect.contains(outer, inner)

const scanFrames = <TNode extends FrameNodeLike>(
  nodes: readonly TNode[],
  frameRect: FrameRectReader<TNode>
) => nodes.flatMap((node, index) => {
  if (node.type !== 'frame') {
    return []
  }

  const rect = frameRect(node)
  return rect
    ? [{
        node,
        rect,
        index
      }]
    : []
})

export const frameAt = <TNode extends FrameNodeLike>({
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
    order: number
  } | undefined
  const frames = scanFrames(nodes, getFrameRect)

  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index]!
    if (!geometryApi.rect.containsPoint(point, frame.rect)) {
      continue
    }

    best = pick(best, {
      id: frame.node.id,
      area: area(frame.rect),
      order: frame.index
    })
  }

  return best?.id
}

export const frameParent = <TNode extends FrameNodeLike>({
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
  const node = nodes.find((entry) => entry.id === nodeId)
  const rect = node ? getNodeRect(node) : undefined
  if (!rect) {
    return undefined
  }

  let best: {
    id: NodeId
    area: number
    order: number
  } | undefined
  const frames = scanFrames(nodes, getFrameRect)

  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index]!
    if (frame.node.id === nodeId || !contains(frame.rect, rect)) {
      continue
    }

    best = pick(best, {
      id: frame.node.id,
      area: area(frame.rect),
      order: frame.index
    })
  }

  return best?.id
}

export const frameChildren = <TNode extends FrameNodeLike>({
  nodes,
  frameId,
  getNodeRect,
  getFrameRect
}: {
  nodes: readonly TNode[]
  frameId: NodeId
  getNodeRect: NodeRectReader<TNode>
  getFrameRect: FrameRectReader<TNode>
}): NodeId[] => {
  const result: NodeId[] = []

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]!
    if (node.id === frameId) {
      continue
    }

    const rect = getNodeRect(node)
    if (!rect) {
      continue
    }
    if (frameParent({
      nodes,
      nodeId: node.id,
      getNodeRect,
      getFrameRect
    }) !== frameId) {
      continue
    }

    result.push(node.id)
  }

  return result
}

export const frameDescendants = <TNode extends FrameNodeLike>({
  nodes,
  frameId,
  getNodeRect,
  getFrameRect
}: {
  nodes: readonly TNode[]
  frameId: NodeId
  getNodeRect: NodeRectReader<TNode>
  getFrameRect: FrameRectReader<TNode>
}): NodeId[] => {
  const result: NodeId[] = []
  const visited = new Set<NodeId>()
  const stack = [...frameChildren({
    nodes,
    frameId,
    getNodeRect,
    getFrameRect
  })].reverse()

  while (stack.length > 0) {
    const currentId = stack.pop()
    if (!currentId || visited.has(currentId)) {
      continue
    }

    visited.add(currentId)
    result.push(currentId)

    const directChildren = frameChildren({
      nodes,
      frameId: currentId,
      getNodeRect,
      getFrameRect
    })
    for (let index = directChildren.length - 1; index >= 0; index -= 1) {
      stack.push(directChildren[index]!)
    }
  }

  return result
}

export const createFrameQuery = <TNode extends FrameNodeLike>({
  nodes,
  getNodeRect,
  getFrameRect
}: {
  nodes: readonly TNode[]
  getNodeRect: NodeRectReader<TNode>
  getFrameRect: FrameRectReader<TNode>
}): FrameQuery<TNode> => ({
  at: (point) => frameAt({
    nodes,
    point,
    getFrameRect
  }),
  parent: (nodeId) => frameParent({
    nodes,
    nodeId,
    getNodeRect,
    getFrameRect
  }),
  children: (frameId) => frameChildren({
    nodes,
    frameId,
    getNodeRect,
    getFrameRect
  }),
  descendants: (frameId) => frameDescendants({
    nodes,
    frameId,
    getNodeRect,
    getFrameRect
  })
})

export const pickFrame = (input: {
  candidates: readonly FrameCandidate[]
  point: Point
  excludeIds?: ReadonlySet<NodeId>
}): NodeId | undefined => {
  let best: {
    id: NodeId
    area: number
    order: number
  } | undefined

  input.candidates.forEach((candidate) => {
    if (input.excludeIds?.has(candidate.id)) {
      return
    }
    if (!geometryApi.rect.containsPoint(input.point, candidate.rect)) {
      return
    }

    best = pick(best, {
      id: candidate.id,
      area: area(candidate.rect),
      order: candidate.order
    })
  })

  return best?.id
}

export const pickFrameParent = (input: {
  candidates: readonly FrameCandidate[]
  rect: Rect
  nodeId: NodeId
  excludeIds?: ReadonlySet<NodeId>
}): NodeId | undefined => {
  let best: {
    id: NodeId
    area: number
    order: number
  } | undefined

  input.candidates.forEach((candidate) => {
    if (candidate.id === input.nodeId || input.excludeIds?.has(candidate.id)) {
      return
    }
    if (!contains(candidate.rect, input.rect)) {
      return
    }

    best = pick(best, {
      id: candidate.id,
      area: area(candidate.rect),
      order: candidate.order
    })
  })

  return best?.id
}
