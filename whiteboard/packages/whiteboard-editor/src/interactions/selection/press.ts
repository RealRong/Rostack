import { createTimeoutTask, type TimeoutTask } from '@shared/core'
import type { EditField } from '../../runtime/state/edit'
import {
  GestureTuning
} from '../../runtime/interaction/config'
import {
  FINISH,
  replaceSession
} from '../../runtime/interaction/result'
import type { InteractionContext } from '../context'
import type {
  InteractionSession,
  InteractionSessionTransition
} from '../../runtime/interaction/types'
import type {
  PointerDownInput
} from '../../types/input'
import { createMarqueeInteraction } from './marquee'
import { createMoveInteraction } from './move'
import {
  matchSelectionTap,
  resolveSelectionPress as resolveSelectionPressPlan,
  resolveSelectionPressTarget,
  resolveSelectionEditField,
  type SelectionPressDragPlan,
  type SelectionMarqueePlan,
  type SelectionPressPlan,
  type SelectionPressTarget
} from '../../runtime/selectionPress'

type SelectionPressField = EditField

const resolveSelectionPressAction = (
  ctx: InteractionContext,
  input: PointerDownInput
): {
  target: SelectionPressTarget<SelectionPressField>
  plan: SelectionPressPlan<SelectionPressField>
} | null => {
  const tool = ctx.read.tool.get()

  if (
    tool.type !== 'select'
    || input.pick.kind === 'edge'
    || input.pick.kind === 'mindmap'
    || input.editable
    || input.ignoreInput
    || input.ignoreSelection
  ) {
    return null
  }

  const target = resolveSelectionPressTarget<SelectionPressField>(input.pick)
  if (!target) {
    return null
  }
  const selectionModel = ctx.selection.get()

  const resolved = resolveSelectionPressPlan({
    node: {
      get: (nodeId) => ctx.read.node.item.get(nodeId)?.node,
      canEnter: (nodeId) => {
        const node = ctx.read.node.item.get(nodeId)?.node
        return node
          ? ctx.read.node.capability(node).enter
          : false
      },
      groupId: ctx.read.group.ofNode
    },
    group: {
      target: (groupId) => ctx.read.group.target(groupId)
    }
  }, {
    modifiers: input.modifiers,
    selection: selectionModel.summary,
    affordance: selectionModel.affordance,
    target
  })
  if (!resolved) {
    return null
  }

  return {
    target: resolved.target,
    plan: resolved.plan
  }
}

const createSelectionSession = (
  input: {
    ctx: InteractionContext
    start: PointerDownInput
    decision: SelectionPressDragPlan | SelectionMarqueePlan | undefined
  }
) => {
  if (!input.decision) {
    return null
  }

  if (input.decision.kind === 'move') {
    return createMoveInteraction(input.ctx, {
      start: input.start,
      target: input.decision.target,
      visibility: input.decision.visibility
    })
  }

  return createMarqueeInteraction(input.ctx, {
    start: input.start,
    action: input.decision
  })
}

const createPressSession = (
  ctx: InteractionContext,
  start: PointerDownInput,
  resolved: {
    target: SelectionPressTarget<SelectionPressField>
    plan: SelectionPressPlan<SelectionPressField>
  }
): InteractionSession => {
  let holdTask: TimeoutTask | null = null
  let dispatchTransition:
    | ((transition: InteractionSessionTransition) => void)
    | null = null

  const pressSession: InteractionSession = {
    mode: 'press',
    pointerId: start.pointerId,
    chrome: resolved.plan.chrome,
    attach: (dispatch) => {
      dispatchTransition = dispatch
    },
    move: (input) => {
      const dx = Math.abs(input.client.x - start.client.x)
      const dy = Math.abs(input.client.y - start.client.y)
      if (
        dx < GestureTuning.dragMinDistance
        && dy < GestureTuning.dragMinDistance
      ) {
        return
      }

      holdTask?.cancel()
      holdTask = null
      const next = createSelectionSession({
        ctx,
        start,
        decision: resolved.plan.drag
      })
      if (!next) {
        return FINISH
      }

      next.move?.(input)
      return replaceSession(next)
    },
    up: (input) => {
      holdTask?.cancel()
      holdTask = null
      const tap = resolved.plan.tap
      if (!tap) {
        return FINISH
      }

      const target = resolveSelectionPressTarget<SelectionPressField>(input.pick)
      if (!matchSelectionTap(resolved.target, target)) {
        return FINISH
      }

      switch (tap.kind) {
        case 'clear':
          ctx.write.session.selection.clear()
          break
        case 'select':
          ctx.write.session.selection.replace(tap.target)
          break
        case 'edit-node': {
          const field = resolveSelectionEditField(
            ctx.read.node.item.get(tap.nodeId)?.node
          )
          if (!field) {
            break
          }
          ctx.write.session.edit.startNode(tap.nodeId, field, {
            caret: {
              kind: 'point',
              client: input.client
            }
          })
          break
        }
        case 'edit-field':
          if (tap.selection) {
            ctx.write.session.selection.replace(tap.selection)
          }
          ctx.write.session.edit.startNode(tap.nodeId, tap.field, {
            caret: {
              kind: 'point',
              client: input.client
            }
          })
          break
      }
      return FINISH
    },
    cancel: () => {
      holdTask?.cancel()
      holdTask = null
    },
    cleanup: () => {
      holdTask?.cancel()
      holdTask = null
    }
  }

  if (resolved.plan.hold) {
    holdTask = createTimeoutTask(() => {
      holdTask = null
      const next = createSelectionSession({
        ctx,
        start,
        decision: resolved.plan.hold
      })
      dispatchTransition?.(
        next
          ? replaceSession(next)
          : FINISH
      )
    })
    holdTask.schedule(GestureTuning.holdDelay)
  }

  return pressSession
}

export const startSelectionPress = (
  ctx: InteractionContext,
  input: PointerDownInput
): InteractionSession | null => {
  const resolved = resolveSelectionPressAction(ctx, input)
  return resolved
    ? createPressSession(ctx, input, resolved)
    : null
}
