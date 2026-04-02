import type { TransformPreviewPatch } from '@whiteboard/core/node'
import type {
  InteractionBinding,
  InteractionSession
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
  plan: NonNullable<ReturnType<typeof createTransformPlan>>
): InteractionSession => {
  let latest = null as ReturnType<typeof projectTransform> | null

  ctx.write.preview.selection.clearPreview()
  const project = (
    input: TransformPointerInput
  ) => {
    const preview = projectTransform({
      ctx,
      plan,
      pointer: input
    })
    latest = preview
    ctx.write.preview.selection.setNodePatches(
      toTransformNodePatches(preview.nodePatches)
    )
  }

  return {
    mode: 'node-transform',
    pointerId: plan.drag.pointerId,
    chrome: false,
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
    cleanup: () => {
      ctx.snap.clear()
      ctx.write.preview.selection.clearPreview()
    }
  }
}

export const createTransformInteraction = (
  ctx: TransformInteractionCtx
): InteractionBinding => ({
  key: 'transform',
  start: (input) => {
    const plan = createTransformPlan(ctx, input)
    return plan
      ? createTransformSession(ctx, plan)
      : null
  }
})
