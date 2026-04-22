import { buildSceneWorkingState } from '../runtime/helpers'
import type { EditorPhase } from './shared'
import { toMetric } from './shared'

export const createScenePhase = (): EditorPhase => ({
  name: 'scene',
  deps: ['element', 'chrome'],
  run: (context) => {
    context.working.scene = buildSceneWorkingState({
      snapshot: context.working.input.document.snapshot,
      structure: context.working.structure,
      element: context.working.element,
      working: {
        tree: context.working.tree
      },
      visibleWorld: context.working.input.viewport.visibleWorld
    })

    return {
      action: 'sync',
      change: undefined,
      metrics: toMetric(context.working.scene.items.length)
    }
  }
})
