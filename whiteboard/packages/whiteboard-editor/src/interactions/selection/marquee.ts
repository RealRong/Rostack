import {
  createMarqueeItemsKey,
  finishMarqueeSession,
  startMarqueeSession,
  stepMarqueeSession,
  type SelectionMarqueeDecision,
  type SelectionTarget
} from '@whiteboard/core/selection'
import {
  applySelection,
  type SelectionMode
} from '@whiteboard/core/node'
import type { EdgeId, NodeId, Rect } from '@whiteboard/core/types'
import {
  GestureTuning,
  type InteractionCtx,
  type InteractionSession,
  type InteractionSessionTransition
} from '../../runtime/interaction'
import type { PointerDownInput } from '../../types/input'

type SelectionInteractionCtx = Pick<
  InteractionCtx,
  'read' | 'write' | 'config' | 'snap'
>

type MarqueeItems = {
  nodeIds: readonly NodeId[]
  edgeIds: readonly EdgeId[]
}

type MarqueePointer = Pick<PointerDownInput, 'screen' | 'world'>

type MarqueeInteractionInput = {
  start: PointerDownInput
  action: SelectionMarqueeDecision
}

const applyMatchedSelection = (
  base: SelectionTarget,
  matched: SelectionTarget,
  mode: SelectionMode
): SelectionTarget => ({
  nodeIds: [
    ...applySelection(
      new Set(base.nodeIds),
      [...matched.nodeIds],
      mode
    )
  ],
  edgeIds: [
    ...applySelection(
      new Set(base.edgeIds),
      [...matched.edgeIds],
      mode
    )
  ]
})

const readMatchedItems = (
  input: {
    ctx: SelectionInteractionCtx
    rect: Rect
    match: SelectionMarqueeDecision['match']
  }
): MarqueeItems => ({
  nodeIds: input.ctx.read.node.idsInRect(input.rect, {
    match: input.match
  }),
  edgeIds: input.ctx.read.edge.idsInRect(input.rect, {
    match: input.match
  })
})

const writeMatchedSelection = (
  input: {
    ctx: SelectionInteractionCtx
    action: SelectionMarqueeDecision
    items: MarqueeItems
  }
) => {
  input.ctx.write.session.selection.replace(
    applyMatchedSelection(
      input.action.base,
      {
        nodeIds: input.items.nodeIds,
        edgeIds: input.items.edgeIds
      },
      input.action.mode
    )
  )
}

const projectMarquee = (
  input: {
    session: ReturnType<typeof startMarqueeSession>
    pointer: MarqueePointer
  }
) => stepMarqueeSession({
  session: input.session,
  currentScreen: input.pointer.screen,
  currentWorld: input.pointer.world,
  minDistance: GestureTuning.dragMinDistance
})

export const createMarqueeInteraction = (
  ctx: SelectionInteractionCtx,
  input: MarqueeInteractionInput
): InteractionSession => {
  const FINISH = {
    kind: 'finish'
  } satisfies InteractionSessionTransition

  let session = startMarqueeSession({
    pointerId: input.start.pointerId,
    startScreen: input.start.screen,
    startWorld: input.start.world,
    match: input.action.match
  })
  let emittedKey = ''

  ctx.write.preview.selection.setMarquee(undefined)
  if (input.action.clearOnStart) {
    ctx.write.session.selection.clear()
  }

  const step = (
    pointer: MarqueePointer
  ) => {
    const result = projectMarquee({
      session,
      pointer
    })
    session = result.session
    if (!result.active || !result.worldRect) {
      return false
    }

    const worldRect = result.worldRect
    const matched = readMatchedItems({
      ctx,
      rect: worldRect,
      match: input.action.match
    })
    const nextKey = createMarqueeItemsKey(matched)

    if (nextKey !== emittedKey) {
      emittedKey = nextKey
      writeMatchedSelection({
        ctx,
        action: input.action,
        items: matched
      })
    }

    ctx.write.preview.selection.setMarquee({
      worldRect,
      match: input.action.match
    })

    return true
  }

  return {
    mode: 'marquee',
    pointerId: input.start.pointerId,
    chrome: false,
    autoPan: {
      frame: (pointer) => {
        if (!session.active) {
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
      const finalState = projectMarquee({
        session,
        pointer: next
      })
      session = finalState.session

      const finished = finishMarqueeSession(session)
      if (!finished.active || !finished.worldRect) {
        return FINISH
      }

      const matched = readMatchedItems({
        ctx,
        rect: finished.worldRect,
        match: input.action.match
      })
      writeMatchedSelection({
        ctx,
        action: input.action,
        items: matched
      })
      return FINISH
    },
    cleanup: () => {
      ctx.write.preview.selection.setMarquee(undefined)
    }
  }
}
