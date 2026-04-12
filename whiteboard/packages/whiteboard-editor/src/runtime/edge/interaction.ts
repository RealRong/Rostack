import type { EdgeConnectState } from '@whiteboard/core/edge'
import type { BoardConfig } from '@whiteboard/core/config'
import type { EdgeId } from '@whiteboard/core/types'
import type { PointerDownInput } from '../../types/input'
import type { Tool } from '../../types/tool'
import type { SessionCommands } from '../commands/session'
import type { EdgeRead } from '../read/edge'
import type { NodeRead } from '../read/node'
import { startEdgeConnect } from './connect'
import { startEdgeMove, type EdgeMoveState } from './move'
import { startEdgeRoute, type EdgeRouteHandleState, type EdgeRouteStart } from './route'

export type EdgeInteractionStart =
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

export const readEdgeInteractionCapability = (
  edge: Pick<EdgeRead, 'item' | 'capability'>,
  edgeId: EdgeId
) => {
  const item = edge.item.get(edgeId)
  return item
    ? edge.capability(item.edge)
    : undefined
}

export const selectEdgeInteraction = (
  session: Pick<SessionCommands, 'selection'>,
  edgeId: EdgeId
) => {
  session.selection.replace({
    edgeIds: [edgeId]
  })
}

export const startEdgeInteraction = (input: {
  tool: Tool
  pointer: PointerDownInput
  node: Pick<NodeRead, 'canvas' | 'capability'>
  edge: Pick<EdgeRead, 'item' | 'resolved' | 'capability'>
  zoom: number
  config: BoardConfig['edge']
  session: Pick<SessionCommands, 'selection'>
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

  if (input.pointer.pick.part !== 'body') {
    return undefined
  }

  selectEdgeInteraction(input.session, input.pointer.pick.id)
  const state = startEdgeMove({
    edge: input.edge,
    edgeId: input.pointer.pick.id,
    pointerId: input.pointer.pointerId,
    start: input.pointer.world
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
