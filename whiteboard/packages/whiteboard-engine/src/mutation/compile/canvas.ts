import { document as documentApi } from '@whiteboard/core/document'
import { resolveLockDecision } from '@whiteboard/core/lock'
import { node as nodeApi } from '@whiteboard/core/node'
import type {
  CanvasItemRef,
  Document,
  MindmapId,
  Node
} from '@whiteboard/core/types'
import type { CanvasCommand } from '../../types/command'
import type { CommandCompileContext } from '../types'
import {
  emitEdgeMovePatchOps
} from './edge'

const readNodeMindmapId = (
  node: Pick<Node, 'owner'> | undefined
): MindmapId | undefined => (
  node?.owner?.kind === 'mindmap'
    ? node.owner.id
    : undefined
)

const isMindmapRoot = (
  document: Document,
  node: Node | undefined
) => {
  const mindmapId = readNodeMindmapId(node)
  if (!mindmapId || !node) {
    return false
  }
  return document.mindmaps[mindmapId]?.root === node.id
}

const failLockedModification = (
  ctx: CommandCompileContext,
  reason?: import('@whiteboard/core/lock').LockDecisionReason
) => ctx.tx.fail.cancelled(
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

const reorderRefs = (
  current: readonly CanvasItemRef[],
  refs: readonly CanvasItemRef[],
  mode: import('@whiteboard/core/types').OrderMode
) => {
  const next = [...current]
  const selected = refs.filter((ref) => next.some((entry) => sameCanvasRef(entry, ref)))
  if (selected.length === 0) {
    return next
  }

  const isSelected = (entry: CanvasItemRef) =>
    selected.some((ref) => sameCanvasRef(ref, entry))

  if (mode === 'set') {
    return [...refs]
  }

  const rest = next.filter((entry) => !isSelected(entry))
  if (mode === 'front') {
    return [...rest, ...selected]
  }
  if (mode === 'back') {
    return [...selected, ...rest]
  }

  if (mode === 'forward') {
    const items = [...next]
    for (let index = items.length - 2; index >= 0; index -= 1) {
      if (isSelected(items[index]!) && !isSelected(items[index + 1]!)) {
        const currentEntry = items[index]!
        items[index] = items[index + 1]!
        items[index + 1] = currentEntry
      }
    }
    return items
  }

  const items = [...next]
  for (let index = 1; index < items.length; index += 1) {
    if (isSelected(items[index]!) && !isSelected(items[index - 1]!)) {
      const currentEntry = items[index]!
      items[index] = items[index - 1]!
      items[index - 1] = currentEntry
    }
  }
  return items
}

export const createCanvasOrderMoveOps = (
  current: readonly CanvasItemRef[],
  target: readonly CanvasItemRef[]
) => {
  const working = [...current]
  const ops: import('@whiteboard/core/types').Operation[] = []

  for (let index = 0; index < target.length; index += 1) {
    const ref = target[index]!
    if (sameCanvasRef(working[index] ?? { kind: ref.kind, id: '' }, ref)) {
      continue
    }

    const currentIndex = working.findIndex((entry) => sameCanvasRef(entry, ref))
    if (currentIndex < 0) {
      continue
    }

    working.splice(currentIndex, 1)
    working.splice(index, 0, ref)
    ops.push({
      type: 'canvas.order.move',
      refs: [ref],
      to: index === 0
        ? { kind: 'front' }
        : {
            kind: 'after',
            ref: target[index - 1]!
          }
    })
  }

  return ops
}

export const compileCanvasDelete = (
  refs: readonly CanvasItemRef[],
  ctx: CommandCompileContext
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
    const mindmapId = readNodeMindmapId(node)
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
  ctx: CommandCompileContext
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
  if (nodeIds.some((nodeId) => readNodeMindmapId(document.nodes[nodeId]))) {
    return ctx.tx.fail.invalid('Mindmap duplication must use dedicated mindmap commands.')
  }

  const edgeIds = refs.filter((ref) => ref.kind === 'edge').map((ref) => ref.id)
  const exported = documentApi.slice.export.selection({
    doc: document,
    nodeIds,
    edgeIds,
    nodeSize: ctx.nodeSize
  })
  if (!exported.ok) {
    return ctx.tx.fail.invalid(exported.error.message, exported.error.details)
  }

  const built = documentApi.slice.buildInsertOps({
    doc: document,
    slice: exported.data.slice,
    nodeSize: ctx.nodeSize,
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
    nodeIds: built.data.allNodeIds,
    edgeIds: built.data.allEdgeIds,
    roots: built.data.roots
  }
}

const compileCanvasSelectionMove = (
  command: Extract<CanvasCommand, { type: 'canvas.selection.move' }>,
  ctx: CommandCompileContext
) => {
  const document = ctx.tx.read.document.get()

  for (const nodeId of new Set(command.nodeIds)) {
    if (!documentApi.read.node(document, nodeId)) {
      return ctx.tx.fail.invalid(`Node ${nodeId} not found.`)
    }
  }
  for (const edgeId of new Set(command.edgeIds)) {
    if (!documentApi.read.edge(document, edgeId)) {
      return ctx.tx.fail.invalid(`Edge ${edgeId} not found.`)
    }
  }

  const nodes = documentApi.list.nodes(document)
  const edges = documentApi.list.edges(document)
  const move = nodeApi.move.buildSet({
    nodes,
    ids: command.nodeIds,
    nodeSize: ctx.nodeSize
  })
  const movedNodeIds = move.members.map((member) => member.id)
  const selectedEdgeIdSet = new Set(command.edgeIds)
  const selectedEdges = edges.filter((edge) => selectedEdgeIdSet.has(edge.id))
  const followEdges = edges.filter((edge) => !selectedEdgeIdSet.has(edge.id))
  const followEffect = nodeApi.move.resolveEffect({
    nodes,
    edges: followEdges,
    move,
    delta: command.delta,
    nodeSize: ctx.nodeSize
  })
  const selectedEdgeChanges = nodeApi.move.buildCommit({
    delta: command.delta,
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
  const movedMindmapIds = new Set<MindmapId>()
  const positions = nodeApi.move.projectPositions(move.members, command.delta)

  for (const entry of positions) {
    const node = documentApi.read.node(document, entry.id)
    if (!node) {
      continue
    }

    const mindmapId = readNodeMindmapId(node)
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

export const compileCanvasCommand = (
  command: CanvasCommand,
  ctx: CommandCompileContext
) => {
  switch (command.type) {
    case 'canvas.delete':
      return compileCanvasDelete(command.refs, ctx)
    case 'canvas.duplicate':
      return compileCanvasDuplicate(command.refs, ctx)
    case 'canvas.selection.move':
      return compileCanvasSelectionMove(command, ctx)
    case 'canvas.order.move': {
      const current = documentApi.list.canvasRefs(ctx.tx.read.document.get())
      const target = reorderRefs(current, command.refs, command.mode)
      createCanvasOrderMoveOps(current, target).forEach((op) => ctx.tx.emit(op))
      return
    }
  }
}
