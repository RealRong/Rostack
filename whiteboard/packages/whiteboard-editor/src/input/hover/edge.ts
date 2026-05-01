import { scheduler } from '@shared/core'
import type { Point } from '@whiteboard/core/types'
import type { SnapRuntime } from '@whiteboard/editor/input/core/snap'
import type { EdgeGuidePreview } from '@whiteboard/editor-scene'
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
  preview: {
    read: () => EdgeGuidePreview | undefined
    write: (edgeGuide: EdgeGuidePreview | undefined) => void
  }
): EdgeHoverService => {
  let hoverPoint: Point | null = null

  const writeGuide = (
    nextGuide: EdgeGuidePreview | undefined
  ) => {
    const currentGuide = preview.read()
    if (currentGuide === nextGuide) {
      return
    }

    preview.write(nextGuide)
  }

  const hoverTask = scheduler.createFrameTask(() => {
    if (!hoverPoint || ctx.readTool().type !== 'edge') {
      writeGuide(undefined)
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
    writeGuide(edgeGuide)
  })

  const clear = () => {
    hoverTask.cancel()
    hoverPoint = null
    writeGuide(undefined)
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
