import type {
  ProjectorContext,
  ProjectorPhase,
  ProjectorScopeValue
} from '@shared/projector'
import type { EditorPhaseScopeMap } from '../contracts/delta'
import { spatialPhaseScope } from '../contracts/delta'
import type {
  Input,
  Snapshot
} from '../contracts/editor'
import type { WorkingState } from '../contracts/working'
import { patchSpatial } from '../domain/spatial/update'

type EditorPhaseName = keyof EditorPhaseScopeMap & string

type SpatialPhaseContext = ProjectorContext<
  Input,
  WorkingState,
  Snapshot,
  ProjectorScopeValue<EditorPhaseScopeMap['spatial']>
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
  scope: spatialPhaseScope,
  run: (context) => {
    const result = patchSpatial({
      revision: context.previous.revision + 1,
      graph: context.working.graph,
      snapshot: context.input.document.snapshot,
      graphDelta: context.working.delta.graph,
      state: context.working.spatial,
      scope: context.scope,
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
