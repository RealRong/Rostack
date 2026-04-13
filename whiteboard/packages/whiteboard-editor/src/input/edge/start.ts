import type { EdgeConnectState } from '@whiteboard/core/edge'
import type { BoardConfig } from '@whiteboard/core/config'
import type { EdgeId } from '@whiteboard/core/types'
import type { InteractionBinding } from '../core/types'
import { HANDLED } from '../core/result'
import type { InteractionContext } from '../context'
import type { PointerDownInput } from '../../types/input'
import type { Tool } from '../../types/tool'
import type { SessionActions } from '../../types/commands'
import type { EdgePresentationRead } from '../../query/edge/read'
import type { NodePresentationRead } from '../../query/node/read'
import { createEdgeConnectSession } from './connect/session'
import { startEdgeConnect } from './connect/start'
import { createEdgeBodyMoveSession } from './move/session'
import { startEdgeMove, type EdgeMoveState } from './move/start'
import { createEdgeRouteSession, createEdgeRoutePointSession } from './route/session'
import { startEdgeRoute, type EdgeRouteHandleState, type EdgeRouteStart } from './route/start'

type EdgeInteractionStart =
  | {
      kind: 'connect'
      state: EdgeConnectState
    }
  | {
      kind: 'move'
      state: EdgeMoveState
    }
  | {
      kind: 'route'
      state: EdgeRouteHandleState
    }
  | Extract<EdgeRouteStart, { kind: 'insert' | 'remove' }>
  | {
      kind: 'handled'
    }

const selectEdgeInteraction = (
  session: Pick<SessionActions, 'selection'>,
  edgeId: EdgeId
) => {
  session.selection.replace({
    edgeIds: [edgeId]
  })
}

const startEdgeRouteInteraction = (input: {
  edge: Pick<EdgePresentationRead, 'item' | 'resolved' | 'capability'>
  pointer: PointerDownInput
  session: Pick<SessionActions, 'selection'>
}): EdgeInteractionStart | undefined => {
  const route = startEdgeRoute({
    edge: input.edge,
    pointer: input.pointer
  })
  if (!route) {
    return undefined
  }

  selectEdgeInteraction(
    input.session,
    route.kind === 'session'
      ? route.state.edgeId
      : route.edgeId
  )

  return route.kind === 'session'
    ? {
        kind: 'route',
        state: route.state
      }
    : route
}

const startEdgeBodyInteraction = (input: {
  edge: Pick<EdgePresentationRead, 'item' | 'capability'>
  edgeId: EdgeId
  pointerId: number
  start: PointerDownInput['world']
}): EdgeInteractionStart => {
  const state = startEdgeMove({
    edge: input.edge,
    edgeId: input.edgeId,
    pointerId: input.pointerId,
    start: input.start
  })

  return state.edge
    ? {
        kind: 'move',
        state
      }
    : {
        kind: 'handled'
      }
}

const startEdgeInteraction = (input: {
  tool: Tool
  pointer: PointerDownInput
  node: Pick<NodePresentationRead, 'canvas' | 'capability'>
  edge: Pick<EdgePresentationRead, 'item' | 'resolved' | 'capability'>
  zoom: number
  config: BoardConfig['edge']
  session: Pick<SessionActions, 'selection'>
}): EdgeInteractionStart | undefined => {
  const connect = startEdgeConnect({
    tool: input.tool,
    pointer: input.pointer,
    node: input.node,
    edge: input.edge,
    zoom: input.zoom,
    config: input.config
  })
  if (connect) {
    if (connect.kind === 'reconnect') {
      selectEdgeInteraction(input.session, connect.edgeId)
    }

    return {
      kind: 'connect',
      state: connect
    }
  }

  if (
    input.tool.type !== 'select'
    || input.pointer.pick.kind !== 'edge'
  ) {
    return undefined
  }

  if (input.pointer.pick.part === 'path') {
    return startEdgeRouteInteraction({
      edge: input.edge,
      pointer: input.pointer,
      session: input.session
    })
  }

  if (input.pointer.pick.part !== 'body') {
    return undefined
  }

  selectEdgeInteraction(input.session, input.pointer.pick.id)
  return startEdgeBodyInteraction({
    edge: input.edge,
    edgeId: input.pointer.pick.id,
    pointerId: input.pointer.pointerId,
    start: input.pointer.world
  })
}

export const createEdgeInteraction = (
  ctx: InteractionContext
): InteractionBinding => ({
  key: 'edge',
  start: (input) => {
    const action = startEdgeInteraction({
      tool: ctx.query.tool.get(),
      pointer: input,
      node: ctx.query.node,
      edge: ctx.query.edge,
      zoom: ctx.query.viewport.get().zoom,
      config: ctx.config.edge,
      session: {
        selection: ctx.local.session.selection
      }
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
        ctx.command.edge.route.remove(action.edgeId, action.index)
        ctx.local.feedback.edge.clearPatches()
        return HANDLED
      case 'insert': {
        const result = ctx.command.edge.route.insert(
          action.edgeId,
          action.point
        )
        if (!result.ok) {
          ctx.local.feedback.edge.clearPatches()
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
