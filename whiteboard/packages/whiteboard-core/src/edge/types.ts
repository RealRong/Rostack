import type { EdgeRoute, Point } from '../types/core'
export type {
  AnchorSnapOptions,
  EdgeConnectCandidate,
  EdgeConnectConfig,
  EdgeConnectResult,
  EdgeNodeCanvasSnapshot,
  EdgeConnectTarget,
  EdgeCreateOperationResult,
  EdgeHandle,
  EdgePathEnd,
  EdgePathInput,
  EdgePathResult,
  EdgePathSegment,
  EdgeRectHitMode,
  EdgeRelations,
  EdgeRouter,
  EdgeView,
  InsertRoutePointResult,
  ResolveEdgeEndsInput,
  ResolveEdgePathFromRectsInput,
  ResolvedEdgeEnd,
  ResolvedEdgeEnds,
  ResolvedEdgePathFromRects
} from '../types/edge'

export const readEdgeRoutePoints = (
  route: EdgeRoute | undefined
): readonly Point[] => (
  route?.kind === 'manual'
    ? route.points
    : []
)
