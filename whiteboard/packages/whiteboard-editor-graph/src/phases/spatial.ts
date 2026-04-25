import type {
  ProjectorContext,
  ProjectorPhase
} from '@shared/projector'
import type { EditorPhaseScopeMap } from '../contracts/delta'
import type {
  Input,
  Snapshot
} from '../contracts/editor'
import type { WorkingState } from '../contracts/working'
import { patchSpatial } from '../domain/spatial/update'
import {
  mergeSpatialPatchScope,
  normalizeSpatialPatchScope
} from '../projector/impact'

type EditorPhaseName = keyof EditorPhaseScopeMap & string

type SpatialPhaseContext = ProjectorContext<
  Input,
  WorkingState,
  Snapshot,
  EditorPhaseScopeMap['spatial']
>

export const spatialPhase: ProjectorPhase<
  'spatial',
  SpatialPhaseContext,
  { count: number },
  EditorPhaseName,
  EditorPhaseScopeMap
> = {
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
      metrics: {
        count: result.count
      }
    }
  }
}
