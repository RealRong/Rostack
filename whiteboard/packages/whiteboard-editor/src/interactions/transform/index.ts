import type { TransformPreviewPatch } from '@whiteboard/core/node'
import type {
  InteractionBinding,
  InteractionSession
} from '../../runtime/interaction'
import { commitTransform } from './commit'
import { projectTransform } from './project'
import { startTransformSession } from './start'
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
  initial: NonNullable<ReturnType<typeof startTransformSession>>
): InteractionSession => {
  let latest = null as ReturnType<typeof projectTransform> | null

  ctx.write.preview.selection.clearPreview()
  const project = (
    input: TransformPointerInput
  ) => {
    const projection = projectTransform({
      ctx,
      session: initial,
      pointer: input
    })
    latest = projection
    ctx.write.preview.selection.setNodePatches(
      toTransformNodePatches(projection.patches)
    )
    ctx.write.preview.selection.setGuides(projection.guides)
  }

  return {
    mode: 'node-transform',
    pointerId: initial.drag.pointerId,
    chrome: false,
    move: (input) => {
      project(input)
    },
    up: (input) => {
      project(input)
      commitTransform(ctx, initial, latest)
      return {
        kind: 'finish'
      }
    },
    cleanup: () => {
      ctx.write.preview.selection.clearPreview()
    }
  }
}

export const createTransformInteraction = (
  ctx: TransformInteractionCtx
): InteractionBinding => ({
  key: 'transform',
  start: (input) => {
    const session = startTransformSession(ctx, input)
    return session
      ? createTransformSession(ctx, session)
      : null
  }
})
