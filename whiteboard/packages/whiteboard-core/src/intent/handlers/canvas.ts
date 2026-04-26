import { createCanvasOrderMoveOps, reorderCanvasRefs } from '@whiteboard/core/canvas/ops'
import { document as documentApi } from '@whiteboard/core/document'
import { resolveLockDecision } from '@whiteboard/core/lock'
import { getNodeMindmapId, isMindmapRoot } from '@whiteboard/core/mindmap/ops'
import { node as nodeApi } from '@whiteboard/core/node'
import type {
  CanvasItemRef,
  Document
} from '@whiteboard/core/types'
import type { WhiteboardIntentContext } from '@whiteboard/core/intent/context'
import type { CanvasIntent } from '@whiteboard/core/intent/types'
import {
  emitEdgeMovePatchOps
} from './edge'

const failLockedModification = (
  ctx: WhiteboardIntentContext,
  reason?: import('@whiteboard/core/lock').LockDecisionReason
) => ctx.tx.fail.cancelled(
  reason === 'locked-node'
    ? 'Locked nodes cannot be modified.'
    : reason === 'locked-edge'
      ? 'Locked edges cannot be modified.'
      : 'Locked node relations cannot be modified.'
)

export const compileCanvasDelete = (
  refs: readonly CanvasItemRef[],
  ctx: WhiteboardIntentContext
) => {
  const document = ctx.tx.read.document.get()
  const decision = resolveLockDecision({
    document,
    target: {
      kind: 'refs',
      refs,
      includeEdgeRelations: true
    }
  })
  if (!decision.allowed) {
    return ctx.tx.fail.cancelled(
      decision.reason === 'locked-node'
        ? 'Locked nodes cannot be modified.'
        : decision.reason === 'locked-edge'
          ? 'Locked edges cannot be modified.'
          : 'Locked node relations cannot be modified.'
    )
  }

  refs.forEach((ref) => {
    if (ref.kind === 'edge') {
      ctx.tx.emit({
        type: 'edge.delete',
        id: ref.id
      })
      return
    }

    const node = document.nodes[ref.id]
    const mindmapId = getNodeMindmapId(node)
    if (!mindmapId) {
      ctx.tx.emit({
        type: 'node.delete',
        id: ref.id
      })
      return
    }

    ctx.tx.emit(
      isMindmapRoot(document, node)
        ? {
            type: 'mindmap.delete',
            id: mindmapId
          }
        : {
            type: 'mindmap.topic.delete',
            id: mindmapId,
            input: {
              nodeId: ref.id
            }
          }
    )
  })
}

export const compileCanvasDuplicate = (
  refs: readonly CanvasItemRef[],
  ctx: WhiteboardIntentContext
) => {
  const document = ctx.tx.read.document.get()
  const decision = resolveLockDecision({
    document,
    target: {
      kind: 'refs',
      refs,
      includeEdgeRelations: true
    }
  })
  if (!decision.allowed) {
    return ctx.tx.fail.cancelled(
      decision.reason === 'locked-node'
        ? 'Locked nodes cannot be duplicated.'
        : decision.reason === 'locked-edge'
          ? 'Locked edges cannot be duplicated.'
          : 'Locked node relations cannot be duplicated.'
    )
  }

  const nodeIds = refs.filter((ref) => ref.kind === 'node').map((ref) => ref.id)
  if (nodeIds.some((nodeId) => getNodeMindmapId(document.nodes[nodeId]))) {
    return ctx.tx.fail.invalid('Mindmap duplication must use dedicated mindmap commands.')
  }

  const edgeIds = refs.filter((ref) => ref.kind === 'edge').map((ref) => ref.id)
  const exported = documentApi.slice.export.selection({
    doc: document,
    nodeIds,
    edgeIds
  })
  if (!exported.ok) {
    return ctx.tx.fail.invalid(exported.error.message, exported.error.details)
  }

  const built = documentApi.op.insertSlice({
    doc: document,
    slice: exported.data.slice,
    registries: ctx.registries,
    createNodeId: ctx.tx.ids.node,
    createEdgeId: ctx.tx.ids.edge,
    delta: {
      x: 24,
      y: 24
    },
    roots: exported.data.roots
  })
  if (!built.ok) {
    return ctx.tx.fail.invalid(built.error.message, built.error.details)
  }

  built.data.operations.forEach((op) => ctx.tx.emit(op))
  return {
    allNodeIds: built.data.allNodeIds,
    allEdgeIds: built.data.allEdgeIds,
    roots: built.data.roots
  }
}

const compileCanvasSelectionMove = (
  intent: Extract<CanvasIntent, { type: 'canvas.selection.move' }>,
  ctx: WhiteboardIntentContext
) => {
  const document = ctx.tx.read.document.get()

  for (const nodeId of new Set(intent.nodeIds)) {
    if (!documentApi.read.node(document, nodeId)) {
      return ctx.tx.fail.invalid(`Node ${nodeId} not found.`)
    }
  }
  for (const edgeId of new Set(intent.edgeIds)) {
    if (!documentApi.read.edge(document, edgeId)) {
      return ctx.tx.fail.invalid(`Edge ${edgeId} not found.`)
    }
  }

  const nodes = documentApi.list.nodes(document)
  const edges = documentApi.list.edges(document)
  const move = nodeApi.move.buildSet({
    nodes,
    ids: intent.nodeIds
  })
  const movedNodeIds = move.members.map((member) => member.id)
  const selectedEdgeIdSet = new Set(intent.edgeIds)
  const selectedEdges = edges.filter((edge) => selectedEdgeIdSet.has(edge.id))
  const followEdges = edges.filter((edge) => !selectedEdgeIdSet.has(edge.id))
  const followEffect = nodeApi.move.resolveEffect({
    edges: followEdges,
    move,
    delta: intent.delta
  })
  const selectedEdgeChanges = nodeApi.move.buildCommit({
    delta: intent.delta,
    edgePlan: {
      dragged: selectedEdges,
      follow: []
    }
  }).edges

  const nodeDecision = resolveLockDecision({
    document,
    target: {
      kind: 'nodes',
      nodeIds: movedNodeIds
    }
  })
  if (!nodeDecision.allowed) {
    return failLockedModification(ctx, nodeDecision.reason)
  }

  const touchedEdgeIds = [
    ...selectedEdges.map((edge) => edge.id),
    ...followEffect.edges.map((entry) => entry.id)
  ]
  const edgeDecision = resolveLockDecision({
    document,
    target: {
      kind: 'edge-ids',
      edgeIds: touchedEdgeIds
    }
  })
  if (!edgeDecision.allowed) {
    return failLockedModification(ctx, edgeDecision.reason)
  }

  const movedMemberIdSet = new Set(movedNodeIds)
  const movedMindmapIds = new Set<string>()
  const positions = nodeApi.move.projectPositions(move.members, intent.delta)

  for (const entry of positions) {
    const node = documentApi.read.node(document, entry.id)
    if (!node) {
      continue
    }

    const mindmapId = getNodeMindmapId(node)
    if (!mindmapId) {
      if (
        node.position.x !== entry.position.x
        || node.position.y !== entry.position.y
      ) {
        ctx.tx.emit({
          type: 'node.field.set',
          id: node.id,
          field: 'position',
          value: entry.position
        })
      }
      continue
    }

    const rootId = document.mindmaps[mindmapId]?.root
    if (!rootId) {
      throw new Error(`Mindmap ${mindmapId} root missing.`)
    }

    if (rootId !== node.id) {
      if (!movedMemberIdSet.has(rootId)) {
        return ctx.tx.fail.invalid('Mindmap member move must use mindmap drag.')
      }
      continue
    }

    if (movedMindmapIds.has(mindmapId)) {
      continue
    }
    movedMindmapIds.add(mindmapId)
    ctx.tx.emit({
      type: 'mindmap.move',
      id: mindmapId,
      position: entry.position
    })
  }

  selectedEdgeChanges.forEach((entry) => {
    const edge = documentApi.read.edge(document, entry.id)
    if (!edge) {
      return
    }
    emitEdgeMovePatchOps(edge, entry.patch, ctx)
  })

  followEffect.edges.forEach((entry) => {
    const edge = documentApi.read.edge(document, entry.id)
    if (!edge) {
      return
    }
    emitEdgeMovePatchOps(edge, entry.patch, ctx)
  })
}

export const compileCanvasIntent = (
  intent: CanvasIntent,
  ctx: WhiteboardIntentContext
) => {
  switch (intent.type) {
    case 'canvas.delete':
      return compileCanvasDelete(intent.refs, ctx)
    case 'canvas.duplicate':
      return compileCanvasDuplicate(intent.refs, ctx)
    case 'canvas.selection.move':
      return compileCanvasSelectionMove(intent, ctx)
    case 'canvas.order.move': {
      const current = documentApi.list.canvasRefs(ctx.tx.read.document.get())
      const target = reorderCanvasRefs(current, intent.refs, intent.mode)
      createCanvasOrderMoveOps(current, target).forEach((op) => ctx.tx.emit(op))
      return
    }
  }
}
