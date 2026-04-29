import type {
  EdgeId,
  GroupId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import { idDelta, type IdDelta } from '@shared/delta'
import {
  resetGraphDelta,
  resetGraphDirty
} from '../../contracts/delta'
import type { Input } from '../../contracts/editor'
import type { WorkingState } from '../../contracts/working'
import type { EdgeNodeSnapshot } from './edge'
import { patchEdge } from './edge'
import { patchGroup } from './group'
import { readRelatedEdgeIds } from '../index/read'
import { patchIndexState } from '../index/update'
import { patchMindmap } from './mindmap'
import { patchNode } from './node'

const touchLifecycleIds = <TId extends string>(
  target: IdDelta<TId>,
  source: IdDelta<TId>
) => {
  source.added.forEach((id) => {
    idDelta.add(target, id)
  })
  source.removed.forEach((id) => {
    idDelta.remove(target, id)
  })
}

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

const touchDirtyTarget = <TId extends string>(
  target: IdDelta<TId>,
  ids: Iterable<TId>,
  action: 'add' | 'update' | 'remove'
) => {
  for (const id of ids) {
    if (action === 'add') {
      idDelta.add(target, id)
      continue
    }
    if (action === 'remove') {
      idDelta.remove(target, id)
      continue
    }
    idDelta.update(target, id)
  }
}

const touchDocumentIds = <TId extends string>(
  target: IdDelta<TId>,
  ids: ReadonlySet<TId> | 'all',
  action: 'add' | 'update' | 'remove'
) => {
  if (ids === 'all') {
    return
  }
  touchDirtyTarget(target, ids, action)
}

const markGeometryDirty = <TId extends string>(
  target: IdDelta<TId>,
  ids: Iterable<TId>
) => {
  touchDirtyTarget(target, ids, 'update')
}

const fanoutEdgeGeometryDirty = (
  dirty: WorkingState['dirty']['graph'],
  ids: Iterable<EdgeId>
) => {
  markGeometryDirty(dirty.edge.route, ids)
  markGeometryDirty(dirty.edge.labels, ids)
  markGeometryDirty(dirty.edge.endpoints, ids)
  markGeometryDirty(dirty.edge.box, ids)
}

const fanoutMindmapGeometryDirty = (
  dirty: WorkingState['dirty']['graph'],
  ids: Iterable<MindmapId>
) => {
  markGeometryDirty(dirty.mindmap.geometry, ids)
  markGeometryDirty(dirty.mindmap.connectors, ids)
  markGeometryDirty(dirty.mindmap.membership, ids)
}

const fanoutGroupGeometryDirty = (
  dirty: WorkingState['dirty']['graph'],
  ids: Iterable<GroupId>
) => {
  markGeometryDirty(dirty.group.geometry, ids)
  markGeometryDirty(dirty.group.membership, ids)
}

const readGraphPatchTargets = (
  input: Input
): {
  reset: boolean
  order: boolean
  nodes: ReadonlySet<NodeId>
  edges: ReadonlySet<EdgeId>
  mindmaps: ReadonlySet<MindmapId>
  groups: ReadonlySet<GroupId>
} => {
  if (input.delta.reset) {
    return {
      reset: true,
      order: true,
      nodes: new Set<NodeId>(),
      edges: new Set<EdgeId>(),
      mindmaps: new Set<MindmapId>(),
      groups: new Set<GroupId>()
    }
  }

  const runtimeDelta = input.runtime.delta
  const graphTargets = input.delta.graph.targets()
  if (graphTargets.reset) {
    return {
      reset: true,
      order: true,
      nodes: new Set<NodeId>(),
      edges: new Set<EdgeId>(),
      mindmaps: new Set<MindmapId>(),
      groups: new Set<GroupId>()
    }
  }

  const nodes = new Set<NodeId>(graphTargets.nodes as ReadonlySet<NodeId>)
  const edges = new Set<EdgeId>(graphTargets.edges as ReadonlySet<EdgeId>)
  const mindmaps = new Set<MindmapId>(graphTargets.mindmaps as ReadonlySet<MindmapId>)
  const groups = new Set<GroupId>(graphTargets.groups as ReadonlySet<GroupId>)
  const order = graphTargets.order

  enqueueAll(edges, idDelta.touched(runtimeDelta.session.draft.edges))
  enqueueAll(nodes, idDelta.touched(runtimeDelta.session.preview.nodes))
  enqueueAll(edges, idDelta.touched(runtimeDelta.session.preview.edges))
  enqueueAll(mindmaps, idDelta.touched(runtimeDelta.session.preview.mindmaps))
  enqueueAll(mindmaps, runtimeDelta.clock.mindmaps)

  enqueueAll(edges, input.runtime.session.draft.edges.keys())
  enqueueAll(nodes, input.runtime.session.preview.nodes.keys())
  enqueueAll(edges, input.runtime.session.preview.edges.keys())

  if (input.runtime.session.edit?.kind === 'node') {
    nodes.add(input.runtime.session.edit.nodeId)
  }
  if (input.runtime.session.edit?.kind === 'edge-label') {
    edges.add(input.runtime.session.edit.edgeId)
  }

  if (input.runtime.session.preview.mindmap?.rootMove) {
    mindmaps.add(input.runtime.session.preview.mindmap.rootMove.mindmapId)
  }
  if (input.runtime.session.preview.mindmap?.subtreeMove) {
    mindmaps.add(input.runtime.session.preview.mindmap.subtreeMove.mindmapId)
  }
  input.runtime.session.preview.mindmap?.enter?.forEach((entry) => {
    mindmaps.add(entry.mindmapId)
  })

  return {
    reset: false,
    order,
    nodes,
    edges,
    mindmaps,
    groups
  }
}

const hasGraphTargets = (
  targets: {
    reset: boolean
    order: boolean
    nodes: ReadonlySet<NodeId>
    edges: ReadonlySet<EdgeId>
    mindmaps: ReadonlySet<MindmapId>
    groups: ReadonlySet<GroupId>
  }
): boolean => Boolean(
  targets.reset
  || targets.order
  || targets.nodes.size > 0
  || targets.edges.size > 0
  || targets.mindmaps.size > 0
  || targets.groups.size > 0
)

const seedGraphPatchQueue = (input: {
  working: WorkingState
  queue: GraphPatchQueue
  targets: {
    reset: boolean
    order: boolean
    nodes: ReadonlySet<NodeId>
    edges: ReadonlySet<EdgeId>
    mindmaps: ReadonlySet<MindmapId>
    groups: ReadonlySet<GroupId>
  }
}) => {
  if (input.targets.reset) {
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

  enqueueAll(input.queue.nodes, input.targets.nodes)
  enqueueAll(input.queue.edges, input.targets.edges)
  enqueueAll(input.queue.mindmaps, input.targets.mindmaps)
  enqueueAll(input.queue.groups, input.targets.groups)
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
  targets: {
    reset: boolean
    order: boolean
    nodes: ReadonlySet<NodeId>
    edges: ReadonlySet<EdgeId>
    mindmaps: ReadonlySet<MindmapId>
    groups: ReadonlySet<GroupId>
  }
}) => {
  if (input.targets.reset) {
    return
  }

  input.targets.nodes.forEach((nodeId) => {
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

const seedGraphDirtyFromMutation = (input: {
  current: Input
  dirty: WorkingState['dirty']['graph']
}) => {
  const { current, dirty } = input
  dirty.order = current.delta.graph.orderChanged()

  touchDocumentIds(
    dirty.node.lifecycle,
    current.delta.node.create.touchedIds(),
    'add'
  )
  touchDocumentIds(
    dirty.node.lifecycle,
    current.delta.node.delete.touchedIds(),
    'remove'
  )
  touchDocumentIds(
    dirty.node.geometry,
    current.delta.node.geometry.touchedIds(),
    'update'
  )
  touchDocumentIds(
    dirty.node.content,
    current.delta.node.content.touchedIds(),
    'update'
  )
  touchDocumentIds(
    dirty.node.owner,
    current.delta.node.owner.touchedIds(),
    'update'
  )

  touchDocumentIds(
    dirty.edge.lifecycle,
    current.delta.edge.create.touchedIds(),
    'add'
  )
  touchDocumentIds(
    dirty.edge.lifecycle,
    current.delta.edge.delete.touchedIds(),
    'remove'
  )
  touchDocumentIds(
    dirty.edge.route,
    current.delta.graph.affects.edgeRouteIds(),
    'update'
  )
  touchDocumentIds(
    dirty.edge.endpoints,
    current.delta.graph.affects.edgeEndpointIds(),
    'update'
  )
  touchDocumentIds(
    dirty.edge.box,
    current.delta.graph.affects.edgeBoxIds(),
    'update'
  )
  touchDocumentIds(
    dirty.edge.style,
    current.delta.graph.affects.edgeStyleIds(),
    'update'
  )
  touchDocumentIds(
    dirty.edge.labels,
    current.delta.graph.affects.edgeLabelIds(),
    'update'
  )

  touchDocumentIds(
    dirty.mindmap.lifecycle,
    current.delta.mindmap.create.touchedIds(),
    'add'
  )
  touchDocumentIds(
    dirty.mindmap.lifecycle,
    current.delta.mindmap.delete.touchedIds(),
    'remove'
  )
  touchDocumentIds(
    dirty.mindmap.geometry,
    current.delta.graph.affects.mindmapGeometryIds(),
    'update'
  )
  touchDocumentIds(
    dirty.mindmap.connectors,
    current.delta.graph.affects.mindmapConnectorIds(),
    'update'
  )
  touchDocumentIds(
    dirty.mindmap.membership,
    current.delta.graph.affects.mindmapMembershipIds(),
    'update'
  )

  touchDocumentIds(
    dirty.group.lifecycle,
    current.delta.group.create.touchedIds(),
    'add'
  )
  touchDocumentIds(
    dirty.group.lifecycle,
    current.delta.group.delete.touchedIds(),
    'remove'
  )
  touchDocumentIds(
    dirty.group.geometry,
    current.delta.graph.affects.groupGeometryIds(),
    'update'
  )
  touchDocumentIds(
    dirty.group.membership,
    current.delta.graph.affects.groupMembershipIds(),
    'update'
  )

  touchDirtyTarget(
    dirty.node.geometry,
    idDelta.touched(current.runtime.delta.session.preview.nodes),
    'update'
  )
  touchDirtyTarget(
    dirty.edge.route,
    idDelta.touched(current.runtime.delta.session.preview.edges),
    'update'
  )
  touchDirtyTarget(
    dirty.edge.labels,
    idDelta.touched(current.runtime.delta.session.preview.edges),
    'update'
  )
  touchDirtyTarget(
    dirty.edge.route,
    idDelta.touched(current.runtime.delta.session.draft.edges),
    'update'
  )
  touchDirtyTarget(
    dirty.edge.style,
    idDelta.touched(current.runtime.delta.session.draft.edges),
    'update'
  )
  touchDirtyTarget(
    dirty.mindmap.geometry,
    idDelta.touched(current.runtime.delta.session.preview.mindmaps),
    'update'
  )
  touchDirtyTarget(
    dirty.mindmap.geometry,
    current.runtime.delta.clock.mindmaps,
    'update'
  )

  if (current.runtime.session.edit?.kind === 'node') {
    idDelta.update(dirty.node.content, current.runtime.session.edit.nodeId)
    idDelta.update(dirty.node.geometry, current.runtime.session.edit.nodeId)
  }
  if (current.runtime.session.edit?.kind === 'edge-label') {
    idDelta.update(dirty.edge.labels, current.runtime.session.edit.edgeId)
  }

  if (current.runtime.session.preview.mindmap?.rootMove) {
    idDelta.update(
      dirty.mindmap.geometry,
      current.runtime.session.preview.mindmap.rootMove.mindmapId
    )
  }
  if (current.runtime.session.preview.mindmap?.subtreeMove) {
    idDelta.update(
      dirty.mindmap.geometry,
      current.runtime.session.preview.mindmap.subtreeMove.mindmapId
    )
  }
  current.runtime.session.preview.mindmap?.enter?.forEach((entry) => {
    idDelta.update(dirty.mindmap.geometry, entry.mindmapId)
  })
}

export const patchGraphState = (input: {
  revision: number
  current: Input
  working: WorkingState
  reset?: boolean
  previousDocument?: WorkingState['document']['snapshot']
}): {
  ran: boolean
  count: number
  spatialChanged: boolean
} => {
  const queue = createGraphPatchQueue()
  const delta = input.working.delta.graph
  const graphDirty = input.working.dirty.graph
  const targets = input.reset
    ? {
        reset: true,
        order: true,
        nodes: new Set<NodeId>(),
        edges: new Set<EdgeId>(),
        mindmaps: new Set<MindmapId>(),
        groups: new Set<GroupId>()
      }
    : readGraphPatchTargets(input.current)

  resetGraphDelta(delta)
  resetGraphDirty(graphDirty)

  if (!hasGraphTargets(targets)) {
    return {
      ran: false,
      count: 0,
      spatialChanged: false
    }
  }

  delta.revision = input.revision as typeof delta.revision
  delta.order = targets.reset || targets.order

  seedGraphDirtyFromMutation({
    current: input.current,
    dirty: graphDirty
  })

  patchIndexState({
    state: input.working.indexes,
    previous: input.previousDocument,
    next: input.working.document.snapshot,
    scope: targets
  })

  seedGraphPatchQueue({
    working: input.working,
    queue,
    targets
  })
  preFanoutSeeds({
    working: input.working,
    queue,
    targets
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

  input.working.revision.document = input.current.document.rev
  touchLifecycleIds(graphDirty.node.lifecycle, delta.entities.nodes)
  touchLifecycleIds(graphDirty.edge.lifecycle, delta.entities.edges)
  touchLifecycleIds(graphDirty.mindmap.lifecycle, delta.entities.mindmaps)
  touchLifecycleIds(graphDirty.group.lifecycle, delta.entities.groups)
  markGeometryDirty(graphDirty.node.geometry, delta.geometry.nodes)
  fanoutEdgeGeometryDirty(graphDirty, delta.geometry.edges)
  fanoutMindmapGeometryDirty(graphDirty, delta.geometry.mindmaps)
  fanoutGroupGeometryDirty(graphDirty, delta.geometry.groups)

  return {
    ran: true,
    count,
    spatialChanged: (
      targets.reset
      || delta.order
      || hasGraphEntityLifecycle(input.working)
      || delta.geometry.nodes.size > 0
      || delta.geometry.edges.size > 0
      || delta.geometry.mindmaps.size > 0
    )
  }
}
