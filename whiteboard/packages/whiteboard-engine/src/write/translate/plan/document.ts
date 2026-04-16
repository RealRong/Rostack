import type { CommandOutput, DocumentCommand } from '@whiteboard/engine/types/command'
import {
  buildInsertSliceOperations,
  exportSliceFromSelection,
  getNode
} from '@whiteboard/core/document'
import {
  getMindmapTreeFromDocument,
  getSubtreeIds,
  removeSubtree as removeMindmapSubtree
} from '@whiteboard/core/mindmap'
import {
  resolveLockDecision
} from '@whiteboard/core/lock'
import { err, ok } from '@whiteboard/core/result'
import type { CanvasItemRef, EdgeId } from '@whiteboard/core/types'
import type { MindmapTree } from '@whiteboard/core/mindmap'
import { DEFAULT_TUNING } from '@whiteboard/engine/config'
import type { WriteTranslateContext } from '@whiteboard/engine/write/translate'
import { normalizeOrder } from '@whiteboard/engine/write/translate/order/policy'
import { sameOrder } from '@whiteboard/engine/write/translate/order/refs'
import { cascadeDeleteTargets } from '@whiteboard/engine/write/translate/selection/node'
import type { Step } from '@whiteboard/engine/write/translate/plan/shared'

type Insert = Extract<DocumentCommand, { type: 'document.insert' }>
type Remove = Extract<DocumentCommand, { type: 'document.delete' }>
type Duplicate = Extract<DocumentCommand, { type: 'document.duplicate' }>
type Background = Extract<DocumentCommand, { type: 'document.background.set' }>
type Order = Extract<DocumentCommand, { type: 'document.order' }>

const pickRefs = (refs: readonly CanvasItemRef[]) => ({
  nodeIds: Array.from(new Set(
    refs
      .filter((ref): ref is Extract<CanvasItemRef, { kind: 'node' }> => ref.kind === 'node')
      .map((ref) => ref.id)
  )),
  edgeIds: Array.from(new Set(
    refs
      .filter((ref): ref is Extract<CanvasItemRef, { kind: 'edge' }> => ref.kind === 'edge')
      .map((ref) => ref.id)
  ))
})

const sameBg = (
  left: WriteTranslateContext['doc']['background'] | undefined,
  right: WriteTranslateContext['doc']['background'] | undefined
) => (
  left?.type === right?.type
  && left?.color === right?.color
)

const insertOut = (data: {
  roots: CommandOutput<Insert>['roots']
  allNodeIds: CommandOutput<Insert>['allNodeIds']
  allEdgeIds: CommandOutput<Insert>['allEdgeIds']
}) => ({
  roots: data.roots,
  allNodeIds: data.allNodeIds,
  allEdgeIds: data.allEdgeIds
})

const getSubtreeDeleteOps = (
  tree: MindmapTree
) => getSubtreeIds(tree, tree.rootNodeId).map((id) => ({
  type: 'node.delete' as const,
  id
}))

export const insert = (
  command: Insert,
  ctx: WriteTranslateContext
): Step<CommandOutput<Insert>> => {
  const next = buildInsertSliceOperations({
    doc: ctx.doc,
    slice: command.slice,
    nodeSize: ctx.config.nodeSize,
    registries: ctx.registries,
    createNodeId: ctx.ids.node,
    createEdgeId: ctx.ids.edge,
    delta: command.options?.delta,
    roots: command.options?.roots
  })
  if (!next.ok) {
    return err(next.error.code, next.error.message, next.error.details)
  }

  return ok({
    operations: next.data.operations,
    output: insertOut(next.data)
  })
}

export const remove = (
  command: Remove,
  ctx: WriteTranslateContext
): Step => {
  const { nodeIds, edgeIds } = pickRefs(command.refs)
  if (!nodeIds.length && !edgeIds.length) {
    return err('cancelled', 'No items selected.')
  }

  const rootDeletes = new Set<string>()
  const childDeletes = new Map<string, string[]>()
  nodeIds.forEach((nodeId) => {
    const node = getNode(ctx.doc, nodeId)
    if (!node) {
      return
    }
    if (node.type === 'mindmap') {
      rootDeletes.add(node.id)
      return
    }
    if (node.mindmapId) {
      const bucket = childDeletes.get(node.mindmapId)
      if (bucket) {
        bucket.push(node.id)
      } else {
        childDeletes.set(node.mindmapId, [node.id])
      }
    }
  })

  const operations: Array<
    | { type: 'edge.delete'; id: EdgeId }
    | { type: 'node.delete'; id: string }
    | { type: 'node.update'; id: string; update: { records: readonly [{ scope: 'data'; op: 'set'; value: unknown }] } }
  > = []

  rootDeletes.forEach((mindmapId) => {
    const tree = getMindmapTreeFromDocument(ctx.doc, mindmapId)
    if (!tree) {
      return
    }
    operations.push(
      ...getSubtreeDeleteOps(tree),
      { type: 'node.delete', id: mindmapId }
    )
    childDeletes.delete(mindmapId)
  })

  childDeletes.forEach((childIds, mindmapId) => {
    const tree = getMindmapTreeFromDocument(ctx.doc, mindmapId)
    if (!tree) {
      return
    }
    let nextTree = tree
    const removed = new Set<string>()
    childIds.forEach((childId) => {
      if (removed.has(childId) || !nextTree.nodes[childId]) {
        return
      }
      const result = removeMindmapSubtree(nextTree, {
        nodeId: childId
      })
      if (!result.ok) {
        return
      }
      result.data.removedIds.forEach((id) => removed.add(id))
      nextTree = result.data.tree
    })
    if (!removed.size) {
      return
    }
    operations.push({
      type: 'node.update',
      id: mindmapId,
      update: {
        records: [{
          scope: 'data',
          op: 'set',
          value: nextTree
        }]
      }
    })
    operations.push(...Array.from(removed).map((id) => ({ type: 'node.delete' as const, id })))
  })

  const cascade = nodeIds.length > 0
    ? cascadeDeleteTargets({
        doc: ctx.doc,
        ids: nodeIds.filter((nodeId) => {
          const node = getNode(ctx.doc, nodeId)
          return Boolean(node && !node.mindmapId && node.type !== 'mindmap')
        }),
        nodeSize: ctx.config.nodeSize
      })
    : {
        nodeIds: [],
        edgeIds: []
      }

  const allEdgeIds = Array.from(new Set<EdgeId>([
    ...edgeIds,
    ...cascade.edgeIds
  ]))
  if (!cascade.nodeIds.length && !allEdgeIds.length) {
    if (!operations.length) {
      return err('cancelled', 'No items selected.')
    }
  }

  return ok({
    operations: [
      ...operations,
      ...allEdgeIds.map((id) => ({ type: 'edge.delete' as const, id })),
      ...cascade.nodeIds.map((id) => ({ type: 'node.delete' as const, id }))
    ],
    output: undefined
  })
}

export const duplicate = (
  command: Duplicate,
  ctx: WriteTranslateContext
): Step<CommandOutput<Duplicate>> => {
  const { nodeIds, edgeIds } = pickRefs(command.refs)
  if (!nodeIds.length && !edgeIds.length) {
    return err('cancelled', 'No items selected.')
  }
  if (nodeIds.some((nodeId) => {
    const node = getNode(ctx.doc, nodeId)
    return node?.type === 'mindmap' || Boolean(node?.mindmapId)
  })) {
    return err('invalid', 'Mindmap nodes do not support generic duplicate.')
  }
  const locked = resolveLockDecision({
    document: ctx.doc,
    target: {
      kind: 'refs',
      refs: command.refs,
      includeEdgeRelations: true
    }
  })
  if (!locked.allowed) {
    return err(
      'cancelled',
      locked.reason === 'locked-relation'
        ? 'Locked node relations cannot be duplicated.'
        : locked.reason === 'locked-edge'
          ? 'Locked edges cannot be duplicated.'
        : 'Locked nodes cannot be duplicated.',
      {
        lockedNodeIds: locked.lockedNodeIds,
        lockedEdgeIds: locked.lockedEdgeIds
      }
    )
  }

  const slice = exportSliceFromSelection({
    doc: ctx.doc,
    nodeIds,
    edgeIds,
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
    output: insertOut(next.data)
  })
}

export const background = (
  command: Background,
  ctx: WriteTranslateContext
): Step => {
  if (sameBg(ctx.doc.background, command.background)) {
    return err('cancelled', 'Background is already current.')
  }

  return ok({
    operations: [{
      type: 'document.update',
      patch: {
        background: command.background
      }
    }],
    output: undefined
  })
}

export const order = (
  command: Order,
  ctx: WriteTranslateContext
): Step => {
  if (command.refs.some((ref) => {
    if (ref.kind !== 'node') {
      return false
    }
    const node = getNode(ctx.doc, ref.id)
    return node?.type === 'mindmap' || Boolean(node?.mindmapId)
  })) {
    return err('invalid', 'Mindmap nodes do not support generic order changes.')
  }
  const next = normalizeOrder({
    doc: ctx.doc,
    refs: command.refs,
    mode: command.mode
  })
  if (sameOrder(next.current, next.next)) {
    return err('cancelled', 'Order is already current.')
  }

  return ok({
    operations: [{
      type: 'canvas.order.set',
      refs: next.next
    }],
    output: undefined
  })
}
