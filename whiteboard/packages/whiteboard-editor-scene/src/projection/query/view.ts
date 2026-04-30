import { geometry as geometryApi } from '@whiteboard/core/geometry'
import type {
  SceneHit,
  SceneSpatial,
  SceneViewport,
  SceneViewSnapshot
} from '../../contracts/editor'
import type { WorkingState } from '../../contracts/working'
import { readBackgroundView } from './background'
import { DEFAULT_HIT_THRESHOLD } from './hit'

export const createViewRead = (input: {
  state: () => WorkingState
  view: () => SceneViewSnapshot
  hit: SceneHit
  spatial: SceneSpatial
}): SceneViewport => ({
  zoom: () => input.view().zoom,
  center: () => input.view().center,
  worldRect: () => input.view().worldRect,
  screenPoint: (point) => {
    const view = input.view()
    return geometryApi.viewport.projectPoint({
      point,
      zoom: view.zoom,
      worldRect: view.worldRect
    })
  },
  screenRect: (rect) => {
    const view = input.view()
    return geometryApi.viewport.projectRect({
      rect,
      zoom: view.zoom,
      worldRect: view.worldRect
    })
  },
  background: () => readBackgroundView({
    state: input.state(),
    view: input.view()
  }),
  visible: (options) => {
    const view = input.view()
    return input.spatial.rect(view.worldRect, options)
  },
  pick: ({
    point,
    radius,
    kinds,
    exclude
  }) => {
    const view = input.view()
    const resolvedRadius = radius ?? (
      DEFAULT_HIT_THRESHOLD / Math.max(view.zoom, 0.0001)
    )
    const rect = geometryApi.rect.fromPoint(point, resolvedRadius)
    const candidates = input.spatial.candidates(rect, {
      kinds: kinds?.filter((kind) => kind !== 'group') as
        | readonly ('node' | 'edge' | 'mindmap')[]
        | undefined
    })
    const target = input.hit.item({
      point,
      threshold: resolvedRadius,
      kinds,
      exclude
    })

    return {
      rect,
      target,
      stats: {
        ...candidates.stats,
        hits: target ? 1 : 0,
        latency: 0
      }
    }
  }
})
