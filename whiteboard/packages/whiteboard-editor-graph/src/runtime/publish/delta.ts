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
  items: false,
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
  delta.items = false
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

export const syncItemsPublishDelta = (input: {
  graph: GraphDelta
}): boolean => (
  input.graph.order
  || input.graph.entities.nodes.added.size > 0
  || input.graph.entities.nodes.removed.size > 0
  || input.graph.entities.edges.added.size > 0
  || input.graph.entities.edges.removed.size > 0
  || input.graph.entities.mindmaps.added.size > 0
  || input.graph.entities.mindmaps.removed.size > 0
)
