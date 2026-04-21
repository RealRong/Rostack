import type { Rect, Size } from '@whiteboard/core/types'

const round = (
  value: number
) => Math.round(value * 100) / 100

const readDebugFlag = () => Boolean(
  (globalThis as {
    __WB_DEBUG_MINDMAP_EDIT__?: boolean
  }).__WB_DEBUG_MINDMAP_EDIT__
)

export const debugRect = (
  rect: Rect | undefined
) => rect
  ? {
      x: round(rect.x),
      y: round(rect.y),
      width: round(rect.width),
      height: round(rect.height)
    }
  : undefined

export const debugSize = (
  size: Size | undefined
) => size
  ? {
      width: round(size.width),
      height: round(size.height)
    }
  : undefined

export const debugMindmapEdit = (
  phase: string,
  payload: Record<string, unknown>
) => {
  if (!readDebugFlag()) {
    return
  }

  console.log(`[wb:mindmap-edit] ${phase}`, payload)
}
