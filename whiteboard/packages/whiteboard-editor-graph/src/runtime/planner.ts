import {
  createPlan,
  type RuntimePlanner
} from '@shared/projection-runtime'
import type {
  Input,
  Snapshot
} from '../contracts/editor'
import type { EditorPhaseName } from './phaseNames'

const hasImpactChange = (
  impact: Input['impact']
): boolean => (
  impact.document.changed
  || impact.session.changed
  || impact.measure.changed
  || impact.interaction.changed
  || impact.viewport.changed
  || impact.clock.changed
)

export const createEditorGraphPlanner = (): RuntimePlanner<
  Input,
  Snapshot,
  EditorPhaseName
> => ({
  plan: ({ input, previous }) => {
    const bootstrap = previous.revision === 0
    if (!bootstrap && !hasImpactChange(input.impact)) {
      return createPlan<EditorPhaseName>()
    }

    const graphChanged = bootstrap
      || input.impact.document.changed
      || input.impact.session.changed
      || input.impact.measure.changed
      || input.impact.interaction.changed
      || input.impact.clock.changed

    const sceneChanged = graphChanged || input.impact.viewport.changed

    if (graphChanged) {
      return createPlan<EditorPhaseName>({
        phases: new Set([
          'graph'
        ])
      })
    }

    if (sceneChanged) {
      return createPlan<EditorPhaseName>({
        phases: new Set([
          'scene'
        ])
      })
    }

    return createPlan<EditorPhaseName>()
  }
})
