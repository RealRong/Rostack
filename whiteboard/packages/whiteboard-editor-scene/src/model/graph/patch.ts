import type {
  EdgeId,
  GroupId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import type { GraphPatchScope } from '../../contracts/delta'
import { resetGraphDelta } from '../../contracts/delta'
import type { Input } from '../../contracts/editor'
import type { WorkingState } from '../../contracts/working'
import type { EdgeNodeSnapshot } from './edge'
import { patchEdge } from './edge'
import { patchGroup } from './group'
import { readRelatedEdgeIds } from '../index/read'
import { patchIndexState } from '../index/update'
import { patchMindmap } from './mindmap'
import { patchNode } from './node'

type GraphPatchQueue = {
  nodes: Set<NodeId>
  edges: Set<EdgeId>
  mindmaps: Set<MindmapId>
  groups: Set<GroupId>
}

const createGraphPatchQueue = (): GraphPatchQueue => ({
  nodes: new Set(),
  edges: new Set(),
  mindmaps: new Set(),
  groups: new Set()
})

const enqueueAll = <TId extends string>(
  target: Set<TId>,
  values: Iterable<TId>
) => {
  for (const value of values) {
    target.add(value)
  }
}

const drainQueue = <TId extends string>(
  queue: Set<TId>
): readonly TId[] => {
  const ids = [...queue]
  queue.clear()
  return ids
}

const seedGraphPatchQueue = (input: {
  current: Input
  working: WorkingState
  queue: GraphPatchQueue
  scope: GraphPatchScope
}) => {
  if (input.scope.reset) {
    enqueueAll(
      input.queue.nodes,
      Object.keys(input.working.document.snapshot.nodes) as readonly NodeId[]
    )
    enqueueAll(input.queue.nodes, input.working.graph.nodes.keys())
    enqueueAll(
      input.queue.edges,
      Object.keys(input.working.document.snapshot.edges) as readonly EdgeId[]
    )
    enqueueAll(input.queue.edges, input.working.graph.edges.keys())
    enqueueAll(
      input.queue.mindmaps,
      Object.keys(input.working.document.snapshot.mindmaps) as readonly MindmapId[]
    )
    enqueueAll(input.queue.mindmaps, input.working.graph.owners.mindmaps.keys())
    enqueueAll(
      input.queue.groups,
      Object.keys(input.working.document.snapshot.groups) as readonly GroupId[]
    )
    enqueueAll(input.queue.groups, input.working.graph.owners.groups.keys())
    return
  }

  enqueueAll(input.queue.nodes, input.scope.nodes)
  enqueueAll(input.queue.edges, input.scope.edges)
  enqueueAll(input.queue.mindmaps, input.scope.mindmaps)
  enqueueAll(input.queue.groups, input.scope.groups)
}

const fanoutNodeGeometry = (input: {
  working: WorkingState
  owner?: {
    kind: 'mindmap' | 'group'
    id: string
  }
  queue: GraphPatchQueue
  nodeId: NodeId
}) => {
  enqueueAll(
    input.queue.edges,
    readRelatedEdgeIds(input.working.indexes, [input.nodeId])
  )
  if (input.owner?.kind === 'group') {
    input.queue.groups.add(input.owner.id as GroupId)
  }
}

const preFanoutSeeds = (input: {
  working: WorkingState
  queue: GraphPatchQueue
  scope: GraphPatchScope
}) => {
  if (input.scope.reset) {
    return
  }

  input.scope.nodes.forEach((nodeId) => {
    const nextOwner = input.working.indexes.ownerByNode.get(nodeId)
    const previousOwner = input.working.graph.nodes.get(nodeId)?.base.owner

    if (nextOwner?.kind === 'mindmap') {
      input.queue.mindmaps.add(nextOwner.id)
    }
    if (previousOwner?.kind === 'mindmap') {
      input.queue.mindmaps.add(previousOwner.id)
    }

    fanoutNodeGeometry({
      working: input.working,
      owner: nextOwner,
      queue: input.queue,
      nodeId
    })
    if (previousOwner?.kind === 'group') {
      input.queue.groups.add(previousOwner.id)
    }
  })
}

const patchStandaloneNodes = (input: {
  current: Input
  working: WorkingState
  queue: GraphPatchQueue
}): number => {
  const deferred = new Set<NodeId>()
  let count = 0

  drainQueue(input.queue.nodes).forEach((nodeId) => {
    const owner = input.working.indexes.ownerByNode.get(nodeId)
      ?? input.working.graph.nodes.get(nodeId)?.base.owner
    if (owner?.kind === 'mindmap') {
      deferred.add(nodeId)
      return
    }

    const result = patchNode({
      input: input.current,
      working: input.working,
      delta: input.working.delta.graph,
      nodeId
    })
    if (result.changed) {
      count += 1
    }
    if (result.geometryChanged) {
      fanoutNodeGeometry({
        working: input.working,
        owner: result.owner,
        queue: input.queue,
        nodeId
      })
    }
  })

  deferred.forEach((nodeId) => {
    input.queue.nodes.add(nodeId)
  })

  return count
}

const patchMindmaps = (input: {
  current: Input
  working: WorkingState
  queue: GraphPatchQueue
}): number => {
  let count = 0

  drainQueue(input.queue.mindmaps).forEach((mindmapId) => {
    const result = patchMindmap({
      input: input.current,
      working: input.working,
      delta: input.working.delta.graph,
      mindmapId
    })
    if (result.changed) {
      count += 1
    }
    enqueueAll(input.queue.nodes, result.changedNodeIds)
  })

  return count
}

const patchMindmapMemberNodes = (input: {
  current: Input
  working: WorkingState
  queue: GraphPatchQueue
}): number => {
  let count = 0

  drainQueue(input.queue.nodes).forEach((nodeId) => {
    const result = patchNode({
      input: input.current,
      working: input.working,
      delta: input.working.delta.graph,
      nodeId
    })
    if (result.changed) {
      count += 1
    }
    if (result.geometryChanged) {
      fanoutNodeGeometry({
        working: input.working,
        owner: result.owner,
        queue: input.queue,
        nodeId
      })
    }
  })

  return count
}

const patchEdges = (input: {
  current: Input
  working: WorkingState
  queue: GraphPatchQueue
}): number => {
  let count = 0
  const nodeSnapshotCache = new Map<NodeId, EdgeNodeSnapshot>()

  drainQueue(input.queue.edges).forEach((edgeId) => {
    if (patchEdge({
      input: input.current,
      working: input.working,
      delta: input.working.delta.graph,
      edgeId,
      nodeSnapshotCache
    }).changed) {
      count += 1
    }
  })

  return count
}

const patchGroups = (input: {
  current: Input
  working: WorkingState
  queue: GraphPatchQueue
}): number => {
  let count = 0

  drainQueue(input.queue.groups).forEach((groupId) => {
    if (patchGroup({
      input: input.current,
      working: input.working,
      delta: input.working.delta.graph,
      groupId
    }).changed) {
      count += 1
    }
  })

  return count
}

const hasGraphEntityLifecycle = (working: WorkingState) => {
  const { entities } = working.delta.graph
  return (
    entities.nodes.added.size > 0
    || entities.nodes.removed.size > 0
    || entities.edges.added.size > 0
    || entities.edges.removed.size > 0
    || entities.mindmaps.added.size > 0
    || entities.mindmaps.removed.size > 0
  )
}

export const patchGraphState = (input: {
  revision: number
  current: Input
  working: WorkingState
  scope: GraphPatchScope
}): {
  count: number
  spatialChanged: boolean
} => {
  const queue = createGraphPatchQueue()
  const delta = input.working.delta.graph

  resetGraphDelta(delta)
  delta.revision = input.revision as typeof delta.revision
  delta.order = input.scope.reset || input.scope.order

  patchIndexState({
    state: input.working.indexes,
    previous: input.current.document.previous?.document,
    next: input.working.document.snapshot,
    delta: input.current.document.delta
  })

  seedGraphPatchQueue({
    current: input.current,
    working: input.working,
    queue,
    scope: input.scope
  })
  preFanoutSeeds({
    working: input.working,
    queue,
    scope: input.scope
  })

  const count = (
    patchStandaloneNodes({
      current: input.current,
      working: input.working,
      queue
    })
    + patchMindmaps({
      current: input.current,
      working: input.working,
      queue
    })
    + patchMindmapMemberNodes({
      current: input.current,
      working: input.working,
      queue
    })
    + patchEdges({
      current: input.current,
      working: input.working,
      queue
    })
    + patchGroups({
      current: input.current,
      working: input.working,
      queue
    })
  )

  input.working.revision.document = input.current.document.snapshot.revision

  return {
    count,
    spatialChanged: (
      input.scope.reset
      || delta.order
      || hasGraphEntityLifecycle(input.working)
      || delta.geometry.nodes.size > 0
      || delta.geometry.edges.size > 0
      || delta.geometry.mindmaps.size > 0
    )
  }
}
