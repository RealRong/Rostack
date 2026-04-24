import { buildItems } from '../runtime/items'
import type { ItemsEditorPhase } from './shared'
import { toMetric } from './shared'

export const createItemsPhase = (): ItemsEditorPhase => ({
  name: 'items',
  deps: ['graph'],
  run: (context) => {
    context.working.items = buildItems(
      context.input.document.snapshot
    )

    return {
      action: 'sync',
      change: undefined,
      metrics: toMetric(context.working.items.length)
    }
  }
})
