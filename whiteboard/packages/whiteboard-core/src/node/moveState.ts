import { geometry as geometryApi } from '@whiteboard/core/geometry'
import type { SelectionTarget } from '@whiteboard/core/selection'
import type {
  Edge,
  Node,
  NodeId,
  Point,
  Rect
} from '@whiteboard/core/types'
import {
  buildMoveCommit,
  buildMoveSet,
  projectMovePreview,
  type MoveCommit,
  type MoveEdgePlan,
  type MoveEffect,
  type MoveSet
} from '@whiteboard/core/node/move'
import { getNodeRect } from '@whiteboard/core/node/geometry'

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

    return [getNodeRect(node)]
  })

  return geometryApi.rect.boundingRect(rects)
}

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
