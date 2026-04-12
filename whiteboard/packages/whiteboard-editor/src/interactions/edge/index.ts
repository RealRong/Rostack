import type {
  InteractionBinding
} from '../../runtime/interaction/types'
import { HANDLED } from '../../runtime/interaction/result'
import type { InteractionContext } from '../context'
import { startEdgeInteraction } from '../../runtime/edge/interaction'
import { createEdgeConnectSession } from './connect'
import { createEdgeBodyMoveSession } from './move'
import { createEdgeRouteSession, createEdgeRoutePointSession } from './routePoint'

export const createEdgeInteraction = (
  ctx: InteractionContext
): InteractionBinding => ({
  key: 'edge',
  start: (input) => {
    const action = startEdgeInteraction({
      tool: ctx.read.tool.get(),
      pointer: input,
      node: ctx.read.node,
      edge: ctx.read.edge,
      zoom: ctx.read.viewport.get().zoom,
      config: ctx.config.edge,
      session: ctx.write.session
    })
    if (!action) {
      return null
    }

    switch (action.kind) {
      case 'connect':
        return createEdgeConnectSession(ctx, action.state)
      case 'move':
        return createEdgeBodyMoveSession(ctx, action.state)
      case 'route':
        return createEdgeRouteSession(ctx, action.state)
      case 'remove':
        ctx.write.edge.route.remove(action.edgeId, action.index)
        ctx.write.preview.edge.clearPatches()
        return HANDLED
      case 'insert': {
        const result = ctx.write.edge.route.insert(
          action.edgeId,
          action.point
        )
        if (!result.ok) {
          ctx.write.preview.edge.clearPatches()
          return HANDLED
        }

        return createEdgeRoutePointSession(ctx, {
          edgeId: action.edgeId,
          index: result.data.index,
          pointerId: action.pointerId,
          startWorld: action.startWorld,
          origin: action.origin
        })
      }
      case 'handled':
        return HANDLED
    }
  }
})
