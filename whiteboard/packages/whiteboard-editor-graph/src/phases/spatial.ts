import { patchSpatial } from '../domain/spatial/update'
import {
  mergeSpatialPatchScope,
  normalizeSpatialPatchScope
} from '../projector/scopes/spatialScope'
import {
  defineEditorGraphPhase,
  toPhaseMetrics
} from '../projector/context'

export const spatialPhase = defineEditorGraphPhase({
  name: 'spatial',
  deps: [],
  mergeScope: mergeSpatialPatchScope,
  run: (context) => {
    const scope = normalizeSpatialPatchScope(context.scope)
    const result = patchSpatial({
      revision: context.previous.revision + 1,
      graph: context.working.graph,
      snapshot: context.input.document.snapshot,
      graphDelta: context.working.delta.graph,
      state: context.working.spatial,
      scope,
      delta: context.working.delta.spatial
    })

    return {
      action: result.changed ? 'sync' : 'reuse',
      metrics: toPhaseMetrics(result.count)
    }
  }
})
