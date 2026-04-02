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
  type MoveEffect,
  type MoveSet
} from './move'
import { getNodeAABB } from '../geometry'
import type { Guide } from './snap'

export type MoveIntent = {
  target: SelectionTarget
}

export type MoveSession = {
  target: SelectionTarget
  nodes: readonly Node[]
  move: MoveSet
  bounds: Rect
  origin: Point
  startWorld: Point
  delta: Point
  selectedEdges: readonly Edge[]
  relatedEdges: readonly Edge[]
  nodeSize: Size
}

export type MoveSnapResolver = (input: {
  rect: Rect
  excludeIds: readonly NodeId[]
  allowCross: boolean
}) => {
  rect: Rect
  guides: readonly Guide[]
}

export type MoveStepResult = {
  session: MoveSession
  preview: MoveEffect
  guides: readonly Guide[]
}

const EMPTY_GUIDES: readonly Guide[] = []

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
  intent: MoveIntent
  startWorld: Point
  nodeSize: Size
}): MoveSession | null => {
  const move = buildMoveSet({
    nodes: input.nodes,
    ids: input.intent.target.nodeIds,
    nodeSize: input.nodeSize
  })
  if (!move.members.length) {
    return null
  }

  const bounds = getMoveBounds(input.nodes, move, input.nodeSize)
  if (!bounds) {
    return null
  }

  const selectedEdgeIds = new Set(input.intent.target.edgeIds)

  return {
    target: input.intent.target,
    nodes: input.nodes,
    move,
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
    selectedEdges: input.edges.filter((edge) => selectedEdgeIds.has(edge.id)),
    relatedEdges: input.edges.filter((edge) => !selectedEdgeIds.has(edge.id)),
    nodeSize: input.nodeSize
  }
}

export const stepMoveSession = (input: {
  session: MoveSession
  pointerWorld: Point
  allowCross: boolean
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
    ? input.snap({
        rect: rawRect,
        excludeIds: session.move.members.map((member) => member.id),
        allowCross: input.allowCross
      })
    : {
        rect: rawRect,
        guides: EMPTY_GUIDES
      }
  const delta = {
    x: snapped.rect.x - session.origin.x,
    y: snapped.rect.y - session.origin.y
  }
  const nextSession = {
    ...session,
    delta
  } satisfies MoveSession

  return {
    session: nextSession,
    preview: projectMovePreview({
      nodes: session.nodes,
      relatedEdges: session.relatedEdges,
      selectedEdges: session.selectedEdges,
      move: session.move,
      delta,
      nodeSize: session.nodeSize
    }),
    guides: snapped.guides
  }
}

export const finishMoveSession = (
  session: MoveSession
): MoveCommit => buildMoveCommit({
    delta: session.delta,
    selectedEdges: session.selectedEdges
  })
