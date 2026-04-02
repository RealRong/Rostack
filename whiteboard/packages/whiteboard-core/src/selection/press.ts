import { EMPTY_SELECTION_TARGET, type SelectionTarget } from './target'
import { applySelection, findGroupAncestor, type SelectionMode } from '../node'
import type { EdgeId, Node, NodeId } from '../types'
import type { SelectionSummary } from './summary'

type ModifierEventLike = {
  alt: boolean
  shift: boolean
  ctrl: boolean
  meta: boolean
}

export type SelectionPressSubject<TField extends string = string> =
  | { kind: 'background' }
  | {
      kind: 'selection-box'
      part: 'body' | 'transform'
    }
  | {
      kind: 'node'
      nodeId: NodeId
      part: 'body' | 'shell'
      shell?: 'content' | 'frame' | 'group'
      field?: TField
    }

export type SelectionPressTarget<TField extends string = string> =
  | { kind: 'background' }
  | { kind: 'selection-box' }
  | {
      kind: 'node'
      nodeId: NodeId
      hitNodeId: NodeId
      selectedGroupId?: NodeId
      field?: TField
    }
  | {
      kind: 'group-shell'
      nodeId: NodeId
    }

export type SelectionReleaseDecision<TField extends string = string> =
  | { kind: 'clear' }
  | {
      kind: 'select'
      target: SelectionTarget
    }
  | {
      kind: 'edit'
      nodeId: NodeId
      field: TField
    }

export type SelectionDragDecision =
  | {
      kind: 'move'
      target: SelectionTarget
      prepareSelection?: SelectionTarget
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
  release?: SelectionReleaseDecision<TField>
  drag?: SelectionDragDecision
  hold?: SelectionMarqueeDecision
}

export type SelectionPressResolution<TField extends string = string> = {
  target: SelectionPressTarget<TField>
  decision: SelectionPressDecision<TField>
}

export type SelectionPressPolicyDeps = {
  getNode: (nodeId: NodeId) => Node | undefined
  getOwnerId: (nodeId: NodeId) => NodeId | undefined
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

const findSelectedGroupId = (
  deps: Pick<SelectionPressPolicyDeps, 'getNode' | 'getOwnerId'>,
  nodeId: NodeId,
  selectedNodeIds: readonly NodeId[]
) => findGroupAncestor(
  nodeId,
  deps.getNode,
  deps.getOwnerId,
  (groupId) => selectedNodeIds.includes(groupId)
)

const resolvePressNodeId = (
  deps: Pick<SelectionPressPolicyDeps, 'getNode' | 'getOwnerId'>,
  input: {
    mode: SelectionMode
    selectedNodeIds: readonly NodeId[]
  },
  nodeId: NodeId
) => {
  if (input.mode !== 'replace') {
    return nodeId
  }

  const node = deps.getNode(nodeId)
  if (!node || node.type === 'group') {
    return nodeId
  }

  const groupId = findGroupAncestor(nodeId, deps.getNode, deps.getOwnerId)
  if (!groupId) {
    return nodeId
  }

  const selectedNodeIds = input.selectedNodeIds
  if (
    selectedNodeIds.includes(nodeId)
    || selectedNodeIds.includes(groupId)
  ) {
    return nodeId
  }

  return selectedNodeIds.some((selectedNodeId) =>
    Boolean(findGroupAncestor(
      selectedNodeId,
      deps.getNode,
      deps.getOwnerId,
      (currentId) => currentId === groupId
    ))
  )
    ? nodeId
    : groupId
}

const readPressNodeTarget = <TField extends string>(
  deps: Pick<SelectionPressPolicyDeps, 'getNode' | 'getOwnerId'>,
  input: {
    field?: TField
    mode: SelectionMode
    selectedNodeIds: readonly NodeId[]
  },
  nodeId: NodeId
): SelectionPressTarget<TField> => ({
  kind: 'node',
  nodeId: resolvePressNodeId(deps, input, nodeId),
  hitNodeId: nodeId,
  selectedGroupId:
    input.mode === 'replace'
      ? findSelectedGroupId(deps, nodeId, input.selectedNodeIds)
      : undefined,
  field: input.field
})

export const resolveSelectionPressTarget = <TField extends string>(
  deps: SelectionPressPolicyDeps,
  input: {
    subject: SelectionPressSubject<TField>
    mode: SelectionMode
    selectedNodeIds: readonly NodeId[]
  }
): SelectionPressTarget<TField> | undefined => {
  const { subject } = input

  switch (subject.kind) {
    case 'background':
      return { kind: 'background' }
    case 'selection-box':
      return subject.part === 'body'
        ? { kind: 'selection-box' }
        : undefined
    case 'node':
      if (subject.part === 'body') {
        return readPressNodeTarget(deps, input, subject.nodeId)
      }

      if (subject.shell === 'frame') {
        return {
          kind: 'node',
          nodeId: subject.nodeId,
          hitNodeId: subject.nodeId,
          field: subject.field
        }
      }

      return subject.shell === 'group'
        ? {
            kind: 'group-shell',
            nodeId: subject.nodeId
          }
        : undefined
  }
}

const canDragSelectionBox = (
  selection: SelectionSummary
) => {
  if (!selection.box) {
    return false
  }

  if (selection.items.count > 1) {
    return true
  }

  return (
    selection.transform.resize === 'scale'
    && !(
      selection.kind === 'node'
      && selection.items.primaryNode?.type === 'group'
    )
  )
}

const decideBackgroundPress = <TField extends string>(
  selection: SelectionSummary,
  mode: SelectionMode
): SelectionPressDecision<TField> => ({
  chrome: false,
  release: mode === 'replace'
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
  selection: SelectionSummary
): SelectionPressDecision<TField> | undefined => {
  if (!selection.target.nodeIds.length && !selection.target.edgeIds.length) {
    return undefined
  }

  if (!canDragSelectionBox(selection)) {
    return undefined
  }

  return {
    chrome: true,
    drag: selection.target.nodeIds.length > 0
      ? {
          kind: 'move',
          target: getCurrentSelection(selection)
        }
      : undefined,
    hold: HOLD_TO_CONTAIN_MARQUEE
  }
}

const decideNodePress = <TField extends string>(
  deps: Pick<SelectionPressPolicyDeps, 'getNode'>,
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
  const selected = isSelectedNode(node.id, selectedNodeIds)
  const repeat = mode === 'replace' && isSingleSelectedNode(node.id, selectedNodeIds)
  const dragCurrentSelection = Boolean(
    mode === 'replace'
    && target.selectedGroupId
  )
  const nextSelection = applyNodeTapSelection(
    selectedNodeIds,
    selectedEdgeIds,
    node.id,
    mode
  )
  const dragNodeIds = repeat
    ? selectedNodeIds
    : dragCurrentSelection
      ? selectedNodeIds
      : selected
        ? selectedNodeIds
        : nextSelection.nodeIds
  const dragEdgeIds =
    repeat || dragCurrentSelection || selected
      ? selectedEdgeIds
      : []

  return {
    chrome: selected || dragCurrentSelection,
    release: node.locked
      ? {
          kind: 'select',
          target: nextSelection
        }
      : repeat
        ? (
          nodeId === hitNodeId && field
            ? {
                kind: 'edit',
                nodeId: node.id,
                field
              }
            : undefined
        )
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
      prepareSelection: dragCurrentSelection
        ? undefined
        : toNodeSelection(dragNodeIds)
    },
    hold: HOLD_TO_CONTAIN_MARQUEE
  }
}

const decideGroupShellPress = <TField extends string>(
  deps: Pick<SelectionPressPolicyDeps, 'getNode'>,
  selection: SelectionSummary,
  mode: SelectionMode,
  nodeId: NodeId
): SelectionPressDecision<TField> | undefined => {
  const node = deps.getNode(nodeId)
  if (!node) {
    return undefined
  }

  const selected = isSelectedNode(node.id, selection.target.nodeIds)
  const repeat = mode === 'replace' && selected
  const nextSelection = applyNodeTapSelection(
    selection.target.nodeIds,
    selection.target.edgeIds,
    node.id,
    mode
  )

  return {
    chrome: selected,
    release: {
      kind: 'select',
      target: nextSelection
    },
    drag: repeat
      ? {
          kind: 'move',
          target: getCurrentSelection(selection),
          prepareSelection: toNodeSelection(selection.target.nodeIds)
        }
      : {
          kind: 'marquee',
          match: 'touch',
          mode,
          base: getCurrentSelection(selection)
        },
    hold: HOLD_TO_CONTAIN_MARQUEE
  }
}

export const resolveSelectionPressDecision = <TField extends string>(
  deps: SelectionPressPolicyDeps,
  input: {
    modifiers: ModifierEventLike
    selection: SelectionSummary
    subject: SelectionPressSubject<TField>
  }
): SelectionPressResolution<TField> | undefined => {
  const mode = resolveSelectionPressMode(input.modifiers)
  const target = resolveSelectionPressTarget(deps, {
    subject: input.subject,
    mode,
    selectedNodeIds: input.selection.target.nodeIds
  })
  if (!target) {
    return undefined
  }

  const decision =
    target.kind === 'background'
      ? decideBackgroundPress<TField>(input.selection, mode)
      : target.kind === 'selection-box'
        ? decideSelectionBoxPress<TField>(input.selection)
        : target.kind === 'node'
          ? decideNodePress(deps, input.selection, mode, target)
          : decideGroupShellPress<TField>(deps, input.selection, mode, target.nodeId)

  return decision
    ? {
        target,
        decision
      }
    : undefined
}

export const matchSelectionRelease = <TField extends string>(
  target: SelectionPressTarget<TField>,
  subject: SelectionPressSubject<TField> | undefined
) => {
  if (!subject) {
    return false
  }

  switch (target.kind) {
    case 'background':
      return subject.kind === 'background'
    case 'selection-box':
      return subject.kind === 'selection-box'
        && subject.part === 'body'
    case 'group-shell':
      return (
        subject.kind === 'node'
        && subject.part === 'shell'
        && subject.shell === 'group'
        && subject.nodeId === target.nodeId
      )
    case 'node':
      return (
        subject.kind === 'node'
        && (
          subject.nodeId === target.nodeId
          || subject.nodeId === target.hitNodeId
        )
      )
  }
}
