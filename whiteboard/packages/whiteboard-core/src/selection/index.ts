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
import {
  deriveSelectionEdgeStats as readSelectionEdgeStats,
  deriveSelectionNodeStats as readSelectionNodeStats,
  readSingleSelectedEdgeId as readSingleEdgeId,
  readSingleSelectedNodeId as readSingleNodeId
} from '@whiteboard/core/selection/query'

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
    nodeStats: readSelectionNodeStats,
    edgeStats: readSelectionEdgeStats,
    isAffordanceEqual: isSelectionAffordanceEqual,
    isSummaryEqual: isSelectionSummaryEqual
  },
  members: {
    singleNode: readSingleNodeId,
    singleEdge: readSingleEdgeId
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
export type {
  SelectionEdgeStats,
  SelectionNodeStats
} from '@whiteboard/core/selection/query'
