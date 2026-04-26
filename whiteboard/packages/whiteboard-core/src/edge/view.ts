import { toSpatialNode } from '@whiteboard/core/node/projection'
import { getEdgePath } from '@whiteboard/core/edge/path'
import { resolveEdgeEnds } from '@whiteboard/core/edge/endpoints'
import { readEdgeRoutePoints } from '@whiteboard/core/edge/route'
import type {
  Edge,
  NodeGeometry,
  NodeId,
  NodeModel,
  Rect
} from '@whiteboard/core/types'
import type { EdgeHandle, EdgeView, ResolveEdgeEndsInput } from '@whiteboard/core/types/edge'

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

type NodeGeometryInput = {
  node: NodeModel
  rect: Rect
  outline: NodeGeometry['outline']
  bounds: Rect
  rotation: number
}

const readResolvedNodeSnapshot = (
  readNodeGeometry: (nodeId: NodeId) => NodeGeometryInput | undefined,
  end: Edge['source'] | Edge['target']
) => {
  if (end.kind !== 'node') {
    return undefined
  }

  const geometry = readNodeGeometry(end.nodeId)
  return geometry
    ? {
        node: toSpatialNode(geometry),
        geometry: {
          rect: geometry.rect,
          outline: geometry.outline,
          bounds: geometry.bounds
        }
      }
    : undefined
}

export const resolveEdgeViewFromNodeGeometry = (input: {
  edge: Edge
  readNodeGeometry: (nodeId: NodeId) => NodeGeometryInput | undefined
}): EdgeView | undefined => {
  const source = readResolvedNodeSnapshot(
    input.readNodeGeometry,
    input.edge.source
  )
  const target = readResolvedNodeSnapshot(
    input.readNodeGeometry,
    input.edge.target
  )

  if (
    (input.edge.source.kind === 'node' && !source)
    || (input.edge.target.kind === 'node' && !target)
  ) {
    return undefined
  }

  try {
    return resolveEdgeView({
      edge: input.edge,
      source,
      target
    })
  } catch {
    return undefined
  }
}
