import { scheduler } from '@shared/core'
import type {
  Point,
  Rect
} from '@whiteboard/core/types'
import type { EditorSceneRuntime as SceneRuntime } from '@whiteboard/editor-scene'
import type {
  EditorSceneSource as EditorSceneView,
  ScenePickRequest,
  ScenePickResult,
  ScenePickRuntime,
  ScenePickRuntimeResult
} from '@whiteboard/editor/types/editor'

export type { EditorSceneView as EditorSceneRuntime }

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

const createScenePick = (input: {
  query: SceneRuntime['query']
}): ScenePickRuntime => {
  const listeners = new Set<() => void>()
  let pending: ScenePickRequest | undefined
  let current: ScenePickRuntimeResult | undefined
  let disposed = false

  const resolve = (
    request: ScenePickRequest
  ): ScenePickResult => {
    const startedAt = scheduler.readMonotonicNow()
    const next = input.query.view.pick({
      point: request.world,
      radius: request.radius,
      kinds: request.kinds
    })

    return {
      rect: next.rect ?? toPickRect(request.world, request.radius ?? DEFAULT_PICK_RADIUS_SCREEN),
      target: next.target && next.target.kind !== 'group'
        ? next.target
        : undefined,
      stats: {
        ...next.stats,
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

export const createEditorSceneView = ({
  runtime
}: {
  runtime: Pick<SceneRuntime, 'query' | 'revision' | 'stores'>
}): EditorSceneView & {
  dispose: () => void
} => {
  const visible: EditorSceneView['host']['visible'] = (options) =>
    runtime.query.view.visible(options)
  const pick = createScenePick({
    query: runtime.query
  })

  return {
    dispose: () => {
      pick.dispose()
    },
    revision: runtime.revision,
    query: runtime.query,
    stores: runtime.stores,
    host: {
      pick,
      visible
    }
  }
}
