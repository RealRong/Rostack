import { document as documentApi } from '@whiteboard/core/document'
import { getNodeMindmapId } from '@whiteboard/core/mindmap/ops'
import { node as nodeApi } from '@whiteboard/core/node'
import type {
  WhiteboardCompileContext,
  WhiteboardCompileHandlerTable
} from '@whiteboard/core/mutation/compile/helpers'
import {
  failCancelled,
  failInvalid,
  readCompileRegistries,
  readCompileServices,
  runCustomPlanner,
} from '@whiteboard/core/mutation/compile/helpers'
import {
  planCanvasOrderMove,
} from '@whiteboard/core/mutation/planner/canvas'
import {
  planMindmapDelete,
  planMindmapMove,
  planMindmapTopicDelete,
} from '@whiteboard/core/mutation/planner/mindmap'
import { resolveLockDecision } from '@whiteboard/core/mutation/lock'
import type { CanvasItemRef } from '@whiteboard/core/types'
import { emitEdgeMovePatchOps } from './edge'
import {
  writeEdgeCreate,
  writeEdgeDelete,
  writeNodeCreate,
  writeNodeDelete,
  writeNodePatch,
} from './write'

const failLockedModification = (
  ctx: WhiteboardCompileContext,
  reason?: import('@whiteboard/core/mutation/lock').LockDecisionReason
) => failCancelled(
  ctx,
  reason === 'locked-node'
    ? 'Locked nodes cannot be modified.'
    : reason === 'locked-edge'
      ? 'Locked edges cannot be modified.'
      : 'Locked node relations cannot be modified.'
)

export const compileCanvasDelete = (
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
    return failCancelled(
      ctx,
      decision.reason === 'locked-node'
        ? 'Locked nodes cannot be modified.'
        : decision.reason === 'locked-edge'
          ? 'Locked edges cannot be modified.'
          : 'Locked node relations cannot be modified.'
    )
  }

  refs.forEach((ref) => {
    if (ref.kind === 'edge') {
      writeEdgeDelete(ctx.program, ref.id)
      return
    }

    const node = ctx.reader.nodes.get(ref.id)
    const mindmapId = getNodeMindmapId(node)
    if (!mindmapId) {
      writeNodeDelete(ctx.program, ref.id)
      return
    }

    if (ctx.reader.mindmaps.isRoot(ref.id)) {
      runCustomPlanner(ctx, {
        type: 'mindmap.delete',
        id: mindmapId
      }, planMindmapDelete)
      return
    }

    runCustomPlanner(ctx, {
      type: 'mindmap.topic.delete',
      id: mindmapId,
      input: {
        nodeId: ref.id
      }
    }, planMindmapTopicDelete)
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
    return failCancelled(
      ctx,
      decision.reason === 'locked-node'
        ? 'Locked nodes cannot be duplicated.'
        : decision.reason === 'locked-edge'
          ? 'Locked edges cannot be duplicated.'
          : 'Locked node relations cannot be duplicated.'
    )
  }

  const nodeIds = refs.filter((ref) => ref.kind === 'node').map((ref) => ref.id)
  if (nodeIds.some((nodeId) => ctx.reader.mindmaps.byNode(nodeId))) {
    return failInvalid(ctx, 'Mindmap duplication must use dedicated mindmap commands.')
  }

  const edgeIds = refs.filter((ref) => ref.kind === 'edge').map((ref) => ref.id)
  const exported = documentApi.slice.export.selection({
    doc: document,
    nodeIds,
    edgeIds
  })
  if (!exported.ok) {
    return failInvalid(ctx, exported.error.message, exported.error.details)
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
    return failInvalid(ctx, built.error.message, built.error.details)
  }

  built.data.nodes.forEach((node) => {
    writeNodeCreate(ctx.program, node)
  })
  built.data.edges.forEach((edge) => {
    writeEdgeCreate(ctx.program, edge)
  })
  return {
    allNodeIds: built.data.allNodeIds,
    allEdgeIds: built.data.allEdgeIds,
    roots: built.data.roots
  }
}

const compileCanvasSelectionMove = (
  ctx: WhiteboardCompileContext<'canvas.selection.move'>
) => {
  const {
    intent,
    document
  } = ctx
  const reader = ctx.reader

  for (const nodeId of new Set(intent.nodeIds)) {
    if (!reader.nodes.has(nodeId)) {
      return failInvalid(ctx, `Node ${nodeId} not found.`)
    }
  }
  for (const edgeId of new Set(intent.edgeIds)) {
    if (!reader.edges.has(edgeId)) {
      return failInvalid(ctx, `Edge ${edgeId} not found.`)
    }
  }

  const nodes = reader.nodes.list()
  const edges = reader.edges.list()
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
    ...selectedEdges.map((edge) => edge.id),
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
    const node = reader.nodes.get(entry.id)
    if (!node) {
      continue
    }

    const mindmapId = getNodeMindmapId(node)
    if (!mindmapId) {
      if (
        node.position.x !== entry.position.x
        || node.position.y !== entry.position.y
      ) {
        writeNodePatch(ctx.program, node.id, nodeApi.update.toPatch({
          fields: {
            position: entry.position
          }
        }))
      }
      continue
    }

    const rootId = reader.mindmaps.get(mindmapId)?.root
    if (!rootId) {
      throw new Error(`Mindmap ${mindmapId} root missing.`)
    }

    if (rootId !== node.id) {
      if (!movedMemberIdSet.has(rootId)) {
        return failInvalid(ctx, 'Mindmap member move must use mindmap drag.')
      }
      continue
    }

    if (movedMindmapIds.has(mindmapId)) {
      continue
    }

    movedMindmapIds.add(mindmapId)
    runCustomPlanner(ctx, {
      type: 'mindmap.move',
      id: mindmapId,
      position: entry.position
    }, planMindmapMove)
  }

  selectedEdgeChanges.forEach((entry) => {
    const edge = reader.edges.get(entry.id)
    if (!edge) {
      return
    }
    emitEdgeMovePatchOps(edge, entry.patch, ctx)
  })

  followEffect.edges.forEach((entry) => {
    const edge = reader.edges.get(entry.id)
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
  | 'canvas.order.move'
>

export const canvasIntentHandlers: CanvasIntentHandlers = {
  'canvas.delete': (ctx) => compileCanvasDelete(ctx.intent.refs, ctx),
  'canvas.duplicate': (ctx) => {
    const output = compileCanvasDuplicate(ctx.intent.refs, ctx)
    if (output) {
      if ('kind' in output) {
        return output
      }
      ctx.output(output)
    }
  },
  'canvas.selection.move': (ctx) => compileCanvasSelectionMove(ctx),
  'canvas.order.move': (ctx) => runCustomPlanner(ctx, {
    type: 'canvas.order.move',
    refs: ctx.intent.refs,
    to: ctx.intent.to
  }, planCanvasOrderMove)
}
