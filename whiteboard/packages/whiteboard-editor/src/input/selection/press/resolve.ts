import {
  type SelectionAffordance,
  type SelectionSummary,
  type SelectionTarget
} from '@whiteboard/core/selection'
import type { SelectionMode } from '@whiteboard/core/node'
import type { GroupId, Node, NodeId } from '@whiteboard/core/types'
import type { PointerDownInput } from '@whiteboard/editor/types/input'
import { resolveSelectionPressPlan } from '@whiteboard/editor/input/selection/press/plan'

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

const readCurrentSelection = (
  selection: SelectionSummary
): SelectionTarget => ({
  nodeIds: selection.target.nodeIds,
  edgeIds: selection.target.edgeIds
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

export const resolveSelectionPressSubject = <TField extends string>(
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
