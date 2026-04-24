import { changeSet } from '@shared/core'
import type {
  EdgeId,
  GroupId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import type {
  GraphDelta,
  IdDelta
} from '../../contracts/delta'

const createIdDelta = <TId extends string>(): IdDelta<TId> => ({
  ...changeSet.create<TId>()
})

const resetIdDelta = <TId extends string>(
  delta: IdDelta<TId>
) => {
  changeSet.reset(delta)
}

export const createGraphDelta = (): GraphDelta => ({
  revision: 0,
  order: false,
  entities: {
    nodes: createIdDelta<NodeId>(),
    edges: createIdDelta<EdgeId>(),
    mindmaps: createIdDelta<MindmapId>(),
    groups: createIdDelta<GroupId>()
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
  resetIdDelta(delta.entities.nodes)
  resetIdDelta(delta.entities.edges)
  resetIdDelta(delta.entities.mindmaps)
  resetIdDelta(delta.entities.groups)
  delta.geometry.nodes.clear()
  delta.geometry.edges.clear()
  delta.geometry.mindmaps.clear()
  delta.geometry.groups.clear()
}

export const markAdded = <TId extends string>(
  delta: IdDelta<TId>,
  id: TId
) => {
  changeSet.markAdded(delta, id)
}

export const markUpdated = <TId extends string>(
  delta: IdDelta<TId>,
  id: TId
) => {
  changeSet.markUpdated(delta, id)
}

export const markRemoved = <TId extends string>(
  delta: IdDelta<TId>,
  id: TId
) => {
  changeSet.markRemoved(delta, id)
}

export const markGeometryTouched = <TId extends string>(
  target: Set<TId>,
  id: TId
) => {
  target.add(id)
}
