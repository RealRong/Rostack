import { applySelection, type SelectionMode } from '../node/selection'
import type { EdgeId, NodeId } from '../types'
import { isOrderedArrayEqual } from '../utils'

const EMPTY_NODE_IDS: readonly NodeId[] = []
const EMPTY_EDGE_IDS: readonly EdgeId[] = []

export type SelectionInput = {
  nodeIds?: readonly NodeId[]
  edgeIds?: readonly EdgeId[]
}

export type SelectionTarget = {
  nodeIds: readonly NodeId[]
  edgeIds: readonly EdgeId[]
}

export const EMPTY_SELECTION_TARGET: SelectionTarget = {
  nodeIds: EMPTY_NODE_IDS,
  edgeIds: EMPTY_EDGE_IDS
}

export const isSelectionTargetEqual = (
  left: SelectionTarget,
  right: SelectionTarget
) => (
  isOrderedArrayEqual(left.nodeIds, right.nodeIds)
  && isOrderedArrayEqual(left.edgeIds, right.edgeIds)
)

export const normalizeSelectionTarget = (
  input: SelectionInput
): SelectionTarget => {
  const nodeIds = [...new Set(input.nodeIds ?? EMPTY_NODE_IDS)]
  const edgeIds = [...new Set(input.edgeIds ?? EMPTY_EDGE_IDS)]

  if (!nodeIds.length && !edgeIds.length) {
    return EMPTY_SELECTION_TARGET
  }

  return {
    nodeIds,
    edgeIds
  }
}

export const applySelectionTarget = (
  current: SelectionTarget,
  input: SelectionInput,
  mode: SelectionMode
): SelectionTarget => normalizeSelectionTarget({
  nodeIds: [...applySelection(
    new Set(current.nodeIds),
    [...(input.nodeIds ?? EMPTY_NODE_IDS)],
    mode
  )],
  edgeIds: [...applySelection(
    new Set(current.edgeIds),
    [...(input.edgeIds ?? EMPTY_EDGE_IDS)],
    mode
  )]
})
