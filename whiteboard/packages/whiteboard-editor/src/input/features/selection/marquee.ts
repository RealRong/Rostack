import { geometry as geometryApi } from '@whiteboard/core/geometry'
import type {
  Point,
  Rect
} from '@whiteboard/core/types'
import { selection as selectionApi, type SelectionTarget } from '@whiteboard/core/selection'
import type { SelectionMode } from '@whiteboard/core/node'
import {
  createGesture
} from '@whiteboard/editor/input/core/gesture'
import {
  FINISH
} from '@whiteboard/editor/input/session/result'
import type {
  InteractionSession
} from '@whiteboard/editor/input/core/types'
import type { PointerDownInput } from '@whiteboard/editor/types/input'
import { GestureTuning } from '@whiteboard/editor/input/session/tuning'
import type { EditorHostDeps } from '@whiteboard/editor/input/runtime'

export type MarqueeMatch = 'touch' | 'contain'

type SelectionMarqueeAction = {
  kind: 'marquee'
  match: MarqueeMatch
  mode: SelectionMode
  base: SelectionTarget
  clearOnStart?: boolean
}

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

const createMarqueeRect = (
  start: Point,
  current: Point
): Rect => geometryApi.rect.fromPoints(start, current)

const readMatchedSelection = (
  input: {
    ctx: Pick<EditorHostDeps, 'query'>
    rect: Rect
    match: SelectionMarqueeAction['match']
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
  const selection = selectionApi.target.apply(
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
): MarqueeSelectionState => {
  if (state.kind === 'finished') {
    return state
  }

  if (event.type === 'cancel') {
    return {
      ...state,
      kind: 'finished'
    }
  }

  return toMarqueeSelectionState({
    previous: state,
    event
  })
}

const syncMarqueeInteraction = (
  ctx: Pick<EditorHostDeps, 'actions'>,
  interaction: InteractionSession,
  previous: MarqueeSelectionState,
  next: MarqueeSelectionState
) => {
  if (!selectionApi.target.equal(previous.selection, next.selection)) {
    ctx.actions.selection.replace(next.selection)
  }

  interaction.gesture = next.kind === 'active'
    ? createGesture('selection-marquee', {
        marquee: {
          worldRect: next.worldRect,
          match: next.match
        },
        guides: []
      })
    : null
}

export const createMarqueeSession = (
  ctx: Pick<EditorHostDeps, 'query' | 'actions'>,
  input: {
    start: PointerDownInput
    action: SelectionMarqueeAction
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
    ctx.actions.selection.clear()
  }

  const dispatch = (
    event: MarqueeSelectionEvent
  ) => {
    const previous = state
    state = reduceMarqueeSelection(state, event)
    syncMarqueeInteraction(ctx, interaction!, previous, state)
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
