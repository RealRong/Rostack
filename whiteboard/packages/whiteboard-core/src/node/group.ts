import type {
  GroupId,
  Node,
  NodeId,
  NodePatch,
  Rect,
  Size,
  SpatialNode
} from '../types'
import { getNodesBounds } from './bounds'

type GroupableNode = Pick<Node, 'id' | 'groupId'>

export const isContainerNode = <TNode extends Pick<Node, 'type'>>(
  node: TNode
): node is TNode & (SpatialNode & { type: 'frame' }) => node.type === 'frame'

export const isOwnerNode = () => false

export const sanitizeGroupNode = (
  node: Node
): Node => node

export const sanitizeGroupPatch = (
  patch: NodePatch
): NodePatch => patch

export const getNodesBoundingRect = (
  nodes: readonly Node[],
  fallbackSize: Size
): Rect | undefined => getNodesBounds(nodes, fallbackSize)

export const getGroupChildrenMap = <TNode extends GroupableNode>(
  _nodes: readonly TNode[]
): Map<GroupId, TNode[]> => new Map()

export const getGroupDescendants = <TNode extends GroupableNode>(
  nodes: readonly TNode[],
  groupId: GroupId
): TNode[] => nodes.filter((node) => node.groupId === groupId)

export const findGroupAncestor = <
  TNode extends Pick<Node, 'id'> & Partial<Pick<Node, 'groupId'>>
>(
  nodeId: NodeId,
  readNode: (nodeId: NodeId) => TNode | undefined,
  _readOwnerId: (nodeId: NodeId) => NodeId | undefined,
  match?: (groupId: GroupId, group: TNode) => boolean
): GroupId | undefined => {
  const node = readNode(nodeId)
  const groupId = node?.groupId
  if (!node || !groupId) {
    return undefined
  }

  return !match || match(groupId, node)
    ? groupId
    : undefined
}

export const expandGroupMembers = <TNode extends GroupableNode>(
  nodes: readonly TNode[],
  rootIds: readonly NodeId[]
): TNode[] => {
  if (!rootIds.length) {
    return []
  }

  const rootIdSet = new Set(rootIds)
  return nodes.filter((node) => rootIdSet.has(node.id))
}

export const rectEquals = (a: Rect, b: Rect, epsilon: number) => (
  Math.abs(a.x - b.x) <= epsilon &&
  Math.abs(a.y - b.y) <= epsilon &&
  Math.abs(a.width - b.width) <= epsilon &&
  Math.abs(a.height - b.height) <= epsilon
)
