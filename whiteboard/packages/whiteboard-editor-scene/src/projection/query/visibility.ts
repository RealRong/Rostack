import { edge as edgeApi } from '@whiteboard/core/edge'
import { geometry as geometryApi } from '@whiteboard/core/geometry'
import { node as nodeApi } from '@whiteboard/core/node'
import type {
  Point,
  Rect
} from '@whiteboard/core/types'
import type {
  EdgeView,
  MindmapView,
  NodeView,
  SceneHitItem,
  SceneSpatial,
  SceneVisibility
} from '../../contracts/editor'
import type { WorkingState } from '../../contracts/working'

type VisibleSceneHitItem =
  | {
      kind: 'node'
      id: string
    }
  | {
      kind: 'edge'
      id: string
    }
  | {
      kind: 'mindmap'
      id: string
    }

type VisibilityCandidate = VisibleSceneHitItem & {
  order: number
}

type VisiblePointCandidate = VisibilityCandidate & {
  distance: number
}

const KIND_RANK: Record<VisibleSceneHitItem['kind'], number> = {
  node: 2,
  mindmap: 2,
  edge: 1
}

const makeKindSet = (
  kinds?: readonly ('node' | 'edge' | 'mindmap')[]
) => kinds
  ? new Set(kinds)
  : undefined

const isVisibleKind = (kind: SceneHitItem['kind']): kind is VisibleSceneHitItem['kind'] => (
  kind === 'node'
  || kind === 'edge'
  || kind === 'mindmap'
)

const getRectCenter = (
  rect: Rect
): Point => ({
  x: rect.x + rect.width / 2,
  y: rect.y + rect.height / 2
})

const getRectCorners = (
  rect: Rect
): Point[] => [
  { x: rect.x, y: rect.y },
  { x: rect.x + rect.width, y: rect.y },
  { x: rect.x + rect.width, y: rect.y + rect.height },
  { x: rect.x, y: rect.y + rect.height }
]

const readNodeDistance = (input: {
  state: WorkingState
  nodeId: string
  point: Point
}): number | undefined => {
  const graph = input.state.graph.nodes.get(input.nodeId)
  const state = input.state.graph.state.node.get(input.nodeId)
  if (!graph || state?.hidden) {
    return undefined
  }

  return nodeApi.hit.distanceToPoint({
    node: graph.base.node,
    rect: graph.geometry.rect,
    rotation: graph.geometry.rotation,
    point: input.point
  })
}

const readEdgeDistance = (input: {
  state: WorkingState
  edgeId: string
  point: Point
}): number | undefined => {
  const edge = input.state.graph.edges.get(input.edgeId)
  return edgeApi.hit.distanceToViewPoint({
    path: edge?.route,
    point: input.point
  })
}

const readMindmapDistance = (input: {
  state: WorkingState
  mindmapId: string
  point: Point
}): number | undefined => {
  const bounds = input.state.graph.owners.mindmaps.get(input.mindmapId)?.tree.bbox
  if (!bounds) {
    return undefined
  }

  return geometryApi.rect.containsPoint(input.point, bounds)
    ? 0
    : geometryApi.rect.distanceToPoint(input.point, bounds)
}

const readCandidateDistance = (input: {
  state: WorkingState
  candidate: VisibleSceneHitItem
  point: Point
}): number | undefined => {
  switch (input.candidate.kind) {
    case 'node':
      return readNodeDistance({
        state: input.state,
        nodeId: input.candidate.id,
        point: input.point
      })
    case 'edge':
      return readEdgeDistance({
        state: input.state,
        edgeId: input.candidate.id,
        point: input.point
      })
    case 'mindmap':
      return readMindmapDistance({
        state: input.state,
        mindmapId: input.candidate.id,
        point: input.point
      })
    default:
      return undefined
  }
}

const sortVisiblePointCandidates = (
  left: VisiblePointCandidate,
  right: VisiblePointCandidate
): number => (
  KIND_RANK[right.kind] - KIND_RANK[left.kind]
  || right.order - left.order
  || left.distance - right.distance
  || left.id.localeCompare(right.id)
)

const sortVisibilityCandidates = (
  left: VisibilityCandidate,
  right: VisibilityCandidate
): number => (
  KIND_RANK[right.kind] - KIND_RANK[left.kind]
  || right.order - left.order
  || left.id.localeCompare(right.id)
)

const readNodeSamples = (input: {
  node: NodeView
  queryRect: Rect
}) => {
  const rect = input.node.geometry.rect
  const samples = [getRectCenter(rect)]
  const overlap = {
    x: Math.max(rect.x, input.queryRect.x),
    y: Math.max(rect.y, input.queryRect.y),
    width: Math.min(rect.x + rect.width, input.queryRect.x + input.queryRect.width) - Math.max(rect.x, input.queryRect.x),
    height: Math.min(rect.y + rect.height, input.queryRect.y + input.queryRect.height) - Math.max(rect.y, input.queryRect.y)
  }
  if (overlap.width >= 0 && overlap.height >= 0) {
    samples.push(...getRectCorners(overlap))
  }
  return samples
}

const readEdgeSamples = (input: {
  edge: EdgeView
  queryRect: Rect
}) => {
  const samples = [...input.edge.route.points]
  input.edge.route.segments.forEach((segment) => {
    samples.push(segment.from)
    samples.push(segment.to)
    if (segment.hitPoints) {
      samples.push(...segment.hitPoints)
    }
  })

  return samples.filter((point) => geometryApi.rect.containsPoint(point, input.queryRect))
}

const readMindmapSamples = (input: {
  bounds: Rect
  queryRect: Rect
}) => {
  const samples = [getRectCenter(input.bounds)]
  const overlap = {
    x: Math.max(input.bounds.x, input.queryRect.x),
    y: Math.max(input.bounds.y, input.queryRect.y),
    width: Math.min(input.bounds.x + input.bounds.width, input.queryRect.x + input.queryRect.width) - Math.max(input.bounds.x, input.queryRect.x),
    height: Math.min(input.bounds.y + input.bounds.height, input.queryRect.y + input.queryRect.height) - Math.max(input.bounds.y, input.queryRect.y)
  }
  if (overlap.width >= 0 && overlap.height >= 0) {
    samples.push(...getRectCorners(overlap))
  }
  return samples
}

export const createVisibilityRead = (input: {
  state: () => WorkingState
  spatial: SceneSpatial
}): SceneVisibility => ({
  point: ({ point, threshold, kinds, exclude }) => {
    const radius = threshold ?? 8
    const kindSet = makeKindSet(kinds)
    const state = input.state()
    const excludes = {
      node: new Set(exclude?.node ?? []),
      edge: new Set(exclude?.edge ?? []),
      mindmap: new Set(exclude?.mindmap ?? [])
    }

    const candidates = input.spatial.candidates(geometryApi.rect.fromPoint(point, radius), {
      kinds: ['node', 'edge', 'mindmap']
    }).records.flatMap((record) => {
      if (!isVisibleKind(record.item.kind)) {
        return []
      }
      if (
        (record.item.kind === 'node' && excludes.node.has(record.item.id))
        || (record.item.kind === 'edge' && excludes.edge.has(record.item.id))
        || (record.item.kind === 'mindmap' && excludes.mindmap.has(record.item.id))
      ) {
        return []
      }

      const distance = readCandidateDistance({
        state,
        candidate: record.item,
        point
      })
      if (distance === undefined || distance > radius) {
        return []
      }

      return [{
        ...record.item,
        order: record.order,
        distance
      } satisfies VisiblePointCandidate]
    })

    candidates.sort(sortVisiblePointCandidates)

    const ordered = candidates.map((candidate) => ({
      kind: candidate.kind,
      id: candidate.id
    }) satisfies SceneHitItem)

    const topmost = ordered[0]
    if (!topmost) {
      return {
        ordered
      }
    }

    if (kindSet && !kindSet.has(topmost.kind)) {
      return {
        ordered
      }
    }

    return {
      ordered,
      topmost
    }
  },
  rect: ({ rect, kinds, exclude }) => {
    const state = input.state()
    const kindSet = makeKindSet(kinds)
    const excludes = {
      node: new Set(exclude?.node ?? []),
      edge: new Set(exclude?.edge ?? []),
      mindmap: new Set(exclude?.mindmap ?? [])
    }

    const candidates = input.spatial.rect(rect, {
      kinds: ['node', 'edge', 'mindmap']
    }).flatMap((record) => {
      if (!isVisibleKind(record.item.kind)) {
        return []
      }
      if (
        (record.item.kind === 'node' && excludes.node.has(record.item.id))
        || (record.item.kind === 'edge' && excludes.edge.has(record.item.id))
        || (record.item.kind === 'mindmap' && excludes.mindmap.has(record.item.id))
      ) {
        return []
      }

      return [{
        ...record.item,
        order: record.order
      } satisfies VisibilityCandidate]
    })

    candidates.sort(sortVisibilityCandidates)

    const visible = {
      node: new Set<string>(),
      edge: new Set<string>(),
      mindmap: new Set<string>()
    }

    candidates.forEach((candidate) => {
      let samples: readonly Point[] = []

      if (candidate.kind === 'node') {
        const node = state.graph.nodes.get(candidate.id)
        if (!node) {
          return
        }
        samples = readNodeSamples({
          node,
          queryRect: rect
        })
      } else if (candidate.kind === 'edge') {
        const edge = state.graph.edges.get(candidate.id)
        if (!edge) {
          return
        }
        samples = readEdgeSamples({
          edge,
          queryRect: rect
        })
      } else {
        const mindmap = state.graph.owners.mindmaps.get(candidate.id)
        if (!mindmap?.tree.bbox) {
          return
        }
        samples = readMindmapSamples({
          bounds: mindmap.tree.bbox,
          queryRect: rect
        })
      }

      const matched = samples.some((sample) => {
        const topmost = input.spatial.point(sample, {
          kinds: ['node', 'edge', 'mindmap']
        }).flatMap((record) => {
          const item = record.item
          if (!isVisibleKind(item.kind)) {
            return []
          }
          const distance = readCandidateDistance({
            state,
            candidate: item,
            point: sample
          })
          if (distance === undefined || distance > 8) {
            return []
          }
          return [{
            ...item,
            order: record.order,
            distance
          } satisfies VisiblePointCandidate]
        }).sort(sortVisiblePointCandidates)[0]

        return topmost?.kind === candidate.kind && topmost.id === candidate.id
      })

      if (matched) {
        if (!kindSet || kindSet.has(candidate.kind)) {
          visible[candidate.kind].add(candidate.id)
        }
      }
    })

    const ordered = candidates
      .filter((candidate) => !kindSet || kindSet.has(candidate.kind))
      .map((candidate) => ({
        kind: candidate.kind,
        id: candidate.id
      }) satisfies SceneHitItem)

    return {
      ordered,
      visibleIds: {
        node: [...visible.node],
        edge: [...visible.edge],
        mindmap: [...visible.mindmap]
      }
    }
  }
})
