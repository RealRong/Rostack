import { HANDLED } from '@whiteboard/editor/input/session/result'
import type { InteractionBinding } from '@whiteboard/editor/input/core/types'
import { createEdgeConnectSession, tryStartEdgeConnect } from '@whiteboard/editor/input/features/edge/connect'
import {
  createEdgeLabelPressSession,
  startEdgeLabelPress
} from '@whiteboard/editor/input/features/edge/label'
import { createEdgeMoveSession, startEdgeMove } from '@whiteboard/editor/input/features/edge/move'
import {
  createEdgeRoutePressSession,
  tryStartEdgeRoute
} from '@whiteboard/editor/input/features/edge/route'
import type { EditorHostDeps } from '@whiteboard/editor/input/runtime'

const selectEdge = (
  ctx: Pick<EditorHostDeps, 'ops'>,
  edgeId: string
) => {
  ctx.ops.selection.replace({
    edgeIds: [edgeId]
  })
}

export const createEdgeBinding = (
  ctx: Pick<EditorHostDeps, 'engine' | 'projection' | 'sessionRead' | 'write' | 'ops' | 'snap'>
): InteractionBinding => ({
  key: 'edge',
  start: (input) => {
    const tool = ctx.sessionRead.tool.get()
    const connect = tryStartEdgeConnect({
      tool,
      pointer: input,
      node: ctx.projection.node,
      edge: ctx.projection.edge,
      zoom: ctx.sessionRead.viewport.get().zoom,
      config: ctx.engine.config.edge
    })
    if (connect) {
      if (connect.kind === 'reconnect') {
        selectEdge(ctx, connect.edgeId)
      }

      return createEdgeConnectSession(ctx, connect)
    }

    if (
      tool.type !== 'select'
      || input.pick.kind !== 'edge'
    ) {
      return null
    }

    if (input.pick.part === 'label') {
      const label = startEdgeLabelPress(ctx, input)
      if (!label) {
        return null
      }

      return label === 'handled'
        ? HANDLED
        : createEdgeLabelPressSession(ctx, input, label)
    }

    if (input.pick.part === 'path') {
      const route = tryStartEdgeRoute({
        edge: ctx.projection.edge,
        pointer: input
      })
      if (!route) {
        return null
      }

      selectEdge(
        ctx,
        route.kind === 'session'
          ? route.state.edgeId
          : route.edgeId
      )

      if (route.kind === 'remove') {
        ctx.ops.edge.route.removePoint(route.edgeId, route.index)
        return HANDLED
      }

      return createEdgeRoutePressSession(
        ctx,
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

    selectEdge(ctx, input.pick.id)
    const move = startEdgeMove({
      edge: ctx.projection.edge,
      edgeId: input.pick.id,
      pointerId: input.pointerId,
      start: input.world
    })

    return move.edge
      ? createEdgeMoveSession(ctx, move)
      : HANDLED
  }
})
