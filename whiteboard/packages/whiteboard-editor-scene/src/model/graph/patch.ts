import { idDelta } from '@shared/delta'
import type {
  EdgeId,
  GroupId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import { resetGraphDelta } from '../../contracts/delta'
import type { Input } from '../../contracts/editor'
import {
  createEmptyWhiteboardGraphExecutionChange,
  executionScopeFromValues,
  executionScopeHasAny,
  executionScopeUnion,
  type ExecutionScope,
  type WhiteboardSceneExecution
} from '../../contracts/execution'
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

type ResolvedGraphTargets = {
  reset: boolean
  order: boolean
  nodes: ReadonlySet<NodeId>
  edges: ReadonlySet<EdgeId>
  mindmaps: ReadonlySet<MindmapId>
  groups: ReadonlySet<GroupId>
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

const resolveScope = <TId extends string>(
  scope: ExecutionScope<TId>,
  readAll: () => Iterable<TId>
): ReadonlySet<TId> => scope === 'all'
  ? new Set(readAll())
  : new Set(scope)

const resolveGraphTargets = (input: {
  execution: WhiteboardSceneExecution
  working: WorkingState
}): ResolvedGraphTargets => ({
  reset: input.execution.reset,
  order: input.execution.order,
  nodes: resolveScope(
    input.execution.target.node,
    () => [
      ...(Object.keys(input.working.document.snapshot.nodes) as readonly NodeId[]),
      ...input.working.graph.nodes.keys()
    ]
  ),
  edges: resolveScope(
    input.execution.target.edge,
    () => [
      ...(Object.keys(input.working.document.snapshot.edges) as readonly EdgeId[]),
      ...input.working.graph.edges.keys()
    ]
  ),
  mindmaps: resolveScope(
    input.execution.target.mindmap,
    () => [
      ...(Object.keys(input.working.document.snapshot.mindmaps) as readonly MindmapId[]),
      ...input.working.graph.owners.mindmaps.keys()
    ]
  ),
  groups: resolveScope(
    input.execution.target.group,
    () => [
      ...(Object.keys(input.working.document.snapshot.groups) as readonly GroupId[]),
      ...input.working.graph.owners.groups.keys()
    ]
  )
})

const hasGraphTargets = (
  targets: ResolvedGraphTargets
): boolean => Boolean(
  targets.reset
  || targets.order
  || targets.nodes.size > 0
  || targets.edges.size > 0
  || targets.mindmaps.size > 0
  || targets.groups.size > 0
)

const seedGraphPatchQueue = (input: {
  queue: GraphPatchQueue
  targets: ResolvedGraphTargets
}) => {
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
  targets: ResolvedGraphTargets
}) => {
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
    || entities.groups.added.size > 0
    || entities.groups.removed.size > 0
  )
}

const scopeFromTouchedIds = <TId extends string>(
  ids: ReadonlySet<TId> | 'all'
): ExecutionScope<TId> => ids === 'all'
  ? 'all'
  : new Set(ids)

const compileGraphExecutionChange = (input: {
  current: Input
  execution: WhiteboardSceneExecution
  working: WorkingState
}) => {
  if (input.execution.reset) {
    return {
      entity: {
        node: 'all',
        edge: 'all',
        mindmap: 'all',
        group: 'all'
      },
      geometry: {
        node: 'all',
        edge: 'all',
        mindmap: 'all',
        group: 'all'
      },
      content: {
        node: 'all',
        edge: 'all'
      },
      owner: {
        node: 'all',
        mindmap: 'all',
        group: 'all'
      }
    } satisfies WhiteboardSceneExecution['change']['graph']
  }

  const graphChange = createEmptyWhiteboardGraphExecutionChange()
  const graphDelta = input.working.delta.graph
  const editingNodeScope = input.current.runtime.session.edit?.kind === 'node'
    ? executionScopeFromValues([input.current.runtime.session.edit.nodeId])
    : new Set<NodeId>()
  const editingEdgeScope = input.current.runtime.session.edit?.kind === 'edge-label'
    ? executionScopeFromValues([input.current.runtime.session.edit.edgeId])
    : new Set<EdgeId>()

  graphChange.entity.node = idDelta.touched(graphDelta.entities.nodes)
  graphChange.entity.edge = idDelta.touched(graphDelta.entities.edges)
  graphChange.entity.mindmap = idDelta.touched(graphDelta.entities.mindmaps)
  graphChange.entity.group = idDelta.touched(graphDelta.entities.groups)

  graphChange.geometry.node = executionScopeFromValues(graphDelta.geometry.nodes)
  graphChange.geometry.edge = executionScopeFromValues(graphDelta.geometry.edges)
  graphChange.geometry.mindmap = executionScopeFromValues(graphDelta.geometry.mindmaps)
  graphChange.geometry.group = executionScopeFromValues(graphDelta.geometry.groups)

  graphChange.content.node = executionScopeUnion(
    scopeFromTouchedIds(input.current.delta.node.content.touchedIds()),
    editingNodeScope
  )
  graphChange.content.edge = executionScopeUnion(
    scopeFromTouchedIds(input.current.delta.edge.labels.touchedIds()),
    scopeFromTouchedIds(input.current.delta.edge.style.touchedIds()),
    scopeFromTouchedIds(input.current.delta.edge.data.touchedIds()),
    editingEdgeScope
  )

  graphChange.owner.node = scopeFromTouchedIds(input.current.delta.node.owner.touchedIds())
  graphChange.owner.mindmap = scopeFromTouchedIds(input.current.delta.mindmap.structure.touchedIds())
  graphChange.owner.group = scopeFromTouchedIds(input.current.delta.group.value.touchedIds())

  return graphChange
}

export const patchGraphState = (input: {
  revision: number
  current: Input
  execution: WhiteboardSceneExecution
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
  const targets = input.reset
    ? resolveGraphTargets({
        execution: {
          ...input.execution,
          reset: true,
          order: true,
          target: {
            node: 'all',
            edge: 'all',
            mindmap: 'all',
            group: 'all'
          }
        },
        working: input.working
      })
    : resolveGraphTargets({
        execution: input.execution,
        working: input.working
      })

  resetGraphDelta(delta)
  input.execution.change.graph = createEmptyWhiteboardGraphExecutionChange()

  if (!hasGraphTargets(targets)) {
    return {
      ran: false,
      count: 0,
      spatialChanged: false
    }
  }

  delta.revision = input.revision as typeof delta.revision
  delta.order = targets.reset || targets.order

  patchIndexState({
    state: input.working.indexes,
    previous: input.previousDocument,
    next: input.working.document.snapshot,
    scope: targets
  })

  seedGraphPatchQueue({
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
  input.execution.change.graph = compileGraphExecutionChange({
    current: input.current,
    execution: input.execution,
    working: input.working
  })

  return {
    ran: true,
    count,
    spatialChanged: (
      targets.reset
      || delta.order
      || hasGraphEntityLifecycle(input.working)
      || executionScopeHasAny(input.execution.change.graph.geometry.node)
      || executionScopeHasAny(input.execution.change.graph.geometry.edge)
      || executionScopeHasAny(input.execution.change.graph.geometry.mindmap)
      || executionScopeHasAny(input.execution.change.graph.geometry.group)
    )
  }
}
