import type { EdgeConnectState } from '@whiteboard/core/edge'
import type { EdgeId, Point } from '@whiteboard/core/types'
import type {
  InteractionControl,
  InteractionStartResult
} from '../../runtime/interaction'
import type { PointerDownInput } from '../../types/input'
import { readEdgeType } from '../../tool/model'
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

const selectEdge = (
  ctx: EdgeInteractionCtx,
  edgeId: EdgeId
) => {
  ctx.write.session.selection.replace({
    edgeIds: [edgeId]
  })
}

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

const startEdgeConnectPlan = (
  ctx: EdgeInteractionCtx,
  decision: Extract<EdgePressDecision, { kind: 'connect' }>,
  control: InteractionControl
): InteractionStartResult => {
  if (decision.selectEdgeId) {
    selectEdge(ctx, decision.selectEdgeId)
  }

  return createEdgeConnectSession(ctx, decision.state, control)
}

const startEdgeMoveBodyPlan = (
  ctx: EdgeInteractionCtx,
  start: PointerDownInput,
  decision: Extract<EdgePressDecision, { kind: 'move-body' }>,
  control: InteractionControl
) => {
  selectEdge(ctx, decision.edgeId)
  return createEdgeBodyMoveSession(ctx, {
    edgeId: decision.edgeId,
    pointerId: start.pointerId,
    start: start.world
  }, control)
}

const startEdgeRoutePointDragPlan = (
  ctx: EdgeInteractionCtx,
  decision: Extract<EdgePressDecision, { kind: 'drag-route-point' }>,
  control: InteractionControl
) => createEdgeRoutePointSession(ctx, {
  edgeId: decision.edgeId,
  index: decision.index,
  pointerId: decision.pointerId,
  start: decision.start,
  origin: decision.origin
}, control)

const runEdgeRemoveRoutePointPlan = (
  ctx: EdgeInteractionCtx,
  decision: Extract<EdgePressDecision, { kind: 'remove-route-point' }>
): InteractionStartResult => {
  ctx.write.document.edge.route.remove(
    decision.edgeId,
    decision.index
  )
  ctx.write.preview.edge.clearPatches()
  return HANDLED
}

const runEdgeInsertRoutePointPlan = (
  ctx: EdgeInteractionCtx,
  decision: Extract<EdgePressDecision, { kind: 'insert-route-point' }>,
  control: InteractionControl
): InteractionStartResult => {
  selectEdge(ctx, decision.edgeId)

  const result = ctx.write.document.edge.route.insert(
    decision.edgeId,
    decision.worldPoint
  )

  if (!decision.dragAfterInsert) {
    ctx.write.preview.edge.clear()
    return HANDLED
  }

  if (!result.ok) {
    ctx.write.preview.edge.clearPatches()
    return HANDLED
  }

  const origin =
    readEdgeRouteOrigin(ctx, decision.edgeId, result.data.index)
    ?? decision.worldPoint

  return createEdgeRoutePointSession(ctx, {
    edgeId: decision.edgeId,
    index: result.data.index,
    pointerId: decision.dragAfterInsert.pointerId,
    start: decision.dragAfterInsert.start,
    origin
  }, control)
}

export const startEdgePressPlan = (
  ctx: EdgeInteractionCtx,
  start: PointerDownInput,
  plan: EdgePressPlan,
  control: InteractionControl
): InteractionStartResult => {
  switch (plan.decision.kind) {
    case 'connect':
      return startEdgeConnectPlan(ctx, plan.decision, control)
    case 'move-body':
      return startEdgeMoveBodyPlan(ctx, start, plan.decision, control)
    case 'insert-route-point':
      return runEdgeInsertRoutePointPlan(ctx, plan.decision, control)
    case 'drag-route-point':
      return startEdgeRoutePointDragPlan(ctx, plan.decision, control)
    case 'remove-route-point':
      return runEdgeRemoveRoutePointPlan(ctx, plan.decision)
  }
}
