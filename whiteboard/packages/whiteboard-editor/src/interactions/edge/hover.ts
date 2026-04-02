import { createRafTask } from '@whiteboard/engine'
import { Point } from '@whiteboard/core/types'
import type { EdgeInteractionCtx } from './types'

export type EdgeHoverService = {
  move: (world: Point) => void
  clear: () => void
}

export const createEdgeHoverService = (
  ctx: EdgeInteractionCtx
): EdgeHoverService => {
  let hoverPoint: Point | null = null

  const hoverTask = createRafTask(() => {
    if (!hoverPoint || ctx.read.tool.get().type !== 'edge') {
      ctx.write.preview.edge.clearGuide()
      return
    }

    const target = ctx.snap.edge.connect(hoverPoint)
    ctx.write.preview.edge.setGuide(
      target
        ? { snap: target.pointWorld }
        : undefined
    )
  })

  const clear = () => {
    hoverTask.cancel()
    hoverPoint = null
    ctx.write.preview.edge.clearGuide()
  }

  return {
    move: (world) => {
      if (ctx.read.tool.get().type !== 'edge') {
        clear()
        return
      }

      hoverPoint = world
      hoverTask.schedule()
    },
    clear
  }
}
