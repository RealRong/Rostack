import { scheduler, store } from '@shared/core'
import { edge as edgeApi } from '@whiteboard/core/edge'
import { geometry as geometryApi } from '@whiteboard/core/geometry'
import { node as nodeApi } from '@whiteboard/core/node'
import type {
  MindmapId,
  NodeId,
  Point,
  Rect
} from '@whiteboard/core/types'
import type {
  MindmapView,
  SpatialRead
} from '@whiteboard/editor-scene'
import type {
  GraphEdgeRead
} from './edge'
import type {
  GraphNodeGeometry,
  GraphNodeRead
} from './node'
import type {
  ScenePickCandidateResult,
  ScenePickKind,
  ScenePickRequest,
  ScenePickResult,
  ScenePickRuntime,
  ScenePickRuntimeResult,
  ScenePickTarget
} from '../types/editor'

const DEFAULT_PICK_RADIUS_SCREEN = 8

type PickCandidateInput = {
  point: Point
  radius?: number
  kinds?: readonly ScenePickKind[]
}

type PickWinner = {
  target: ScenePickTarget
  distance: number
  order: number
}

const KIND_PRIORITY: Record<ScenePickKind, number> = {
  node: 3,
  mindmap: 2,
  edge: 1
}

const toPickRect = (
  point: Point,
  radius: number
): Rect => ({
  x: point.x - radius,
  y: point.y - radius,
  width: radius * 2,
  height: radius * 2
})

const readRectDistance = (
  rect: Rect,
  point: Point
) => {
  const dx = point.x < rect.x
    ? rect.x - point.x
    : point.x > rect.x + rect.width
      ? point.x - (rect.x + rect.width)
      : 0
  const dy = point.y < rect.y
    ? rect.y - point.y
    : point.y > rect.y + rect.height
      ? point.y - (rect.y + rect.height)
      : 0

  return Math.hypot(dx, dy)
}

const pickBetter = (
  current: PickWinner | undefined,
  next: PickWinner
) => {
  if (!current) {
    return next
  }
  if (next.distance < current.distance) {
    return next
  }
  if (next.distance > current.distance) {
    return current
  }
  if (next.order > current.order) {
    return next
  }
  if (next.order < current.order) {
    return current
  }

  return KIND_PRIORITY[next.target.kind] > KIND_PRIORITY[current.target.kind]
    ? next
    : current
}

const isScenePickRuntimeResultEqual = (
  left: ScenePickRuntimeResult | undefined,
  right: ScenePickRuntimeResult | undefined
) => (
  left?.request.world.x === right?.request.world.x
  && left?.request.world.y === right?.request.world.y
  && left?.request.radius === right?.request.radius
  && left?.result.rect.x === right?.result.rect.x
  && left?.result.rect.y === right?.result.rect.y
  && left?.result.rect.width === right?.result.rect.width
  && left?.result.rect.height === right?.result.rect.height
  && left?.result.target?.kind === right?.result.target?.kind
  && left?.result.target?.id === right?.result.target?.id
  && left?.result.stats.cells === right?.result.stats.cells
  && left?.result.stats.candidates === right?.result.stats.candidates
  && left?.result.stats.oversized === right?.result.stats.oversized
  && left?.result.stats.hits === right?.result.stats.hits
)

export const createScenePick = ({
  readZoom,
  spatial,
  node,
  edge,
  mindmap
}: {
  readZoom: () => number
  spatial: Pick<SpatialRead, 'candidates'>
  node: {
    view: GraphNodeRead['view']
    geometry: (nodeId: NodeId) => (GraphNodeGeometry & {
      node: NonNullable<ReturnType<GraphNodeRead['get']>>['node']
    }) | undefined
  }
  edge: {
    geometry: GraphEdgeRead['geometry']
  }
  mindmap: store.KeyedReadStore<MindmapId, MindmapView | undefined>
}): {
  rect: (point: Point, radius?: number) => Rect
  candidates: (input: PickCandidateInput) => ScenePickCandidateResult
  resolve: (input: PickCandidateInput) => ScenePickResult
  runtime: ScenePickRuntime
} => {
  const listeners = new Set<() => void>()
  let pending: ScenePickRequest | undefined
  let current: ScenePickRuntimeResult | undefined

  const resolveRadius = (
    radius?: number
  ) => radius ?? (
    DEFAULT_PICK_RADIUS_SCREEN / Math.max(readZoom(), 0.0001)
  )

  const candidates = (
    input: PickCandidateInput
  ): ScenePickCandidateResult => {
    const radius = resolveRadius(input.radius)
    const rect = toPickRect(input.point, radius)
    const result = spatial.candidates(rect, {
      kinds: input.kinds
    })

    return {
      rect,
      records: result.records,
      stats: result.stats
    }
  }

  const resolve = (
    input: PickCandidateInput
  ): ScenePickResult => {
    const startedAt = scheduler.readMonotonicNow()
    const candidateResult = candidates(input)
    const radius = resolveRadius(input.radius)
    let hits = 0
    let winner: PickWinner | undefined

    candidateResult.records.forEach((record) => {
      switch (record.kind) {
        case 'node': {
          const currentNode = store.read(node.view, record.item.id)
          const geometry = node.geometry(record.item.id)
          if (!currentNode || currentNode.hidden || !geometry) {
            return
          }

          const distance = nodeApi.outline.containsPoint(
            geometry.node,
            geometry.rect,
            geometry.rotation,
            input.point
          )
            ? 0
            : nodeApi.outline.distanceToOutline(
                geometry.node,
                geometry.rect,
                geometry.rotation,
                input.point
              )
          if (distance > radius) {
            return
          }

          hits += 1
          winner = pickBetter(winner, {
            target: {
              kind: 'node',
              id: record.item.id
            },
            distance,
            order: record.order
          })
          return
        }
        case 'edge': {
          const geometry = store.read(edge.geometry, record.item.id)
          if (!geometry) {
            return
          }

          const distance = edgeApi.hit.distanceToPath({
            path: geometry.path,
            point: input.point
          })
          if (!Number.isFinite(distance) || distance > radius) {
            return
          }

          hits += 1
          winner = pickBetter(winner, {
            target: {
              kind: 'edge',
              id: record.item.id
            },
            distance,
            order: record.order
          })
          return
        }
        case 'mindmap': {
          const currentMindmap = store.read(mindmap, record.item.id)
          const bounds = currentMindmap?.tree.bbox
          if (!bounds) {
            return
          }

          const distance = geometryApi.rect.containsPoint(input.point, bounds)
            ? 0
            : readRectDistance(bounds, input.point)
          if (distance > radius) {
            return
          }

          hits += 1
          winner = pickBetter(winner, {
            target: {
              kind: 'mindmap',
              id: record.item.id
            },
            distance,
            order: record.order
          })
        }
      }
    })

    return {
      rect: candidateResult.rect,
      target: winner?.target,
      stats: {
        ...candidateResult.stats,
        hits,
        latency: scheduler.readMonotonicNow() - startedAt
      }
    }
  }

  const runtimeTask = scheduler.createFrameTask(() => {
    if (!pending) {
      return
    }

    const request = pending
    pending = undefined
    const next: ScenePickRuntimeResult = {
      request,
      result: resolve({
        point: request.world,
        radius: request.radius,
        kinds: request.kinds
      })
    }

    if (isScenePickRuntimeResultEqual(current, next)) {
      current = next
      return
    }

    current = next
    listeners.forEach((listener) => {
      listener()
    })
  })

  return {
    rect: (point, radius) => toPickRect(point, resolveRadius(radius)),
    candidates,
    resolve,
    runtime: {
      schedule: (request) => {
        pending = request
        runtimeTask.schedule()
      },
      get: () => current,
      subscribe: (listener) => {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
      clear: () => {
        pending = undefined
        runtimeTask.cancel()
        if (!current) {
          return
        }

        current = undefined
        listeners.forEach((listener) => {
          listener()
        })
      }
    }
  }
}
