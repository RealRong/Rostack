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
  added: new Set(),
  updated: new Set(),
  removed: new Set()
})

const resetIdDelta = <TId extends string>(
  delta: IdDelta<TId>
) => {
  delta.added.clear()
  delta.updated.clear()
  delta.removed.clear()
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
  delta.removed.delete(id)
  delta.updated.delete(id)
  delta.added.add(id)
}

export const markUpdated = <TId extends string>(
  delta: IdDelta<TId>,
  id: TId
) => {
  if (delta.added.has(id) || delta.removed.has(id)) {
    return
  }

  delta.updated.add(id)
}

export const markRemoved = <TId extends string>(
  delta: IdDelta<TId>,
  id: TId
) => {
  if (delta.added.delete(id)) {
    return
  }

  delta.updated.delete(id)
  delta.removed.add(id)
}

export const markGeometryTouched = <TId extends string>(
  target: Set<TId>,
  id: TId
) => {
  target.add(id)
}
