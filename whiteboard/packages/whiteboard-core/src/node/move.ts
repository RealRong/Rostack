import {
  moveEdge,
  moveEdgeRoute
} from '../edge'
import { getNodeAABB } from '../geometry'
import type {
  Edge,
  EdgeId,
  EdgePatch,
  Node,
  NodeId,
  Point,
  Size
} from '../types'
import {
  expandGroupMembers,
  isContainerNode
} from './group'
import {
  expandFrameSelection,
  resolveNodeFrame
} from './frame'
import { filterRootIds } from './owner'

export type MoveMember = {
  id: NodeId
  position: Point
}

export type MoveSet = {
  rootIds: readonly NodeId[]
  members: readonly MoveMember[]
}

export type MoveNodePosition = {
  id: NodeId
  position: Point
}

export type MoveEdgeChange = {
  id: EdgeId
  patch: EdgePatch
}

export type MoveEffect = {
  nodes: readonly MoveNodePosition[]
  edges: readonly MoveEdgeChange[]
  hovered?: NodeId
}

export type MoveCommit = {
  delta?: Point
  edges: readonly MoveEdgeChange[]
}

const EMPTY_ROOT_IDS: readonly NodeId[] = []
const EMPTY_MEMBERS: readonly MoveMember[] = []
const EMPTY_POSITIONS: readonly MoveNodePosition[] = []
const EMPTY_EDGES: readonly MoveEdgeChange[] = []
const EMPTY_MEMBER_ID_SET: ReadonlySet<NodeId> = new Set<NodeId>()

const toNodeById = (
  nodes: readonly Node[]
): ReadonlyMap<NodeId, Node> =>
  new Map(nodes.map((node) => [node.id, node]))

const toMemberIdSet = (
  members: readonly MoveMember[]
): ReadonlySet<NodeId> => (
  members.length > 0
    ? new Set(members.map((member) => member.id))
    : EMPTY_MEMBER_ID_SET
)

const toPositionById = (
  positions: readonly MoveNodePosition[]
): ReadonlyMap<NodeId, Point> =>
  new Map(positions.map((entry) => [entry.id, entry.position]))

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
  const rootIds = filterRootIds(nodes, ids)
  if (!rootIds.length) {
    return {
      rootIds: EMPTY_ROOT_IDS,
      members: EMPTY_MEMBERS
    }
  }

  const expandedIds = expandFrameSelection({
    nodes,
    ids: expandGroupMembers(nodes, rootIds).map((node) => node.id),
    getNodeRect: (node) => (
      node.type === 'group'
        ? undefined
        : getNodeAABB(node, nodeSize)
    ),
    getFrameRect: (node) => (
      node.type === 'frame'
        ? getNodeAABB(node, nodeSize)
        : undefined
    )
  })
  const members = nodes.flatMap((node) => (
    expandedIds.has(node.id) && node.type !== 'group'
      ? [{
          id: node.id,
          position: node.position
        }]
      : []
  ))

  return {
    rootIds,
    members: members.length > 0 ? members : EMPTY_MEMBERS
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

const resolveSharedContainerTarget = (options: {
  rootIds: readonly NodeId[]
  positionById: ReadonlyMap<NodeId, Point>
  nodeById: ReadonlyMap<NodeId, Node>
  nodes: readonly Node[]
  memberIds: ReadonlySet<NodeId>
  nodeSize: Size
}): NodeId | undefined => {
  let hovered: NodeId | undefined

  for (let index = 0; index < options.rootIds.length; index += 1) {
    const rootId = options.rootIds[index]!
    const node = options.nodeById.get(rootId)
    const position = options.positionById.get(rootId)
    if (!node || node.type === 'group' || !position) {
      continue
    }

    const target = resolveNodeFrame({
      nodes: options.nodes,
      nodeId: node.id,
      getNodeRect: (candidate) => {
        if (candidate.type === 'group') {
          return undefined
        }

        const nextPosition = options.positionById.get(candidate.id)
        return getNodeAABB(
          nextPosition
            ? {
                ...candidate,
                position: nextPosition
              }
            : candidate,
          options.nodeSize
        )
      },
      getFrameRect: (candidate) => (
        candidate.type === 'frame' && !options.memberIds.has(candidate.id)
          ? getNodeAABB(candidate, options.nodeSize)
          : undefined
      )
    })
    if (!target) {
      return undefined
    }
    if (hovered === undefined) {
      hovered = target
      continue
    }
    if (hovered !== target) {
      return undefined
    }
  }

  return hovered
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

  const nodeById = toNodeById(options.nodes)
  const memberIds = toMemberIdSet(options.move.members)
  const positionById = toPositionById(positions)
  const hasStationaryFrame = options.nodes.some((node) => (
    isContainerNode(node)
    && !memberIds.has(node.id)
  ))

  return {
    nodes: positions,
    edges: collectFollowEdgePatches({
      memberIds,
      delta: options.delta,
      edges: options.edges ?? []
    }),
    hovered: hasStationaryFrame
      ? resolveSharedContainerTarget({
          rootIds: options.move.rootIds,
          positionById,
          nodeById,
          nodes: options.nodes,
          memberIds,
          nodeSize: options.nodeSize
        })
      : undefined
  }
}

export const projectMovePreview = (options: {
  nodes: readonly Node[]
  relatedEdges?: readonly Edge[]
  selectedEdges?: readonly Edge[]
  move: MoveSet
  delta: Point
  nodeSize: Size
}): MoveEffect => {
  const effect = resolveMoveEffect({
    nodes: options.nodes,
    edges: options.relatedEdges,
    move: options.move,
    delta: options.delta,
    nodeSize: options.nodeSize
  })
  const selectedEdgeChanges = collectMovedEdgePatches({
    edges: options.selectedEdges ?? [],
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
  selectedEdges?: readonly Edge[]
}): MoveCommit => ({
  delta:
    options.delta.x === 0 && options.delta.y === 0
      ? undefined
      : options.delta,
  edges: collectMovedEdgePatches({
    edges: options.selectedEdges ?? [],
    delta: options.delta
  })
})
