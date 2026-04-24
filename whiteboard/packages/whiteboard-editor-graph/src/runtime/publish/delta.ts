import { changeSet } from '@shared/core'
import type {
  EdgeId,
  GroupId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import type {
  GraphDelta,
  GraphPublishDelta,
  PublishDelta,
  ScenePublishDelta,
  SpatialDelta,
  UiPublishDelta
} from '../../contracts/delta'

export const createPublishDelta = (): PublishDelta => ({
  graph: {
    nodes: changeSet.create<NodeId>(),
    edges: changeSet.create<EdgeId>(),
    owners: {
      mindmaps: changeSet.create<MindmapId>(),
      groups: changeSet.create<GroupId>()
    }
  },
  scene: {
    items: false,
    visible: false
  },
  ui: {
    chrome: false,
    nodes: changeSet.create<NodeId>(),
    edges: changeSet.create<EdgeId>()
  }
})

export const resetGraphPublishDelta = (
  delta: GraphPublishDelta
) => {
  changeSet.reset(delta.nodes)
  changeSet.reset(delta.edges)
  changeSet.reset(delta.owners.mindmaps)
  changeSet.reset(delta.owners.groups)
}

export const resetScenePublishDelta = (
  delta: ScenePublishDelta
) => {
  delta.items = false
  delta.visible = false
}

export const resetUiPublishDelta = (
  delta: UiPublishDelta
) => {
  delta.chrome = false
  changeSet.reset(delta.nodes)
  changeSet.reset(delta.edges)
}

export const resetPublishDelta = (
  delta: PublishDelta
) => {
  resetGraphPublishDelta(delta.graph)
  resetScenePublishDelta(delta.scene)
  resetUiPublishDelta(delta.ui)
}

export const syncGraphPublishDelta = (input: {
  source: GraphDelta
  target: GraphPublishDelta
}) => {
  changeSet.assign(input.target.nodes, input.source.entities.nodes)
  changeSet.assign(input.target.edges, input.source.entities.edges)
  changeSet.assign(input.target.owners.mindmaps, input.source.entities.mindmaps)
  changeSet.assign(input.target.owners.groups, input.source.entities.groups)
}

export const syncScenePublishDelta = (input: {
  graph: GraphDelta
  spatial: SpatialDelta
  target: ScenePublishDelta
}) => {
  input.target.items = input.graph.order
  input.target.visible = input.spatial.order || input.spatial.visible
}
