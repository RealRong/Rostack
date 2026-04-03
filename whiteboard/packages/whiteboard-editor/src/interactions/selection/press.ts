import {
  matchSelectionTap,
  resolveSelectionPressDecision,
  type SelectionDragDecision,
  type SelectionMarqueeDecision,
  type SelectionPressDecision,
  type SelectionPressTargetInput,
  type SelectionPressTarget
} from '@whiteboard/core/selection'
import { createTimeoutTask, type TimeoutTask } from '@whiteboard/engine'
import {
  GestureTuning,
  type InteractionCtx,
  type InteractionSession,
  type InteractionSessionTransition
} from '../../runtime/interaction'
import type {
  PointerDownInput
} from '../../types/input'
import { createMarqueeInteraction } from './marquee'
import { createMoveInteraction } from './move'

type SelectionPressField = NonNullable<PointerDownInput['field']>
type SelectionSubjectInput = Pick<PointerDownInput, 'pick' | 'field'>
type SelectionInteractionCtx = Pick<
  InteractionCtx,
  'read' | 'write' | 'config' | 'snap'
>

const resolveSelectionPressTargetInput = (
  ctx: SelectionInteractionCtx,
  input: SelectionSubjectInput
): SelectionPressTargetInput<SelectionPressField> | undefined => {
  switch (input.pick.kind) {
    case 'background':
      return {
        kind: 'background'
      }
    case 'selection-box':
      return {
        kind: 'selection-box',
        part: input.pick.part
      }
    case 'node': {
      if (input.pick.part !== 'body' && input.pick.part !== 'shell') {
        return undefined
      }

      const targetInput: SelectionPressTargetInput<SelectionPressField> = {
        kind: 'node',
        nodeId: input.pick.id,
        part: input.pick.part,
        field: input.field
      }

      if (input.pick.part === 'shell') {
        const node = ctx.read.node.item.get(input.pick.id)?.node
        targetInput.shell = node
          ? ctx.read.node.capability(node).role
          : 'content'
      }

      return targetInput
    }
    case 'edge':
    case 'mindmap':
      return undefined
  }
}

const resolveSelectionPress = (
  ctx: SelectionInteractionCtx,
  input: PointerDownInput
): {
  target: SelectionPressTarget<SelectionPressField>
  decision: SelectionPressDecision<SelectionPressField>
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

  const targetInput = resolveSelectionPressTargetInput(ctx, input)
  if (!targetInput) {
    return null
  }

  const resolved = resolveSelectionPressDecision({
    getNode: (nodeId) => ctx.read.node.item.get(nodeId)?.node,
    getOwnerId: ctx.read.node.owner
  }, {
    modifiers: input.modifiers,
    selection: ctx.read.selection.summary.get(),
    affordance: ctx.read.selection.affordance.get(),
    targetInput
  })
  if (!resolved) {
    return null
  }

  return {
    target: resolved.target,
    decision: resolved.decision
  }
}

const createSelectionSession = (
  input: {
    ctx: SelectionInteractionCtx
    start: PointerDownInput
    decision: SelectionDragDecision | SelectionMarqueeDecision | undefined
  }
) => {
  if (!input.decision) {
    return null
  }

  if (input.decision.kind === 'move') {
    return createMoveInteraction(input.ctx, {
      start: input.start,
      target: input.decision.target,
      selection: input.decision.selection
    })
  }

  return createMarqueeInteraction(input.ctx, {
    start: input.start,
    action: input.decision
  })
}

const createPressSession = (
  ctx: SelectionInteractionCtx,
  start: PointerDownInput,
  resolved: {
    target: SelectionPressTarget<SelectionPressField>
    decision: SelectionPressDecision<SelectionPressField>
  }
): InteractionSession => {
  const FINISH = {
    kind: 'finish'
  } satisfies InteractionSessionTransition
  let holdTask: TimeoutTask | null = null
  let dispatchTransition:
    | ((transition: InteractionSessionTransition) => void)
    | null = null

  const pressSession: InteractionSession = {
    mode: 'press',
    pointerId: start.pointerId,
    chrome: resolved.decision.chrome,
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
        decision: resolved.decision.drag
      })
      if (!next) {
        return FINISH
      }

      next.move?.(input)
      return {
        kind: 'replace',
        session: next
      }
    },
    up: (input) => {
      holdTask?.cancel()
      holdTask = null
      const tap = resolved.decision.tap
      if (!tap) {
        return FINISH
      }

      const targetInput = resolveSelectionPressTargetInput(ctx, input)
      if (!matchSelectionTap(resolved.target, targetInput)) {
        return FINISH
      }

      switch (tap.kind) {
        case 'clear':
          ctx.write.session.selection.clear()
          break
        case 'select':
          ctx.write.session.selection.replace(tap.target)
          break
        case 'edit':
          ctx.write.session.edit.start(tap.nodeId, tap.field)
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

  if (resolved.decision.hold) {
    holdTask = createTimeoutTask(() => {
      holdTask = null
      const next = createSelectionSession({
        ctx,
        start,
        decision: resolved.decision.hold
      })
      dispatchTransition?.(
        next
          ? {
              kind: 'replace',
              session: next
            }
          : {
              kind: 'finish'
            }
      )
    })
    holdTask.schedule(GestureTuning.holdDelay)
  }

  return pressSession
}

export const startSelectionPress = (
  ctx: SelectionInteractionCtx,
  input: PointerDownInput
): InteractionSession | null => {
  const resolved = resolveSelectionPress(ctx, input)
  return resolved
    ? createPressSession(ctx, input, resolved)
    : null
}
