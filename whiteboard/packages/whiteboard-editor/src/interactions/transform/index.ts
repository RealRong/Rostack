import type { TransformPreviewPatch } from '@whiteboard/core/node'
import type {
  InteractionBinding,
  InteractionSession
} from '../../runtime/interaction'
import {
  createTransformGesture
} from '../../runtime/interaction'
import { commitTransform } from './commit'
import { createTransformPlan } from './plan'
import { projectTransform } from './project'
import type {
  TransformInteractionCtx,
  TransformPointerInput
} from './types'

const toTransformNodePatches = (
  patches: readonly TransformPreviewPatch[]
) => patches.map(({
  id,
  position,
  size,
  rotation
}) => ({
  id,
  patch: {
    position,
    size,
    rotation
  }
}))

const createTransformSession = (
  ctx: TransformInteractionCtx,
  plan: NonNullable<ReturnType<typeof createTransformPlan>>,
  start: TransformPointerInput
): InteractionSession => {
  let latest = null as ReturnType<typeof projectTransform> | null
  let modifiers = start.modifiers
  let interaction = null as InteractionSession | null

  const project = (
    input: TransformPointerInput
  ) => {
    modifiers = input.modifiers
    const preview = projectTransform({
      ctx,
      plan,
      pointer: input
    })
    latest = preview
    interaction!.gesture = createTransformGesture({
      start: {
        point: start.world,
        selection: ctx.read.selection.target.get()
      },
      draft: {
        nodePatches: toTransformNodePatches(preview.nodePatches),
        edgePatches: [],
        frameHoverId: undefined,
        marquee: undefined,
        guides: preview.guides
      },
      meta: {
        mode: plan.kind === 'single-rotate'
          ? 'rotate'
          : 'resize'
      }
    })
  }

  interaction = {
    mode: 'node-transform',
    pointerId: plan.drag.pointerId,
    chrome: false,
    gesture: null,
    autoPan: {
      frame: (pointer) => {
        project({
          screen: ctx.read.viewport.screenPoint(pointer.clientX, pointer.clientY),
          world: ctx.read.viewport.pointer(pointer).world,
          modifiers
        })
      }
    },
    move: (input) => {
      project(input)
    },
    up: (input) => {
      project(input)
      commitTransform(ctx, plan, latest)
      return {
        kind: 'finish'
      }
    },
    cleanup: () => {}
  }

  return interaction
}

export const createTransformInteraction = (
  ctx: TransformInteractionCtx
): InteractionBinding => ({
  key: 'transform',
  start: (input) => {
    const plan = createTransformPlan(ctx, input)
    return plan
      ? createTransformSession(ctx, plan, {
          screen: input.screen,
          world: input.world,
          modifiers: input.modifiers
        })
      : null
  }
})
