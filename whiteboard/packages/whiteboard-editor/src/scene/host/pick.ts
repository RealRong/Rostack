import { scheduler } from '@shared/core'
import type {
  Point,
  Rect
} from '@whiteboard/core/types'
import type { Query } from '@whiteboard/editor-scene'
import type {
  ScenePickKind,
  ScenePickRequest,
  ScenePickResult,
  ScenePickRuntime,
  ScenePickRuntimeResult
} from '@whiteboard/editor/types/editor'

const DEFAULT_PICK_RADIUS_SCREEN = 8

const toPickRect = (
  point: Point,
  radius: number
): Rect => ({
  x: point.x - radius,
  y: point.y - radius,
  width: radius * 2,
  height: radius * 2
})

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

export const createScenePick = (input: {
  readZoom: () => number
  query: Pick<Query, 'hit' | 'spatial'>
}): ScenePickRuntime => {
  const listeners = new Set<() => void>()
  let pending: ScenePickRequest | undefined
  let current: ScenePickRuntimeResult | undefined
  let disposed = false

  const resolveRadius = (
    radius?: number
  ) => radius ?? (
    DEFAULT_PICK_RADIUS_SCREEN / Math.max(input.readZoom(), 0.0001)
  )

  const resolve = (
    request: ScenePickRequest
  ): ScenePickResult => {
    const startedAt = scheduler.readMonotonicNow()
    const radius = resolveRadius(request.radius)
    const rect = toPickRect(request.world, radius)
    const candidates = input.query.spatial.candidates(rect, {
      kinds: request.kinds
    })
    const target = input.query.hit.item({
      point: request.world,
      threshold: radius,
      kinds: request.kinds
    })

    return {
      rect,
      target: target && target.kind !== 'group'
        ? target
        : undefined,
      stats: {
        ...candidates.stats,
        hits: target ? 1 : 0,
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
      result: resolve(request)
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
    schedule: (request) => {
      if (disposed) {
        return
      }

      pending = request
      runtimeTask.schedule()
    },
    get: () => disposed
      ? undefined
      : current,
    subscribe: (listener) => {
      if (disposed) {
        return () => {}
      }

      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    clear: () => {
      if (disposed) {
        return
      }

      pending = undefined
      if (current === undefined) {
        return
      }

      current = undefined
      listeners.forEach((listener) => {
        listener()
      })
    },
    dispose: () => {
      disposed = true
      pending = undefined
      current = undefined
      listeners.clear()
    }
  }
}
