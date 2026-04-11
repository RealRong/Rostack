import {
  isSelectionTargetEqual,
} from '@whiteboard/core/selection'
import { createTimeoutTask, type TimeoutTask } from '@shared/core'
import type { Node } from '@whiteboard/core/types'
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
  resolveSelectionPressDecision,
  type SelectionDragDecision,
  type SelectionMarqueeDecision,
  type SelectionPressDecision,
  type SelectionPressTarget,
  type SelectionPressTargetInput
} from './pressPolicy'

type SelectionPressField = EditField
type SelectionSubjectInput = Pick<PointerDownInput, 'pick'>

const resolveImplicitEditField = (
  node: Node | undefined
): EditField | undefined => {
  if (!node) {
    return undefined
  }

  switch (node.type) {
    case 'text':
    case 'sticky':
    case 'shape':
      return 'text'
    default:
      return undefined
  }
}

const readGroupSelection = (
  ctx: InteractionContext,
  groupId: string
) => {
  const nodeIds = ctx.read.group.nodeIds(groupId)
  const edgeIds = ctx.read.group.edgeIds(groupId)

  return nodeIds.length > 0 || edgeIds.length > 0
    ? {
        nodeIds,
        edgeIds
      }
    : undefined
}

const isGroupSelectionCurrent = (
  ctx: InteractionContext,
  groupId: string,
  target: {
    nodeIds: readonly string[]
    edgeIds: readonly string[]
  }
) => {
  const selection = readGroupSelection(ctx, groupId)
  return selection
    ? isSelectionTargetEqual(selection, target)
    : false
}

const resolveSelectionPressTargetInput = (
  ctx: InteractionContext,
  input: SelectionSubjectInput
): SelectionPressTargetInput<SelectionPressField> | undefined => {
  switch (input.pick.kind) {
    case 'background':
      return {
        kind: 'background'
      }
    case 'group':
      return {
        kind: 'group',
        groupId: input.pick.id
      }
    case 'selection-box':
      return {
        kind: 'selection-box',
        part: input.pick.part
      }
    case 'node': {
      if (input.pick.part === 'field') {
        return {
          kind: 'node',
          nodeId: input.pick.id,
          part: 'field',
          field: input.pick.field
        }
      }

      if (input.pick.part === 'body') {
        return {
          kind: 'node',
          nodeId: input.pick.id,
          part: 'body'
        }
      }

      return undefined
    }
    case 'edge':
    case 'mindmap':
      return undefined
  }
}

const resolveSelectionPress = (
  ctx: InteractionContext,
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
  const selectionModel = ctx.selection.model.get()

  const resolved = resolveSelectionPressDecision({
    getNode: (nodeId) => ctx.read.node.item.get(nodeId)?.node,
    canEnter: (nodeId) => {
      const node = ctx.read.node.item.get(nodeId)?.node
      return node
        ? ctx.read.node.capability(node).enter
        : false
    },
    getNodeGroupId: ctx.read.group.ofNode,
    getGroupSelection: (groupId) => readGroupSelection(ctx, groupId),
    isGroupSelected: (groupId, target) =>
      isGroupSelectionCurrent(ctx, groupId, target)
  }, {
    modifiers: input.modifiers,
    selection: selectionModel.summary,
    affordance: selectionModel.affordance,
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
    ctx: InteractionContext
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
  ctx: InteractionContext,
  start: PointerDownInput,
  resolved: {
    target: SelectionPressTarget<SelectionPressField>
    decision: SelectionPressDecision<SelectionPressField>
  }
): InteractionSession => {
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
      return replaceSession(next)
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
        case 'edit-node': {
          const field = resolveImplicitEditField(
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
  const resolved = resolveSelectionPress(ctx, input)
  return resolved
    ? createPressSession(ctx, input, resolved)
    : null
}
