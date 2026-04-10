import { getEdgePath } from './path'
import { resolveEdgeEnds } from './endpoints'
import { readEdgeRoutePoints } from './route'
import type { EdgeHandle, EdgeView, ResolveEdgeEndsInput } from '../types/edge'

const buildEdgeHandles = (
  ends: NonNullable<ReturnType<typeof resolveEdgeEnds>>,
  input: ResolveEdgeEndsInput,
  path: ReturnType<typeof getEdgePath>
): readonly EdgeHandle[] => {
  const routePoints = readEdgeRoutePoints(input.edge.route)
  const handles: EdgeHandle[] = [
    {
      kind: 'end',
      end: 'source',
      point: ends.source.point
    },
    {
      kind: 'end',
      end: 'target',
      point: ends.target.point
    }
  ]

  routePoints.forEach((point, index) => {
    handles.push({
      kind: 'anchor',
      index,
      point,
      mode: 'fixed'
    })
  })

  path.segments.forEach((segment, segmentIndex) => {
    handles.push({
      kind: 'segment',
      role: segment.role,
      insertIndex: segment.insertIndex,
      segmentIndex,
      axis: segment.from.x === segment.to.x ? 'x' : 'y',
      point: segment.insertPoint ?? {
        x: (segment.from.x + segment.to.x) / 2,
        y: (segment.from.y + segment.to.y) / 2
      }
    })
  })

  return handles
}

export const resolveEdgeView = (
  input: ResolveEdgeEndsInput
): EdgeView => {
  const ends = resolveEdgeEnds(input)
  if (!ends) {
    throw new Error(`Unable to resolve edge view for ${input.edge.id}.`)
  }

  const path = getEdgePath({
    edge: input.edge,
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
    path,
    handles: buildEdgeHandles(ends, input, path)
  }
}
