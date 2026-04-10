import { rectFromPoints } from '@whiteboard/core/geometry'
import type {
  Point,
  Rect
} from '@whiteboard/core/types'
import {
  applySelectionTarget,
  isSelectionTargetEqual,
  type SelectionTarget
} from '@whiteboard/core/selection'
import type { SelectionMode } from '@whiteboard/core/node'

export type MarqueeMatch = 'touch' | 'contain'

export type MarqueeSelectionState = {
  pointerId: number
  startScreen: Point
  startWorld: Point
  match: MarqueeMatch
  mode: SelectionMode
  base: SelectionTarget
  active: boolean
  worldRect?: Rect
  selection: SelectionTarget
}

export type MarqueeSelectionDraft = {
  active: boolean
  worldRect?: Rect
  selection?: SelectionTarget
  changed: boolean
}

export type MarqueeSelectionStepResult = {
  state: MarqueeSelectionState
  draft: MarqueeSelectionDraft
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

export const startMarqueeSelection = (
  input: {
    pointerId: number
    startScreen: Point
    startWorld: Point
    match: MarqueeMatch
    mode: SelectionMode
    base: SelectionTarget
  }
): MarqueeSelectionState => ({
  pointerId: input.pointerId,
  startScreen: input.startScreen,
  startWorld: input.startWorld,
  match: input.match,
  mode: input.mode,
  base: input.base,
  active: false,
  selection: input.base
})

export const stepMarqueeSelection = (
  input: {
    state: MarqueeSelectionState
    currentScreen: Point
    currentWorld: Point
    minDistance: number
    matched: SelectionTarget
  }
): MarqueeSelectionStepResult => {
  const active = hasMarqueeStarted({
    startScreen: input.state.startScreen,
    currentScreen: input.currentScreen,
    minDistance: input.minDistance,
    active: input.state.active
  })
  if (!active) {
    return {
      state: input.state,
      draft: {
        active: false,
        changed: false
      }
    }
  }

  const worldRect = createMarqueeRect(
    input.state.startWorld,
    input.currentWorld
  )
  const selection = applySelectionTarget(
    input.state.base,
    input.matched,
    input.state.mode
  )
  const state = {
    ...input.state,
    active: true,
    worldRect,
    selection
  } satisfies MarqueeSelectionState

  return {
    state,
    draft: {
      active: true,
      worldRect,
      selection,
      changed: !isSelectionTargetEqual(input.state.selection, selection)
    }
  }
}

export const finishMarqueeSelection = (
  state: MarqueeSelectionState
): MarqueeSelectionDraft => ({
  active: state.active,
  worldRect: state.worldRect,
  selection: state.active
    ? state.selection
    : undefined,
  changed: false
})
