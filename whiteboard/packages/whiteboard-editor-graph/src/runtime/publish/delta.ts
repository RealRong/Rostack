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
  IdDelta,
  PublishDelta,
  ScenePublishDelta,
  SpatialDelta,
  UiPublishDelta
} from '../../contracts/delta'
import {
  markAdded,
  markRemoved,
  markUpdated
} from '../graphPatch/delta'

const createIdDelta = <TId extends string>(): IdDelta<TId> => ({
  ...changeSet.create<TId>()
})

const resetIdDelta = <TId extends string>(
  delta: IdDelta<TId>
) => {
  changeSet.reset(delta)
}

const syncIdDelta = <TId extends string>(input: {
  source: IdDelta<TId>
  target: IdDelta<TId>
}) => {
  changeSet.assign(input.target, input.source)
}

export const createPublishDelta = (): PublishDelta => ({
  graph: {
    nodes: createIdDelta<NodeId>(),
    edges: createIdDelta<EdgeId>(),
    owners: {
      mindmaps: createIdDelta<MindmapId>(),
      groups: createIdDelta<GroupId>()
    }
  },
  scene: {
    items: false,
    visible: false
  },
  ui: {
    selection: false,
    chrome: false,
    nodes: createIdDelta<NodeId>(),
    edges: createIdDelta<EdgeId>()
  }
})

export const resetGraphPublishDelta = (
  delta: GraphPublishDelta
) => {
  resetIdDelta(delta.nodes)
  resetIdDelta(delta.edges)
  resetIdDelta(delta.owners.mindmaps)
  resetIdDelta(delta.owners.groups)
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
  delta.selection = false
  delta.chrome = false
  resetIdDelta(delta.nodes)
  resetIdDelta(delta.edges)
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
  syncIdDelta({
    source: input.source.entities.nodes,
    target: input.target.nodes
  })
  syncIdDelta({
    source: input.source.entities.edges,
    target: input.target.edges
  })
  syncIdDelta({
    source: input.source.entities.mindmaps,
    target: input.target.owners.mindmaps
  })
  syncIdDelta({
    source: input.source.entities.groups,
    target: input.target.owners.groups
  })
}

export const syncScenePublishDelta = (input: {
  graph: GraphDelta
  spatial: SpatialDelta
  target: ScenePublishDelta
}) => {
  input.target.items = input.graph.order
  input.target.visible = input.spatial.order || input.spatial.visible
}

export const markUiSelectionChanged = (
  delta: UiPublishDelta
) => {
  delta.selection = true
}

export const markUiChromeChanged = (
  delta: UiPublishDelta
) => {
  delta.chrome = true
}

export const markUiNodeAdded = (
  delta: UiPublishDelta,
  nodeId: NodeId
) => {
  markAdded(delta.nodes, nodeId)
}

export const markUiNodeUpdated = (
  delta: UiPublishDelta,
  nodeId: NodeId
) => {
  markUpdated(delta.nodes, nodeId)
}

export const markUiNodeRemoved = (
  delta: UiPublishDelta,
  nodeId: NodeId
) => {
  markRemoved(delta.nodes, nodeId)
}

export const markUiEdgeAdded = (
  delta: UiPublishDelta,
  edgeId: EdgeId
) => {
  markAdded(delta.edges, edgeId)
}

export const markUiEdgeUpdated = (
  delta: UiPublishDelta,
  edgeId: EdgeId
) => {
  markUpdated(delta.edges, edgeId)
}

export const markUiEdgeRemoved = (
  delta: UiPublishDelta,
  edgeId: EdgeId
) => {
  markRemoved(delta.edges, edgeId)
}
