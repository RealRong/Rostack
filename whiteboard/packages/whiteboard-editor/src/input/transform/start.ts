import {
  buildSelectionTransformPlan,
  readNodeRotation,
  resolveNodeTransformBehavior,
  type TransformSpec
} from '@whiteboard/core/node'
import type { Node, NodeId } from '@whiteboard/core/types'
import type { InteractionBinding } from '@whiteboard/editor/input/core/types'
import type { InteractionContext } from '@whiteboard/editor/input/context'
import type { PointerDownInput } from '@whiteboard/editor/types/input'
import type { TransformPickHandle } from '@whiteboard/editor/types/pick'
import {
  createTransformSession,
  type RuntimeTransformSpec,
  type TransformTarget
} from '@whiteboard/editor/input/transform/session'

const readTransformTarget = (
  ctx: InteractionContext,
  nodeId: NodeId
): TransformTarget | undefined => {
  const entry = ctx.query.node.canvas.get(nodeId)

  return entry
    ? {
        id: entry.node.id,
        node: entry.node,
        rect: entry.geometry.rect
      }
    : undefined
}

const readNodeTransformSpec = (
  ctx: InteractionContext,
  nodeId: NodeId,
  handle: TransformPickHandle,
  input: PointerDownInput
): RuntimeTransformSpec | undefined => {
  const entry = ctx.query.node.canvas.get(nodeId)
  if (!entry || entry.node.locked) {
    return undefined
  }

  const capability = ctx.query.node.capability(entry.node)
  const target = readTransformTarget(ctx, nodeId)
  if (!target) {
    return undefined
  }

  if (handle.kind === 'resize') {
    if (!handle.direction || !capability.resize) {
      return undefined
    }

    const behavior = resolveNodeTransformBehavior(entry.node, {
      role: capability.role,
      resize: capability.resize
    })
    if (entry.node.type === 'text' && behavior) {
      const plan = buildSelectionTransformPlan({
        box: target.rect,
        members: [{
          ...target,
          behavior
        }]
      })
      if (!plan) {
        return undefined
      }

      return {
        kind: 'selection-resize',
        pointerId: input.pointerId,
        plan,
        rotation: readNodeRotation(entry.node),
        handle: handle.direction,
        startScreen: input.client
      }
    }

    return {
      kind: 'single-resize',
      pointerId: input.pointerId,
      target,
      handle: handle.direction,
      rotation: readNodeRotation(entry.node),
      startScreen: input.client
    }
  }

  if (!capability.rotate) {
    return undefined
  }

  return {
    kind: 'single-rotate',
    pointerId: input.pointerId,
    target,
    rotation: readNodeRotation(entry.node),
    startWorld: input.world
  }
}

const readSelectionTransformSpec = (
  ctx: InteractionContext,
  handle: TransformPickHandle,
  input: PointerDownInput
): TransformSpec<Node> | undefined => {
  const selectionModel = ctx.selection.get()
  const selection = selectionModel.summary
  if (
    !selection.transformPlan
    || handle.kind !== 'resize'
    || !handle.direction
  ) {
    return undefined
  }

  return {
    kind: 'selection-resize',
    pointerId: input.pointerId,
    plan: selection.transformPlan,
    rotation: 0,
    handle: handle.direction,
    startScreen: input.client
  }
}

const resolveTransformSpec = (
  ctx: InteractionContext,
  input: PointerDownInput
): RuntimeTransformSpec | null => {
  const tool = ctx.query.tool.get()
  if (
    tool.type !== 'select'
    || (input.pick.kind !== 'node' && input.pick.kind !== 'selection-box')
    || input.pick.part !== 'transform'
    || !input.pick.handle
  ) {
    return null
  }

  if (input.pick.kind === 'node') {
    return readNodeTransformSpec(ctx, input.pick.id, input.pick.handle, input) ?? null
  }

  return readSelectionTransformSpec(ctx, input.pick.handle, input) ?? null
}

const startTransformInteraction = (
  ctx: InteractionContext,
  input: PointerDownInput
) => {
  const spec = resolveTransformSpec(ctx, input)

  return spec
    ? createTransformSession(ctx, spec, {
        modifiers: input.modifiers
      })
    : null
}

export const createTransformInteraction = (
  ctx: InteractionContext
): InteractionBinding => ({
  key: 'transform',
  start: (input) => startTransformInteraction(ctx, input)
})
