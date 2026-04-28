import type { MutationCompileHandlerTable } from '@shared/mutation'
import { document as documentApi } from '@whiteboard/core/document'
import { getNodeMindmapId, isMindmapRoot } from '@whiteboard/core/mindmap/ops'
import { node as nodeApi } from '@whiteboard/core/node'
import type { WhiteboardCompileScope } from '@whiteboard/core/operations/compile/scope'
import type {
  CanvasIntent,
  WhiteboardMutationTable
} from '@whiteboard/core/operations/intent-types'
import { resolveLockDecision } from '@whiteboard/core/operations/lock'
import { canvasOrderMove } from '@whiteboard/core/operations/plan'
import type { CanvasItemRef } from '@whiteboard/core/types'
import { emitEdgeMovePatchOps } from './edge'

const failLockedModification = (
  ctx: WhiteboardCompileScope,
  reason?: import('@whiteboard/core/operations/lock').LockDecisionReason
) => ctx.fail.cancelled(
  reason === 'locked-node'
    ? 'Locked nodes cannot be modified.'
    : reason === 'locked-edge'
      ? 'Locked edges cannot be modified.'
      : 'Locked node relations cannot be modified.'
)

export const compileCanvasDelete = (
  refs: readonly CanvasItemRef[],
  ctx: WhiteboardCompileScope
) => {
  const document = ctx.read.document()
  const decision = resolveLockDecision({
    document,
    target: {
      kind: 'refs',
      refs,
      includeEdgeRelations: true
    }
  })
  if (!decision.allowed) {
    return ctx.fail.cancelled(
      decision.reason === 'locked-node'
        ? 'Locked nodes cannot be modified.'
        : decision.reason === 'locked-edge'
          ? 'Locked edges cannot be modified.'
          : 'Locked node relations cannot be modified.'
    )
  }

  refs.forEach((ref) => {
    if (ref.kind === 'edge') {
      ctx.emit({
        type: 'edge.delete',
        id: ref.id
      })
      return
    }

    const node = document.nodes[ref.id]
    const mindmapId = getNodeMindmapId(node)
    if (!mindmapId) {
      ctx.emit({
        type: 'node.delete',
        id: ref.id
      })
      return
    }

    ctx.emit(
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
  ctx: WhiteboardCompileScope
) => {
  const document = ctx.read.document()
  const decision = resolveLockDecision({
    document,
    target: {
      kind: 'refs',
      refs,
      includeEdgeRelations: true
    }
  })
  if (!decision.allowed) {
    return ctx.fail.cancelled(
      decision.reason === 'locked-node'
        ? 'Locked nodes cannot be duplicated.'
        : decision.reason === 'locked-edge'
          ? 'Locked edges cannot be duplicated.'
          : 'Locked node relations cannot be duplicated.'
    )
  }

  const nodeIds = refs.filter((ref) => ref.kind === 'node').map((ref) => ref.id)
  if (nodeIds.some((nodeId) => getNodeMindmapId(document.nodes[nodeId]))) {
    return ctx.fail.invalid('Mindmap duplication must use dedicated mindmap commands.')
  }

  const edgeIds = refs.filter((ref) => ref.kind === 'edge').map((ref) => ref.id)
  const exported = documentApi.slice.export.selection({
    doc: document,
    nodeIds,
    edgeIds
  })
  if (!exported.ok) {
    return ctx.fail.invalid(exported.error.message, exported.error.details)
  }

  const built = documentApi.slice.insert.ops({
    doc: document,
    slice: exported.data.slice,
    registries: ctx.registries,
    createNodeId: ctx.ids.node,
    createEdgeId: ctx.ids.edge,
    delta: {
      x: 24,
      y: 24
    },
    roots: exported.data.roots
  })
  if (!built.ok) {
    return ctx.fail.invalid(built.error.message, built.error.details)
  }

  built.data.operations.forEach((op) => ctx.emit(op))
  return {
    allNodeIds: built.data.allNodeIds,
    allEdgeIds: built.data.allEdgeIds,
    roots: built.data.roots
  }
}

const compileCanvasSelectionMove = (
  intent: Extract<CanvasIntent, { type: 'canvas.selection.move' }>,
  ctx: WhiteboardCompileScope
) => {
  const document = ctx.read.document()

  for (const nodeId of new Set(intent.nodeIds)) {
    if (!document.nodes[nodeId]) {
      return ctx.fail.invalid(`Node ${nodeId} not found.`)
    }
  }
  for (const edgeId of new Set(intent.edgeIds)) {
    if (!document.edges[edgeId]) {
      return ctx.fail.invalid(`Edge ${edgeId} not found.`)
    }
  }

  const nodes = Object.values(document.nodes)
  const edges = Object.values(document.edges)
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
    const node = document.nodes[entry.id]
    if (!node) {
      continue
    }

    const mindmapId = getNodeMindmapId(node)
    if (!mindmapId) {
      if (
        node.position.x !== entry.position.x
        || node.position.y !== entry.position.y
      ) {
        ctx.emit({
          type: 'node.patch',
          id: node.id,
          fields: {
            position: entry.position
          }
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
        return ctx.fail.invalid('Mindmap member move must use mindmap drag.')
      }
      continue
    }

    if (movedMindmapIds.has(mindmapId)) {
      continue
    }

    movedMindmapIds.add(mindmapId)
    ctx.emit({
      type: 'mindmap.move',
      id: mindmapId,
      position: entry.position
    })
  }

  selectedEdgeChanges.forEach((entry) => {
    const edge = document.edges[entry.id]
    if (!edge) {
      return
    }
    emitEdgeMovePatchOps(edge, entry.patch, ctx)
  })

  followEffect.edges.forEach((entry) => {
    const edge = document.edges[entry.id]
    if (!edge) {
      return
    }
    emitEdgeMovePatchOps(edge, entry.patch, ctx)
  })
}

type CanvasIntentHandlers = Pick<
  MutationCompileHandlerTable<
    WhiteboardMutationTable,
    WhiteboardCompileScope,
    'invalid' | 'cancelled'
  >,
  'canvas.delete'
  | 'canvas.duplicate'
  | 'canvas.selection.move'
  | 'canvas.order.move'
>

export const canvasIntentHandlers: CanvasIntentHandlers = {
  'canvas.delete': (intent, ctx) => compileCanvasDelete(intent.refs, ctx),
  'canvas.duplicate': (intent, ctx) => compileCanvasDuplicate(intent.refs, ctx),
  'canvas.selection.move': (intent, ctx) => compileCanvasSelectionMove(intent, ctx),
  'canvas.order.move': (intent, ctx) => {
    const current = ctx.read.document().canvas.order
    const target = canvasOrderMove.reorder(current, intent.refs, intent.mode)
    canvasOrderMove.ops(current, target).forEach((op) => ctx.emit(op))
  }
}
