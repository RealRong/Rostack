import { scheduler } from '@shared/core'
import type { Point } from '@whiteboard/core/types'
import type { SnapRuntime } from '@whiteboard/editor/input/core/snap'
import type { HoverState } from '@whiteboard/editor/input/hover/store'
import type { SessionRead } from '@whiteboard/editor/session/read'

export type EdgeHoverService = {
  move: (world: Point) => void
  clear: () => void
}

export const createEdgeHoverService = (
  ctx: {
    sessionRead: SessionRead
    snap: SnapRuntime
  },
  hover: {
    setHover: (hover: HoverState) => void
    clearHover: () => void
  }
): EdgeHoverService => {
  let hoverPoint: Point | null = null

  const hoverTask = scheduler.createFrameTask(() => {
    if (!hoverPoint || ctx.sessionRead.tool.get().type !== 'edge') {
      hover.clearHover()
      return
    }

    const evaluation = ctx.snap.edge.connect({
      pointerWorld: hoverPoint
    })
    hover.setHover({
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
    hover.clearHover()
  }

  return {
    move: (world) => {
      if (ctx.sessionRead.tool.get().type !== 'edge') {
        clear()
        return
      }

      hoverPoint = world
      hoverTask.schedule()
    },
    clear
  }
}
