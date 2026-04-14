import {
  EMPTY_SELECTION_TARGET,
  applySelectionTarget,
  isSelectionTargetEqual,
  type SelectionTarget
} from '@whiteboard/core/selection'
import type { SelectionMode } from '@whiteboard/core/node'
import type {
  SelectionMarqueePlan,
  SelectionMoveVisibility,
  SelectionPressPlan,
  SelectionPressSubject,
  SelectionPressTarget,
  SelectionPressTapPlan
} from '@whiteboard/editor/input/selection/press/resolve'

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

export const resolveSelectionPressPlan = <TField extends string>(
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
