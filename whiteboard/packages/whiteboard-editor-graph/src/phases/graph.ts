import type { MindmapId, NodeId } from '@whiteboard/core/types'
import type { GraphEditorPhase } from './shared'
import { toMetric } from './shared'
import { patchEdge } from '../runtime/graphPatch/edge'
import {
  createGraphPatchQueue,
  preFanoutSeeds,
  seedGraphPatchQueue
} from '../runtime/graphPatch/fanout'
import { patchGroup } from '../runtime/graphPatch/group'
import { patchMindmap } from '../runtime/graphPatch/mindmap'
import { patchNode } from '../runtime/graphPatch/node'
import {
  mergeGraphPatchScope,
  normalizeGraphPatchScope
} from '../runtime/graphPatch/scope'
import { resetGraphDelta } from '../runtime/graphPatch/delta'

const drainQueue = <TId extends string>(
  queue: Set<TId>
): readonly TId[] => {
  const ids = [...queue]
  queue.clear()
  return ids
}

const patchStandaloneNodes = (
  context: Parameters<GraphEditorPhase['run']>[0],
  queue: ReturnType<typeof createGraphPatchQueue>
): number => {
  const deferred = new Set<NodeId>()
  let count = 0

  drainQueue(queue.nodes).forEach((nodeId) => {
    const owner = context.input.document.snapshot.state.facts.relations.nodeOwner.get(nodeId)
      ?? context.working.graph.nodes.get(nodeId)?.base.owner
    if (owner?.kind === 'mindmap') {
      deferred.add(nodeId)
      return
    }

    if (patchNode({
      input: context.input,
      working: context.working,
      queue,
      delta: context.working.delta.graph,
      nodeId
    })) {
      count += 1
    }
  })

  deferred.forEach((nodeId) => {
    queue.nodes.add(nodeId)
  })

  return count
}

const patchMindmaps = (
  context: Parameters<GraphEditorPhase['run']>[0],
  queue: ReturnType<typeof createGraphPatchQueue>
): number => {
  let count = 0

  drainQueue(queue.mindmaps).forEach((mindmapId) => {
    if (patchMindmap({
      input: context.input,
      working: context.working,
      queue,
      delta: context.working.delta.graph,
      mindmapId: mindmapId as MindmapId
    })) {
      count += 1
    }
  })

  return count
}

const patchMindmapMemberNodes = (
  context: Parameters<GraphEditorPhase['run']>[0],
  queue: ReturnType<typeof createGraphPatchQueue>
): number => {
  let count = 0

  drainQueue(queue.nodes).forEach((nodeId) => {
    if (patchNode({
      input: context.input,
      working: context.working,
      queue,
      delta: context.working.delta.graph,
      nodeId
    })) {
      count += 1
    }
  })

  return count
}

const patchEdges = (
  context: Parameters<GraphEditorPhase['run']>[0],
  queue: ReturnType<typeof createGraphPatchQueue>
): number => {
  let count = 0

  drainQueue(queue.edges).forEach((edgeId) => {
    if (patchEdge({
      input: context.input,
      working: context.working,
      delta: context.working.delta.graph,
      edgeId
    })) {
      count += 1
    }
  })

  return count
}

const patchGroups = (
  context: Parameters<GraphEditorPhase['run']>[0],
  queue: ReturnType<typeof createGraphPatchQueue>
): number => {
  let count = 0

  drainQueue(queue.groups).forEach((groupId) => {
    if (patchGroup({
      input: context.input,
      working: context.working,
      delta: context.working.delta.graph,
      groupId
    })) {
      count += 1
    }
  })

  return count
}

export const createGraphPhase = (): GraphEditorPhase => ({
  name: 'graph',
  deps: [],
  mergeScope: mergeGraphPatchScope,
  run: (context) => {
    const scope = normalizeGraphPatchScope(context.scope)
    const queue = createGraphPatchQueue()
    const delta = context.working.delta.graph

    resetGraphDelta(delta)
    delta.order = scope.reset || scope.order

    seedGraphPatchQueue({
      snapshot: context.input.document.snapshot,
      working: context.working.graph,
      scope,
      queue
    })
    preFanoutSeeds({
      snapshot: context.input.document.snapshot,
      working: context.working.graph,
      scope,
      queue
    })

    const count = (
      patchStandaloneNodes(context, queue)
      + patchMindmaps(context, queue)
      + patchMindmapMemberNodes(context, queue)
      + patchEdges(context, queue)
      + patchGroups(context, queue)
    )

    context.working.revision.document = context.input.document.snapshot.revision

    return {
      action: 'sync',
      change: undefined,
      metrics: toMetric(count)
    }
  }
})
