import type { Edge, EdgeId, GroupId, Node, NodeId, Rect } from '../types'
import { isOrderedArrayEqual, isSameOptionalRectTuple } from '../utils'
import type { SelectionTarget } from './target'

const EMPTY_NODE_IDS: readonly NodeId[] = []
const EMPTY_NODE_SET: ReadonlySet<NodeId> = new Set<NodeId>()
const EMPTY_EDGE_IDS: readonly EdgeId[] = []
const EMPTY_EDGE_SET: ReadonlySet<EdgeId> = new Set<EdgeId>()
const EMPTY_GROUP_IDS: readonly GroupId[] = []
const EMPTY_GROUP_SET: ReadonlySet<GroupId> = new Set<GroupId>()
const EMPTY_NODES: readonly Node[] = []
const EMPTY_EDGES: readonly Edge[] = []

export type SelectionTransform = {
  move: boolean
  resize: 'none' | 'resize' | 'scale'
}

export type SelectionSummary = {
  kind: 'none' | 'node' | 'nodes' | 'edge' | 'edges' | 'mixed'
  target: {
    nodeIds: readonly NodeId[]
    nodeSet: ReadonlySet<NodeId>
    edgeIds: readonly EdgeId[]
    edgeSet: ReadonlySet<EdgeId>
    groupIds: readonly GroupId[]
    groupSet: ReadonlySet<GroupId>
    edgeId?: EdgeId
    groupId?: GroupId
  }
  items: {
    nodes: readonly Node[]
    edges: readonly Edge[]
    primaryNode?: Node
    primaryEdge?: Edge
    count: number
    nodeCount: number
    edgeCount: number
  }
  groups: {
    ids: readonly GroupId[]
    set: ReadonlySet<GroupId>
    count: number
    primaryId?: GroupId
  }
  transform: SelectionTransform
  box?: Rect
}

export type SelectionTransformBox = {
  box?: Rect
  canResize: boolean
}

const EMPTY_TRANSFORM: SelectionTransform = {
  move: false,
  resize: 'none'
}

export const isSelectionSummaryEqual = (
  left: SelectionSummary,
  right: SelectionSummary
) => (
  left.kind === right.kind
  && left.target.edgeId === right.target.edgeId
  && left.items.primaryNode === right.items.primaryNode
  && left.items.primaryEdge === right.items.primaryEdge
  && left.items.count === right.items.count
  && left.items.nodeCount === right.items.nodeCount
  && left.items.edgeCount === right.items.edgeCount
  && left.groups.count === right.groups.count
  && left.groups.primaryId === right.groups.primaryId
  && left.transform.move === right.transform.move
  && left.transform.resize === right.transform.resize
  && isOrderedArrayEqual(left.target.nodeIds, right.target.nodeIds)
  && isOrderedArrayEqual(left.target.edgeIds, right.target.edgeIds)
  && isOrderedArrayEqual(left.target.groupIds, right.target.groupIds)
  && isOrderedArrayEqual(left.items.nodes, right.items.nodes)
  && isOrderedArrayEqual(left.items.edges, right.items.edges)
  && isSameOptionalRectTuple(left.box, right.box)
)

export const deriveSelectionSummary = ({
  target,
  nodes,
  edges,
  readBounds,
  resolveNodeTransformCapability,
  isNodeScalable
}: {
  target: SelectionTarget
  nodes: readonly Node[]
  edges: readonly Edge[]
  readBounds: (target: SelectionTarget) => Rect | undefined
  resolveNodeTransformCapability: (node: Node) => {
    resize: boolean
    rotate: boolean
  }
  isNodeScalable: (node: Node) => boolean
}): SelectionSummary => {
  const nodeIds = nodes.length > 0
    ? nodes.map((node) => node.id)
    : EMPTY_NODE_IDS
  const nodeSet = nodeIds.length > 0
    ? new Set<NodeId>(nodeIds)
    : EMPTY_NODE_SET
  const edgeIds = edges.length > 0
    ? edges.map((edge) => edge.id)
    : EMPTY_EDGE_IDS
  const edgeSet = edgeIds.length > 0
    ? new Set<EdgeId>(edgeIds)
    : EMPTY_EDGE_SET
  const nextGroupIds = Array.from(new Set([
    ...nodeItemsGroupIds(nodes),
    ...edgeItemsGroupIds(edges)
  ]))
  const groupIds = nextGroupIds.length > 0
    ? nextGroupIds
    : EMPTY_GROUP_IDS
  const groupSet = groupIds.length > 0
    ? new Set<GroupId>(groupIds)
    : EMPTY_GROUP_SET
  const nodeItems = nodes.length > 0 ? nodes : EMPTY_NODES
  const edgeItems = edges.length > 0 ? edges : EMPTY_EDGES
  const nodeCount = nodeItems.length
  const edgeCount = edgeItems.length
  const count = nodeCount + edgeCount
  const canResizeNodes = nodeCount > 0
    && nodeItems.every((node) => (
      !node.locked
      && resolveNodeTransformCapability(node).resize
    ))
  const canScaleNodes = nodeCount > 0
    && nodeItems.every((node) => isNodeScalable(node))
  const transform = count > 0
    ? {
        move: nodeItems.every((node) => !node.locked),
        resize: nodeCount === 0
          ? 'none' as const
          : nodeCount === 1
            ? (
                canResizeNodes
                  ? 'resize' as const
                  : canScaleNodes
                    ? 'scale' as const
                    : 'none' as const
              )
            : canScaleNodes
              ? 'scale' as const
              : 'none' as const
      }
    : EMPTY_TRANSFORM
  const box = readBounds({
    nodeIds: target.nodeIds,
    edgeIds: target.edgeIds
  })
  return {
    kind:
      nodeCount > 0 && edgeCount > 0
        ? 'mixed'
        : nodeCount === 1
          ? 'node'
          : nodeCount > 1
            ? 'nodes'
            : edgeCount === 1
              ? 'edge'
              : edgeCount > 1
                ? 'edges'
                : 'none',
    target: {
      nodeIds,
      nodeSet,
      edgeIds,
      edgeSet,
      groupIds,
      groupSet,
      edgeId: edgeCount === 1 ? edgeIds[0] : undefined,
      groupId: groupIds.length === 1 ? groupIds[0] : undefined
    },
    items: {
      nodes: nodeItems,
      edges: edgeItems,
      primaryNode: nodeItems[0],
      primaryEdge: edgeItems[0],
      count,
      nodeCount,
      edgeCount
    },
    groups: {
      ids: groupIds,
      set: groupSet,
      count: groupIds.length,
      primaryId: groupIds.length === 1 ? groupIds[0] : undefined
    },
    transform,
    box
  } satisfies SelectionSummary
}

const nodeItemsGroupIds = (
  nodes: readonly Node[]
): GroupId[] => nodes
  .map((node) => node.groupId)
  .filter((groupId): groupId is GroupId => Boolean(groupId))

const edgeItemsGroupIds = (
  edges: readonly Edge[]
): GroupId[] => edges
  .map((edge) => edge.groupId)
  .filter((groupId): groupId is GroupId => Boolean(groupId))

export const resolveSelectionTransformBox = (
  selection: SelectionSummary,
  box: Rect | undefined = selection.box
): SelectionTransformBox => ({
  box,
  canResize: selection.transform.resize !== 'none'
})
