import { idDelta } from '@shared/projector/delta'
import type {
  EdgeId,
  GroupId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import type {
  GraphDelta,
  GraphPublishDelta,
  UiPublishDelta
} from '../../contracts/delta'

export const createGraphPublishDelta = (): GraphPublishDelta => ({
  nodes: idDelta.create<NodeId>(),
  edges: idDelta.create<EdgeId>(),
  owners: {
    mindmaps: idDelta.create<MindmapId>(),
    groups: idDelta.create<GroupId>()
  }
})

export const createUiPublishDelta = (): UiPublishDelta => ({
  chrome: false,
  nodes: idDelta.create<NodeId>(),
  edges: idDelta.create<EdgeId>()
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

export const writeGraphPublishDelta = (input: {
  source: GraphDelta
  target: GraphPublishDelta
}) => {
  resetGraphPublishDelta(input.target)
  idDelta.assign(input.target.nodes, input.source.entities.nodes)
  idDelta.assign(input.target.edges, input.source.entities.edges)
  idDelta.assign(input.target.owners.mindmaps, input.source.entities.mindmaps)
  idDelta.assign(input.target.owners.groups, input.source.entities.groups)
}

export const hasGraphPublishDelta = (
  delta: GraphPublishDelta
): boolean => (
  idDelta.hasAny(delta.nodes)
  || idDelta.hasAny(delta.edges)
  || idDelta.hasAny(delta.owners.mindmaps)
  || idDelta.hasAny(delta.owners.groups)
)

export const hasUiPublishDelta = (
  delta: UiPublishDelta
): boolean => (
  delta.chrome
  || idDelta.hasAny(delta.nodes)
  || idDelta.hasAny(delta.edges)
)

export const readItemsPublishChanged = (input: {
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
