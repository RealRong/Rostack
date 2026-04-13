import {
  type SelectionTarget
} from '@whiteboard/core/selection'
import type { Rect } from '@whiteboard/core/types'
import {
  createSelectionGesture
} from '../../core/gesture'
import { GestureTuning } from '../../core/config'
import {
  FINISH
} from '../../core/result'
import type { InteractionContext } from '../../context'
import type {
  InteractionSession
} from '../../core/types'
import type { PointerDownInput } from '../../../types/input'
import {
  createMarqueeRect,
  reduceMarqueeSelection,
  startMarqueeSelection,
  type MarqueeSelectionEffect,
  type MarqueeSelectionEvent
} from './state'
import type { SelectionMarqueePlan } from '../press/resolve'

type MarqueePointer = Pick<PointerDownInput, 'screen' | 'world'>

type MarqueeInteractionInput = {
  start: PointerDownInput
  action: SelectionMarqueePlan
}

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
      interaction.gesture = createSelectionGesture(
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

export const createMarqueeInteraction = (
  ctx: InteractionContext,
  input: MarqueeInteractionInput
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
    pointer: MarqueePointer
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
