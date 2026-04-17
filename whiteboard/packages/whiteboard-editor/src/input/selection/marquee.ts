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
import {
  createGesture
} from '@whiteboard/editor/input/gesture'
import {
  FINISH
} from '@whiteboard/editor/input/result'
import type { InteractionContext } from '@whiteboard/editor/input/context'
import type {
  InteractionSession
} from '@whiteboard/editor/input/types'
import type { PointerDownInput } from '@whiteboard/editor/types/input'
import type { SelectionMarqueePlan } from '@whiteboard/editor/input/selection/press'
import { GestureTuning } from '@whiteboard/editor/input/tuning'

export type MarqueeMatch = 'touch' | 'contain'

type MarqueeSelectionBaseState = {
  pointerId: number
  startScreen: Point
  startWorld: Point
  match: MarqueeMatch
  mode: SelectionMode
  base: SelectionTarget
  selection: SelectionTarget
}

type MarqueeSelectionState =
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

type MarqueeSelectionEffect =
  | {
      type: 'selection.replace'
      selection: SelectionTarget
    }
  | {
      type: 'preview.set'
      worldRect: Rect
      match: MarqueeMatch
    }

type MarqueeSelectionEvent =
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

type MarqueeSelectionTransition = {
  state: MarqueeSelectionState
  effects: readonly MarqueeSelectionEffect[]
}

const createMarqueeRect = (
  start: Point,
  current: Point
): Rect => rectFromPoints(start, current)

const readMatchedSelection = (
  input: {
    ctx: InteractionContext
    rect: Rect
    match: SelectionMarqueePlan['match']
  }
): SelectionTarget => ({
  nodeIds: input.ctx.query.node.idsInRect(input.rect, {
    match: input.match,
    policy: 'selection-marquee'
  }),
  edgeIds: input.ctx.query.edge.idsInRect(input.rect, {
    match: input.match
  })
})

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

const startMarqueeSelection = (
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

const reduceMarqueeSelection = (
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

const applyMarqueeEffect = (
  ctx: InteractionContext,
  interaction: InteractionSession,
  effect: MarqueeSelectionEffect
) => {
  switch (effect.type) {
    case 'selection.replace':
      ctx.local.session.selection.replace(effect.selection)
      return
    case 'preview.set':
      interaction.gesture = createGesture(
        'selection-marquee',
        {
          nodePatches: [],
          edgePatches: [],
          frameHoverId: undefined,
          guides: [],
          marquee: {
            worldRect: effect.worldRect,
            match: effect.match
          }
        }
      )
  }
}

export const createMarqueeSession = (
  ctx: InteractionContext,
  input: {
    start: PointerDownInput
    action: SelectionMarqueePlan
  }
): InteractionSession => {
  let state = startMarqueeSelection({
    pointerId: input.start.pointerId,
    startScreen: input.start.screen,
    startWorld: input.start.world,
    match: input.action.match,
    mode: input.action.mode,
    base: input.action.base
  })
  let interaction = null as InteractionSession | null

  if (input.action.clearOnStart) {
    ctx.local.session.selection.clear()
  }

  const dispatch = (
    event: MarqueeSelectionEvent
  ) => {
    const result = reduceMarqueeSelection(state, event)
    state = result.state
    result.effects.forEach((effect) => {
      applyMarqueeEffect(ctx, interaction!, effect)
    })
  }

  const step = (
    pointer: Pick<PointerDownInput, 'screen' | 'world'>
  ) => {
    dispatch({
      type: 'pointer.move',
      currentScreen: pointer.screen,
      currentWorld: pointer.world,
      minDistance: GestureTuning.dragMinDistance,
      matched: readMatchedSelection({
        ctx,
        rect: createMarqueeRect(state.startWorld, pointer.world),
        match: input.action.match
      })
    })
  }

  interaction = {
    mode: 'marquee',
    pointerId: input.start.pointerId,
    chrome: false,
    gesture: null,
    autoPan: {
      frame: (pointer) => {
        if (state.kind !== 'active') {
          return
        }

        const sample = ctx.query.viewport.pointer(pointer)
        step({
          screen: sample.screen,
          world: sample.world
        })
      }
    },
    move: (next) => {
      step(next)
    },
    up: (next) => {
      dispatch({
        type: 'pointer.up',
        currentScreen: next.screen,
        currentWorld: next.world,
        minDistance: GestureTuning.dragMinDistance,
        matched: readMatchedSelection({
          ctx,
          rect: createMarqueeRect(state.startWorld, next.world),
          match: input.action.match
        })
      })
      return FINISH
    },
    cleanup: () => {
      dispatch({
        type: 'cancel'
      })
    }
  }

  return interaction
}
