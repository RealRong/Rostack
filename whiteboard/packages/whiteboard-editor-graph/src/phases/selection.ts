import { buildSelectionView } from '../runtime/helpers'
import type { EditorPhase } from './shared'
import { toMetric } from './shared'

export const createSelectionPhase = (): EditorPhase => ({
  name: 'selection',
  deps: ['element'],
  run: (context) => {
    context.working.ui = {
      ...context.working.ui,
      selection: buildSelectionView({
        selection: context.working.input.interaction.selection,
        nodes: context.working.element.nodes,
        edges: context.working.element.edges
      }),
      hover: context.working.input.interaction.hover
    }

    return {
      action: 'sync',
      change: undefined,
      metrics: toMetric(
        context.working.ui.selection.target.nodeIds.length
        + context.working.ui.selection.target.edgeIds.length
      )
    }
  }
})
