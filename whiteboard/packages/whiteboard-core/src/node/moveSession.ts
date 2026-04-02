import { getRectsBoundingRect } from '../geometry'
import type { SelectionTarget } from '../selection'
import type {
  Edge,
  Node,
  NodeId,
  Point,
  Rect,
  Size
} from '../types'
import {
  buildMoveCommit,
  buildMoveSet,
  projectMovePreview,
  type MoveCommit,
  type MoveEdgePlan,
  type MoveEffect,
  type MoveSet
} from './move'
import { getNodeAABB } from '../geometry'

export type MoveSession = {
  nodes: readonly Node[]
  move: MoveSet
  edgePlan: MoveEdgePlan
  bounds: Rect
  origin: Point
  startWorld: Point
  delta: Point
  nodeSize: Size
}

export type MoveSnapResolver = (input: {
  rect: Rect
  excludeIds: readonly NodeId[]
}) => Rect

export type MoveStepResult = {
  session: MoveSession
  preview: MoveEffect
}

const getMoveBounds = (
  nodes: readonly Node[],
  move: MoveSet,
  nodeSize: Size
): Rect | undefined => {
  const nodeById = new Map(nodes.map((node) => [node.id, node] as const))
  const rects = move.members.flatMap((member) => {
    const node = nodeById.get(member.id)
    if (!node || node.type === 'group') {
      return []
    }

    return [getNodeAABB(node, nodeSize)]
  })

  return getRectsBoundingRect(rects)
}

export const startMoveSession = (input: {
  nodes: readonly Node[]
  edges: readonly Edge[]
  target: SelectionTarget
  startWorld: Point
  nodeSize: Size
}): MoveSession | null => {
  const move = buildMoveSet({
    nodes: input.nodes,
    ids: input.target.nodeIds,
    nodeSize: input.nodeSize
  })
  if (!move.members.length) {
    return null
  }

  const bounds = getMoveBounds(input.nodes, move, input.nodeSize)
  if (!bounds) {
    return null
  }

  const draggedEdgeIds = new Set(input.target.edgeIds)

  return {
    nodes: input.nodes,
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
    },
    nodeSize: input.nodeSize
  }
}

export const stepMoveSession = (input: {
  session: MoveSession
  pointerWorld: Point
  snap?: MoveSnapResolver
}): MoveStepResult => {
  const { session } = input
  const rawRect = {
    x: session.origin.x + (input.pointerWorld.x - session.startWorld.x),
    y: session.origin.y + (input.pointerWorld.y - session.startWorld.y),
    width: session.bounds.width,
    height: session.bounds.height
  }
  const snapped = input.snap
    ? {
        rect: rawRect,
        snappedRect: input.snap({
          rect: rawRect,
          excludeIds: session.move.members.map((member) => member.id)
        })
      }
    : {
        rect: rawRect,
        snappedRect: rawRect
      }
  const delta = {
    x: snapped.snappedRect.x - session.origin.x,
    y: snapped.snappedRect.y - session.origin.y
  }
  const nextSession = {
    ...session,
    delta
  } satisfies MoveSession

  return {
    session: nextSession,
    preview: projectMovePreview({
      nodes: session.nodes,
      edgePlan: session.edgePlan,
      move: session.move,
      delta,
      nodeSize: session.nodeSize
    })
  }
}

export const finishMoveSession = (
  session: MoveSession
): MoveCommit => buildMoveCommit({
    delta: session.delta,
    edgePlan: session.edgePlan
  })
