import { geometry as geometryApi } from '@whiteboard/core/geometry'
import { edge as edgeApi } from '@whiteboard/core/edge'
import type {
  Edge,
  EdgeId,
  Point
} from '@whiteboard/core/types'
import type {
  InteractionSession
} from '@whiteboard/editor/input/core/types'
import {
  CANCEL,
  FINISH
} from '@whiteboard/editor/input/session/result'
import { createGesture } from '@whiteboard/editor/input/core/gesture'
import type { EditorHostDeps } from '@whiteboard/editor/input/runtime'

export type EdgeMoveState = {
  edgeId: EdgeId
  pointerId: number
  edge?: Edge
  start: Point
  delta: Point
}

const ZERO_POINT: Point = {
  x: 0,
  y: 0
}

const readEdgeMovePatch = (
  state: EdgeMoveState
) => state.edge && !geometryApi.equal.point(state.delta, ZERO_POINT)
  ? edgeApi.edit.move(state.edge, state.delta)
  : undefined

const readMovableEdge = (
  projection: Pick<EditorHostDeps, 'projection'>['projection'],
  edgeId: EdgeId
) => {
  const current = projection.read.scene.edges.get(edgeId)?.base.edge

  return current && projection.read.scene.edges.capability(edgeId)?.move
    ? current
    : undefined
}

export const startEdgeMove = (input: {
  edge: Pick<EditorHostDeps, 'projection'>['projection']
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
  patch?: ReturnType<typeof edgeApi.edit.move>
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
  if (geometryApi.equal.point(delta, state.delta)) {
    return {
      state,
      patch: readEdgeMovePatch(state)
    }
  }

  const nextState = {
    ...state,
    delta
  }

  return {
    state: nextState,
    patch: readEdgeMovePatch(nextState)
  }
}

const commitEdgeMove = (
  state: EdgeMoveState
): {
  edgeId: EdgeId
  delta: Point
} | undefined => (
  !geometryApi.equal.point(state.delta, ZERO_POINT)
    ? {
        edgeId: state.edgeId,
        delta: state.delta
      }
    : undefined
)

const readMoveGesture = (
  state: EdgeMoveState,
  patch?: ReturnType<typeof stepEdgeMove>['patch']
) => patch
  ? createGesture(
      'edge-move',
      {
        edgePatches: [{
          id: state.edgeId,
          patch
        }]
      }
    )
  : null

export const createEdgeMoveSession = (
  ctx: Pick<EditorHostDeps, 'projection' | 'sessionRead' | 'write'>,
  initial: EdgeMoveState
): InteractionSession => {
  let state = initial
  let interaction = null as InteractionSession | null

  const step = (
    world: Point
  ) => {
    const result = stepEdgeMove(state, world)
    state = result.state

    if (result.cancel) {
      return CANCEL
    }

    interaction!.gesture = readMoveGesture(state, result.patch)
  }

  interaction = {
    mode: 'edge-drag',
    pointerId: state.pointerId,
    chrome: false,
    gesture: null,
    autoPan: {
      frame: (pointer) => step(ctx.sessionRead.viewport.pointer(pointer).world)
    },
    move: (input) => {
      const transition = step(input.world)
      if (transition) {
        return transition
      }
    },
    up: (input) => {
      const transition = step(input.world)
      if (transition) {
        return transition
      }

      const commit = commitEdgeMove(state)
      if (commit) {
        ctx.write.edge.move({
          ids: [commit.edgeId],
          delta: commit.delta
        })
      }

      return FINISH
    },
    cleanup: () => {}
  }

  return interaction
}
