import { isPointEqual } from '@whiteboard/core/geometry'
import { moveEdge } from '@whiteboard/core/edge'
import type {
  Edge,
  EdgeId,
  Point
} from '@whiteboard/core/types'
import type { EdgeRead } from '../../../query/edge/read'

export type EdgeMoveState = {
  edgeId: EdgeId
  pointerId: number
  edge?: Edge
  start: Point
  delta: Point
}

export const readMovableEdge = (
  edge: Pick<EdgeRead, 'item' | 'capability'>,
  edgeId: EdgeId
) => {
  const item = edge.item.get(edgeId)

  return item && edge.capability(item.edge).move
    ? item.edge
    : undefined
}

export const startEdgeMove = (input: {
  edge: Pick<EdgeRead, 'item' | 'capability'>
  edgeId: EdgeId
  pointerId: number
  start: Point
}): EdgeMoveState => ({
  edgeId: input.edgeId,
  pointerId: input.pointerId,
  edge: readMovableEdge(input.edge, input.edgeId),
  start: input.start,
  delta: { x: 0, y: 0 }
})

export const stepEdgeMove = (
  state: EdgeMoveState,
  world: Point
): {
  state: EdgeMoveState
  patch?: ReturnType<typeof moveEdge>
  cancel?: true
} => {
  if (!state.edge) {
    return {
      state,
      cancel: true
    }
  }

  const delta = {
    x: world.x - state.start.x,
    y: world.y - state.start.y
  }
  if (isPointEqual(delta, state.delta)) {
    return {
      state
    }
  }

  return {
    state: {
      ...state,
      delta
    },
    patch: moveEdge(state.edge, delta)
  }
}

export const commitEdgeMove = (
  state: EdgeMoveState
): {
  edgeId: EdgeId
  delta: Point
} | undefined => (
  !isPointEqual(state.delta, { x: 0, y: 0 })
    ? {
        edgeId: state.edgeId,
        delta: state.delta
      }
    : undefined
)
