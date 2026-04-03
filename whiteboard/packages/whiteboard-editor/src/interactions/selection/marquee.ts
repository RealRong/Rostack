import {
  createMarqueeRect,
  finishMarqueeSelection,
  startMarqueeSelection,
  stepMarqueeSelection,
  type SelectionMarqueeDecision,
  type SelectionTarget
} from '@whiteboard/core/selection'
import type { Rect } from '@whiteboard/core/types'
import {
  createSelectionGesture
} from '../../runtime/interaction/gesture'
import { GestureTuning } from '../../runtime/interaction/config'
import type { InteractionContext } from '../context'
import type {
  InteractionSession,
  InteractionSessionTransition
} from '../../runtime/interaction/types'
import type { PointerDownInput } from '../../types/input'

type SelectionInteractionCtx = Pick<
  InteractionContext,
  'read' | 'write' | 'config' | 'snap'
>

type MarqueePointer = Pick<PointerDownInput, 'screen' | 'world'>

type MarqueeInteractionInput = {
  start: PointerDownInput
  action: SelectionMarqueeDecision
}

const readMatchedSelection = (
  input: {
    ctx: SelectionInteractionCtx
    rect: Rect
    match: SelectionMarqueeDecision['match']
  }
): SelectionTarget => ({
  nodeIds: input.ctx.read.node.idsInRect(input.rect, {
    match: input.match,
    policy: 'selection-marquee'
  }),
  edgeIds: input.ctx.read.edge.idsInRect(input.rect, {
    match: input.match
  })
})

export const createMarqueeInteraction = (
  ctx: SelectionInteractionCtx,
  input: MarqueeInteractionInput
): InteractionSession => {
  const FINISH = {
    kind: 'finish'
  } satisfies InteractionSessionTransition

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
    ctx.write.session.selection.clear()
  }

  const step = (
    pointer: MarqueePointer
  ) => {
    const result = stepMarqueeSelection({
      state,
      currentScreen: pointer.screen,
      currentWorld: pointer.world,
      minDistance: GestureTuning.dragMinDistance,
      matched: readMatchedSelection({
        ctx,
        rect: createMarqueeRect(state.startWorld, pointer.world),
        match: input.action.match
      })
    })
    state = result.state
    if (!result.draft.active || !result.draft.worldRect) {
      return false
    }

    if (result.draft.changed && result.draft.selection) {
      ctx.write.session.selection.replace(result.draft.selection)
    }

    interaction!.gesture = createSelectionGesture(
      'selection-marquee',
      {
        nodePatches: [],
        edgePatches: [],
        frameHoverId: undefined,
        guides: [],
        marquee: {
          worldRect: result.draft.worldRect,
          match: input.action.match
        }
      }
    )

    return true
  }

  interaction = {
    mode: 'marquee',
    pointerId: input.start.pointerId,
    chrome: false,
    gesture: null,
    autoPan: {
      frame: (pointer) => {
        if (!state.active) {
          return
        }

        const sample = ctx.read.viewport.pointer(pointer)
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
      step(next)
      finishMarqueeSelection(state)
      return FINISH
    },
    cleanup: () => {}
  }

  return interaction
}
