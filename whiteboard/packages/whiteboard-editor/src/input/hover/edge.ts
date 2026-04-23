import { scheduler } from '@shared/core'
import type { Point } from '@whiteboard/core/types'
import type { SnapRuntime } from '@whiteboard/editor/input/core/snap'
import type { HoverState } from '@whiteboard/editor/input/hover/store'
import type { Tool } from '@whiteboard/editor/types/tool'

export type EdgeHoverService = {
  move: (world: Point) => void
  clear: () => void
}

export const createEdgeHoverService = (
  ctx: {
    readTool: () => Tool
    snap: SnapRuntime
  },
  hover: {
    setHover: (
      next:
        | HoverState
        | ((current: HoverState) => HoverState)
    ) => void
  }
): EdgeHoverService => {
  let hoverPoint: Point | null = null

  const hoverTask = scheduler.createFrameTask(() => {
    if (!hoverPoint || ctx.readTool().type !== 'edge') {
      hover.setHover((current) => (
        current.edgeGuide === undefined
          ? current
          : {
              ...current,
              edgeGuide: undefined
            }
      ))
      return
    }

    const evaluation = ctx.snap.edge.connect({
      pointerWorld: hoverPoint
    })
    const edgeGuide =
      evaluation.focusedNodeId || evaluation.resolution.mode !== 'free'
        ? {
            connect: {
              focusedNodeId: evaluation.focusedNodeId,
              resolution: evaluation.resolution
            }
          }
        : undefined
    hover.setHover((current) => (
      current.edgeGuide === edgeGuide
        ? current
        : {
            ...current,
            edgeGuide
          }
    ))
  })

  const clear = () => {
    hoverTask.cancel()
    hoverPoint = null
    hover.setHover((current) => (
      current.edgeGuide === undefined
        ? current
        : {
            ...current,
            edgeGuide: undefined
          }
    ))
  }

  return {
    move: (world) => {
      if (ctx.readTool().type !== 'edge') {
        clear()
        return
      }

      hoverPoint = world
      hoverTask.schedule()
    },
    clear
  }
}
