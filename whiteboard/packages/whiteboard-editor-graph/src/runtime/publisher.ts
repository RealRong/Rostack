import type { ProjectorPublisher } from '@shared/projector'
import type {
  Change,
  Snapshot
} from '../contracts/editor'
import type { WorkingState } from '../contracts/working'
import {
  resetGraphPublishDelta,
  resetPublishDelta,
  syncGraphPublishDelta,
  syncItemsPublishDelta
} from './publish/delta'
import { patchPublishedGraph } from './publish/graph'
import { patchPublishedItems } from './publish/items'
import { patchPublishedUi } from './publish/ui'

export const createEditorGraphPublisher = (): ProjectorPublisher<
  WorkingState,
  Snapshot,
  Change
> => ({
  publish: ({ revision, previous, working }) => {
    const delta = working.delta.publish

    resetGraphPublishDelta(delta.graph)
    if (working.delta.graph.revision === revision) {
      syncGraphPublishDelta({
        source: working.delta.graph,
        target: delta.graph
      })
    }

    delta.items = working.delta.graph.revision === revision
      ? syncItemsPublishDelta({
          graph: working.delta.graph
        })
      : false

    const graph = patchPublishedGraph({
      previous: previous.graph,
      working,
      delta: delta.graph
    })
    const items = patchPublishedItems({
      previous: previous.items,
      working,
      changed: delta.items
    })
    const ui = patchPublishedUi({
      previous: previous.ui,
      working,
      delta: delta.ui
    })

    const result = {
      snapshot: {
        revision,
        documentRevision: working.revision.document,
        graph: graph.value,
        items: items.value,
        ui: ui.value
      },
      change: {
        graph: graph.change,
        items: items.change,
        ui: ui.change
      }
    }

    resetPublishDelta(delta)

    return result
  }
})
