import { buildTransformCommitUpdates } from '@whiteboard/core/node'
import type {
  TransformInteractionCtx,
  TransformPlan,
  TransformPreview
} from './types'

export const commitTransform = (
  ctx: TransformInteractionCtx,
  plan: TransformPlan,
  preview: TransformPreview | null
) => {
  if (!preview?.nodePatches.length) {
    return
  }

  const updates = (() => {
    switch (plan.kind) {
      case 'single-resize':
      case 'single-rotate':
        return buildTransformCommitUpdates({
          targets: [plan.target],
          patches: preview.nodePatches
        })
      case 'multi-scale':
        return buildTransformCommitUpdates({
          targets: plan.targets,
          patches: preview.nodePatches,
          commitTargetIds: plan.commitIds
        })
    }
  })()

  if (!updates.length) {
    return
  }

  ctx.write.document.node.document.updateMany(updates)
}
