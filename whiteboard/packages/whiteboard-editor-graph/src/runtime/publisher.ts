import type { RuntimePublisher } from '@shared/projection-runtime'
import type {
  Change,
  Snapshot
} from '../contracts/editor'
import type { WorkingState } from '../contracts/working'
import {
  resetGraphPublishDelta,
  resetPublishDelta,
  resetScenePublishDelta,
  syncGraphPublishDelta,
  syncScenePublishDelta
} from './publish/delta'
import { patchPublishedGraph } from './publish/graph'
import { patchPublishedScene } from './publish/scene'
import { patchPublishedUi } from './publish/ui'

export const createEditorGraphPublisher = (): RuntimePublisher<
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

    resetScenePublishDelta(delta.scene)
    syncScenePublishDelta({
      graph: working.delta.graph.revision === revision
        ? working.delta.graph
        : {
            ...working.delta.graph,
            order: false
          },
      spatial: working.delta.spatial.revision === revision
        ? working.delta.spatial
        : {
            ...working.delta.spatial,
            order: false,
            visible: false
          },
      target: delta.scene
    })

    const graph = patchPublishedGraph({
      previous: previous.graph,
      working,
      delta: delta.graph
    })
    const scene = patchPublishedScene({
      previous: previous.scene,
      working,
      delta: delta.scene
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
        scene: scene.value,
        ui: ui.value
      },
      change: {
        graph: graph.change,
        scene: scene.change,
        ui: ui.change
      }
    }

    resetPublishDelta(delta)

    return result
  }
})
