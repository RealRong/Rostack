import type {
  ProjectorContext,
  ProjectorPhase,
  ProjectorPhaseScopeInput,
  ProjectorScopeValue
} from '@shared/projector'
import type {
  EdgeId,
  GroupId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import type { EditorPhaseScopeMap } from '../contracts/delta'
import { graphPhaseScope } from '../contracts/delta'
import { resetGraphDelta } from '../contracts/delta'
import type {
  Input,
  Snapshot
} from '../contracts/editor'
import type { WorkingState } from '../contracts/working'
import { patchEdge } from '../domain/edge'
import { patchGroup } from '../domain/group'
import { readRelatedEdgeIds } from '../domain/index/read'
import { patchIndexState } from '../domain/index/update'
import { buildItems } from '../domain/items'
import { patchMindmap } from '../domain/mindmap'
import { patchNode } from '../domain/node'
import {
  readUiPlanScope
} from '../projector/impact'
import {
  hasGraphPublishDelta,
  readItemsChangedFromGraphDelta,
  writeGraphPublishDelta
} from '../projector/publish'

type EditorPhaseName = keyof EditorPhaseScopeMap & string

type GraphPhaseContext = ProjectorContext<
  Input,
  WorkingState,
  Snapshot,
  ProjectorScopeValue<EditorPhaseScopeMap['graph']>
>

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
  context: GraphPhaseContext
  queue: GraphPatchQueue
  reset: boolean
}) => {
  if (input.reset) {
    enqueueAll(
      input.queue.nodes,
      Object.keys(input.context.input.document.snapshot.document.nodes) as readonly NodeId[]
    )
    enqueueAll(input.queue.nodes, input.context.working.graph.nodes.keys())
    enqueueAll(
      input.queue.edges,
      Object.keys(input.context.input.document.snapshot.document.edges) as readonly EdgeId[]
    )
    enqueueAll(input.queue.edges, input.context.working.graph.edges.keys())
    enqueueAll(
      input.queue.mindmaps,
      Object.keys(input.context.input.document.snapshot.document.mindmaps) as readonly MindmapId[]
    )
    enqueueAll(input.queue.mindmaps, input.context.working.graph.owners.mindmaps.keys())
    enqueueAll(
      input.queue.groups,
      Object.keys(input.context.input.document.snapshot.document.groups) as readonly GroupId[]
    )
    enqueueAll(input.queue.groups, input.context.working.graph.owners.groups.keys())
    return
  }

  enqueueAll(input.queue.nodes, input.context.scope.nodes)
  enqueueAll(input.queue.edges, input.context.scope.edges)
  enqueueAll(input.queue.mindmaps, input.context.scope.mindmaps)
  enqueueAll(input.queue.groups, input.context.scope.groups)
}

const fanoutNodeGeometry = (input: {
  context: GraphPhaseContext
  owner?: {
    kind: 'mindmap' | 'group'
    id: string
  }
  queue: GraphPatchQueue
  nodeId: NodeId
}) => {
  enqueueAll(
    input.queue.edges,
    readRelatedEdgeIds(input.context.working.indexes, [input.nodeId])
  )
  if (input.owner?.kind === 'group') {
    input.queue.groups.add(input.owner.id as GroupId)
  }
}

const preFanoutSeeds = (input: {
  context: GraphPhaseContext
  queue: GraphPatchQueue
  reset: boolean
}) => {
  if (input.reset) {
    return
  }

  input.context.scope.nodes.forEach((nodeId) => {
    const nextOwner = input.context.working.indexes.ownerByNode.get(nodeId)
    const previousOwner = input.context.working.graph.nodes.get(nodeId)?.base.owner

    if (nextOwner?.kind === 'mindmap') {
      input.queue.mindmaps.add(nextOwner.id)
    }
    if (previousOwner?.kind === 'mindmap') {
      input.queue.mindmaps.add(previousOwner.id)
    }

    fanoutNodeGeometry({
      context: input.context,
      owner: nextOwner,
      queue: input.queue,
      nodeId
    })
    if (previousOwner?.kind === 'group') {
      input.queue.groups.add(previousOwner.id)
    }
  })
}

const patchStandaloneNodes = (
  context: GraphPhaseContext,
  queue: GraphPatchQueue
): number => {
  const deferred = new Set<NodeId>()
  let count = 0

  drainQueue(queue.nodes).forEach((nodeId) => {
    const owner = context.working.indexes.ownerByNode.get(nodeId)
      ?? context.working.graph.nodes.get(nodeId)?.base.owner
    if (owner?.kind === 'mindmap') {
      deferred.add(nodeId)
      return
    }

    const result = patchNode({
      input: context.input,
      working: context.working,
      delta: context.working.delta.graph,
      nodeId
    })
    if (result.changed) {
      count += 1
    }
    if (result.geometryChanged) {
      fanoutNodeGeometry({
        context,
        owner: result.owner,
        queue,
        nodeId
      })
    }
  })

  deferred.forEach((nodeId) => {
    queue.nodes.add(nodeId)
  })

  return count
}

const patchMindmaps = (
  context: GraphPhaseContext,
  queue: GraphPatchQueue
): number => {
  let count = 0

  drainQueue(queue.mindmaps).forEach((mindmapId) => {
    const result = patchMindmap({
      input: context.input,
      working: context.working,
      delta: context.working.delta.graph,
      mindmapId
    })
    if (result.changed) {
      count += 1
    }
    enqueueAll(queue.nodes, result.changedNodeIds)
  })

  return count
}

const patchMindmapMemberNodes = (
  context: GraphPhaseContext,
  queue: GraphPatchQueue
): number => {
  let count = 0

  drainQueue(queue.nodes).forEach((nodeId) => {
    const result = patchNode({
      input: context.input,
      working: context.working,
      delta: context.working.delta.graph,
      nodeId
    })
    if (result.changed) {
      count += 1
    }
    if (result.geometryChanged) {
      fanoutNodeGeometry({
        context,
        owner: result.owner,
        queue,
        nodeId
      })
    }
  })

  return count
}

const patchEdges = (
  context: GraphPhaseContext,
  queue: GraphPatchQueue
): number => {
  let count = 0

  drainQueue(queue.edges).forEach((edgeId) => {
    if (patchEdge({
      input: context.input,
      working: context.working,
      delta: context.working.delta.graph,
      edgeId
    }).changed) {
      count += 1
    }
  })

  return count
}

const patchGroups = (
  context: GraphPhaseContext,
  queue: GraphPatchQueue
): number => {
  let count = 0

  drainQueue(queue.groups).forEach((groupId) => {
    if (patchGroup({
      input: context.input,
      working: context.working,
      delta: context.working.delta.graph,
      groupId
    }).changed) {
      count += 1
    }
  })

  return count
}

const isSpatialGraphPatchRequired = (
  context: GraphPhaseContext
): boolean => {
  const delta = context.working.delta.graph
  return context.scope.reset
    || delta.order
    || hasGraphPublishDelta(context.working.publish.graph.delta)
    || delta.geometry.nodes.size > 0
    || delta.geometry.edges.size > 0
    || delta.geometry.mindmaps.size > 0
}

export const graphPhase: ProjectorPhase<
  'graph',
  GraphPhaseContext,
  { count: number },
  EditorPhaseName,
  EditorPhaseScopeMap
> = {
  name: 'graph',
  deps: [],
  scope: graphPhaseScope,
  run: (context) => {
    const queue = createGraphPatchQueue()
    const delta = context.working.delta.graph
    const publish = context.working.publish.graph
    const revision = context.previous.revision + 1

    resetGraphDelta(delta)
    delta.revision = revision
    delta.order = context.scope.reset || context.scope.order

    patchIndexState({
      state: context.working.indexes,
      previous: context.input.document.previous?.document,
      next: context.input.document.snapshot.document,
      delta: context.input.document.delta
    })

    seedGraphPatchQueue({
      context: {
        ...context,
        scope: context.scope
      },
      queue,
      reset: context.scope.reset
    })
    preFanoutSeeds({
      context: {
        ...context,
        scope: context.scope
      },
      queue,
      reset: context.scope.reset
    })

    const count = (
      patchStandaloneNodes(context, queue)
      + patchMindmaps(context, queue)
      + patchMindmapMemberNodes(context, queue)
      + patchEdges(context, queue)
      + patchGroups(context, queue)
    )

    context.working.revision.document = context.input.document.snapshot.revision

    writeGraphPublishDelta({
      source: delta,
      target: publish.delta
    })
    publish.revision = hasGraphPublishDelta(publish.delta)
      ? revision
      : 0

    if (readItemsChangedFromGraphDelta(delta)) {
      context.working.items = buildItems(
        context.input.document.snapshot
      )
    }

    const uiScope = readUiPlanScope({
      reset: context.scope.reset,
      input: context.input,
      previous: context.previous,
      graphDelta: delta,
      readMindmapNodeIds: (mindmapId) => (
        context.working.graph.owners.mindmaps.get(mindmapId)?.structure.nodeIds
        ?? context.previous.graph.owners.mindmaps.byId.get(mindmapId)?.structure.nodeIds
      )
    })

    const emit: ProjectorPhaseScopeInput<
      EditorPhaseName,
      EditorPhaseScopeMap
    > = {}
    if (isSpatialGraphPatchRequired({
      ...context,
      scope: context.scope
    })) {
      emit.spatial = {
        reset: context.scope.reset,
        graph: true
      }
    }
    emit.ui = uiScope

    return {
      action: count > 0
        ? 'sync'
        : 'reuse',
      metrics: {
        count
      },
      emit
    }
  }
}
