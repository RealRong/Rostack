import type { Point } from '../types'
import type { MindmapNodeId } from './types'

export const DEFAULT_ROOT_MOVE_THRESHOLD = 0.5

export const shouldMoveMindmapRoot = (options: {
  position: Point
  origin?: Point
  threshold?: number
}) => {
  if (!options.origin) {
    return true
  }

  const threshold = options.threshold ?? DEFAULT_ROOT_MOVE_THRESHOLD

  return (
    Math.abs(options.origin.x - options.position.x) >= threshold
    || Math.abs(options.origin.y - options.position.y) >= threshold
  )
}

export const shouldMoveMindmapSubtree = (options: {
  drop: {
    parentId: MindmapNodeId
    index: number
    side?: 'left' | 'right'
  }
  origin?: {
    parentId?: MindmapNodeId
    index?: number
  }
}) => (
  options.drop.parentId !== options.origin?.parentId
  || options.drop.index !== options.origin?.index
  || typeof options.drop.side !== 'undefined'
)
