import type { EditorPhase } from './shared'
import { toMetric } from './shared'

export const createInputPhase = (): EditorPhase => ({
  name: 'input',
  deps: [],
  run: (context) => {
    context.working.input = {
      revision: {
        document: context.input.document.snapshot.revision,
        input: context.previous.base.inputRevision + 1
      },
      document: context.input.document,
      session: context.input.session,
      measure: context.input.measure,
      interaction: context.input.interaction,
      viewport: context.input.viewport,
      clock: context.input.clock,
      impact: [...(context.dirty ?? [])]
    }

    return {
      action: 'sync',
      change: undefined,
      metrics: toMetric(context.working.input.impact.length)
    }
  }
})
