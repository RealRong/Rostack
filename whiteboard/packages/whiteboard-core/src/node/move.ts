import { edge as edgeApi } from '@whiteboard/core/edge'
import { geometry as geometryApi } from '@whiteboard/core/geometry'
import type {
  Edge,
  EdgeId,
  EdgePatch,
  Node,
  NodeId,
  Point,
  Rect
} from '@whiteboard/core/types'
import { createFrameQuery } from '@whiteboard/core/node/frame'
import { getNodeBoundsByNode } from '@whiteboard/core/node/geometry'
import type { SelectionTarget } from '@whiteboard/core/selection'

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
  translation?: Point
  edges: readonly MoveEdgeChange[]
}

export type MoveState = {
  move: MoveSet
  edgePlan: MoveEdgePlan
  bounds: Rect
  origin: Point
  startWorld: Point
  delta: Point
}

export type MoveSnapResolver = (input: {
  rect: Rect
  excludeIds: readonly NodeId[]
}) => Rect

export type MoveStepResult = {
  state: MoveState
  preview: MoveEffect
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
}): MoveSet => {
  const { nodes, ids } = options
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
  ): Rect | undefined => getNodeBoundsByNode(node)

  const frame = createFrameQuery({
    nodes,
    getNodeRect: readNodeRect,
    getFrameRect: (node) => (
      node.type === 'frame'
        ? getNodeBoundsByNode(node)
        : undefined
    )
  })
  const expandedIds = new Set(rootIds)

  rootIds.forEach((nodeId) => {
    frame.descendants(nodeId).forEach((childId) => {
      expandedIds.add(childId)
    })
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

    const patch = edgeApi.points.moveAll(edge, options.delta)
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
    const patch = edgeApi.edit.move(edge, options.delta)
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

const getMoveBounds = (
  nodes: readonly Node[],
  move: MoveSet
): Rect | undefined => {
  const nodeById = new Map(nodes.map((node) => [node.id, node] as const))
  const rects = move.members.flatMap((member) => {
    const node = nodeById.get(member.id)
    if (!node) {
      return []
    }

    const rect = getNodeBoundsByNode(node)
    return rect ? [rect] : []
  })

  return geometryApi.rect.boundingRect(rects)
}

export const resolveMoveEffect = (options: {
  edges?: readonly Edge[]
  move: MoveSet
  delta: Point
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
  edgePlan?: MoveEdgePlan
  move: MoveSet
  delta: Point
}): MoveEffect => {
  const effect = resolveMoveEffect({
    edges: options.edgePlan?.follow,
    move: options.move,
    delta: options.delta
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
  translation:
    options.delta.x === 0 && options.delta.y === 0
      ? undefined
      : options.delta,
  edges: collectMovedEdgePatches({
    edges: options.edgePlan?.dragged ?? [],
    delta: options.delta
  })
})

export const startMoveState = (input: {
  nodes: readonly Node[]
  edges: readonly Edge[]
  target: SelectionTarget
  startWorld: Point
}): MoveState | null => {
  const move = buildMoveSet({
    nodes: input.nodes,
    ids: input.target.nodeIds
  })
  if (!move.members.length) {
    return null
  }

  const bounds = getMoveBounds(input.nodes, move)
  if (!bounds) {
    return null
  }

  const draggedEdgeIds = new Set(input.target.edgeIds)

  return {
    move,
    edgePlan: {
      dragged: input.edges.filter((edge) => draggedEdgeIds.has(edge.id)),
      follow: input.edges.filter((edge) => !draggedEdgeIds.has(edge.id))
    },
    bounds,
    origin: {
      x: bounds.x,
      y: bounds.y
    },
    startWorld: input.startWorld,
    delta: {
      x: 0,
      y: 0
    }
  }
}

export const stepMoveState = (input: {
  state: MoveState
  pointerWorld: Point
  snap?: MoveSnapResolver
}): MoveStepResult => {
  const { state } = input
  const rawRect = {
    x: state.origin.x + (input.pointerWorld.x - state.startWorld.x),
    y: state.origin.y + (input.pointerWorld.y - state.startWorld.y),
    width: state.bounds.width,
    height: state.bounds.height
  }
  const snapped = input.snap
    ? {
        rect: rawRect,
        snappedRect: input.snap({
          rect: rawRect,
          excludeIds: state.move.snapExcludeIds
        })
      }
    : {
        rect: rawRect,
        snappedRect: rawRect
      }
  const delta = {
    x: snapped.snappedRect.x - state.origin.x,
    y: snapped.snappedRect.y - state.origin.y
  }
  const nextState = {
    ...state,
    delta
  } satisfies MoveState

  return {
    state: nextState,
    preview: projectMovePreview({
      edgePlan: state.edgePlan,
      move: state.move,
      delta
    })
  }
}

export const finishMoveState = (
  state: MoveState
): MoveCommit => buildMoveCommit({
    delta: state.delta,
    edgePlan: state.edgePlan
  })
