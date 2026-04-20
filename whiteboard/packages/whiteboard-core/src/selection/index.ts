import {
  applySelectionTarget,
  deriveSelectionAffordance,
  deriveSelectionSummary,
  EMPTY_SELECTION_TARGET,
  getTargetBounds,
  isSelectionAffordanceEqual,
  isSelectionSummaryEqual,
  isSelectionTargetEqual,
  normalizeSelectionTarget,
  resolveSelectionBoxTarget
} from '@whiteboard/core/selection/model'

export const selection = {
  target: {
    empty: EMPTY_SELECTION_TARGET,
    apply: applySelectionTarget,
    normalize: normalizeSelectionTarget,
    equal: isSelectionTargetEqual
  },
  derive: {
    affordance: deriveSelectionAffordance,
    summary: deriveSelectionSummary,
    isAffordanceEqual: isSelectionAffordanceEqual,
    isSummaryEqual: isSelectionSummaryEqual
  },
  bounds: {
    get: getTargetBounds
  },
  resolve: {
    boxTarget: resolveSelectionBoxTarget
  }
} as const

export type {
  SelectionInput,
  BoundsTarget,
  SelectionAffordance,
  SelectionAffordanceMoveHit,
  SelectionAffordanceOwner,
  SelectionSummary,
  SelectionTarget
} from '@whiteboard/core/selection/model'
