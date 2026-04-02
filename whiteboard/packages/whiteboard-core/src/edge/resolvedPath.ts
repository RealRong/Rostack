import { getEdgePath } from './path'
import { resolveEdgeEnds } from './endpoints'
import type {
  ResolveEdgePathFromRectsInput,
  ResolvedEdgePathFromRects
} from '../types/edge'

export const resolveEdgePathFromRects = ({
  edge,
  source,
  target
}: ResolveEdgePathFromRectsInput): ResolvedEdgePathFromRects => {
  const ends = resolveEdgeEnds({
    edge,
    source,
    target
  })
  if (!ends) {
    throw new Error(`Unable to resolve edge path for ${edge.id}.`)
  }
  const path = getEdgePath({
    edge,
    source: {
      point: ends.source.point,
      side: ends.source.anchor?.side
    },
    target: {
      point: ends.target.point,
      side: ends.target.anchor?.side
    }
  })
  return {
    ends,
    path
  }
}
