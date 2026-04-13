import { getEdgePath } from '#whiteboard-core/edge/path'
import { resolveEdgeEnds } from '#whiteboard-core/edge/endpoints'
import type {
  ResolveEdgePathFromRectsInput,
  ResolvedEdgePathFromRects
} from '#whiteboard-core/types/edge'

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
