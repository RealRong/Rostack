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
} from '@whiteboard/editor/input/internals/result'
import type { Editor } from '@whiteboard/editor/api/editor'

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
  projection: Editor['scene'],
  edgeId: EdgeId
) => {
  const current = projection.edges.get(edgeId)?.base.edge

  return current && projection.edges.capability(edgeId)?.move
    ? current
    : undefined
}

export const startEdgeMove = (input: {
  edge: Editor['scene']
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

export const createEdgeMoveSession = (
  editor: Editor,
  initial: EdgeMoveState
): InteractionSession => {
  let state = initial

  const step = (
    world: Point
  ) => {
    const result = stepEdgeMove(state, world)
    state = result.state

    if (result.cancel) {
      return CANCEL
    }

    editor.state.write(({
      writer,
      snapshot
    }) => {
      Object.keys(snapshot.preview.edge).forEach((edgeId) => {
        const id = edgeId as EdgeId
        if (!result.patch || id !== state.edgeId) {
          writer.preview.edge.delete(id)
          return
        }

        writer.preview.edge.patch(id, {
          patch: result.patch,
          activeRouteIndex: undefined
        })
      })

      if (result.patch && !snapshot.preview.edge[state.edgeId]) {
        writer.preview.edge.create(state.edgeId, {
          patch: result.patch
        })
      }
    })
  }

  return {
    mode: 'edge-drag',
    pointerId: state.pointerId,
    chrome: false,
    autoPan: {
      frame: (pointer) => step(editor.viewport.pointer(pointer).world)
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
        editor.actions.document.edge.move({
          ids: [commit.edgeId],
          delta: commit.delta
        })
      }

      return FINISH
    },
    cleanup: () => {
      editor.state.write(({
        writer,
        snapshot
      }) => {
        Object.keys(snapshot.preview.edge).forEach((edgeId) => {
          writer.preview.edge.delete(edgeId as EdgeId)
        })
      })
    }
  }
}
