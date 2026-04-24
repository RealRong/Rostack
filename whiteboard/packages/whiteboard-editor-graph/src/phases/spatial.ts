import { patchSpatial } from '../runtime/spatial/update'
import {
  mergeSpatialPatchScope,
  normalizeSpatialPatchScope
} from '../runtime/spatial/contracts'
import type { SpatialEditorPhase } from './shared'
import { toMetric } from './shared'

export const createSpatialPhase = (): SpatialEditorPhase => ({
  name: 'spatial',
  deps: ['graph'],
  mergeScope: mergeSpatialPatchScope,
  run: (context) => {
    const scope = normalizeSpatialPatchScope(context.scope)
    const result = patchSpatial({
      graph: context.working.graph,
      snapshot: context.input.document.snapshot,
      graphDelta: context.working.delta.graph,
      state: context.working.spatial,
      scope,
      delta: context.working.delta.spatial
    })

    return {
      action: result.changed ? 'sync' : 'reuse',
      change: undefined,
      metrics: toMetric(result.count)
    }
  }
})
