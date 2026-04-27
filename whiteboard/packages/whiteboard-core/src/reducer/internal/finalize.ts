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
  NodeId,
  Operation
} from '@whiteboard/core/types'
import type {
  WhiteboardReduceCtx,
  WhiteboardReduceExtra
} from '../types'
import { readWhiteboardReduceInternal } from '../context'
import {
  materializeDraftDocument
} from './state'

const EMPTY_NODE_IDS: readonly NodeId[] = []
const EMPTY_EDGE_IDS: readonly EdgeId[] = []

export const invalidationTraceSpec = {
  summary: {
    reset: 'flag',
    document: 'flag',
    background: 'flag',
    canvasOrder: 'flag',
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
    canvasOrder: boolean
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
      canvasOrder: invalidation.canvasOrder,
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
  summary.addFact('canvas.order', invalidation.canvasOrder)
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
      geometry: reset || trace.summary.canvasOrder || mindmapTouched || nodeTouched,
      list: reset || trace.summary.canvasOrder,
      value: reset || mindmapTouched || nodeTouched
    },
    edge: {
      ids: reset ? EMPTY_EDGE_IDS : edgeIds,
      nodeIds: reset ? EMPTY_NODE_IDS : nodeIds,
      geometry: reset || trace.summary.canvasOrder || nodeTouched || edgeTouched,
      list: reset || trace.summary.canvasOrder,
      value: reset || nodeTouched || edgeTouched
    }
  }
}

export const readLockViolationMessage = (
  reason: 'locked-node' | 'locked-edge' | 'locked-relation',
  operation: Operation
) => {
  const action = (
    operation.type === 'node.create'
    || operation.type === 'edge.create'
  )
    ? 'duplicated'
    : 'modified'

  if (reason === 'locked-node') {
    return `Locked nodes cannot be ${action}.`
  }
  if (reason === 'locked-edge') {
    return `Locked edges cannot be ${action}.`
  }
  return `Locked node relations cannot be ${action}.`
}

export const finishWhiteboardReduce = (
  ctx: WhiteboardReduceCtx
): WhiteboardReduceExtra => {
  const internal = readWhiteboardReduceInternal(ctx)
  const { state } = internal

  const doc = materializeDraftDocument(state.draft)
  const invalidation = state.invalidation
  internal.base.replace(doc)
  return {
    changes: state.changes,
    invalidation,
    impact: state.replaced
      ? RESET_READ_IMPACT
      : deriveImpact(invalidation)
  }
}
