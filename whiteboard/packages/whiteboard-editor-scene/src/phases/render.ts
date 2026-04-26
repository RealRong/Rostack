import type {
  ProjectorContext,
  ProjectorPhase,
  ProjectorScopeValue
} from '@shared/projector'
import { idDelta } from '@shared/projector/delta'
import type { EditorPhaseScopeMap } from '../contracts/delta'
import { renderPhaseScope } from '../contracts/delta'
import type {
  Input,
  Snapshot
} from '../contracts/editor'
import type { WorkingState } from '../contracts/working'
import { patchRender } from '../domain/render'
import {
  hasRenderPublishDelta,
  resetRenderPublishDelta
} from '../projector/publish'

type EditorPhaseName = keyof EditorPhaseScopeMap & string

type RenderPhaseContext = ProjectorContext<
  Input,
  WorkingState,
  Snapshot,
  ProjectorScopeValue<EditorPhaseScopeMap['render']>
>

const readRenderPublishCount = (
  working: WorkingState
): number => (
  idDelta.touched(working.publish.render.delta.edge.statics).size
  + idDelta.touched(working.publish.render.delta.edge.active).size
  + idDelta.touched(working.publish.render.delta.edge.labels).size
  + idDelta.touched(working.publish.render.delta.edge.masks).size
  + (working.publish.render.delta.edge.overlay ? 1 : 0)
)

export const renderPhase: ProjectorPhase<
  'render',
  RenderPhaseContext,
  { count: number },
  EditorPhaseName,
  EditorPhaseScopeMap
> = {
  name: 'render',
  deps: [],
  scope: renderPhaseScope,
  run: (context) => {
    const revision = context.previous.revision + 1
    const publish = context.working.publish.render

    resetRenderPublishDelta(publish.delta)
    patchRender({
      working: context.working,
      current: context.input,
      delta: publish.delta,
      scope: context.scope
    })

    publish.revision = hasRenderPublishDelta(publish.delta)
      ? revision
      : 0

    return {
      action: publish.revision === revision
        ? 'sync'
        : 'reuse',
      metrics: {
        count: readRenderPublishCount(context.working)
      }
    }
  }
}
