import {
  buildEdgeView,
  buildNodeView
} from '../runtime/helpers'
import type { EditorPhase } from './shared'
import { toMetric } from './shared'

export const createElementPhase = (): EditorPhase => ({
  name: 'element',
  deps: ['graph', 'measure', 'tree'],
  run: (context) => {
    const nodes = new Map()
    const edges = new Map()

    context.working.graph.nodes.forEach((entry, nodeId) => {
      const treeRect = entry.base.owner?.kind === 'mindmap'
        ? context.working.tree.mindmaps.get(entry.base.owner.id)?.layout?.node[nodeId]
        : undefined

      nodes.set(nodeId, buildNodeView({
        entry,
        measuredSize: context.working.measure.nodes.get(nodeId)?.size,
        treeRect,
        edit: context.working.input.session.edit,
        selection: context.working.input.interaction.selection,
        hover: context.working.input.interaction.hover
      }))
    })

    context.working.graph.edges.forEach((entry, edgeId) => {
      edges.set(edgeId, buildEdgeView({
        edgeId,
        entry,
        nodes,
        labelMeasures: context.working.measure.edgeLabels.get(edgeId),
        edit: context.working.input.session.edit,
        selection: context.working.input.interaction.selection
      }))
    })

    context.working.element = {
      nodes,
      edges
    }

    return {
      action: 'sync',
      change: undefined,
      metrics: toMetric(nodes.size + edges.size)
    }
  }
})
