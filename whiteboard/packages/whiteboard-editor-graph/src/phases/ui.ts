import {
  buildEdgeUiView,
  buildChromeView,
  buildNodeUiView,
  buildSelectionView
} from '../runtime/ui'
import type { UiEditorPhase } from './shared'
import { toMetric } from './shared'

export const createUiPhase = (): UiEditorPhase => ({
  name: 'ui',
  deps: ['graph'],
  run: (context) => {
    const nodes = new Map()
    context.working.graph.nodes.forEach((view, nodeId) => {
      nodes.set(nodeId, buildNodeUiView({
        nodeId,
        draft: context.input.session.draft.nodes.get(nodeId),
        preview: context.input.session.preview.nodes.get(nodeId),
        draw: context.input.session.preview.draw,
        edit: context.input.session.edit,
        selection: context.input.interaction.selection,
        hover: context.input.interaction.hover
      }))
    })

    const selection = buildSelectionView({
      selection: context.input.interaction.selection,
      nodes: context.working.graph.nodes,
      edges: context.working.graph.edges
    })

    const edges = new Map()
    context.working.graph.edges.forEach((view, edgeId) => {
      edges.set(edgeId, buildEdgeUiView({
        edgeId,
        entry: {
          base: {
            edge: view.base.edge,
            nodes: view.base.nodes
          },
          draft: context.input.session.draft.edges.get(edgeId),
          preview: context.input.session.preview.edges.get(edgeId)
        },
        view,
        edit: context.input.session.edit,
        selection: context.input.interaction.selection
      }))
    })

    context.working.ui = {
      selection,
      chrome: buildChromeView({
        session: context.input.session,
        selection: selection.target,
        hover: context.input.interaction.hover
      }),
      nodes,
      edges
    }

    return {
      action: 'sync',
      change: undefined,
      metrics: toMetric(
        selection.target.nodeIds.length
        + selection.target.edgeIds.length
        + context.working.ui.chrome.overlays.length
        + nodes.size
        + edges.size
      )
    }
  }
})
