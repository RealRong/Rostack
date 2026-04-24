import { changeSet } from '@shared/core'
import type {
  EdgeId,
  GroupId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import type { GraphDelta } from '../../contracts/delta'

export const createGraphDelta = (): GraphDelta => ({
  revision: 0,
  order: false,
  entities: {
    nodes: changeSet.create<NodeId>(),
    edges: changeSet.create<EdgeId>(),
    mindmaps: changeSet.create<MindmapId>(),
    groups: changeSet.create<GroupId>()
  },
  geometry: {
    nodes: new Set(),
    edges: new Set(),
    mindmaps: new Set(),
    groups: new Set()
  }
})

export const resetGraphDelta = (
  delta: GraphDelta
) => {
  delta.revision = 0
  delta.order = false
  changeSet.reset(delta.entities.nodes)
  changeSet.reset(delta.entities.edges)
  changeSet.reset(delta.entities.mindmaps)
  changeSet.reset(delta.entities.groups)
  delta.geometry.nodes.clear()
  delta.geometry.edges.clear()
  delta.geometry.mindmaps.clear()
  delta.geometry.groups.clear()
}
