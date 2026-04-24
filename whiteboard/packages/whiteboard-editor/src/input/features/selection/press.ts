import type { PointerDownInput } from '@whiteboard/editor/types/input'
import type { InteractionBinding, InteractionSession } from '@whiteboard/editor/input/core/types'
import { createMoveInteraction } from '@whiteboard/editor/input/features/selection/move'
import { createMarqueeSession, type MarqueeMatch } from '@whiteboard/editor/input/features/selection/marquee'
import { createPressDragSession } from '@whiteboard/editor/input/session/press'
import { selection as selectionApi, type SelectionTarget } from '@whiteboard/core/selection'
import type {
  SelectionAffordance,
  SelectionSummary
} from '@whiteboard/core/selection'
import type { SelectionMode } from '@whiteboard/core/node'
import type { GroupId, Node, NodeId } from '@whiteboard/core/types'
import {
  clearSelection,
  replaceSelection,
  startNodeEdit
} from '@whiteboard/editor/input/helpers'
import type { EditorHostDeps } from '@whiteboard/editor/input/runtime'

export type SelectionPressTarget<TField extends string = string> =
  | { kind: 'background' }
  | {
      kind: 'group'
      groupId: GroupId
    }
  | { kind: 'selection-box' }
  | {
      kind: 'node'
      nodeId: NodeId
      field?: TField
    }

type SelectionTapAction<TField extends string = string> =
  | { kind: 'clear' }
  | {
      kind: 'select'
      target: SelectionTarget
    }
  | {
      kind: 'edit-node'
      nodeId: NodeId
    }
  | {
      kind: 'edit-field'
      nodeId: NodeId
      field: TField
      selection: SelectionTarget
    }

export type SelectionMoveVisibility =
  | { kind: 'none' }
  | {
      kind: 'show'
      selection: SelectionTarget
    }
  | {
      kind: 'temporary'
      selection: SelectionTarget
      restore: SelectionTarget
    }

type SelectionDragAction =
  | {
      kind: 'move'
      target: SelectionTarget
      visibility: SelectionMoveVisibility
    }
  | {
      kind: 'marquee'
      match: MarqueeMatch
      mode: SelectionMode
      base: SelectionTarget
      clearOnStart?: boolean
    }

type SelectionMarqueeAction = Extract<
  SelectionDragAction,
  { kind: 'marquee' }
>

type SelectionPressBehavior<TField extends string = string> = {
  chrome: boolean
  tap?: SelectionTapAction<TField>
  drag?: SelectionDragAction
  hold?: SelectionMarqueeAction
}

type SelectionPressDeps = {
  node: {
    get: (nodeId: NodeId) => Node | undefined
    canEnter: (nodeId: NodeId) => boolean
    groupId: (nodeId: NodeId) => GroupId | undefined
  }
  group: {
    target: (groupId: GroupId) => SelectionTarget | undefined
  }
}

export type SelectionPressSubject<TField extends string = string> =
  | {
      kind: 'background'
      target: SelectionPressTarget<TField>
      currentSelection: SelectionTarget
    }
  | {
      kind: 'selection-box'
      target: SelectionPressTarget<TField>
      currentSelection: SelectionTarget
      canMoveSelection: boolean
    }
  | {
      kind: 'group'
      target: Extract<SelectionPressTarget<TField>, { kind: 'group' }>
      currentSelection: SelectionTarget
      mode: SelectionMode
      groupSelection: SelectionTarget
      selected: boolean
      canMove: boolean
    }
  | {
      kind: 'node'
      target: Extract<SelectionPressTarget<TField>, { kind: 'node' }>
      node: Node
      currentSelection: SelectionTarget
      mode: SelectionMode
      selected: boolean
      repeat: boolean
      canEnter: boolean
      groupId?: GroupId
      groupSelection?: SelectionTarget
      groupSelected: boolean
      promoteToGroup: boolean
      currentSelectionMovable: boolean
      groupSelectionMovable: boolean
    }

type ModifierEventLike = {
  alt: boolean
  shift: boolean
  ctrl: boolean
  meta: boolean
}

type SelectionPressField = 'text'

const resolveSelectionEditField = (
  node: Node | undefined
): SelectionPressField | undefined => {
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

const createSelectionSession = (
  input: {
    ctx: Pick<EditorHostDeps, 'engine' | 'document' | 'projection' | 'sessionRead' | 'snap' | 'write' | 'session'>
    start: PointerDownInput
    decision: SelectionDragAction | SelectionMarqueeAction | undefined
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

  return createMarqueeSession(input.ctx, {
    start: input.start,
    action: input.decision
  })
}

const isSingleSelectedNode = (
  nodeId: NodeId,
  selectedNodeIds: readonly NodeId[]
) => (
  selectedNodeIds.length === 1
  && selectedNodeIds[0] === nodeId
)

const isSelectedNode = (
  nodeId: NodeId,
  selectedNodeIds: readonly NodeId[]
) => selectedNodeIds.includes(nodeId)

const canDragSelectionBox = (
  affordance: SelectionAffordance
) => (
  affordance.moveHit === 'body'
  && affordance.canMove
  && !affordance.showSingleNodeOverlay
)

const canMoveSelectionTarget = (
  deps: SelectionPressDeps,
  target: SelectionTarget
) => target.nodeIds.every((nodeId) => !deps.node.get(nodeId)?.locked)

const resolveSelectionPressMode = (
  modifiers: ModifierEventLike
): SelectionMode => {
  if (modifiers.alt) return 'subtract'
  if (modifiers.meta || modifiers.ctrl) return 'toggle'
  if (modifiers.shift) return 'add'
  return 'replace'
}

const resolveSelectionPressTarget = <TField extends string>(
  pick: PointerDownInput['pick']
): SelectionPressTarget<TField> | undefined => {
  switch (pick.kind) {
    case 'background':
      return {
        kind: 'background'
      }
    case 'group':
      return {
        kind: 'group',
        groupId: pick.id
      }
    case 'selection-box':
      return pick.part === 'body'
        ? {
            kind: 'selection-box'
          }
        : undefined
    case 'node':
      return pick.part === 'field'
        ? {
            kind: 'node',
            nodeId: pick.id,
            field: pick.field as TField | undefined
          }
        : pick.part === 'body'
          ? {
              kind: 'node',
              nodeId: pick.id
            }
          : undefined
    case 'edge':
    case 'mindmap':
      return undefined
  }
}

const isGroupSelected = (
  deps: SelectionPressDeps,
  groupId: GroupId,
  target: SelectionTarget
) => {
  const selection = deps.group.target(groupId)
  return selection
    ? selection.nodeIds.length === target.nodeIds.length
      && selection.edgeIds.length === target.edgeIds.length
      && selection.nodeIds.every((nodeId, index) => nodeId === target.nodeIds[index])
      && selection.edgeIds.every((edgeId, index) => edgeId === target.edgeIds[index])
    : false
}

const resolveSelectionPressSubject = <TField extends string>(
  deps: SelectionPressDeps,
  input: {
    target: SelectionPressTarget<TField>
    mode: SelectionMode
    selection: SelectionSummary
    affordance: SelectionAffordance
  }
): SelectionPressSubject<TField> | undefined => {
  const currentSelection: SelectionTarget = {
    nodeIds: input.selection.target.nodeIds,
    edgeIds: input.selection.target.edgeIds
  }

  switch (input.target.kind) {
    case 'background':
      return {
        kind: 'background',
        target: input.target,
        currentSelection
      }
    case 'selection-box':
      return {
        kind: 'selection-box',
        target: input.target,
        currentSelection,
        canMoveSelection: canDragSelectionBox(input.affordance)
      }
    case 'group': {
      const groupSelection = deps.group.target(input.target.groupId)
      if (!groupSelection) {
        return undefined
      }

      return {
        kind: 'group',
        target: input.target,
        currentSelection,
        mode: input.mode,
        groupSelection,
        selected: isGroupSelected(deps, input.target.groupId, currentSelection),
        canMove: canMoveSelectionTarget(deps, groupSelection)
      }
    }
    case 'node': {
      const node = deps.node.get(input.target.nodeId)
      if (!node) {
        return undefined
      }

      const selectedNodeIds = input.selection.target.nodeIds
      const selectedEdgeIds = input.selection.target.edgeIds
      const groupId = deps.node.groupId(node.id)
      const currentGroupId = (
        input.mode === 'replace'
        && selectedNodeIds.length === 1
        && selectedEdgeIds.length === 0
      )
        ? deps.node.groupId(selectedNodeIds[0]!)
        : undefined
      const groupSelection = input.mode === 'replace' && groupId
        ? deps.group.target(groupId)
        : undefined
      const groupSelected = Boolean(
        input.mode === 'replace'
        && groupId
        && isGroupSelected(deps, groupId, currentSelection)
      )
      const drilledWithinGroup = Boolean(
        input.mode === 'replace'
        && groupId
        && currentGroupId === groupId
        && !groupSelected
      )

      return {
        kind: 'node',
        target: input.target,
        node,
        currentSelection,
        mode: input.mode,
        selected: isSelectedNode(node.id, selectedNodeIds),
        repeat: input.mode === 'replace' && isSingleSelectedNode(node.id, selectedNodeIds),
        canEnter: deps.node.canEnter(node.id),
        groupId,
        groupSelection,
        groupSelected,
        promoteToGroup: Boolean(
          groupSelection
          && !groupSelected
          && !drilledWithinGroup
        ),
        currentSelectionMovable: canMoveSelectionTarget(deps, currentSelection),
        groupSelectionMovable: groupSelection
          ? canMoveSelectionTarget(deps, groupSelection)
          : false
      }
    }
  }
}

const HOLD_TO_CONTAIN_MARQUEE: SelectionMarqueeAction = {
  kind: 'marquee',
  match: 'contain',
  mode: 'replace',
  base: selectionApi.target.empty,
  clearOnStart: true
}

const HIDE_SELECTION: SelectionMoveVisibility = {
  kind: 'none'
}

const readNodeOnlySelection = (
  nodeIds: readonly string[]
): SelectionTarget => ({
  nodeIds,
  edgeIds: []
})

const showSelection = (
  selection: SelectionTarget
): SelectionMoveVisibility => ({
  kind: 'show',
  selection
})

const showTemporarySelection = (
  selection: SelectionTarget,
  restore: SelectionTarget
): SelectionMoveVisibility => ({
  kind: 'temporary',
  selection,
  restore
})

const createBackgroundBehavior = <TField extends string>(
  subject: Extract<SelectionPressSubject<TField>, { kind: 'background' }>,
  mode: SelectionMode
): SelectionPressBehavior<TField> => ({
  chrome: false,
  tap: mode === 'replace'
    ? { kind: 'clear' }
    : undefined,
  drag: {
    kind: 'marquee',
    match: 'touch',
    mode,
    base: subject.currentSelection
  }
})

const createSelectionBoxBehavior = <TField extends string>(
  subject: Extract<SelectionPressSubject<TField>, { kind: 'selection-box' }>
): SelectionPressBehavior<TField> | undefined => {
  if (
    !subject.currentSelection.nodeIds.length
    && !subject.currentSelection.edgeIds.length
  ) {
    return undefined
  }

  if (!subject.canMoveSelection) {
    return undefined
  }

  return {
    chrome: true,
    drag: subject.currentSelection.nodeIds.length > 0
      ? {
          kind: 'move',
          target: subject.currentSelection,
          visibility: HIDE_SELECTION
        }
      : undefined,
    hold: HOLD_TO_CONTAIN_MARQUEE
  }
}

const createGroupBehavior = <TField extends string>(
  subject: Extract<SelectionPressSubject<TField>, { kind: 'group' }>
): SelectionPressBehavior<TField> => {
  const nextSelection = subject.mode === 'replace'
    ? subject.groupSelection
    : selectionApi.target.apply(
        subject.currentSelection,
        subject.groupSelection,
        subject.mode
      )
  const dragCurrentSelection = subject.mode === 'replace' && subject.selected

  return {
    chrome: subject.selected,
    tap: {
      kind: 'select',
      target: nextSelection
    },
    drag: subject.canMove
      ? {
          kind: 'move',
          target: dragCurrentSelection
            ? subject.currentSelection
            : nextSelection,
          visibility:
            subject.mode === 'replace' && !subject.selected
              ? showTemporarySelection(nextSelection, subject.currentSelection)
              : dragCurrentSelection
                ? HIDE_SELECTION
                : showSelection(nextSelection)
        }
      : undefined,
    hold: HOLD_TO_CONTAIN_MARQUEE
  }
}

const resolveNodeNextSelection = <TField extends string>(
  subject: Extract<SelectionPressSubject<TField>, { kind: 'node' }>
): SelectionTarget => {
  if (subject.promoteToGroup) {
    return subject.groupSelection!
  }

  if (subject.groupSelected) {
    return {
      nodeIds: [subject.node.id],
      edgeIds: []
    }
  }

  return selectionApi.target.apply(
    subject.currentSelection,
    {
      nodeIds: [subject.node.id]
    },
    subject.mode
  )
}

const resolveNodeDragTarget = <TField extends string>(
  subject: Extract<SelectionPressSubject<TField>, { kind: 'node' }>,
  nextSelection: SelectionTarget
): SelectionTarget => {
  if (subject.repeat || subject.groupSelected || subject.selected) {
    return subject.currentSelection
  }

  if (subject.promoteToGroup) {
    return nextSelection
  }

  return readNodeOnlySelection(nextSelection.nodeIds)
}

const resolveNodeDragVisibility = <TField extends string>(
  subject: Extract<SelectionPressSubject<TField>, { kind: 'node' }>,
  nextSelection: SelectionTarget,
  dragTarget: SelectionTarget
): SelectionMoveVisibility => {
  if (subject.promoteToGroup) {
    return showTemporarySelection(nextSelection, subject.currentSelection)
  }

  if (subject.mode === 'replace' && !subject.selected && !subject.groupSelected) {
    return showTemporarySelection(
      readNodeOnlySelection(dragTarget.nodeIds),
      subject.currentSelection
    )
  }

  if (subject.repeat || subject.groupSelected || subject.selected) {
    return HIDE_SELECTION
  }

  return showSelection(readNodeOnlySelection(dragTarget.nodeIds))
}

const resolveNodeTapAction = <TField extends string>(
  subject: Extract<SelectionPressSubject<TField>, { kind: 'node' }>,
  nextSelection: SelectionTarget
): SelectionTapAction<TField> => {
  const explicitFieldEdit = (
    subject.mode === 'replace'
    && Boolean(subject.target.field)
    && subject.selected
    && !subject.node.locked
    && !subject.promoteToGroup
    && !subject.groupSelected
  )
  const implicitEdit = subject.repeat && subject.canEnter

  if (subject.node.locked) {
    return {
      kind: 'select',
      target: nextSelection
    }
  }

  if (explicitFieldEdit) {
    return {
      kind: 'edit-field',
      nodeId: subject.node.id,
      field: subject.target.field!,
      selection: nextSelection
    }
  }

  if (implicitEdit) {
    return {
      kind: 'edit-node',
      nodeId: subject.node.id
    }
  }

  return {
    kind: 'select',
    target: nextSelection
  }
}

const createNodeBehavior = <TField extends string>(
  subject: Extract<SelectionPressSubject<TField>, { kind: 'node' }>
): SelectionPressBehavior<TField> => {
  const nextSelection = resolveNodeNextSelection(subject)
  const dragTarget = resolveNodeDragTarget(subject, nextSelection)
  const canDrag =
    subject.repeat || subject.groupSelected || subject.selected
      ? subject.currentSelectionMovable
      : subject.promoteToGroup
        ? subject.groupSelectionMovable
        : !subject.node.locked

  return {
    chrome: subject.selected || subject.groupSelected,
    tap: resolveNodeTapAction(subject, nextSelection),
    drag: canDrag
      ? {
          kind: 'move',
          target: dragTarget,
          visibility: resolveNodeDragVisibility(subject, nextSelection, dragTarget)
        }
      : undefined,
    hold: HOLD_TO_CONTAIN_MARQUEE
  }
}

export const createSelectionPressBehavior = <TField extends string>(
  subject: SelectionPressSubject<TField>,
  mode: SelectionMode
): SelectionPressBehavior<TField> | undefined => {
  switch (subject.kind) {
    case 'background':
      return createBackgroundBehavior(subject, mode)
    case 'selection-box':
      return createSelectionBoxBehavior(subject)
    case 'group':
      return createGroupBehavior(subject)
    case 'node':
      return createNodeBehavior(subject)
  }
}

const matchSelectionTap = <TField extends string>(
  target: SelectionPressTarget<TField>,
  next: SelectionPressTarget<TField> | undefined
) => {
  if (!next) {
    return false
  }

  switch (target.kind) {
    case 'background':
      return next.kind === 'background'
    case 'group':
      return next.kind === 'group' && next.groupId === target.groupId
    case 'selection-box':
      return next.kind === 'selection-box'
    case 'node':
      return (
        next.kind === 'node'
        && next.nodeId === target.nodeId
        && next.field === target.field
      )
  }
}

const applySelectionTap = (
  ctx: Pick<EditorHostDeps, 'document' | 'projection' | 'session' | 'registry'>,
  tap: SelectionTapAction<SelectionPressField>,
  input: Pick<PointerDownInput, 'client'>
) => {
  switch (tap.kind) {
    case 'clear':
      clearSelection({
        session: ctx.session
      })
      return
    case 'select':
      replaceSelection({
        session: ctx.session
      }, tap.target)
      return
    case 'edit-node': {
      const field = resolveSelectionEditField(
        ctx.document.node.committed.get(tap.nodeId)?.node
      )
      if (!field) {
        return
      }

      startNodeEdit({
        session: ctx.session,
        document: ctx.document,
        registry: ctx.registry
      }, tap.nodeId, field, {
        caret: {
          kind: 'point',
          client: input.client
        }
      })
      return
    }
    case 'edit-field':
      if (!selectionApi.target.equal(ctx.projection.selection.summary.get().target, tap.selection)) {
        replaceSelection({
          session: ctx.session
        }, tap.selection)
      }
      startNodeEdit({
        session: ctx.session,
        document: ctx.document,
        registry: ctx.registry
      }, tap.nodeId, tap.field, {
        caret: {
          kind: 'point',
          client: input.client
        }
      })
  }
}

const createSelectionPressSession = (
  ctx: Pick<EditorHostDeps, 'engine' | 'document' | 'projection' | 'sessionRead' | 'snap' | 'write' | 'session' | 'registry'>,
  start: PointerDownInput,
  resolved: {
    target: SelectionPressTarget<SelectionPressField>
    behavior: SelectionPressBehavior<SelectionPressField>
  }
): InteractionSession => createPressDragSession({
  start,
  chrome: resolved.behavior.chrome,
  createDragSession: (nextInput) => createSelectionSession({
    ctx,
    start,
    decision: resolved.behavior.drag
  }),
  onTap: (input) => {
    const tap = resolved.behavior.tap
    if (!tap) {
      return
    }

    const target = resolveSelectionPressTarget<SelectionPressField>(input.pick)
    if (!matchSelectionTap(resolved.target, target)) {
      return
    }

    applySelectionTap(ctx, tap, input)
  },
  onHold: () => createSelectionSession({
    ctx,
    start,
    decision: resolved.behavior.hold
  })
})

const tryStartSelectionPress = (
  ctx: Pick<EditorHostDeps, 'engine' | 'document' | 'projection' | 'sessionRead' | 'snap' | 'write' | 'session' | 'registry'>,
  input: PointerDownInput
): InteractionSession | null => {
  const tool = ctx.sessionRead.tool.get()
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

  const selectionSummary = ctx.projection.selection.summary.get()
  const selectionAffordance = ctx.projection.selection.affordance.get()
  const deps: SelectionPressDeps = {
    node: {
      get: (nodeId) => ctx.document.node.committed.get(nodeId)?.node,
      canEnter: (nodeId) => {
        const node = ctx.document.node.committed.get(nodeId)?.node
        return node
          ? ctx.projection.node.capability(node).enter
          : false
      },
      groupId: ctx.projection.group.ofNode
    },
    group: {
      target: (groupId) => ctx.projection.group.target(groupId)
    }
  }
  const mode = resolveSelectionPressMode(input.modifiers)
  const subject = resolveSelectionPressSubject(deps, {
    target,
    mode,
    selection: selectionSummary,
    affordance: selectionAffordance
  })
  if (!subject) {
    return null
  }

  const behavior = createSelectionPressBehavior(subject, mode)
  if (!behavior) {
    return null
  }

  const resolved = {
    target,
    behavior
  }

  return resolved
    ? createSelectionPressSession(ctx, input, resolved)
    : null
}

export const createSelectionBinding = (
  ctx: Pick<EditorHostDeps, 'engine' | 'document' | 'projection' | 'sessionRead' | 'snap' | 'write' | 'session' | 'registry'>
): InteractionBinding => ({
  key: 'selection',
  start: (input) => tryStartSelectionPress(ctx, input)
})
