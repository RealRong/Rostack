import { buildTransformCommitUpdates } from '@whiteboard/core/node'
import type {
  TransformInteractionCtx,
  TransformProjection,
  TransformSession
} from './types'

export const commitTransform = (
  ctx: TransformInteractionCtx,
  session: TransformSession,
  projection: TransformProjection | null
) => {
  if (!projection?.patches.length) {
    return
  }

  const updates = buildTransformCommitUpdates({
    targets: session.targets,
    patches: projection.patches,
    commitTargetIds: session.commitTargetIds
  })
  if (!updates.length) {
    return
  }

  ctx.write.document.node.document.updateMany(updates)
}
