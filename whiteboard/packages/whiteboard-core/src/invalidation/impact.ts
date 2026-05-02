import {
  trace as sharedTrace
} from '@shared/trace'
import type {
  TraceCount,
  TraceFact
} from '@shared/trace'
import type {
  EdgeId,
  Invalidation,
  KernelReadImpact,
  NodeId
} from '@whiteboard/core/types'

const EMPTY_NODE_IDS: readonly NodeId[] = []
const EMPTY_EDGE_IDS: readonly EdgeId[] = []

export const invalidationTraceSpec = {
  summary: {
    reset: 'flag',
    document: 'flag',
    background: 'flag',
    order: 'flag',
    nodes: 'flag',
    edges: 'flag',
    groups: 'flag',
    mindmaps: 'flag'
  },
  entities: {
    touchedNodeCount: 'count',
    touchedEdgeCount: 'count',
    touchedGroupCount: 'count',
    touchedMindmapCount: 'count'
  }
} as const

export interface InvalidationTraceSummary {
  summary: {
    reset: boolean
    document: boolean
    background: boolean
    order: boolean
    nodes: boolean
    edges: boolean
    groups: boolean
    mindmaps: boolean
  }
  facts: readonly TraceFact[]
  entities: {
    touchedNodeCount?: TraceCount
    touchedEdgeCount?: TraceCount
    touchedGroupCount?: TraceCount
    touchedMindmapCount?: TraceCount
  }
}

export const RESET_READ_IMPACT: KernelReadImpact = {
  reset: true,
  document: false,
  node: {
    ids: EMPTY_NODE_IDS,
    geometry: false,
    list: false,
    value: false
  },
  edge: {
    ids: EMPTY_EDGE_IDS,
    nodeIds: EMPTY_NODE_IDS,
    geometry: false,
    list: false,
    value: false
  }
}

export const summarizeInvalidation = (
  invalidation: Invalidation
): InvalidationTraceSummary => {
  const touchedNodeCount = sharedTrace.count(invalidation.nodes)
  const touchedEdgeCount = sharedTrace.count(invalidation.edges)
  const touchedGroupCount = sharedTrace.count(invalidation.groups)
  const touchedMindmapCount = sharedTrace.count(invalidation.mindmaps)
  const summary = sharedTrace.create({
    spec: invalidationTraceSpec,
    summary: {
      reset: invalidation.document,
      document: invalidation.document || invalidation.background,
      background: invalidation.background,
      order: invalidation.order,
      nodes: invalidation.document || sharedTrace.has(touchedNodeCount),
      edges: invalidation.document || sharedTrace.has(touchedEdgeCount),
      groups: invalidation.document || sharedTrace.has(touchedGroupCount),
      mindmaps: invalidation.document || sharedTrace.has(touchedMindmapCount)
    },
    entities: {
      touchedNodeCount: undefined,
      touchedEdgeCount: undefined,
      touchedGroupCount: undefined,
      touchedMindmapCount: undefined
    }
  })

  summary.addFact('document.reset', invalidation.document)
  summary.addFact('document.background', invalidation.background)
  summary.addFact('document.order', invalidation.order)
  summary.addFact('node.touch', invalidation.nodes)
  summary.addFact('edge.touch', invalidation.edges)
  summary.addFact('group.touch', invalidation.groups)
  summary.addFact('mindmap.touch', invalidation.mindmaps)
  summary.setEntity('touchedNodeCount', touchedNodeCount)
  summary.setEntity('touchedEdgeCount', touchedEdgeCount)
  summary.setEntity('touchedGroupCount', touchedGroupCount)
  summary.setEntity('touchedMindmapCount', touchedMindmapCount)

  return summary.finish()
}

export const deriveImpact = (
  invalidation: Invalidation
): KernelReadImpact => {
  const trace = summarizeInvalidation(invalidation)
  const nodeIds = [...invalidation.nodes]
  const edgeIds = [...invalidation.edges]
  const reset = trace.summary.reset
  const nodeTouched = sharedTrace.has(trace.entities.touchedNodeCount)
  const edgeTouched = sharedTrace.has(trace.entities.touchedEdgeCount)
  const mindmapTouched = sharedTrace.has(trace.entities.touchedMindmapCount)

  return {
    reset,
    document: trace.summary.document,
    node: {
      ids: reset ? EMPTY_NODE_IDS : nodeIds,
      geometry: reset || trace.summary.order || mindmapTouched || nodeTouched,
      list: reset || trace.summary.order,
      value: reset || mindmapTouched || nodeTouched
    },
    edge: {
      ids: reset ? EMPTY_EDGE_IDS : edgeIds,
      nodeIds: reset ? EMPTY_NODE_IDS : nodeIds,
      geometry: reset || trace.summary.order || nodeTouched || edgeTouched,
      list: reset || trace.summary.order,
      value: reset || nodeTouched || edgeTouched
    }
  }
}
