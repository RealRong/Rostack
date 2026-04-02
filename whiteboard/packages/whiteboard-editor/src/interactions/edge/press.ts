import type { EdgeConnectState } from '@whiteboard/core/edge'
import type { EdgeId, Point } from '@whiteboard/core/types'
import type {
  InteractionControl,
  InteractionStartResult
} from '../../runtime/interaction'
import type { PointerDownInput } from '../../types/input'
import { readEdgeType } from '../../edge/preset'
import {
  createEdgeConnectSession,
  resolveEdgeCreateState,
  resolveEdgeReconnectState
} from './connect'
import { createEdgeBodyMoveSession } from './move'
import {
  createEdgeRoutePointSession,
  readEdgeRouteOrigin,
  resolveEdgeRoutePointTarget
} from './routePoint'
import type { EdgeInteractionCtx } from './types'

type EdgePressTarget =
  | {
      kind: 'create'
      state: EdgeConnectState
    }
  | {
      kind: 'reconnect'
      state: Extract<EdgeConnectState, { kind: 'reconnect' }>
    }
  | {
      kind: 'body'
      edgeId: EdgeId
    }
  | {
      kind: 'route-anchor'
      edgeId: EdgeId
      index: number
      point: Point
    }
  | {
      kind: 'route-insert'
      edgeId: EdgeId
      worldPoint: Point
    }

type EdgePressDecision =
  | {
      kind: 'connect'
      state: EdgeConnectState
      selectEdgeId?: EdgeId
    }
  | {
      kind: 'move-body'
      edgeId: EdgeId
    }
  | {
      kind: 'insert-route-point'
      edgeId: EdgeId
      worldPoint: Point
      dragAfterInsert?: {
        pointerId: number
        start: Point
      }
    }
  | {
      kind: 'drag-route-point'
      edgeId: EdgeId
      index: number
      pointerId: number
      start: Point
      origin: Point
    }
  | {
      kind: 'remove-route-point'
      edgeId: EdgeId
      index: number
    }

export type EdgePressPlan = {
  target: EdgePressTarget
  decision: EdgePressDecision
}

const HANDLED: InteractionStartResult = 'handled'

const readCapability = (
  ctx: EdgeInteractionCtx,
  edgeId: EdgeId
) => {
  const item = ctx.read.edge.item.get(edgeId)
  return item
    ? ctx.read.edge.capability(item.edge)
    : undefined
}

const resolveEdgePressTarget = (
  ctx: EdgeInteractionCtx,
  input: PointerDownInput
): EdgePressTarget | null => {
  const tool = ctx.read.tool.get()

  if (tool.type === 'edge') {
    const canStartFromNodeHandle =
      input.pick.kind === 'node'
      && input.pick.part === 'connect'
      && Boolean(input.pick.side)

    if (
      !canStartFromNodeHandle
      && (input.editable || input.ignoreInput || input.ignoreSelection)
    ) {
      return null
    }

    return {
      kind: 'create',
      state: resolveEdgeCreateState(ctx, input, readEdgeType(tool.preset))
    }
  }

  if (tool.type !== 'select') {
    return null
  }

  if (
    input.pick.kind === 'edge'
    && input.pick.part === 'end'
    && input.pick.end
  ) {
    const state = resolveEdgeReconnectState(ctx, {
      edgeId: input.pick.id,
      end: input.pick.end,
      pointerId: input.pointerId,
      world: input.world
    })
    if (!state || state.kind !== 'reconnect') {
      return null
    }

    return {
      kind: 'reconnect',
      state
    }
  }

  if (
    input.pick.kind === 'edge'
    && input.pick.part === 'body'
  ) {
    return {
      kind: 'body',
      edgeId: input.pick.id
    }
  }

  const routePoint = resolveEdgeRoutePointTarget(ctx, input.pick)
  if (!routePoint) {
    return null
  }

  return routePoint.kind === 'anchor'
    ? {
        kind: 'route-anchor',
        edgeId: routePoint.edgeId,
        index: routePoint.index,
        point: routePoint.point
      }
    : {
        kind: 'route-insert',
        edgeId: routePoint.edgeId,
        worldPoint: input.world
      }
}

const resolveEdgePressDecision = (
  ctx: EdgeInteractionCtx,
  input: PointerDownInput,
  target: EdgePressTarget
): EdgePressDecision | null => {
  switch (target.kind) {
    case 'create':
      return {
        kind: 'connect',
        state: target.state
      }
    case 'reconnect':
      return {
        kind: 'connect',
        state: target.state,
        selectEdgeId: target.state.edgeId
      }
    case 'body': {
      const capability = readCapability(ctx, target.edgeId)
      if (!capability) {
        return null
      }

      if (input.modifiers.shift || input.detail >= 2) {
        if (!capability.editRoute) {
          return null
        }

        return {
          kind: 'insert-route-point',
          edgeId: target.edgeId,
          worldPoint: input.world
        }
      }

      if (!capability.move) {
        return null
      }

      return {
        kind: 'move-body',
        edgeId: target.edgeId
      }
    }
    case 'route-anchor':
      return input.detail >= 2
        ? {
            kind: 'remove-route-point',
            edgeId: target.edgeId,
            index: target.index
          }
        : {
            kind: 'drag-route-point',
            edgeId: target.edgeId,
            index: target.index,
            pointerId: input.pointerId,
            start: input.world,
            origin: target.point
          }
    case 'route-insert':
      return {
        kind: 'insert-route-point',
        edgeId: target.edgeId,
        worldPoint: target.worldPoint,
        dragAfterInsert: {
          pointerId: input.pointerId,
          start: input.world
        }
      }
  }
}

export const resolveEdgePressPlan = (
  ctx: EdgeInteractionCtx,
  input: PointerDownInput
): EdgePressPlan | null => {
  const target = resolveEdgePressTarget(ctx, input)
  if (!target) {
    return null
  }

  const decision = resolveEdgePressDecision(ctx, input, target)
  if (!decision) {
    return null
  }

  return {
    target,
    decision
  }
}

export const startEdgePressPlan = (
  ctx: EdgeInteractionCtx,
  start: PointerDownInput,
  plan: EdgePressPlan,
  control: InteractionControl
): InteractionStartResult => {
  switch (plan.decision.kind) {
    case 'connect':
      if (plan.decision.selectEdgeId) {
        ctx.write.session.selection.replace({
          edgeIds: [plan.decision.selectEdgeId]
        })
      }

      return createEdgeConnectSession(ctx, plan.decision.state, control)
    case 'move-body':
      ctx.write.session.selection.replace({
        edgeIds: [plan.decision.edgeId]
      })
      return createEdgeBodyMoveSession(ctx, {
        edgeId: plan.decision.edgeId,
        pointerId: start.pointerId,
        start: start.world
      }, control)
    case 'insert-route-point': {
      ctx.write.session.selection.replace({
        edgeIds: [plan.decision.edgeId]
      })

      const result = ctx.write.document.edge.route.insert(
        plan.decision.edgeId,
        plan.decision.worldPoint
      )

      if (!plan.decision.dragAfterInsert) {
        ctx.write.preview.edge.clear()
        return HANDLED
      }

      if (!result.ok) {
        ctx.write.preview.edge.clearPatches()
        return HANDLED
      }

      const origin =
        readEdgeRouteOrigin(ctx, plan.decision.edgeId, result.data.index)
        ?? plan.decision.worldPoint

      return createEdgeRoutePointSession(ctx, {
        edgeId: plan.decision.edgeId,
        index: result.data.index,
        pointerId: plan.decision.dragAfterInsert.pointerId,
        start: plan.decision.dragAfterInsert.start,
        origin
      }, control)
    }
    case 'drag-route-point':
      return createEdgeRoutePointSession(ctx, {
        edgeId: plan.decision.edgeId,
        index: plan.decision.index,
        pointerId: plan.decision.pointerId,
        start: plan.decision.start,
        origin: plan.decision.origin
      }, control)
    case 'remove-route-point':
      ctx.write.document.edge.route.remove(
        plan.decision.edgeId,
        plan.decision.index
      )
      ctx.write.preview.edge.clearPatches()
      return HANDLED
  }
}
