import { document as documentApi } from '@whiteboard/core/document'
import { getNodeMindmapId } from '@whiteboard/core/mindmap/ops'
import { node as nodeApi } from '@whiteboard/core/node'
import type {
  WhiteboardCompileIntent,
  WhiteboardCompileContext,
  WhiteboardCompileHandlerTable
} from '@whiteboard/core/mutation/compile/helpers'
import {
  readCompileRegistries,
  readCompileServices,
} from '@whiteboard/core/mutation/compile/helpers'
import {
  emitMindmapDelete,
  emitMindmapMove,
  emitMindmapTopicDelete,
} from '@whiteboard/core/mutation/compile/mindmap'
import { resolveLockDecision } from '@whiteboard/core/mutation/lock'
import type {
  CanvasItemRef,
  Edge
} from '@whiteboard/core/types'
import { emitEdgeMovePatchOps } from './edge'
import {
  canvasRefKey,
  toCanvasOrderAnchor
} from '@whiteboard/core/mutation/support'

const failLockedModification = (
  ctx: WhiteboardCompileContext,
  reason?: import('@whiteboard/core/mutation/lock').LockDecisionReason
) => ctx.cancelled(
  reason === 'locked-node'
    ? 'Locked nodes cannot be modified.'
    : reason === 'locked-edge'
      ? 'Locked edges cannot be modified.'
      : 'Locked node relations cannot be modified.'
)

const sameCanvasRef = (
  left: CanvasItemRef,
  right: CanvasItemRef
) => left.kind === right.kind && left.id === right.id

export const compileCanvasDelete = (
  refs: readonly CanvasItemRef[],
  ctx: WhiteboardCompileContext
) => {
  const decision = resolveLockDecision({
    reader: ctx.reader,
    target: {
      kind: 'refs',
      refs,
      includeEdgeRelations: true
    }
  })
  if (!decision.allowed) {
    return ctx.cancelled(
      decision.reason === 'locked-node'
        ? 'Locked nodes cannot be modified.'
        : decision.reason === 'locked-edge'
          ? 'Locked edges cannot be modified.'
          : 'Locked node relations cannot be modified.'
    )
  }

  refs.forEach((ref) => {
    if (ref.kind === 'edge') {
      ctx.writer.edge.delete(ref.id)
      return
    }

    const node = ctx.reader.node.get(ref.id)
    const mindmapId = getNodeMindmapId(node)
    if (!mindmapId) {
      ctx.writer.node.delete(ref.id)
      return
    }

    if (ctx.query.mindmap.isRoot(ref.id)) {
      emitMindmapDelete(ctx, mindmapId)
      return
    }

    emitMindmapTopicDelete(ctx, mindmapId, ref.id)
  })
}

export const compileCanvasDuplicate = (
  refs: readonly CanvasItemRef[],
  ctx: WhiteboardCompileContext
) => {
  const document = ctx.document
  const decision = resolveLockDecision({
    reader: ctx.reader,
    target: {
      kind: 'refs',
      refs,
      includeEdgeRelations: true
    }
  })
  if (!decision.allowed) {
    return ctx.cancelled(
      decision.reason === 'locked-node'
        ? 'Locked nodes cannot be duplicated.'
        : decision.reason === 'locked-edge'
          ? 'Locked edges cannot be duplicated.'
          : 'Locked node relations cannot be duplicated.'
    )
  }

  const nodeIds = refs.filter((ref) => ref.kind === 'node').map((ref) => ref.id)
  if (nodeIds.some((nodeId) => ctx.query.mindmap.byNode(nodeId))) {
    return ctx.invalid('Mindmap duplication must use dedicated mindmap commands.')
  }

  const edgeIds = refs.filter((ref) => ref.kind === 'edge').map((ref) => ref.id)
  const exported = documentApi.slice.export.selection({
    doc: document,
    nodeIds,
    edgeIds
  })
  if (!exported.ok) {
    return ctx.invalid(exported.error.message, exported.error.details)
  }

  const built = documentApi.slice.insert.ops({
    doc: document,
    slice: exported.data.slice,
    registries: readCompileRegistries(ctx),
    createNodeId: readCompileServices(ctx).ids.node,
    createEdgeId: readCompileServices(ctx).ids.edge,
    delta: {
      x: 24,
      y: 24
    },
    roots: exported.data.roots
  })
  if (!built.ok) {
    return ctx.invalid(built.error.message, built.error.details)
  }

  built.data.nodes.forEach((node) => {
    ctx.writer.node.create(node)
  })
  built.data.edges.forEach((edge) => {
    ctx.writer.edge.create(edge)
  })
  return {
    allNodeIds: built.data.allNodeIds,
    allEdgeIds: built.data.allEdgeIds,
    roots: built.data.roots
  }
}

const compileCanvasSelectionMove = (
  ctx: WhiteboardCompileContext<WhiteboardCompileIntent<'canvas.selection.move'>>
) => {
  const {
    intent,
    document
  } = ctx
  const reader = ctx.reader

  for (const nodeId of new Set(intent.nodeIds)) {
    if (!reader.node.has(nodeId)) {
      return ctx.invalid(`Node ${nodeId} not found.`)
    }
  }
  for (const edgeId of new Set(intent.edgeIds)) {
    if (!reader.edge.has(edgeId)) {
      return ctx.invalid(`Edge ${edgeId} not found.`)
    }
  }

  const nodes = reader.node.list()
  const edges = reader.edge.list()
  const move = nodeApi.move.buildSet({
    nodes,
    ids: intent.nodeIds
  })
  const movedNodeIds = move.members.map((member) => member.id)
  const selectedEdgeIdSet = new Set(intent.edgeIds)
  const selectedEdges = edges.filter((edge: Edge) => selectedEdgeIdSet.has(edge.id))
  const followEdges = edges.filter((edge: Edge) => !selectedEdgeIdSet.has(edge.id))
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
    reader,
    target: {
      kind: 'nodes',
      nodeIds: movedNodeIds
    }
  })
  if (!nodeDecision.allowed) {
    return failLockedModification(ctx, nodeDecision.reason)
  }

  const touchedEdgeIds = [
    ...selectedEdges.map((edge: Edge) => edge.id),
    ...followEffect.edges.map((entry) => entry.id)
  ]
  const edgeDecision = resolveLockDecision({
    reader,
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
    const node = reader.node.get(entry.id)
    if (!node) {
      continue
    }

    const mindmapId = getNodeMindmapId(node)
    if (!mindmapId) {
      if (
        node.position.x !== entry.position.x
        || node.position.y !== entry.position.y
      ) {
        ctx.writer.node.patch(node.id, nodeApi.update.toPatch({
          fields: {
            position: entry.position
          }
        }))
      }
      continue
    }

    const rootId = reader.mindmap.get(mindmapId)?.root
    if (!rootId) {
      throw new Error(`Mindmap ${mindmapId} root missing.`)
    }

    if (rootId !== node.id) {
      if (!movedMemberIdSet.has(rootId)) {
        return ctx.invalid('Mindmap member move must use mindmap drag.')
      }
      continue
    }

    if (movedMindmapIds.has(mindmapId)) {
      continue
    }

    movedMindmapIds.add(mindmapId)
    emitMindmapMove(ctx, mindmapId, entry.position)
  }

  selectedEdgeChanges.forEach((entry) => {
    const edge = reader.edge.get(entry.id)
    if (!edge) {
      return
    }
    emitEdgeMovePatchOps(edge, entry.patch, ctx)
  })

  followEffect.edges.forEach((entry) => {
    const edge = reader.edge.get(entry.id)
    if (!edge) {
      return
    }
    emitEdgeMovePatchOps(edge, entry.patch, ctx)
  })
}

type CanvasIntentHandlers = Pick<
  WhiteboardCompileHandlerTable,
  'canvas.delete'
  | 'canvas.duplicate'
  | 'canvas.selection.move'
  | 'document.order.move'
>

export const canvasIntentHandlers = {
  'canvas.delete': (ctx) => compileCanvasDelete(ctx.intent.refs, ctx),
  'canvas.duplicate': (ctx) => {
    const output = compileCanvasDuplicate(ctx.intent.refs, ctx)
    if (output) {
      if ('kind' in output) {
        return output
      }
      return output
    }
  },
  'canvas.selection.move': (ctx) => compileCanvasSelectionMove(ctx),
  'document.order.move': (ctx) => {
    const currentOrder = ctx.reader.document.order().items()
    const existingRefs = ctx.intent.refs.filter((ref) => (
      currentOrder.some((entry) => sameCanvasRef(entry, ref))
    ))
    if (existingRefs.length === 0) {
      return
    }

    const anchor = toCanvasOrderAnchor(currentOrder, existingRefs, ctx.intent.to)
    if (existingRefs.length === 1) {
      ctx.writer.document.order().move(
        canvasRefKey(existingRefs[0]!),
        anchor
      )
      return
    }

    ctx.writer.document.order().splice(
      existingRefs.map((ref) => canvasRefKey(ref)),
      anchor
    )
  }
} satisfies CanvasIntentHandlers
