import {
  moveEdge,
  moveEdgeRoute
} from '../edge'
import type {
  Edge,
  EdgeId,
  EdgePatch,
  Node,
  NodeId,
  Point,
  Rect,
  Size
} from '../types'
import { expandFrameSelection } from './frame'
import { getNodeBoundsByNode } from './bounds'

export type MoveMember = {
  id: NodeId
  position: Point
}

export type MoveSet = {
  rootIds: readonly NodeId[]
  members: readonly MoveMember[]
  snapExcludeIds: readonly NodeId[]
}

export type MoveNodePosition = {
  id: NodeId
  position: Point
}

export type MoveEdgeChange = {
  id: EdgeId
  patch: EdgePatch
}

export type MoveEdgePlan = {
  dragged: readonly Edge[]
  follow: readonly Edge[]
}

export type MoveEffect = {
  nodes: readonly MoveNodePosition[]
  edges: readonly MoveEdgeChange[]
}

export type MoveCommit = {
  delta?: Point
  edges: readonly MoveEdgeChange[]
}

const EMPTY_ROOT_IDS: readonly NodeId[] = []
const EMPTY_MEMBERS: readonly MoveMember[] = []
const EMPTY_SNAP_EXCLUDE_IDS: readonly NodeId[] = []
const EMPTY_POSITIONS: readonly MoveNodePosition[] = []
const EMPTY_EDGES: readonly MoveEdgeChange[] = []
const EMPTY_MEMBER_ID_SET: ReadonlySet<NodeId> = new Set<NodeId>()

const toMemberIdSet = (
  members: readonly MoveMember[]
): ReadonlySet<NodeId> => (
  members.length > 0
    ? new Set(members.map((member) => member.id))
    : EMPTY_MEMBER_ID_SET
)

export const buildMoveSet = (options: {
  nodes: readonly Node[]
  ids: readonly NodeId[]
  nodeSize: Size
}): MoveSet => {
  const {
    nodes,
    ids,
    nodeSize
  } = options
  const rootIds = Array.from(new Set(ids))
  if (!rootIds.length) {
    return {
      rootIds: EMPTY_ROOT_IDS,
      members: EMPTY_MEMBERS,
      snapExcludeIds: EMPTY_SNAP_EXCLUDE_IDS
    }
  }

  const readNodeRect = (
    node: Node
  ): Rect | undefined => getNodeBoundsByNode(node, nodeSize)

  const expandedIds = expandFrameSelection({
    nodes,
    ids: rootIds,
    getNodeRect: readNodeRect,
    getFrameRect: (node) => (
      node.type === 'frame'
        ? getNodeBoundsByNode(node, nodeSize)
        : undefined
    )
  })
  const members = nodes.flatMap((node) => (
    expandedIds.has(node.id)
      ? [{
          id: node.id,
          position: node.position
        }]
      : []
  ))
  const snapExcludeIds = nodes.flatMap((node) => (
    expandedIds.has(node.id)
      ? [node.id]
      : []
  ))

  return {
    rootIds,
    members: members.length > 0 ? members : EMPTY_MEMBERS,
    snapExcludeIds:
      snapExcludeIds.length > 0
        ? snapExcludeIds
        : EMPTY_SNAP_EXCLUDE_IDS
  }
}

export const projectMovePositions = (
  members: readonly MoveMember[],
  delta: Point
): readonly MoveNodePosition[] => {
  if (!members.length) {
    return EMPTY_POSITIONS
  }

  return members.map((member) => ({
    id: member.id,
    position: {
      x: member.position.x + delta.x,
      y: member.position.y + delta.y
    }
  }))
}

const collectFollowEdgePatches = (options: {
  memberIds: ReadonlySet<NodeId>
  delta: Point
  edges: readonly Edge[]
}): readonly MoveEdgeChange[] => {
  if (!options.memberIds.size || (options.delta.x === 0 && options.delta.y === 0)) {
    return EMPTY_EDGES
  }

  const changes: MoveEdgeChange[] = []

  options.edges.forEach((edge) => {
    if (edge.source.kind !== 'node' || edge.target.kind !== 'node') {
      return
    }
    if (
      !options.memberIds.has(edge.source.nodeId)
      || !options.memberIds.has(edge.target.nodeId)
    ) {
      return
    }

    const patch = moveEdgeRoute(edge, options.delta)
    if (!patch) {
      return
    }

    changes.push({
      id: edge.id,
      patch
    })
  })

  return changes.length > 0 ? changes : EMPTY_EDGES
}

const collectMovedEdgePatches = (options: {
  edges: readonly Edge[]
  delta: Point
}): readonly MoveEdgeChange[] => {
  if (!options.edges.length || (options.delta.x === 0 && options.delta.y === 0)) {
    return EMPTY_EDGES
  }

  const changes: MoveEdgeChange[] = []

  options.edges.forEach((edge) => {
    const patch = moveEdge(edge, options.delta)
    if (!patch) {
      return
    }

    changes.push({
      id: edge.id,
      patch
    })
  })

  return changes.length > 0 ? changes : EMPTY_EDGES
}

export const resolveMoveEffect = (options: {
  nodes: readonly Node[]
  edges?: readonly Edge[]
  move: MoveSet
  delta: Point
  nodeSize: Size
}): MoveEffect => {
  const positions = projectMovePositions(options.move.members, options.delta)
  if (!positions.length) {
    return {
      nodes: EMPTY_POSITIONS,
      edges: EMPTY_EDGES
    }
  }

  const memberIds = toMemberIdSet(options.move.members)

  return {
    nodes: positions,
    edges: collectFollowEdgePatches({
      memberIds,
      delta: options.delta,
      edges: options.edges ?? []
    })
  }
}

export const projectMovePreview = (options: {
  nodes: readonly Node[]
  edgePlan?: MoveEdgePlan
  move: MoveSet
  delta: Point
  nodeSize: Size
}): MoveEffect => {
  const effect = resolveMoveEffect({
    nodes: options.nodes,
    edges: options.edgePlan?.follow,
    move: options.move,
    delta: options.delta,
    nodeSize: options.nodeSize
  })
  const selectedEdgeChanges = collectMovedEdgePatches({
    edges: options.edgePlan?.dragged ?? [],
    delta: options.delta
  })

  return {
    ...effect,
    edges:
      selectedEdgeChanges.length > 0
        ? [
            ...selectedEdgeChanges,
            ...effect.edges
          ]
        : effect.edges
  }
}

export const buildMoveCommit = (options: {
  delta: Point
  edgePlan?: MoveEdgePlan
}): MoveCommit => ({
  delta:
    options.delta.x === 0 && options.delta.y === 0
      ? undefined
      : options.delta,
  edges: collectMovedEdgePatches({
    edges: options.edgePlan?.dragged ?? [],
    delta: options.delta
  })
})
