import type { ProjectorPublisher } from '@shared/projector'
import type {
  Change,
  Snapshot
} from '../contracts/editor'
import type { WorkingState } from '../contracts/working'
import {
  createGraphPublishDelta,
  createUiPublishDelta
} from './publish/delta'
import { patchPublishedGraph } from './publish/graph'
import { patchPublishedItems } from './publish/items'
import { patchPublishedUi } from './publish/ui'

const EMPTY_GRAPH_PUBLISH_DELTA = createGraphPublishDelta()
const EMPTY_UI_PUBLISH_DELTA = createUiPublishDelta()

export const editorGraphPublisher: ProjectorPublisher<
  WorkingState,
  Snapshot,
  Change
> = {
  publish: ({ revision, previous, working }) => {
    const graph = patchPublishedGraph({
      previous: previous.graph,
      working,
      delta: working.publish.graph.revision === revision
        ? working.publish.graph.delta
        : EMPTY_GRAPH_PUBLISH_DELTA
    })
    const items = patchPublishedItems({
      previous: previous.items,
      working,
      changed: working.publish.items.revision === revision
        && working.publish.items.changed
    })
    const ui = patchPublishedUi({
      previous: previous.ui,
      working,
      delta: working.publish.ui.revision === revision
        ? working.publish.ui.delta
        : EMPTY_UI_PUBLISH_DELTA
    })

    return {
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
  }
}
