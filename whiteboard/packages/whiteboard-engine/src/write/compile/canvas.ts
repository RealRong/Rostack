import {
  buildInsertSliceOperations,
  exportSliceFromSelection,
  listCanvasItemRefs
} from '@whiteboard/core/document'
import { resolveLockDecision } from '@whiteboard/core/lock'
import type {
  CanvasItemRef,
  Document,
  MindmapId,
  Node
} from '@whiteboard/core/types'
import type { CanvasCommand } from '@whiteboard/engine/types/command'
import type { CommandCompileContext } from '@whiteboard/engine/write/types'

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
  const exported = exportSliceFromSelection({
    doc: document,
    nodeIds,
    edgeIds,
    nodeSize: ctx.nodeSize
  })
  if (!exported.ok) {
    return ctx.tx.fail.invalid(exported.error.message, exported.error.details)
  }

  const built = buildInsertSliceOperations({
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

export const compileCanvasCommand = (
  command: CanvasCommand,
  ctx: CommandCompileContext
) => {
  switch (command.type) {
    case 'canvas.delete':
      return compileCanvasDelete(command.refs, ctx)
    case 'canvas.duplicate':
      return compileCanvasDuplicate(command.refs, ctx)
    case 'canvas.order.move': {
      const current = listCanvasItemRefs(ctx.tx.read.document.get())
      const target = reorderRefs(current, command.refs, command.mode)
      createCanvasOrderMoveOps(current, target).forEach((op) => ctx.tx.emit(op))
      return
    }
  }
}
