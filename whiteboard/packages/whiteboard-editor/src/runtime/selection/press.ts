import {
  EMPTY_SELECTION_TARGET,
  applySelectionTarget,
  isSelectionTargetEqual,
  type SelectionAffordance,
  type SelectionSummary,
  type SelectionTarget
} from '@whiteboard/core/selection'
import type { SelectionMode } from '@whiteboard/core/node'
import type { GroupId, Node, NodeId } from '@whiteboard/core/types'
import type { RuntimeRead } from '../read'
import type { SelectionModelRead } from '../read/selection'
import type { PointerDownInput } from '../../types/input'

type ModifierEventLike = {
  alt: boolean
  shift: boolean
  ctrl: boolean
  meta: boolean
}

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

export type SelectionPressTapPlan<TField extends string = string> =
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

export type SelectionPressDragPlan =
  | {
      kind: 'move'
      target: SelectionTarget
      visibility: SelectionMoveVisibility
    }
  | {
      kind: 'marquee'
      match: 'touch' | 'contain'
      mode: SelectionMode
      base: SelectionTarget
      clearOnStart?: boolean
    }

export type SelectionMarqueePlan = Extract<
  SelectionPressDragPlan,
  { kind: 'marquee' }
>

export type SelectionPressPlan<TField extends string = string> = {
  chrome: boolean
  tap?: SelectionPressTapPlan<TField>
  drag?: SelectionPressDragPlan
  hold?: SelectionMarqueePlan
}

export type SelectionPressResolution<TField extends string = string> = {
  target: SelectionPressTarget<TField>
  plan: SelectionPressPlan<TField>
}

export type SelectionPressDeps = {
  node: {
    get: (nodeId: NodeId) => Node | undefined
    canEnter: (nodeId: NodeId) => boolean
    groupId: (nodeId: NodeId) => GroupId | undefined
  }
  group: {
    target: (groupId: GroupId) => SelectionTarget | undefined
  }
}

type SelectionPressSubject<TField extends string = string> =
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
    }

const HOLD_TO_CONTAIN_MARQUEE: SelectionMarqueePlan = {
  kind: 'marquee',
  match: 'contain',
  mode: 'replace',
  base: EMPTY_SELECTION_TARGET,
  clearOnStart: true
}

const HIDE_SELECTION: SelectionMoveVisibility = {
  kind: 'none'
}

const readCurrentSelection = (
  selection: SelectionSummary
): SelectionTarget => ({
  nodeIds: selection.target.nodeIds,
  edgeIds: selection.target.edgeIds
})

const readNodeOnlySelection = (
  nodeIds: readonly NodeId[]
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

export const resolveSelectionPressMode = (
  modifiers: ModifierEventLike
): SelectionMode => {
  if (modifiers.alt) return 'subtract'
  if (modifiers.meta || modifiers.ctrl) return 'toggle'
  if (modifiers.shift) return 'add'
  return 'replace'
}

export const resolveSelectionPressTarget = <TField extends string>(
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

export const resolveSelectionPressAction = <TField extends string>(
  input: {
    read: Pick<RuntimeRead, 'tool' | 'node' | 'group'>
    selection: Pick<SelectionModelRead, 'get'>
    pointer: PointerDownInput
  }
): SelectionPressResolution<TField> | undefined => {
  const tool = input.read.tool.get()

  if (
    tool.type !== 'select'
    || input.pointer.pick.kind === 'edge'
    || input.pointer.pick.kind === 'mindmap'
    || input.pointer.editable
    || input.pointer.ignoreInput
    || input.pointer.ignoreSelection
  ) {
    return undefined
  }

  const target = resolveSelectionPressTarget<TField>(input.pointer.pick)
  if (!target) {
    return undefined
  }

  const selectionModel = input.selection.get()

  return resolveSelectionPress({
    node: {
      get: (nodeId) => input.read.node.item.get(nodeId)?.node,
      canEnter: (nodeId) => {
        const node = input.read.node.item.get(nodeId)?.node
        return node
          ? input.read.node.capability(node).enter
          : false
      },
      groupId: input.read.group.ofNode
    },
    group: {
      target: (groupId) => input.read.group.target(groupId)
    }
  }, {
    modifiers: input.pointer.modifiers,
    selection: selectionModel.summary,
    affordance: selectionModel.affordance,
    target
  })
}

const isGroupSelected = (
  deps: SelectionPressDeps,
  groupId: GroupId,
  target: SelectionTarget
) => {
  const selection = deps.group.target(groupId)
  return selection
    ? isSelectionTargetEqual(selection, target)
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
  const currentSelection = readCurrentSelection(input.selection)

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
        selected: isGroupSelected(deps, input.target.groupId, currentSelection)
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
        )
      }
    }
  }
}

const planBackgroundPress = <TField extends string>(
  subject: Extract<SelectionPressSubject<TField>, { kind: 'background' }>,
  mode: SelectionMode
): SelectionPressPlan<TField> => ({
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

const planSelectionBoxPress = <TField extends string>(
  subject: Extract<SelectionPressSubject<TField>, { kind: 'selection-box' }>
): SelectionPressPlan<TField> | undefined => {
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

const planGroupPress = <TField extends string>(
  subject: Extract<SelectionPressSubject<TField>, { kind: 'group' }>
): SelectionPressPlan<TField> => {
  const nextSelection = subject.mode === 'replace'
    ? subject.groupSelection
    : applySelectionTarget(
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
    drag: {
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
    },
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

  return applySelectionTarget(
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

const resolveNodeTapPlan = <TField extends string>(
  subject: Extract<SelectionPressSubject<TField>, { kind: 'node' }>,
  nextSelection: SelectionTarget
): SelectionPressTapPlan<TField> => {
  const explicitFieldEdit = (
    subject.mode === 'replace'
    && Boolean(subject.target.field)
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

const planNodePress = <TField extends string>(
  subject: Extract<SelectionPressSubject<TField>, { kind: 'node' }>
): SelectionPressPlan<TField> => {
  const nextSelection = resolveNodeNextSelection(subject)
  const dragTarget = resolveNodeDragTarget(subject, nextSelection)

  return {
    chrome: subject.selected || subject.groupSelected,
    tap: resolveNodeTapPlan(subject, nextSelection),
    drag: {
      kind: 'move',
      target: dragTarget,
      visibility: resolveNodeDragVisibility(subject, nextSelection, dragTarget)
    },
    hold: HOLD_TO_CONTAIN_MARQUEE
  }
}

const resolveSelectionPressPlan = <TField extends string>(
  subject: SelectionPressSubject<TField>,
  mode: SelectionMode
): SelectionPressPlan<TField> | undefined => {
  switch (subject.kind) {
    case 'background':
      return planBackgroundPress(subject, mode)
    case 'selection-box':
      return planSelectionBoxPress(subject)
    case 'group':
      return planGroupPress(subject)
    case 'node':
      return planNodePress(subject)
  }
}

export const resolveSelectionPress = <TField extends string>(
  deps: SelectionPressDeps,
  input: {
    modifiers: ModifierEventLike
    selection: SelectionSummary
    affordance: SelectionAffordance
    target: SelectionPressTarget<TField>
  }
): SelectionPressResolution<TField> | undefined => {
  const mode = resolveSelectionPressMode(input.modifiers)
  const subject = resolveSelectionPressSubject(deps, {
    target: input.target,
    mode,
    selection: input.selection,
    affordance: input.affordance
  })
  if (!subject) {
    return undefined
  }

  const plan = resolveSelectionPressPlan(subject, mode)
  if (!plan) {
    return undefined
  }

  return {
    target: input.target,
    plan
  }
}

export const matchSelectionTap = <TField extends string>(
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
