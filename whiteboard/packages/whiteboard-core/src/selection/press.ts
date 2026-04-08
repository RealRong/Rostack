import {
  EMPTY_SELECTION_TARGET,
  applySelectionTarget,
  type SelectionTarget
} from './target'
import { applySelection, type SelectionMode } from '../node'
import type { EdgeId, GroupId, Node, NodeId } from '../types'
import type { SelectionAffordance } from './affordance'
import type { SelectionSummary } from './summary'

type ModifierEventLike = {
  alt: boolean
  shift: boolean
  ctrl: boolean
  meta: boolean
}

export type SelectionPressTargetInput<TField extends string = string> =
  | { kind: 'background' }
  | {
      kind: 'group'
      groupId: GroupId
    }
  | {
      kind: 'selection-box'
      part: 'body' | 'transform'
    }
  | {
      kind: 'node'
      nodeId: NodeId
      part: 'body' | 'field'
      field?: TField
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
      hitNodeId: NodeId
      field?: TField
    }

export type SelectionTapAction<TField extends string = string> =
  | { kind: 'clear' }
  | {
      kind: 'select'
      target: SelectionTarget
    }
  | {
      kind: 'edit-node'
      nodeId: NodeId
      selection?: SelectionTarget
    }
  | {
      kind: 'edit-field'
      nodeId: NodeId
      field: TField
      selection?: SelectionTarget
    }

export type SelectionMoveSelectionBehavior =
  | {
      kind: 'persist'
      visibleSelection?: SelectionTarget
    }
  | {
      kind: 'temporary'
      visibleSelection: SelectionTarget
      restoreSelection: SelectionTarget
    }

export type SelectionDragDecision =
  | {
      kind: 'move'
      target: SelectionTarget
      selection: SelectionMoveSelectionBehavior
    }
  | {
      kind: 'marquee'
      match: 'touch' | 'contain'
      mode: SelectionMode
      base: SelectionTarget
      clearOnStart?: boolean
    }

export type SelectionMarqueeDecision = Extract<
  SelectionDragDecision,
  { kind: 'marquee' }
>

export type SelectionPressDecision<TField extends string = string> = {
  chrome: boolean
  tap?: SelectionTapAction<TField>
  drag?: SelectionDragDecision
  hold?: SelectionMarqueeDecision
}

export type SelectionPressResolution<TField extends string = string> = {
  target: SelectionPressTarget<TField>
  decision: SelectionPressDecision<TField>
}

export type SelectionPressPolicyDeps = {
  getNode: (nodeId: NodeId) => Node | undefined
  canEnter: (nodeId: NodeId) => boolean
  getNodeGroupId: (nodeId: NodeId) => GroupId | undefined
  getGroupSelection: (groupId: GroupId) => SelectionTarget | undefined
  isGroupSelected: (
    groupId: GroupId,
    target: SelectionTarget
  ) => boolean
}

const HOLD_TO_CONTAIN_MARQUEE: SelectionMarqueeDecision = {
  kind: 'marquee',
  match: 'contain',
  mode: 'replace',
  base: EMPTY_SELECTION_TARGET,
  clearOnStart: true
}

export const resolveSelectionPressMode = (
  modifiers: ModifierEventLike
): SelectionMode => {
  if (modifiers.alt) return 'subtract'
  if (modifiers.meta || modifiers.ctrl) return 'toggle'
  if (modifiers.shift) return 'add'
  return 'replace'
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

const toNodeSelection = (
  nodeIds: readonly NodeId[]
): SelectionTarget => ({
  nodeIds,
  edgeIds: []
})

const applyNodeTapSelection = (
  selectedNodeIds: readonly NodeId[],
  selectedEdgeIds: readonly EdgeId[],
  nodeId: NodeId,
  mode: SelectionMode
): SelectionTarget => ({
  nodeIds: [
    ...applySelection(
      new Set(selectedNodeIds),
      [nodeId],
      mode
    )
  ],
  edgeIds: [
    ...applySelection(
      new Set(selectedEdgeIds),
      [],
      mode
    )
  ]
})

const getCurrentSelection = (
  selection: SelectionSummary
): SelectionTarget => ({
  nodeIds: selection.target.nodeIds,
  edgeIds: selection.target.edgeIds
})

const createPersistMoveSelection = (
  visibleSelection?: SelectionTarget
): SelectionMoveSelectionBehavior => ({
  kind: 'persist',
  visibleSelection
})

const createTemporaryMoveSelection = (
  visibleSelection: SelectionTarget,
  restoreSelection: SelectionTarget
): SelectionMoveSelectionBehavior => ({
  kind: 'temporary',
  visibleSelection,
  restoreSelection
})

const readPressNodeTarget = <TField extends string>(
  _deps: Pick<SelectionPressPolicyDeps, 'getNode'>,
  input: {
    field?: TField
    mode: SelectionMode
    selectedNodeIds: readonly NodeId[]
  },
  nodeId: NodeId
): SelectionPressTarget<TField> => {
  void input
  return {
    kind: 'node',
    nodeId,
    hitNodeId: nodeId,
    field: input.field
  }
}

export const resolveSelectionPressTarget = <TField extends string>(
  deps: SelectionPressPolicyDeps,
  input: {
    targetInput: SelectionPressTargetInput<TField>
    mode: SelectionMode
    selectedNodeIds: readonly NodeId[]
  }
): SelectionPressTarget<TField> | undefined => {
  const { targetInput } = input

  switch (targetInput.kind) {
    case 'background':
      return { kind: 'background' }
    case 'group':
      return {
        kind: 'group',
        groupId: targetInput.groupId
      }
    case 'selection-box':
      return targetInput.part === 'body'
        ? { kind: 'selection-box' }
        : undefined
    case 'node':
      return readPressNodeTarget(deps, input, targetInput.nodeId)
  }
}

const canDragSelectionBox = (
  affordance: SelectionAffordance
) => (
  affordance.moveHit === 'body'
  && affordance.canMove
  && !affordance.showSingleNodeOverlay
)

const decideBackgroundPress = <TField extends string>(
  selection: SelectionSummary,
  mode: SelectionMode
): SelectionPressDecision<TField> => ({
  chrome: false,
  tap: mode === 'replace'
    ? { kind: 'clear' }
    : undefined,
  drag: {
    kind: 'marquee',
    match: 'touch',
    mode,
    base: getCurrentSelection(selection)
  }
})

const decideSelectionBoxPress = <TField extends string>(
  selection: SelectionSummary,
  affordance: SelectionAffordance
): SelectionPressDecision<TField> | undefined => {
  if (!selection.target.nodeIds.length && !selection.target.edgeIds.length) {
    return undefined
  }

  if (!canDragSelectionBox(affordance)) {
    return undefined
  }

  return {
    chrome: true,
    drag: selection.target.nodeIds.length > 0
      ? {
          kind: 'move',
          target: getCurrentSelection(selection),
          selection: createPersistMoveSelection()
        }
      : undefined,
    hold: HOLD_TO_CONTAIN_MARQUEE
  }
}

const decideNodePress = <TField extends string>(
  deps: Pick<
    SelectionPressPolicyDeps,
    'getNode' | 'canEnter' | 'getNodeGroupId' | 'getGroupSelection' | 'isGroupSelected'
  >,
  selection: SelectionSummary,
  mode: SelectionMode,
  target: Extract<SelectionPressTarget<TField>, { kind: 'node' }>
): SelectionPressDecision<TField> | undefined => {
  const {
    nodeId,
    hitNodeId,
    field
  } = target
  const node = deps.getNode(nodeId)
  if (!node) {
    return undefined
  }

  const selectedNodeIds = selection.target.nodeIds
  const selectedEdgeIds = selection.target.edgeIds
  const currentSelection = getCurrentSelection(selection)
  const groupId = deps.getNodeGroupId(hitNodeId)
  const groupSelection = mode === 'replace' && groupId
    ? deps.getGroupSelection(groupId)
    : undefined
  const groupSelected = Boolean(
    mode === 'replace'
    && groupId
    && deps.isGroupSelected(groupId, currentSelection)
  )
  const promoteToGroup = Boolean(groupSelection && !groupSelected)
  const selected = isSelectedNode(node.id, selectedNodeIds)
  const repeat = mode === 'replace' && isSingleSelectedNode(node.id, selectedNodeIds)
  const dragCurrentSelection = mode === 'replace' && groupSelected
  const nextSelection = promoteToGroup
    ? groupSelection!
    : groupSelected
      ? {
          nodeIds: [node.id],
          edgeIds: []
        }
      : applyNodeTapSelection(
          selectedNodeIds,
          selectedEdgeIds,
          node.id,
          mode
        )
  const dragNodeIds = repeat
    ? selectedNodeIds
    : dragCurrentSelection
      ? selectedNodeIds
      : promoteToGroup
        ? nextSelection.nodeIds
      : selected
        ? selectedNodeIds
        : nextSelection.nodeIds
  const dragEdgeIds =
    repeat || dragCurrentSelection
      ? selectedEdgeIds
      : promoteToGroup
        ? nextSelection.edgeIds
      : selected
        ? selectedEdgeIds
      : []
  const dragSelection = toNodeSelection(dragNodeIds)
  const dragSelectionBehavior =
    promoteToGroup
      ? createTemporaryMoveSelection(
          nextSelection,
          currentSelection
        )
      : mode === 'replace' && !selected && !dragCurrentSelection
      ? createTemporaryMoveSelection(
          dragSelection,
          currentSelection
        )
      : createPersistMoveSelection(
          repeat || dragCurrentSelection || selected
            ? undefined
            : (
                promoteToGroup
                  ? nextSelection
                  : dragSelection
              )
        )

  const explicitFieldEdit =
    mode === 'replace'
    && nodeId === hitNodeId
    && Boolean(field)
    && !node.locked
    && !promoteToGroup
    && !groupSelected
  const implicitEdit =
    repeat
    && nodeId === hitNodeId
    && deps.canEnter(node.id)

  return {
    chrome: selected || dragCurrentSelection,
    tap: node.locked
      ? {
          kind: 'select',
          target: nextSelection
        }
      : explicitFieldEdit
        ? {
            kind: 'edit-field',
            nodeId: node.id,
            field: field!,
            selection: nextSelection
          }
        : implicitEdit
          ? {
              kind: 'edit-node',
              nodeId: node.id
            }
        : {
            kind: 'select',
            target: nextSelection
          },
    drag: {
      kind: 'move',
      target: {
        nodeIds: dragNodeIds,
        edgeIds: dragEdgeIds
      },
      selection: dragSelectionBehavior
    },
    hold: HOLD_TO_CONTAIN_MARQUEE
  }
}

const decideGroupPress = <TField extends string>(
  deps: Pick<SelectionPressPolicyDeps, 'getGroupSelection' | 'isGroupSelected'>,
  selection: SelectionSummary,
  mode: SelectionMode,
  groupId: GroupId
): SelectionPressDecision<TField> | undefined => {
  const currentSelection = getCurrentSelection(selection)
  const groupSelection = deps.getGroupSelection(groupId)
  if (!groupSelection) {
    return undefined
  }

  const selected = deps.isGroupSelected(groupId, currentSelection)
  const nextSelection = mode === 'replace'
    ? groupSelection
    : applySelectionTarget(currentSelection, groupSelection, mode)
  const dragCurrentSelection = mode === 'replace' && selected

  return {
    chrome: selected,
    tap: {
      kind: 'select',
      target: nextSelection
    },
    drag: {
      kind: 'move',
      target: dragCurrentSelection
        ? currentSelection
        : nextSelection,
      selection:
        mode === 'replace' && !selected
          ? createTemporaryMoveSelection(
              nextSelection,
              currentSelection
            )
          : createPersistMoveSelection(
              dragCurrentSelection
                ? undefined
                : nextSelection
            )
    },
    hold: HOLD_TO_CONTAIN_MARQUEE
  }
}

export const resolveSelectionPressDecision = <TField extends string>(
  deps: SelectionPressPolicyDeps,
  input: {
    modifiers: ModifierEventLike
    selection: SelectionSummary
    affordance: SelectionAffordance
    targetInput: SelectionPressTargetInput<TField>
  }
): SelectionPressResolution<TField> | undefined => {
  const mode = resolveSelectionPressMode(input.modifiers)
  const target = resolveSelectionPressTarget(deps, {
    targetInput: input.targetInput,
    mode,
    selectedNodeIds: input.selection.target.nodeIds
  })
  if (!target) {
    return undefined
  }

  const decision =
    target.kind === 'background'
      ? decideBackgroundPress<TField>(input.selection, mode)
      : target.kind === 'group'
        ? decideGroupPress<TField>(deps, input.selection, mode, target.groupId)
      : target.kind === 'selection-box'
        ? decideSelectionBoxPress<TField>(input.selection, input.affordance)
        : decideNodePress(deps, input.selection, mode, target)

  return decision
    ? {
        target,
        decision
      }
    : undefined
}

export const matchSelectionTap = <TField extends string>(
  target: SelectionPressTarget<TField>,
  targetInput: SelectionPressTargetInput<TField> | undefined
) => {
  if (!targetInput) {
    return false
  }

  switch (target.kind) {
    case 'background':
      return targetInput.kind === 'background'
    case 'group':
      return targetInput.kind === 'group'
        && targetInput.groupId === target.groupId
    case 'selection-box':
      return targetInput.kind === 'selection-box'
        && targetInput.part === 'body'
    case 'node':
      return (
        targetInput.kind === 'node'
        && (
          targetInput.nodeId === target.nodeId
          || targetInput.nodeId === target.hitNodeId
        )
      )
  }
}
