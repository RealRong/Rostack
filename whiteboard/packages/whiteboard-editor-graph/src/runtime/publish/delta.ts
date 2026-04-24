import { idDelta } from '@shared/projector'
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
    nodes: idDelta.create<NodeId>(),
    edges: idDelta.create<EdgeId>(),
    owners: {
      mindmaps: idDelta.create<MindmapId>(),
      groups: idDelta.create<GroupId>()
    }
  },
  items: false,
  ui: {
    chrome: false,
    nodes: idDelta.create<NodeId>(),
    edges: idDelta.create<EdgeId>()
  }
})

export const resetGraphPublishDelta = (
  delta: GraphPublishDelta
) => {
  idDelta.reset(delta.nodes)
  idDelta.reset(delta.edges)
  idDelta.reset(delta.owners.mindmaps)
  idDelta.reset(delta.owners.groups)
}

export const resetUiPublishDelta = (
  delta: UiPublishDelta
) => {
  delta.chrome = false
  idDelta.reset(delta.nodes)
  idDelta.reset(delta.edges)
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
  idDelta.assign(input.target.nodes, input.source.entities.nodes)
  idDelta.assign(input.target.edges, input.source.entities.edges)
  idDelta.assign(input.target.owners.mindmaps, input.source.entities.mindmaps)
  idDelta.assign(input.target.owners.groups, input.source.entities.groups)
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
