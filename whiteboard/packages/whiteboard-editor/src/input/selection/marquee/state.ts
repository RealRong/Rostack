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
import type { MarqueeMatch } from '#whiteboard-editor/input/selection/shared'

type MarqueeSelectionBaseState = {
  pointerId: number
  startScreen: Point
  startWorld: Point
  match: MarqueeMatch
  mode: SelectionMode
  base: SelectionTarget
  selection: SelectionTarget
}

export type MarqueeSelectionState =
  | (MarqueeSelectionBaseState & {
      kind: 'armed'
    })
  | (MarqueeSelectionBaseState & {
      kind: 'active'
      worldRect: Rect
    })
  | (MarqueeSelectionBaseState & {
      kind: 'finished'
      worldRect?: Rect
    })

export type MarqueeSelectionEffect =
  | {
      type: 'selection.replace'
      selection: SelectionTarget
    }
  | {
      type: 'preview.set'
      worldRect: Rect
      match: MarqueeMatch
    }

export type MarqueeSelectionEvent =
  | {
      type: 'pointer.move' | 'pointer.up'
      currentScreen: Point
      currentWorld: Point
      minDistance: number
      matched: SelectionTarget
    }
  | {
      type: 'cancel'
    }

export type MarqueeSelectionTransition = {
  state: MarqueeSelectionState
  effects: readonly MarqueeSelectionEffect[]
}

export const createMarqueeRect = (
  start: Point,
  current: Point
): Rect => rectFromPoints(start, current)

const hasMarqueeStarted = (input: {
  startScreen: Point
  currentScreen: Point
  minDistance: number
  active: boolean
}) => {
  if (input.active) {
    return true
  }

  const dx = Math.abs(input.currentScreen.x - input.startScreen.x)
  const dy = Math.abs(input.currentScreen.y - input.startScreen.y)

  return dx >= input.minDistance || dy >= input.minDistance
}

const toMarqueeSelectionState = (
  input: {
    previous: MarqueeSelectionState
    event: Extract<MarqueeSelectionEvent, {
      type: 'pointer.move' | 'pointer.up'
    }>
  }
): MarqueeSelectionState => {
  const active = hasMarqueeStarted({
    startScreen: input.previous.startScreen,
    currentScreen: input.event.currentScreen,
    minDistance: input.event.minDistance,
    active: input.previous.kind === 'active'
  })

  if (!active) {
    return input.event.type === 'pointer.up'
      ? {
          ...input.previous,
          kind: 'finished'
        }
      : input.previous
  }

  const worldRect = createMarqueeRect(
    input.previous.startWorld,
    input.event.currentWorld
  )
  const selection = applySelectionTarget(
    input.previous.base,
    input.event.matched,
    input.previous.mode
  )

  return {
    ...input.previous,
    kind: input.event.type === 'pointer.up' ? 'finished' : 'active',
    worldRect,
    selection
  }
}

const toMarqueeSelectionEffects = (
  previous: MarqueeSelectionState,
  next: MarqueeSelectionState
): readonly MarqueeSelectionEffect[] => {
  if (next.kind === 'armed' || next.kind === 'finished') {
    return []
  }

  const effects: MarqueeSelectionEffect[] = [{
    type: 'preview.set',
    worldRect: next.worldRect,
    match: next.match
  }]

  if (!isSelectionTargetEqual(previous.selection, next.selection)) {
    effects.push({
      type: 'selection.replace',
      selection: next.selection
    })
  }

  return effects
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
  kind: 'armed',
  pointerId: input.pointerId,
  startScreen: input.startScreen,
  startWorld: input.startWorld,
  match: input.match,
  mode: input.mode,
  base: input.base,
  selection: input.base
})

export const reduceMarqueeSelection = (
  state: MarqueeSelectionState,
  event: MarqueeSelectionEvent
): MarqueeSelectionTransition => {
  if (state.kind === 'finished') {
    return {
      state,
      effects: []
    }
  }

  if (event.type === 'cancel') {
    return {
      state: {
        ...state,
        kind: 'finished'
      },
      effects: []
    }
  }

  const next = toMarqueeSelectionState({
    previous: state,
    event
  })

  return {
    state: next,
    effects: toMarqueeSelectionEffects(state, next)
  }
}
