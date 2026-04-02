import { rectFromPoints } from '../geometry'
import type {
  EdgeId,
  NodeId,
  Point,
  Rect
} from '../types'

export type SelectionMarqueeItems = {
  nodeIds: readonly NodeId[]
  edgeIds: readonly EdgeId[]
}

export type MarqueeMatch = 'touch' | 'contain'

export type MarqueeSession = {
  pointerId: number
  startScreen: Point
  startWorld: Point
  match: MarqueeMatch
  active: boolean
  worldRect?: Rect
}

export type MarqueeStepResult = {
  session: MarqueeSession
  active: boolean
  worldRect?: Rect
}

export const createMarqueeRect = (
  start: Point,
  current: Point
): Rect => rectFromPoints(start, current)

export const hasMarqueeStarted = (options: {
  startScreen: Point
  currentScreen: Point
  minDistance: number
  active: boolean
}) => {
  if (options.active) {
    return true
  }

  const dx = Math.abs(options.currentScreen.x - options.startScreen.x)
  const dy = Math.abs(options.currentScreen.y - options.startScreen.y)

  return dx >= options.minDistance || dy >= options.minDistance
}

export const createMarqueeItemsKey = (
  items: SelectionMarqueeItems
) => [
  [...items.nodeIds].sort().join('|'),
  [...items.edgeIds].sort().join('|')
].join('::')

export const startMarqueeSession = (input: {
  pointerId: number
  startScreen: Point
  startWorld: Point
  match: MarqueeMatch
}): MarqueeSession => ({
  pointerId: input.pointerId,
  startScreen: input.startScreen,
  startWorld: input.startWorld,
  match: input.match,
  active: false
})

export const stepMarqueeSession = (input: {
  session: MarqueeSession
  currentScreen: Point
  currentWorld: Point
  minDistance: number
}): MarqueeStepResult => {
  const active = hasMarqueeStarted({
    startScreen: input.session.startScreen,
    currentScreen: input.currentScreen,
    minDistance: input.minDistance,
    active: input.session.active
  })
  if (!active) {
    return {
      session: input.session,
      active: false
    }
  }

  const worldRect = createMarqueeRect(
    input.session.startWorld,
    input.currentWorld
  )
  const session = {
    ...input.session,
    active: true,
    worldRect
  } satisfies MarqueeSession

  return {
    session,
    active: true,
    worldRect
  }
}

export const finishMarqueeSession = (
  session: MarqueeSession
) => ({
  active: session.active,
  worldRect: session.worldRect
})
