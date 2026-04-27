import {
  buildSelectionTransformPlan,
  type NodeTransformBehavior,
  type SelectionTransformPlan
} from '@whiteboard/core/node/transform'
import { geometry as geometryApi } from '@whiteboard/core/geometry'
import type {
  Edge,
  EdgeId,
  GroupId,
  NodeId,
  NodeModel,
  NodeRole,
  Rect
} from '@whiteboard/core/types'
import { equal } from '@shared/core'


const EMPTY_NODE_IDS: readonly NodeId[] = []
const EMPTY_EDGE_IDS: readonly EdgeId[] = []
const EMPTY_NODE_SET: ReadonlySet<NodeId> = new Set<NodeId>()
const EMPTY_EDGE_SET: ReadonlySet<EdgeId> = new Set<EdgeId>()
const EMPTY_GROUP_IDS: readonly GroupId[] = []
const EMPTY_GROUP_SET: ReadonlySet<GroupId> = new Set<GroupId>()
const EMPTY_EDGES: readonly Edge[] = []

type SelectionNodeItem = Pick<NodeModel, 'id' | 'type' | 'groupId' | 'locked'>

export type SelectionMode = 'replace' | 'add' | 'subtract' | 'toggle'

export const applySelection = <T>(
  prevSelectedIds: Set<T>,
  ids: T[],
  mode: SelectionMode
): Set<T> => {
  if (mode === 'replace') {
    return new Set(ids)
  }

  const next = new Set(prevSelectedIds)
  if (mode === 'add') {
    ids.forEach((id) => next.add(id))
    return next
  }

  if (mode === 'subtract') {
    ids.forEach((id) => next.delete(id))
    return next
  }

  ids.forEach((id) => {
    if (next.has(id)) {
      next.delete(id)
      return
    }
    next.add(id)
  })
  return next
}

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
  equal.sameOrder(left.nodeIds, right.nodeIds)
  && equal.sameOrder(left.edgeIds, right.edgeIds)
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

export type SelectionSummary<
  TNode extends SelectionNodeItem = NodeModel
> = {
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
    nodes: readonly TNode[]
    edges: readonly Edge[]
    primaryNode?: TNode
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
  canMove: boolean
  transformPlan?: SelectionTransformPlan<TNode>
  box?: Rect
}

export const isSelectionSummaryEqual = <
  TNode extends SelectionNodeItem
>(
  left: SelectionSummary<TNode>,
  right: SelectionSummary<TNode>
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
  && left.canMove === right.canMove
  && equal.sameOrder(left.target.nodeIds, right.target.nodeIds)
  && equal.sameOrder(left.target.edgeIds, right.target.edgeIds)
  && equal.sameOrder(left.target.groupIds, right.target.groupIds)
  && equal.sameOrder(left.items.nodes, right.items.nodes)
  && equal.sameOrder(left.items.edges, right.items.edges)
  && isSelectionTransformPlanEqual(left.transformPlan, right.transformPlan)
  && equal.sameOptionalRect(left.box, right.box)
)

const isNodeTransformBehaviorEqual = (
  left: NodeTransformBehavior,
  right: NodeTransformBehavior
) => (
  left.kind === right.kind
  && equal.sameOrder(left.supportedFamilies, right.supportedFamilies)
)

const isSelectionTransformPlanEqual = (
  left: SelectionTransformPlan<SelectionNodeItem> | undefined,
  right: SelectionTransformPlan<SelectionNodeItem> | undefined
) => (
  left === right
  || (
    left !== undefined
    && right !== undefined
    && equal.sameOptionalRect(left.box, right.box)
    && left.handles.length === right.handles.length
    && left.handles.every((entry, index) => (
      entry.id === right.handles[index]?.id
      && entry.visible === right.handles[index]?.visible
      && entry.enabled === right.handles[index]?.enabled
      && entry.family === right.handles[index]?.family
      && entry.cursor === right.handles[index]?.cursor
    ))
    && left.members.length === right.members.length
    && left.members.every((entry, index) => (
      entry.id === right.members[index]?.id
      && entry.node === right.members[index]?.node
      && equal.sameOptionalRect(entry.rect, right.members[index]?.rect)
      && isNodeTransformBehaviorEqual(entry.behavior, right.members[index]!.behavior)
    ))
  )
)

export const deriveSelectionSummary = <
  TNode extends SelectionNodeItem
>({
  target,
  nodes,
  edges,
  readNodeRect,
  readEdgeBounds,
  resolveNodeTransformBehavior
}: {
  target: SelectionTarget
  nodes: readonly TNode[]
  edges: readonly Edge[]
  readNodeRect: (node: TNode) => Rect | undefined
  readEdgeBounds: (edge: Edge) => Rect | undefined
  resolveNodeTransformBehavior: (node: TNode) => NodeTransformBehavior | undefined
}): SelectionSummary<TNode> => {
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
  const nodeItems = nodes
  const edgeItems = edges.length > 0 ? edges : EMPTY_EDGES
  const nodeCount = nodeItems.length
  const edgeCount = edgeItems.length
  const count = nodeCount + edgeCount
  const canMove = count > 0 && nodeItems.every((node) => !node.locked)
  const box = geometryApi.rect.boundingRect([
    ...nodeItems.flatMap((node) => {
      const rect = readNodeRect(node)
      return rect ? [rect] : []
    }),
    ...edgeItems.flatMap((edge) => {
      const rect = readEdgeBounds(edge)
      return rect ? [rect] : []
    })
  ])
  const transformPlan = (
    edgeCount === 0
    && nodeCount > 1
    && box
  )
    ? buildSelectionTransformPlan({
        box,
        members: nodeItems.flatMap((node) => {
          const rect = readNodeRect(node)
          const behavior = rect
            ? resolveNodeTransformBehavior(node)
            : undefined

          return rect && behavior
            ? [{
                id: node.id,
                node,
                rect,
                behavior
              }]
            : []
        })
      })
    : undefined
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
    canMove,
    transformPlan,
    box
  } satisfies SelectionSummary<TNode>
}

const nodeItemsGroupIds = (
  nodes: readonly Pick<SelectionNodeItem, 'groupId'>[]
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

export type SelectionAffordance<
  TNode extends SelectionNodeItem = NodeModel
> = {
  owner: SelectionAffordanceOwner
  ownerNodeId?: NodeId
  displayBox?: Rect
  moveHit: SelectionAffordanceMoveHit
  canMove: boolean
  canResize: boolean
  canRotate: boolean
  transformPlan?: SelectionTransformPlan<TNode>
  showSingleNodeOverlay: boolean
}

const EMPTY_AFFORDANCE: Omit<SelectionAffordance, 'transformPlan'> = {
  owner: 'none',
  moveHit: 'none',
  canMove: false,
  canResize: false,
  canRotate: false,
  showSingleNodeOverlay: false
}

export const deriveSelectionAffordance = <
  TNode extends SelectionNodeItem
>({
  selection,
  resolveNodeRole,
  resolveNodeTransformCapability
}: {
  selection: SelectionSummary<TNode>
  resolveNodeRole: (node: TNode) => NodeRole
  resolveNodeTransformCapability: (node: TNode) => {
    resize: boolean
    rotate: boolean
  }
}): SelectionAffordance<TNode> => {
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
          selection.canMove && Boolean(displayBox)
            ? 'body'
            : 'none',
        canMove: selection.canMove && Boolean(displayBox),
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
        selection.canMove && Boolean(displayBox)
          ? 'body'
          : 'none',
      canMove: selection.canMove && Boolean(displayBox),
      canResize: !primaryNode.locked && capability.resize,
      canRotate: !primaryNode.locked && capability.rotate,
      showSingleNodeOverlay: true
    }
  }

  return {
    owner: 'multi-selection',
    displayBox,
    moveHit:
      selection.canMove
      && nodeCount > 0
      && Boolean(displayBox)
        ? 'body'
        : 'none',
    canMove:
      selection.canMove
      && nodeCount > 0
      && Boolean(displayBox),
    canResize:
      edgeCount === 0
      && Boolean(displayBox)
      && Boolean(selection.transformPlan?.handles.some((handle) => handle.enabled && handle.visible)),
    canRotate: false,
    transformPlan: selection.transformPlan,
    showSingleNodeOverlay: false
  }
}

export const isSelectionAffordanceEqual = <
  TNode extends SelectionNodeItem
>(
  left: SelectionAffordance<TNode>,
  right: SelectionAffordance<TNode>
) => (
  left.owner === right.owner
  && left.ownerNodeId === right.ownerNodeId
  && left.moveHit === right.moveHit
  && left.canMove === right.canMove
  && left.canResize === right.canResize
  && left.canRotate === right.canRotate
  && isSelectionTransformPlanEqual(left.transformPlan, right.transformPlan)
  && left.showSingleNodeOverlay === right.showSingleNodeOverlay
  && equal.sameOptionalRect(left.displayBox, right.displayBox)
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

  return geometryApi.rect.boundingRect(rects)
}

export const resolveSelectionBoxTarget = (
  target: BoundsTarget,
  _nodes: readonly unknown[]
): BoundsTarget => target
