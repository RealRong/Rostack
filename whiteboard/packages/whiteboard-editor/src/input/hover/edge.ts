import { createRafTask } from '@shared/core'
import type { Point } from '@whiteboard/core/types'
import type { InteractionDeps } from '@whiteboard/editor/input/core/context'
import type { HoverStore } from '@whiteboard/editor/input/hover/store'

export type EdgeHoverService = {
  move: (world: Point) => void
  clear: () => void
}

export const createEdgeHoverService = (
  ctx: InteractionDeps,
  hover: Pick<HoverStore, 'set' | 'reset'>
): EdgeHoverService => {
  let hoverPoint: Point | null = null

  const hoverTask = createRafTask(() => {
    if (!hoverPoint || ctx.query.tool.get().type !== 'edge') {
      hover.reset()
      return
    }

    const evaluation = ctx.snap.edge.connect({
      pointerWorld: hoverPoint
    })
    hover.set({
      edgeGuide:
        evaluation.focusedNodeId || evaluation.resolution.mode !== 'free'
          ? {
              connect: {
                focusedNodeId: evaluation.focusedNodeId,
                resolution: evaluation.resolution
              }
            }
          : undefined
    })
  })

  const clear = () => {
    hoverTask.cancel()
    hoverPoint = null
    hover.reset()
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
