import { expandRect } from './geometry'
import type { Point, Rect } from './types'

export type SnapThresholdConfig = {
  snapThresholdScreen: number
  snapMaxThresholdWorld: number
}

export const resolveInteractionZoom = (
  zoom: number,
  zoomEpsilon = 0.0001
) => Math.max(zoom, zoomEpsilon)

export const resolveScreenDistanceWorld = (
  screen: number,
  zoom: number,
  zoomEpsilon = 0.0001
) => screen / resolveInteractionZoom(zoom, zoomEpsilon)

export const resolveWorldThreshold = (
  screen: number,
  maxWorld: number,
  zoom: number,
  zoomEpsilon = 0.0001
) => Math.min(
  resolveScreenDistanceWorld(screen, zoom, zoomEpsilon),
  maxWorld
)

export const resolveSnapThresholdWorld = (
  config: SnapThresholdConfig,
  zoom: number,
  zoomEpsilon = 0.0001
) => resolveWorldThreshold(
  config.snapThresholdScreen,
  config.snapMaxThresholdWorld,
  zoom,
  zoomEpsilon
)

export const expandRectByThreshold = (
  rect: Rect,
  thresholdWorld: number
): Rect => expandRect(rect, thresholdWorld)

export const rectFromPoint = (
  point: Point,
  radius: number
): Rect => ({
  x: point.x - radius,
  y: point.y - radius,
  width: radius * 2,
  height: radius * 2
})

export const pickNearest = <T>(
  items: readonly T[],
  readDistance: (item: T) => number | undefined
): T | undefined => {
  let best: T | undefined
  let bestDistance = Number.POSITIVE_INFINITY

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    const distance = readDistance(item)
    if (
      distance === undefined
      || !Number.isFinite(distance)
      || distance >= bestDistance
    ) {
      continue
    }

    best = item
    bestDistance = distance
  }

  return best
}
