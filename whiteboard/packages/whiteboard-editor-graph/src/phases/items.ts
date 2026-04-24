import { buildItems } from '../domain/items'
import { readItemsPublishChanged } from '../projector/publish/delta'
import {
  defineEditorGraphPhase,
  toPhaseMetrics
} from '../projector/context'

export const itemsPhase = defineEditorGraphPhase({
  name: 'items',
  deps: ['graph'],
  run: (context) => {
    const revision = context.previous.revision + 1
    const changed = context.working.delta.graph.revision === revision
      ? readItemsPublishChanged({
          graph: context.working.delta.graph
        })
      : false

    context.working.publish.items.changed = changed
    context.working.publish.items.revision = changed
      ? revision
      : 0

    if (!changed) {
      return {
        action: 'reuse',
        metrics: toPhaseMetrics(0)
      }
    }

    context.working.items = buildItems(
      context.input.document.snapshot
    )

    return {
      action: 'sync',
      metrics: toPhaseMetrics(context.working.items.length)
    }
  }
})
