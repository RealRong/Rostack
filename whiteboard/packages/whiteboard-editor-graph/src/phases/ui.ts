import {
  buildChromeView,
  buildSelectionView
} from '../runtime/ui'
import type { EditorPhase } from './shared'
import { toMetric } from './shared'

export const createUiPhase = (): EditorPhase => ({
  name: 'ui',
  deps: ['graph'],
  run: (context) => {
    const selection = buildSelectionView({
      selection: context.input.interaction.selection,
      nodes: context.working.graph.nodes,
      edges: context.working.graph.edges
    })

    context.working.ui = {
      selection,
      chrome: buildChromeView({
        session: context.input.session,
        selection: selection.target,
        hover: context.input.interaction.hover
      })
    }

    return {
      action: 'sync',
      change: undefined,
      metrics: toMetric(
        selection.target.nodeIds.length
        + selection.target.edgeIds.length
        + context.working.ui.chrome.overlays.length
      )
    }
  }
})
