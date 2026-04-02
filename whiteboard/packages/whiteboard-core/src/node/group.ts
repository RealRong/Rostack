import type {
  GroupNode,
  Node,
  NodeId,
  NodePatch,
  Point,
  Rect,
  Size,
  SpatialNode
} from '../types'
import { getNodeAABB } from '../geometry'
import {
  findOwnerAncestor,
  getOwnerDescendants
} from './owner'

type OwnedNode = Pick<Node, 'id' | 'type' | 'children'>

export const isContainerNode = <TNode extends Pick<Node, 'type'>>(
  node: TNode
): node is TNode & (SpatialNode & { type: 'frame' }) => node.type === 'frame'

export const isOwnerNode = <TNode extends Pick<Node, 'type'>>(
  node: TNode
): node is TNode & GroupNode => node.type === 'group'

export const sanitizeGroupNode = (
  node: Node
): Node => {
  if (node.type !== 'group') {
    return node
  }

  const rawNode = node as GroupNode & Partial<{
    position: Point
    size: Size
    rotation: number
  }>

  if (
    rawNode.position === undefined
    && rawNode.size === undefined
    && rawNode.rotation === undefined
  ) {
    return node
  }

  const {
    position: _position,
    size: _size,
    rotation: _rotation,
    ...nextNode
  } = rawNode

  return nextNode
}

const hasOwn = (target: object, key: keyof NodePatch) =>
  Object.prototype.hasOwnProperty.call(target, key)

export const sanitizeGroupPatch = (
  patch: NodePatch,
  type?: string
): NodePatch => {
  if (type !== 'group') {
    return patch
  }

  if (
    !hasOwn(patch, 'position')
    && !hasOwn(patch, 'size')
    && !hasOwn(patch, 'rotation')
  ) {
    return patch
  }

  const {
    position: _position,
    size: _size,
    rotation: _rotation,
    ...nextPatch
  } = patch

  return nextPatch
}

export const getNodesBoundingRect = (
  nodes: readonly Node[],
  fallbackSize: Size
): Rect | undefined => {
  if (!nodes.length) return undefined

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  nodes.forEach((node) => {
    if (node.type === 'group') {
      return
    }

    const rect = getNodeAABB(node, fallbackSize)
    minX = Math.min(minX, rect.x)
    minY = Math.min(minY, rect.y)
    maxX = Math.max(maxX, rect.x + rect.width)
    maxY = Math.max(maxY, rect.y + rect.height)
  })

  if (
    !Number.isFinite(minX)
    || !Number.isFinite(minY)
    || !Number.isFinite(maxX)
    || !Number.isFinite(maxY)
  ) {
    return undefined
  }

  return {
    x: minX,
    y: minY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY)
  }
}

export const getGroupChildrenMap = <TNode extends OwnedNode>(
  nodes: readonly TNode[]
): Map<NodeId, TNode[]> => {
  const nodesById = new Map(nodes.map((node) => [node.id, node] as const))
  const map = new Map<NodeId, TNode[]>()

  nodes.forEach((node) => {
    if (node.type !== 'group') {
      return
    }

    const children = (node.children ?? [])
      .map((childId) => nodesById.get(childId))
      .filter((child): child is TNode => Boolean(child))

    if (children.length > 0) {
      map.set(node.id, children)
    }
  })

  return map
}

export const getGroupDescendants = <TNode extends OwnedNode>(
  nodes: readonly TNode[],
  groupId: NodeId
): TNode[] => getOwnerDescendants(nodes, groupId)

export const findGroupAncestor = <
  TNode extends Pick<Node, 'id' | 'type'>
>(
  nodeId: NodeId,
  readNode: (nodeId: NodeId) => TNode | undefined,
  readOwnerId: (nodeId: NodeId) => NodeId | undefined,
  match?: (groupId: NodeId, group: TNode) => boolean
): NodeId | undefined => findOwnerAncestor(
  nodeId,
  readNode,
  readOwnerId,
  (ownerId, owner) => (
    owner.type === 'group'
    && (!match || match(ownerId, owner))
  )
)

export const expandGroupMembers = <TNode extends OwnedNode>(
  nodes: readonly TNode[],
  rootIds: readonly NodeId[]
): TNode[] => {
  if (!rootIds.length) {
    return []
  }

  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const memberIds = new Set<NodeId>()

  rootIds.forEach((rootId) => {
    const root = nodesById.get(rootId)
    if (!root) {
      return
    }

    memberIds.add(root.id)
    if (root.type !== 'group') {
      return
    }

    getOwnerDescendants(nodes, root.id).forEach((child) => {
      memberIds.add(child.id)
    })
  })

  return nodes.filter((node) => memberIds.has(node.id))
}

export const rectEquals = (a: Rect, b: Rect, epsilon: number) => (
  Math.abs(a.x - b.x) <= epsilon &&
  Math.abs(a.y - b.y) <= epsilon &&
  Math.abs(a.width - b.width) <= epsilon &&
  Math.abs(a.height - b.height) <= epsilon
)
