import { publishEntityFamily } from '@shared/projector'
import type { GraphChange, GraphSnapshot } from '../../contracts/editor'
import type { GraphPublishDelta } from '../../contracts/delta'
import type { WorkingState } from '../../contracts/working'

export const patchPublishedGraph = (input: {
  previous: GraphSnapshot
  working: WorkingState
  delta: GraphPublishDelta
}): {
  value: GraphSnapshot
  change: GraphChange
} => {
  const nodes = publishEntityFamily({
    previous: input.previous.nodes,
    ids: [...input.working.graph.nodes.keys()],
    change: input.delta.nodes,
    read: (nodeId) => input.working.graph.nodes.get(nodeId)
  })
  const edges = publishEntityFamily({
    previous: input.previous.edges,
    ids: [...input.working.graph.edges.keys()],
    change: input.delta.edges,
    read: (edgeId) => input.working.graph.edges.get(edgeId)
  })
  const mindmaps = publishEntityFamily({
    previous: input.previous.owners.mindmaps,
    ids: [...input.working.graph.owners.mindmaps.keys()],
    change: input.delta.owners.mindmaps,
    read: (mindmapId) => input.working.graph.owners.mindmaps.get(mindmapId)
  })
  const groups = publishEntityFamily({
    previous: input.previous.owners.groups,
    ids: [...input.working.graph.owners.groups.keys()],
    change: input.delta.owners.groups,
    read: (groupId) => input.working.graph.owners.groups.get(groupId)
  })

  const owners = (
    mindmaps.value === input.previous.owners.mindmaps
    && groups.value === input.previous.owners.groups
  )
    ? input.previous.owners
    : {
        mindmaps: mindmaps.value,
        groups: groups.value
      }

  const value = (
    nodes.value === input.previous.nodes
    && edges.value === input.previous.edges
    && owners === input.previous.owners
  )
    ? input.previous
    : {
        nodes: nodes.value,
        edges: edges.value,
        owners
      }

  return {
    value,
    change: {
      nodes: nodes.change,
      edges: edges.change,
      owners: {
        mindmaps: mindmaps.change,
        groups: groups.change
      }
    }
  }
}
