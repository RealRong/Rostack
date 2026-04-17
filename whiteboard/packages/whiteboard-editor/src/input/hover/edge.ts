import { createRafTask } from '@shared/core'
import type { Point } from '@whiteboard/core/types'
import type { InteractionContext } from '@whiteboard/editor/input/context'

export type EdgeHoverService = {
  move: (world: Point) => void
  clear: () => void
}

export const createEdgeHoverService = (
  ctx: InteractionContext
): EdgeHoverService => {
  let hoverPoint: Point | null = null

  const hoverTask = createRafTask(() => {
    if (!hoverPoint || ctx.query.tool.get().type !== 'edge') {
      ctx.local.feedback.edge.clearGuide()
      return
    }

    const evaluation = ctx.snap.edge.connect({
      pointerWorld: hoverPoint
    })
    ctx.local.feedback.edge.setGuide(
      evaluation.focusedNodeId || evaluation.resolution.mode !== 'free'
        ? {
            connect: {
              focusedNodeId: evaluation.focusedNodeId,
              resolution: evaluation.resolution
            }
          }
        : undefined
    )
  })

  const clear = () => {
    hoverTask.cancel()
    hoverPoint = null
    ctx.local.feedback.edge.clearGuide()
  }

  return {
    move: (world) => {
      if (ctx.query.tool.get().type !== 'edge') {
        clear()
        return
      }

      hoverPoint = world
      hoverTask.schedule()
    },
    clear
  }
}
