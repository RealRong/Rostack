import { geometry as geometryApi } from '@whiteboard/core/geometry'
import type { Query } from '../../contracts/editor'
import type { WorkingState } from '../../contracts/working'

export const createBoundsRead = (input: {
  state: () => WorkingState
}): Query['bounds'] => () => {
  const state = input.state()
  return geometryApi.rect.boundingRect([
    ...[...state.graph.nodes.values()].map((node) => node.geometry.bounds),
    ...[...state.graph.edges.values()].flatMap((edge) => (
      edge.route.bounds
        ? [edge.route.bounds]
        : []
    )),
    ...[...state.graph.owners.mindmaps.values()].flatMap((mindmap) => (
      mindmap.tree.bbox
        ? [mindmap.tree.bbox]
        : []
    )),
    ...[...state.graph.owners.groups.values()].flatMap((group) => (
      group.frame.bounds
        ? [group.frame.bounds]
        : []
    ))
  ])
}
