import {
  matchSelectionRelease,
  resolveSelectionPressDecision,
  type SelectionDragDecision,
  type SelectionMarqueeDecision,
  type SelectionPressDecision,
  type SelectionPressSubject,
  type SelectionPressTarget,
  type SelectionReleaseDecision
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

export type SelectionPressState = {
  target: SelectionPressTarget<SelectionPressField>
  decision: SelectionPressDecision<SelectionPressField>
  start: {
    clientX: number
    clientY: number
  }
  holdTask: TimeoutTask | null
}

const toPanPointer = (
  input: PointerMoveInput
) => ({
  clientX: input.client.x,
  clientY: input.client.y
})

const clearHoldTask = (
  state: SelectionPressState
) => {
  if (state.holdTask === null) {
    return
  }

  state.holdTask.cancel()
  state.holdTask = null
}

const toSelectionPressSubject = (
  ctx: SelectionInteractionCtx,
  input: SelectionSubjectInput
): SelectionPressSubject<SelectionPressField> | undefined => {
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

      const subject: SelectionPressSubject<SelectionPressField> = {
        kind: 'node',
        nodeId: input.pick.id,
        part: input.pick.part,
        field: input.field
      }

      if (input.pick.part === 'shell') {
        const node = ctx.read.node.item.get(input.pick.id)?.node
        subject.shell = node
          ? ctx.read.node.capability(node).role
          : 'content'
      }

      return subject
    }
    case 'edge':
    case 'mindmap':
      return undefined
  }
}

const hasMovedEnough = (
  state: SelectionPressState,
  input: PointerMoveInput
) => {
  const dx = Math.abs(input.client.x - state.start.clientX)
  const dy = Math.abs(input.client.y - state.start.clientY)

  return dx >= GestureTuning.dragMinDistance || dy >= GestureTuning.dragMinDistance
}

const runRelease = (
  input: {
    ctx: SelectionInteractionCtx
    action: SelectionReleaseDecision<SelectionPressField>
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

export const resolveSelectionPressState = (
  ctx: SelectionInteractionCtx,
  input: PointerDownInput
): SelectionPressState | null => {
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

  const subject = toSelectionPressSubject(ctx, input)
  if (!subject) {
    return null
  }

  const resolved = resolveSelectionPressDecision({
    getNode: (nodeId) => ctx.read.node.item.get(nodeId)?.node,
    getOwnerId: ctx.read.node.owner
  }, {
    modifiers: input.modifiers,
    selection: ctx.read.selection.summary.get(),
    subject
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
    },
    holdTask: null
  }
}

const createDragSession = (
  input: {
    ctx: SelectionInteractionCtx
    start: PointerDownInput
    drag: SelectionDragDecision | undefined
  }
) => {
  if (!input.drag) {
    return null
  }

  if (input.drag.kind === 'move') {
    return createMoveInteraction(input.ctx, {
      start: input.start,
      target: input.drag.target,
      prepareSelection: input.drag.prepareSelection
    })
  }

  return createMarqueeInteraction(input.ctx, {
    start: input.start,
    action: input.drag
  })
}

const createFollowupSession = (
  input: {
    ctx: SelectionInteractionCtx
    start: PointerDownInput
    decision: SelectionDragDecision | SelectionMarqueeDecision | undefined
  }
) => {
  if (!input.decision) {
    return null
  }

  return input.decision.kind === 'move'
    ? createDragSession({
        ctx: input.ctx,
        start: input.start,
        drag: input.decision
      })
    : createMarqueeInteraction(input.ctx, {
        start: input.start,
        action: input.decision
      })
}

export const createPressInteraction = (
  ctx: SelectionInteractionCtx,
  start: PointerDownInput,
  pressState: SelectionPressState,
  control: InteractionControl
): InteractionSession => {
  const FINISH = {
    kind: 'finish'
  } satisfies InteractionSessionTransition

  const pressSession: InteractionSession = {
    mode: 'press',
    pointerId: start.pointerId,
    chrome: pressState.decision.chrome,
    move: (input) => {
      if (!hasMovedEnough(pressState, input)) {
        return
      }

      clearHoldTask(pressState)
      const next = createFollowupSession({
        ctx,
        start,
        decision: pressState.decision.drag
      })
      if (!next) {
        return FINISH
      }

      next.move?.(input)
      if (next.autoPan) {
        control.pan(toPanPointer(input))
      }
      return {
        kind: 'replace',
        session: next
      } satisfies InteractionSessionTransition
    },
    up: (input) => {
      clearHoldTask(pressState)
      const release = pressState.decision.release
      if (!release) {
        return FINISH
      }

      const subject = toSelectionPressSubject(ctx, input)
      if (!matchSelectionRelease(pressState.target, subject)) {
        return FINISH
      }

      runRelease({
        ctx,
        action: release
      })
      return FINISH
    },
    cancel: () => {
      clearHoldTask(pressState)
    },
    cleanup: () => {
      clearHoldTask(pressState)
    }
  }

  if (pressState.decision.hold) {
    pressState.holdTask = createTimeoutTask(() => {
      pressState.holdTask = null

      const next = createFollowupSession({
        ctx,
        start,
        decision: pressState.decision.hold
      })
      if (!next) {
        return
      }

      control.replace(next)
    })
    pressState.holdTask.schedule(GestureTuning.holdDelay)
  }

  return pressSession
}
