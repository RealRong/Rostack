import { buildSceneSnapshot } from '../runtime/scene'
import type { SceneEditorPhase } from './shared'
import { toMetric } from './shared'

export const createScenePhase = (): SceneEditorPhase => ({
  name: 'scene',
  deps: ['spatial'],
  run: (context) => {
    context.working.scene = buildSceneSnapshot({
      snapshot: context.input.document.snapshot,
      graph: context.working.graph,
      visibleWorld: context.input.viewport.visibleWorld
    })
    context.working.spatial.visible.dirty = false

    return {
      action: 'sync',
      change: undefined,
      metrics: toMetric(context.working.scene.items.length)
    }
  }
})
