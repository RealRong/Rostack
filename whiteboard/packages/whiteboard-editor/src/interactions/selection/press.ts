import {
  matchSelectionTap,
  resolveSelectionPressDecision,
  type SelectionDragDecision,
  type SelectionMarqueeDecision,
  type SelectionPressDecision,
  type SelectionPressTargetInput,
  type SelectionPressTarget,
  type SelectionTapAction
} from '@whiteboard/core/selection'
import { createTimeoutTask, type TimeoutTask } from '@whiteboard/engine'
import {
  GestureTuning,
  type InteractionCtx,
  type InteractionControl,
  type InteractionSession,
  type InteractionSessionTransition
} from '../../runtime/interaction'
import type {
  PointerDownInput,
  PointerMoveInput,
  PointerUpInput
} from '../../types/input'
import { createMarqueeInteraction } from './marquee'
import { createMoveInteraction } from './move'

type SelectionPressField = NonNullable<PointerDownInput['field']>
type SelectionSubjectInput = Pick<PointerDownInput, 'pick' | 'field'>
type SelectionInteractionCtx = Pick<
  InteractionCtx,
  'read' | 'write' | 'config' | 'snap'
>

export type SelectionPressPlan = {
  target: SelectionPressTarget<SelectionPressField>
  decision: SelectionPressDecision<SelectionPressField>
  start: {
    clientX: number
    clientY: number
  }
}

const toPanPointer = (
  input: PointerMoveInput
) => ({
  clientX: input.client.x,
  clientY: input.client.y
})

const cancelHold = (
  holdTask: TimeoutTask | null
) => {
  if (holdTask === null) {
    return
  }

  holdTask.cancel()
}

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

const hasMovedEnough = (
  plan: SelectionPressPlan,
  input: PointerMoveInput
) => {
  const dx = Math.abs(input.client.x - plan.start.clientX)
  const dy = Math.abs(input.client.y - plan.start.clientY)

  return dx >= GestureTuning.dragMinDistance || dy >= GestureTuning.dragMinDistance
}

const runTapAction = (
  input: {
    ctx: SelectionInteractionCtx
    action: SelectionTapAction<SelectionPressField>
  }
) => {
  switch (input.action.kind) {
    case 'clear':
      input.ctx.write.session.selection.clear()
      return
    case 'select':
      input.ctx.write.session.selection.replace(input.action.target)
      return
    case 'edit':
      input.ctx.write.session.edit.start(input.action.nodeId, input.action.field)
  }
}

export const resolveSelectionPressPlan = (
  ctx: SelectionInteractionCtx,
  input: PointerDownInput
): SelectionPressPlan | null => {
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
    targetInput
  })
  if (!resolved) {
    return null
  }

  return {
    target: resolved.target,
    decision: resolved.decision,
    start: {
      clientX: input.client.x,
      clientY: input.client.y
    }
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
      prepareSelection: input.decision.prepareSelection
    })
  }

  return createMarqueeInteraction(input.ctx, {
    start: input.start,
    action: input.decision
  })
}

const replaceSelectionSession = (input: {
  ctx: SelectionInteractionCtx
  start: PointerDownInput
  decision: SelectionDragDecision | SelectionMarqueeDecision | undefined
  control: InteractionControl
}) => {
  const next = createSelectionSession({
    ctx: input.ctx,
    start: input.start,
    decision: input.decision
  })
  if (!next) {
    return
  }

  input.control.replace(next)
}

const createSelectionReplaceTransition = (input: {
  ctx: SelectionInteractionCtx
  start: PointerDownInput
  decision: SelectionDragDecision | SelectionMarqueeDecision | undefined
  pointer: PointerMoveInput
  control: InteractionControl
}): InteractionSessionTransition => {
  const next = createSelectionSession({
    ctx: input.ctx,
    start: input.start,
    decision: input.decision
  })
  if (!next) {
    return {
      kind: 'finish'
    } satisfies InteractionSessionTransition
  }

  next.move?.(input.pointer)
  if (next.autoPan) {
    input.control.pan(toPanPointer(input.pointer))
  }

  return {
    kind: 'replace',
    session: next
  } satisfies InteractionSessionTransition
}

const armHold = (input: {
  ctx: SelectionInteractionCtx
  start: PointerDownInput
  plan: SelectionPressPlan
  control: InteractionControl
  setHoldTask: (task: TimeoutTask | null) => void
}) => {
  if (!input.plan.decision.hold) {
    return
  }

  const holdTask = createTimeoutTask(() => {
    input.setHoldTask(null)
    replaceSelectionSession({
      ctx: input.ctx,
      start: input.start,
      decision: input.plan.decision.hold,
      control: input.control
    })
  })
  input.setHoldTask(holdTask)
  holdTask.schedule(GestureTuning.holdDelay)
}

export const createPressInteraction = (
  ctx: SelectionInteractionCtx,
  start: PointerDownInput,
  pressPlan: SelectionPressPlan,
  control: InteractionControl
): InteractionSession => {
  const FINISH = {
    kind: 'finish'
  } satisfies InteractionSessionTransition
  let holdTask: TimeoutTask | null = null

  const pressSession: InteractionSession = {
    mode: 'press',
    pointerId: start.pointerId,
    chrome: pressPlan.decision.chrome,
    move: (input) => {
      if (!hasMovedEnough(pressPlan, input)) {
        return
      }

      cancelHold(holdTask)
      holdTask = null
      return createSelectionReplaceTransition({
        ctx,
        start,
        decision: pressPlan.decision.drag,
        pointer: input,
        control
      })
    },
    up: (input) => {
      cancelHold(holdTask)
      holdTask = null
      const tap = pressPlan.decision.tap
      if (!tap) {
        return FINISH
      }

      const targetInput = resolveSelectionPressTargetInput(ctx, input)
      if (!matchSelectionTap(pressPlan.target, targetInput)) {
        return FINISH
      }

      runTapAction({
        ctx,
        action: tap
      })
      return FINISH
    },
    cancel: () => {
      cancelHold(holdTask)
      holdTask = null
    },
    cleanup: () => {
      cancelHold(holdTask)
      holdTask = null
    }
  }

  armHold({
    ctx,
    start,
    plan: pressPlan,
    control,
    setHoldTask: (task) => {
      holdTask = task
    }
  })

  return pressSession
}
