import type { Point, Size } from '#whiteboard-core/types'

export const isPointEqual = (
  left: Point | undefined,
  right: Point | undefined
) => {
  if (!left && !right) return true
  if (!left || !right) return false
  return left.x === right.x && left.y === right.y
}

export const isSizeEqual = (
  left: Size | undefined,
  right: Size | undefined
) => {
  if (!left && !right) return true
  if (!left || !right) return false
  return left.width === right.width && left.height === right.height
}
