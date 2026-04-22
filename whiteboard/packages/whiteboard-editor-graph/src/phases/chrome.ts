import { buildChromeView } from '../runtime/helpers'
import type { EditorPhase } from './shared'
import { toMetric } from './shared'

export const createChromePhase = (): EditorPhase => ({
  name: 'chrome',
  deps: ['selection'],
  run: (context) => {
    context.working.ui = {
      ...context.working.ui,
      chrome: buildChromeView({
        session: context.working.input.session,
        selection: context.working.ui.selection.target,
        hover: context.working.ui.hover
      })
    }

    return {
      action: 'sync',
      change: undefined,
      metrics: toMetric(context.working.ui.chrome.overlays.length)
    }
  }
})
