import { err, ok } from '@whiteboard/core/result'
import { mutationTrace } from '@shared/core'
import type {
  Invalidation,
  KernelReadImpact,
  NodeId,
  EdgeId,
  GroupId,
  MindmapId,
  Operation
} from '@whiteboard/core/types'
import {
  createChangeSet,
  createInvalidation,
  materializeDraftDocument
} from '@whiteboard/core/kernel/reduce/runtime'
import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'

const EMPTY_NODE_IDS: readonly NodeId[] = []
const EMPTY_EDGE_IDS: readonly EdgeId[] = []

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
  facts: readonly mutationTrace.MutationTraceFact[]
  entities: {
    touchedNodeCount?: mutationTrace.MutationTraceCount
    touchedEdgeCount?: mutationTrace.MutationTraceCount
    touchedGroupCount?: mutationTrace.MutationTraceCount
    touchedMindmapCount?: mutationTrace.MutationTraceCount
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
  const touchedNodeCount = mutationTrace.toTouchedCount(invalidation.nodes)
  const touchedEdgeCount = mutationTrace.toTouchedCount(invalidation.edges)
  const touchedGroupCount = mutationTrace.toTouchedCount(invalidation.groups)
  const touchedMindmapCount = mutationTrace.toTouchedCount(invalidation.mindmaps)
  const trace = mutationTrace.createMutationTrace<
    InvalidationTraceSummary['summary'],
    InvalidationTraceSummary['entities']
  >({
    summary: {
      reset: invalidation.document,
      document: invalidation.document || invalidation.background,
      background: invalidation.background,
      canvasOrder: invalidation.canvasOrder,
      nodes: invalidation.document || mutationTrace.hasTouchedCount(touchedNodeCount),
      edges: invalidation.document || mutationTrace.hasTouchedCount(touchedEdgeCount),
      groups: invalidation.document || mutationTrace.hasTouchedCount(touchedGroupCount),
      mindmaps: invalidation.document || mutationTrace.hasTouchedCount(touchedMindmapCount)
    },
    entities: {
      touchedNodeCount: undefined,
      touchedEdgeCount: undefined,
      touchedGroupCount: undefined,
      touchedMindmapCount: undefined
    }
  })

  trace.addFact('document.reset', invalidation.document)
  trace.addFact('document.background', invalidation.background)
  trace.addFact('canvas.order', invalidation.canvasOrder)
  trace.addFact('node.touch', invalidation.nodes)
  trace.addFact('edge.touch', invalidation.edges)
  trace.addFact('group.touch', invalidation.groups)
  trace.addFact('mindmap.touch', invalidation.mindmaps)
  trace.setEntity('touchedNodeCount', touchedNodeCount)
  trace.setEntity('touchedEdgeCount', touchedEdgeCount)
  trace.setEntity('touchedGroupCount', touchedGroupCount)
  trace.setEntity('touchedMindmapCount', touchedMindmapCount)

  return trace.finish()
}

export const deriveImpact = (
  invalidation: Invalidation
): KernelReadImpact => {
  const trace = summarizeInvalidation(invalidation)
  const nodeIds = [...invalidation.nodes]
  const edgeIds = [...invalidation.edges]
  const reset = trace.summary.reset
  const nodeTouched = mutationTrace.hasTouchedCount(trace.entities.touchedNodeCount)
  const edgeTouched = mutationTrace.hasTouchedCount(trace.entities.touchedEdgeCount)
  const mindmapTouched = mutationTrace.hasTouchedCount(trace.entities.touchedMindmapCount)

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

export const createCommitApi = (
  tx: ReducerTx
) => ({
  result: () => {
    if (tx._runtime.shortCircuit) {
      return tx._runtime.shortCircuit
    }

    const invalidation = tx._runtime.dirty
    return ok({
      doc: materializeDraftDocument(tx._runtime.draft),
      changes: tx._runtime.changes,
      invalidation,
      inverse: tx.inverse.finish(),
      history: {
        footprint: tx._runtime.history.footprint.finish()
      },
      impact: deriveImpact(invalidation)
    })
  }
})

export const createDocumentReplaceResult = (
  tx: ReducerTx,
  document: import('@whiteboard/core/types').Document
) => {
  tx._runtime.shortCircuit = ok({
    doc: document,
    changes: {
      ...createChangeSet(),
      document: true,
      background: true,
      canvasOrder: true
    },
    invalidation: {
      ...createInvalidation(),
      document: true,
      background: true,
      canvasOrder: true
    },
    inverse: tx.inverse.finish(),
    history: {
      footprint: []
    },
    impact: RESET_READ_IMPACT
  })
}
