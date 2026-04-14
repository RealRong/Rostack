import type { NodeCommand } from '@whiteboard/engine/types/command'
import {
  buildInsertSliceOperations,
  exportSliceFromNodes,
  getNode,
  listEdges,
  listNodes
} from '@whiteboard/core/document'
import {
  applyNodeUpdate,
  buildMoveSet,
  buildNodeAlignOperations,
  buildNodeCreateOperation,
  buildNodeDistributeOperations,
  createNodeFieldsUpdateOperation,
  createNodeUpdateOperation,
  isNodeUpdateEmpty,
  resolveMoveEffect
} from '@whiteboard/core/node'
import {
  resolveLockDecision
} from '@whiteboard/core/lock'
import { err, ok } from '@whiteboard/core/result'
import type { EdgeId, Node, NodeId } from '@whiteboard/core/types'
import { DEFAULT_TUNING } from '@whiteboard/engine/config'
import type { WriteTranslateContext } from '@whiteboard/engine/write/translate'
import { cascadeDeleteTargets } from '@whiteboard/engine/write/translate/selection/node'
import type { Step } from '@whiteboard/engine/write/translate/plan/shared'

type Create = Extract<NodeCommand, { type: 'node.create' }>
type Move = Extract<NodeCommand, { type: 'node.move' }>
type UpdateMany = Extract<NodeCommand, { type: 'node.patch' }>
type RemoveCascade = Extract<NodeCommand, { type: 'node.deleteCascade' }>
type Duplicate = Extract<NodeCommand, { type: 'node.duplicate' }>
type Align = Extract<NodeCommand, { type: 'node.align' }>
type Distribute = Extract<NodeCommand, { type: 'node.distribute' }>
type Remove = Extract<NodeCommand, { type: 'node.delete' }>

const takeOps = (updates: readonly UpdateMany['updates'][number][], doc: WriteTranslateContext['doc']) => {
  const nextById = new Map<NodeId, Node>()
  const operations: Array<{
    type: 'node.update'
    id: NodeId
    update: UpdateMany['updates'][number]['update']
  }> = []

  for (const { id, update } of updates) {
    const current = nextById.get(id) ?? getNode(doc, id)
    if (!current) {
      return err('invalid', `Node ${id} not found.`)
    }

    const next = applyNodeUpdate(current, update)
    if (!next.ok) {
      return err('invalid', next.message, {
        nodeId: id,
        update
      })
    }

    if (isNodeUpdateEmpty(update)) {
      continue
    }

    nextById.set(id, next.next)
    operations.push(createNodeUpdateOperation(id, update))
  }

  return ok(operations)
}

export const create = (
  command: Create,
  ctx: WriteTranslateContext
): Step<{ nodeId: NodeId }> => {
  const next = buildNodeCreateOperation({
    payload: command.payload,
    doc: ctx.doc,
    registries: ctx.registries,
    createNodeId: ctx.ids.node
  })
  if (!next.ok) {
    return err(next.error.code, next.error.message, next.error.details)
  }

  return ok({
    operations: [next.data.operation],
    output: {
      nodeId: next.data.nodeId
    }
  })
}

export const updateMany = (
  command: UpdateMany,
  doc: WriteTranslateContext['doc']
): Step => {
  const next = takeOps(command.updates, doc)
  if (!next.ok) {
    return next
  }
  if (!next.data.length) {
    return err('cancelled', 'No node updates provided.')
  }

  return ok({
    operations: next.data,
    output: undefined
  })
}

export const move = (
  command: Move,
  ctx: WriteTranslateContext
): Step => {
  if (!command.ids.length) {
    return err('cancelled', 'No nodes selected.')
  }
  if (command.delta.x === 0 && command.delta.y === 0) {
    return err('cancelled', 'Nodes are already current.')
  }

  const selected = buildMoveSet({
    nodes: listNodes(ctx.doc),
    ids: command.ids,
    nodeSize: ctx.config.nodeSize
  })
  if (!selected.members.length) {
    return err('cancelled', 'No movable nodes selected.')
  }

  const effect = resolveMoveEffect({
    nodes: listNodes(ctx.doc),
    edges: listEdges(ctx.doc),
    move: selected,
    delta: command.delta,
    nodeSize: ctx.config.nodeSize
  })
  const operations = [
    ...effect.nodes.map((entry) =>
      createNodeFieldsUpdateOperation(entry.id, {
        position: entry.position
      })
    ),
    ...effect.edges.map((entry) => ({
      type: 'edge.update' as const,
      id: entry.id,
      patch: entry.patch
    }))
  ]
  if (!operations.length) {
    return err('cancelled', 'Nodes are already current.')
  }

  return ok({
    operations,
    output: undefined
  })
}

export const align = (
  command: Align,
  ctx: WriteTranslateContext
): Step => {
  if (command.ids.length < 2) {
    return err('cancelled', 'At least two nodes are required.')
  }

  const next = buildNodeAlignOperations({
    ids: command.ids,
    doc: ctx.doc,
    nodeSize: ctx.config.nodeSize,
    mode: command.mode
  })
  if (!next.ok) {
    return err(next.error.code, next.error.message, next.error.details)
  }
  if (!next.data.operations.length) {
    return err('cancelled', 'Nodes are already aligned.')
  }

  return ok({
    operations: [...next.data.operations],
    output: undefined
  })
}

export const distribute = (
  command: Distribute,
  ctx: WriteTranslateContext
): Step => {
  if (command.ids.length < 3) {
    return err('cancelled', 'At least three nodes are required.')
  }

  const next = buildNodeDistributeOperations({
    ids: command.ids,
    doc: ctx.doc,
    nodeSize: ctx.config.nodeSize,
    mode: command.mode
  })
  if (!next.ok) {
    return err(next.error.code, next.error.message, next.error.details)
  }
  if (!next.data.operations.length) {
    return err('cancelled', 'Nodes are already distributed.')
  }

  return ok({
    operations: [...next.data.operations],
    output: undefined
  })
}

export const remove = (command: Remove): Step => {
  const ids = Array.from(new Set(command.ids))
  if (!ids.length) {
    return err('cancelled', 'No nodes selected.')
  }

  return ok({
    operations: ids.map((id) => ({ type: 'node.delete' as const, id })),
    output: undefined
  })
}

export const removeCascade = (
  command: RemoveCascade,
  ctx: WriteTranslateContext
): Step => {
  if (!command.ids.length) {
    return err('cancelled', 'No nodes selected.')
  }

  const next = cascadeDeleteTargets({
    doc: ctx.doc,
    ids: command.ids,
    nodeSize: ctx.config.nodeSize
  })
  if (!next.nodeIds.length) {
    return err('cancelled', 'No nodes selected.')
  }

  return ok({
    operations: [
      ...next.edgeIds.map((id) => ({ type: 'edge.delete' as const, id })),
      ...next.nodeIds.map((id) => ({ type: 'node.delete' as const, id }))
    ],
    output: undefined
  })
}

export const duplicate = (
  command: Duplicate,
  ctx: WriteTranslateContext
): Step<{ nodeIds: NodeId[]; edgeIds: EdgeId[] }> => {
  if (!command.ids.length) {
    return err('cancelled', 'No nodes selected.')
  }
  const locked = resolveLockDecision({
    document: ctx.doc,
    target: {
      kind: 'nodes',
      nodeIds: command.ids
    }
  })
  if (!locked.allowed) {
    return err('cancelled', 'Locked nodes cannot be duplicated.', {
      lockedNodeIds: locked.lockedNodeIds
    })
  }

  const slice = exportSliceFromNodes({
    doc: ctx.doc,
    ids: command.ids,
    nodeSize: ctx.config.nodeSize
  })
  if (!slice.ok) {
    return err(slice.error.code, slice.error.message, slice.error.details)
  }

  const next = buildInsertSliceOperations({
    doc: ctx.doc,
    slice: slice.data.slice,
    nodeSize: ctx.config.nodeSize,
    registries: ctx.registries,
    createNodeId: ctx.ids.node,
    createEdgeId: ctx.ids.edge,
    delta: DEFAULT_TUNING.shortcuts.duplicateOffset,
    roots: slice.data.roots
  })
  if (!next.ok) {
    return err(next.error.code, next.error.message, next.error.details)
  }

  return ok({
    operations: next.data.operations,
    output: {
      nodeIds: [...next.data.roots.nodeIds],
      edgeIds: [...next.data.allEdgeIds]
    }
  })
}
