import type { MindmapId, NodeId } from '@whiteboard/core/types'
import { patchEdge } from '../domain/graphPatch/edge'
import {
  createGraphPatchQueue,
  preFanoutSeeds,
  seedGraphPatchQueue
} from '../domain/graphPatch/fanout'
import { patchGroup } from '../domain/graphPatch/group'
import { patchMindmap } from '../domain/graphPatch/mindmap'
import { patchNode } from '../domain/graphPatch/node'
import { patchIndexState } from '../domain/indexes'
import { resetGraphDelta } from '../domain/graphPatch/delta'
import {
  type EditorGraphPhase,
  defineEditorGraphPhase,
  toPhaseMetrics
} from '../projector/context'
import {
  hasGraphPublishDelta,
  writeGraphPublishDelta
} from '../projector/publish/delta'
import {
  createGraphPatchScope,
  mergeGraphPatchScope,
  normalizeGraphPatchScope
} from '../projector/scopes/graphScope'
import { createSpatialPatchScope } from '../projector/scopes/spatialScope'
import {
  createMindmapNodeIndexFromState,
  createUiPatchScope,
  hasUiPatchScope
} from '../projector/scopes/uiScope'

type GraphPhaseContext = Parameters<EditorGraphPhase<'graph'>['run']>[0]

const drainQueue = <TId extends string>(
  queue: Set<TId>
): readonly TId[] => {
  const ids = [...queue]
  queue.clear()
  return ids
}

const patchStandaloneNodes = (
  context: GraphPhaseContext,
  queue: ReturnType<typeof createGraphPatchQueue>
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
  context: GraphPhaseContext,
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
  context: GraphPhaseContext,
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
  context: GraphPhaseContext,
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
  context: GraphPhaseContext,
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

export const graphPhase = defineEditorGraphPhase({
  name: 'graph',
  deps: [],
  mergeScope: mergeGraphPatchScope,
  run: (context) => {
    const scope = normalizeGraphPatchScope(context.scope)
    const queue = createGraphPatchQueue()
    const delta = context.working.delta.graph
    const publish = context.working.publish.graph
    const revision = context.previous.revision + 1

    resetGraphDelta(delta)
    delta.revision = revision
    delta.order = scope.reset || scope.order

    patchIndexState({
      state: context.working.indexes,
      previous: context.input.document.previous?.document,
      next: context.input.document.snapshot.document,
      delta: context.input.document.delta
    })

    seedGraphPatchQueue({
      snapshot: context.input.document.snapshot,
      working: context.working.graph,
      scope,
      queue
    })
    preFanoutSeeds({
      indexes: context.working.indexes,
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

    writeGraphPublishDelta({
      source: delta,
      target: publish.delta
    })
    publish.revision = hasGraphPublishDelta(publish.delta)
      ? revision
      : 0

    const uiScope = createUiPatchScope({
      reset: scope.reset,
      input: context.input,
      previous: context.previous,
      graphDelta: delta,
      mindmapNodeIndex: createMindmapNodeIndexFromState({
        previous: context.previous,
        working: context.working
      })
    })

    return {
      action: 'sync',
      metrics: toPhaseMetrics(count),
      emit: {
        spatial: createSpatialPatchScope({
          reset: scope.reset,
          graph: true
        }),
        ...(hasUiPatchScope(uiScope)
          ? {
              ui: uiScope
            }
          : {})
      }
    }
  }
})
