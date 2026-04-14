import { applySelection, type SelectionMode } from '@whiteboard/core/node/selection'
import { getRectsBoundingRect } from '@whiteboard/core/geometry'
import type {
  Edge,
  EdgeId,
  GroupId,
  Node,
  NodeId,
  NodeRole,
  Rect
} from '@whiteboard/core/types'
import {
  sameOptionalRect as isSameOptionalRectTuple,
  sameOrder as isOrderedArrayEqual
} from '@shared/core'

const EMPTY_NODE_IDS: readonly NodeId[] = []
const EMPTY_EDGE_IDS: readonly EdgeId[] = []
const EMPTY_NODE_SET: ReadonlySet<NodeId> = new Set<NodeId>()
const EMPTY_EDGE_SET: ReadonlySet<EdgeId> = new Set<EdgeId>()
const EMPTY_GROUP_IDS: readonly GroupId[] = []
const EMPTY_GROUP_SET: ReadonlySet<GroupId> = new Set<GroupId>()
const EMPTY_NODES: readonly Node[] = []
const EMPTY_EDGES: readonly Edge[] = []

export type SelectionInput = {
  nodeIds?: readonly NodeId[]
  edgeIds?: readonly EdgeId[]
}

export type SelectionTarget = {
  nodeIds: readonly NodeId[]
  edgeIds: readonly EdgeId[]
}

export const EMPTY_SELECTION_TARGET: SelectionTarget = {
  nodeIds: EMPTY_NODE_IDS,
  edgeIds: EMPTY_EDGE_IDS
}

export const isSelectionTargetEqual = (
  left: SelectionTarget,
  right: SelectionTarget
) => (
  isOrderedArrayEqual(left.nodeIds, right.nodeIds)
  && isOrderedArrayEqual(left.edgeIds, right.edgeIds)
)

export const normalizeSelectionTarget = (
  input: SelectionInput
): SelectionTarget => {
  const nodeIds = [...new Set(input.nodeIds ?? EMPTY_NODE_IDS)]
  const edgeIds = [...new Set(input.edgeIds ?? EMPTY_EDGE_IDS)]

  if (!nodeIds.length && !edgeIds.length) {
    return EMPTY_SELECTION_TARGET
  }

  return {
    nodeIds,
    edgeIds
  }
}

export const applySelectionTarget = (
  current: SelectionTarget,
  input: SelectionInput,
  mode: SelectionMode
): SelectionTarget => normalizeSelectionTarget({
  nodeIds: [...applySelection(
    new Set(current.nodeIds),
    [...(input.nodeIds ?? EMPTY_NODE_IDS)],
    mode
  )],
  edgeIds: [...applySelection(
    new Set(current.edgeIds),
    [...(input.edgeIds ?? EMPTY_EDGE_IDS)],
    mode
  )]
})

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
  readNodeRect,
  readEdgeBounds,
  resolveNodeTransformCapability,
  isNodeScalable
}: {
  target: SelectionTarget
  nodes: readonly Node[]
  edges: readonly Edge[]
  readNodeRect: (node: Node) => Rect | undefined
  readEdgeBounds: (edge: Edge) => Rect | undefined
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
  const box = getRectsBoundingRect([
    ...nodeItems.flatMap((node) => {
      const rect = readNodeRect(node)
      return rect ? [rect] : []
    }),
    ...edgeItems.flatMap((edge) => {
      const rect = readEdgeBounds(edge)
      return rect ? [rect] : []
    })
  ])
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

export type SelectionAffordanceOwner =
  | 'none'
  | 'single-node'
  | 'multi-selection'

export type SelectionAffordanceMoveHit = 'none' | 'body'

export type SelectionAffordance = {
  owner: SelectionAffordanceOwner
  ownerNodeId?: NodeId
  displayBox?: Rect
  moveHit: SelectionAffordanceMoveHit
  canMove: boolean
  canResize: boolean
  canRotate: boolean
  showSingleNodeOverlay: boolean
}

const EMPTY_AFFORDANCE: SelectionAffordance = {
  owner: 'none',
  moveHit: 'none',
  canMove: false,
  canResize: false,
  canRotate: false,
  showSingleNodeOverlay: false
}

export const deriveSelectionAffordance = ({
  selection,
  resolveNodeRole,
  resolveNodeTransformCapability
}: {
  selection: SelectionSummary
  resolveNodeRole: (node: Node) => NodeRole
  resolveNodeTransformCapability: (node: Node) => {
    resize: boolean
    rotate: boolean
  }
}): SelectionAffordance => {
  const displayBox = selection.box
  const primaryNode = selection.items.primaryNode
  const nodeCount = selection.items.nodeCount
  const edgeCount = selection.items.edgeCount

  if (!primaryNode || nodeCount === 0) {
    return {
      ...EMPTY_AFFORDANCE,
      displayBox
    }
  }

  const role = resolveNodeRole(primaryNode)
  const capability = resolveNodeTransformCapability(primaryNode)

  if (nodeCount === 1 && edgeCount === 0) {
    if (role === 'frame') {
      return {
        owner: 'single-node',
        ownerNodeId: primaryNode.id,
        displayBox,
        moveHit:
          selection.transform.move && Boolean(displayBox)
            ? 'body'
            : 'none',
        canMove: selection.transform.move && Boolean(displayBox),
        canResize: !primaryNode.locked && capability.resize,
        canRotate: false,
        showSingleNodeOverlay: false
      }
    }

    return {
      owner: 'single-node',
      ownerNodeId: primaryNode.id,
      displayBox,
      moveHit:
        selection.transform.move && Boolean(displayBox)
          ? 'body'
          : 'none',
      canMove: selection.transform.move && Boolean(displayBox),
      canResize: !primaryNode.locked && capability.resize,
      canRotate: !primaryNode.locked && capability.rotate,
      showSingleNodeOverlay: true
    }
  }

  return {
    owner: 'multi-selection',
    displayBox,
    moveHit:
      selection.transform.move
      && nodeCount > 0
      && Boolean(displayBox)
        ? 'body'
        : 'none',
    canMove:
      selection.transform.move
      && nodeCount > 0
      && Boolean(displayBox),
    canResize:
      edgeCount === 0
      && Boolean(displayBox)
      && selection.transform.resize !== 'none',
    canRotate: false,
    showSingleNodeOverlay: false
  }
}

export const isSelectionAffordanceEqual = (
  left: SelectionAffordance,
  right: SelectionAffordance
) => (
  left.owner === right.owner
  && left.ownerNodeId === right.ownerNodeId
  && left.moveHit === right.moveHit
  && left.canMove === right.canMove
  && left.canResize === right.canResize
  && left.canRotate === right.canRotate
  && left.showSingleNodeOverlay === right.showSingleNodeOverlay
  && isSameOptionalRectTuple(left.displayBox, right.displayBox)
)

export type BoundsTarget = {
  nodeIds?: readonly NodeId[]
  edgeIds?: readonly EdgeId[]
}

export const getTargetBounds = ({
  target,
  readNodeBounds,
  readEdgeBounds
}: {
  target: BoundsTarget
  readNodeBounds: (nodeId: NodeId) => Rect | undefined
  readEdgeBounds: (edgeId: EdgeId) => Rect | undefined
}): Rect | undefined => {
  const nodeIds = target.nodeIds ?? []
  const edgeIds = target.edgeIds ?? []
  if (!nodeIds.length && !edgeIds.length) {
    return undefined
  }

  const rectNodeIds = new Set<NodeId>()
  const rects: Rect[] = []

  const pushNodeRect = (nodeId: NodeId) => {
    if (rectNodeIds.has(nodeId)) {
      return
    }

    const rect = readNodeBounds(nodeId)
    if (!rect) {
      return
    }

    rectNodeIds.add(nodeId)
    rects.push(rect)
  }

  nodeIds.forEach(pushNodeRect)

  edgeIds.forEach((edgeId) => {
    const rect = readEdgeBounds(edgeId)
    if (rect) {
      rects.push(rect)
    }
  })

  return getRectsBoundingRect(rects)
}

export const resolveSelectionBoxTarget = (
  target: BoundsTarget,
  _nodes: readonly unknown[]
): BoundsTarget => target
