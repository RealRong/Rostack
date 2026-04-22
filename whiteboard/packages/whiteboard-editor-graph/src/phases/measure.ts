import type { EditorPhase } from './shared'
import { toMetric } from './shared'

export const createMeasurePhase = (): EditorPhase => ({
  name: 'measure',
  deps: ['input'],
  run: (context) => {
    const text = context.working.input.measure.text
    context.working.measure = {
      nodes: text.nodes,
      edgeLabels: text.edgeLabels,
      dirty: {
        nodeIds: new Set(text.nodes.keys()),
        edgeIds: new Set(text.edgeLabels.keys())
      }
    }

    return {
      action: 'sync',
      change: undefined,
      metrics: toMetric(text.nodes.size + text.edgeLabels.size)
    }
  }
})
