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
import type { EditorCommand } from '@whiteboard/editor/state/intents'
import {
  isPreviewEqual,
  replacePreviewEdgeInteraction
} from '@whiteboard/editor/state/preview'

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

    editor.dispatch((snapshot) => {
      const current = snapshot.overlay.preview
      const nextPreview = replacePreviewEdgeInteraction(
        current,
        result.patch
          ? [{
              id: state.edgeId,
              patch: result.patch
            }]
          : []
      )
      return isPreviewEqual(current, nextPreview)
        ? null
        : {
            type: 'overlay.preview.set',
            preview: nextPreview
          } satisfies EditorCommand
    })
  }

  return {
    mode: 'edge-drag',
    pointerId: state.pointerId,
    chrome: false,
    autoPan: {
      frame: (pointer) => step(editor.runtime.viewport.pointer(pointer).world)
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
        editor.actions.edge.move({
          ids: [commit.edgeId],
          delta: commit.delta
        })
      }

      return FINISH
    },
    cleanup: () => {
      editor.dispatch((snapshot) => {
        const current = snapshot.overlay.preview
        const nextPreview = replacePreviewEdgeInteraction(current, [])
        return isPreviewEqual(current, nextPreview)
          ? null
          : {
              type: 'overlay.preview.set',
              preview: nextPreview
            } satisfies EditorCommand
      })
    }
  }
}
