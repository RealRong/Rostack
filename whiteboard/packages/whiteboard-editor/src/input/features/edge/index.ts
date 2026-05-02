import { HANDLED } from '@whiteboard/editor/input/session/result'
import type { InteractionBinding } from '@whiteboard/editor/input/core/types'
import { createEdgeConnectSession, tryStartEdgeConnect } from '@whiteboard/editor/input/features/edge/connect'
import {
  createEdgeLabelPressSession,
  startEdgeLabelPress
} from '@whiteboard/editor/input/features/edge/label'
import { createEdgeMoveSession, startEdgeMove } from '@whiteboard/editor/input/features/edge/move'
import {
  removeEdgeRoutePoint,
  createEdgeRoutePressSession,
  tryStartEdgeRoute
} from '@whiteboard/editor/input/features/edge/route'
import type { WhiteboardLayoutService } from '@whiteboard/core/layout'
import type { Editor } from '@whiteboard/editor/types/editor'

const selectEdge = (
  editor: Editor,
  edgeId: string
) => {
  editor.dispatch({
    type: 'selection.set',
    selection: {
      nodeIds: [],
      edgeIds: [edgeId]
    }
  })
}

export const createEdgeBinding = (
  ctx: {
    editor: Editor
    layout: WhiteboardLayoutService
  }
): InteractionBinding => ({
  key: 'edge',
  start: (input) => {
    const tool = ctx.editor.scene.ui.state.tool.get()
    const connect = tryStartEdgeConnect({
      tool,
      pointer: input,
      editor: ctx.editor,
      zoom: ctx.editor.scene.ui.state.viewport.get().zoom,
      config: ctx.editor.runtime.config.edge
    })
    if (connect) {
      if (connect.kind === 'reconnect') {
        selectEdge(ctx.editor, connect.edgeId)
      }

      return createEdgeConnectSession(ctx.editor, connect)
    }

    if (
      tool.type !== 'select'
      || input.pick.kind !== 'edge'
    ) {
      return null
    }

    if (input.pick.part === 'label') {
      const label = startEdgeLabelPress(ctx.editor, input)
      if (!label) {
        return null
      }

      return label === 'handled'
        ? HANDLED
        : createEdgeLabelPressSession(ctx.editor, input, label)
    }

    if (input.pick.part === 'path') {
      const route = tryStartEdgeRoute({
        edge: ctx.editor.scene,
        pointer: input
      })
      if (!route) {
        return null
      }

      selectEdge(
        ctx.editor,
        route.kind === 'session'
          ? route.state.edgeId
          : route.edgeId
      )

      if (route.kind === 'remove') {
        removeEdgeRoutePoint(ctx.editor, route.edgeId, route.index)
        return HANDLED
      }

      return createEdgeRoutePressSession(
        ctx.editor,
        input,
        route.kind === 'session'
          ? {
              kind: 'session',
              state: route.state
            }
          : route
      )
    }

    if (input.pick.part !== 'body') {
      return null
    }

    selectEdge(ctx.editor, input.pick.id)
    const move = startEdgeMove({
      edge: ctx.editor.scene,
      edgeId: input.pick.id,
      pointerId: input.pointerId,
      start: input.world
    })

    return move.edge
      ? createEdgeMoveSession(ctx.editor, move)
      : HANDLED
  }
})
