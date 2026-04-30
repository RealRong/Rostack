import type { Point, Rect } from '@whiteboard/core/types'

export const getRectCenter = (rect: Rect): Point => ({
  x: rect.x + rect.width / 2,
  y: rect.y + rect.height / 2
})

export const isPointInRect = (point: Point, rect: Rect) => (
  point.x >= rect.x &&
  point.x <= rect.x + rect.width &&
  point.y >= rect.y &&
  point.y <= rect.y + rect.height
)

export const rectFromPoints = (a: Point, b: Point): Rect => {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  const width = Math.abs(a.x - b.x)
  const height = Math.abs(a.y - b.y)
  return { x, y, width, height }
}

export const rectContains = (outer: Rect, inner: Rect) => (
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height
)

export const rectIntersects = (a: Rect, b: Rect) => (
  a.x <= b.x + b.width &&
  a.x + a.width >= b.x &&
  a.y <= b.y + b.height &&
  a.y + a.height >= b.y
)

export const distancePointToRect = (
  point: Point,
  rect: Rect
): number => {
  const dx = Math.max(
    rect.x - point.x,
    0,
    point.x - (rect.x + rect.width)
  )
  const dy = Math.max(
    rect.y - point.y,
    0,
    point.y - (rect.y + rect.height)
  )

  return Math.hypot(dx, dy)
}

export const expandRect = (
  rect: Rect,
  value: number
): Rect => ({
  x: rect.x - value,
  y: rect.y - value,
  width: rect.width + value * 2,
  height: rect.height + value * 2
})

export const rectFromPoint = (
  point: Point,
  radius: number
): Rect => ({
  x: point.x - radius,
  y: point.y - radius,
  width: radius * 2,
  height: radius * 2
})

export const getRectCorners = (rect: Rect): Point[] => [
  { x: rect.x, y: rect.y },
  { x: rect.x + rect.width, y: rect.y },
  { x: rect.x + rect.width, y: rect.y + rect.height },
  { x: rect.x, y: rect.y + rect.height }
]

export const getAABBFromPoints = (points: Point[]): Rect => {
  return getRectsBoundingRect(points.map((point) => ({
    x: point.x,
    y: point.y,
    width: 0,
    height: 0
  }))) ?? { x: 0, y: 0, width: 0, height: 0 }
}

export const getRectsBoundingRect = (
  rects: readonly Rect[]
): Rect | undefined => {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  rects.forEach((rect) => {
    minX = Math.min(minX, rect.x)
    minY = Math.min(minY, rect.y)
    maxX = Math.max(maxX, rect.x + rect.width)
    maxY = Math.max(maxY, rect.y + rect.height)
  })

  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(minY) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(maxY)
  ) {
    return undefined
  }

  return {
    x: minX,
    y: minY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY)
  }
}
