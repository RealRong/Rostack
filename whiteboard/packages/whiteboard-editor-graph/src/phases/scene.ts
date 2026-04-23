import { buildSceneSnapshot } from '../runtime/scene'
import type { SceneEditorPhase } from './shared'
import { toMetric } from './shared'

export const createScenePhase = (): SceneEditorPhase => ({
  name: 'scene',
  deps: ['graph'],
  run: (context) => {
    context.working.scene = buildSceneSnapshot({
      snapshot: context.input.document.snapshot,
      graph: context.working.graph,
      visibleWorld: context.input.viewport.visibleWorld
    })

    return {
      action: 'sync',
      change: undefined,
      metrics: toMetric(context.working.scene.items.length)
    }
  }
})
