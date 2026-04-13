import type { CommandOutput, DocumentCommand } from '#types/command'
import {
  buildInsertSliceOperations,
  exportSliceFromSelection
} from '@whiteboard/core/document'
import { err, ok } from '@whiteboard/core/result'
import type { CanvasItemRef, EdgeId } from '@whiteboard/core/types'
import { DEFAULT_TUNING } from '../../../config'
import type { WriteTranslateContext } from '../index'
import { normalizeOrder } from '../order/policy'
import { sameOrder } from '../order/refs'
import { cascadeDeleteTargets } from '../selection/node'
import type { Step } from './shared'

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

  const cascade = nodeIds.length > 0
    ? cascadeDeleteTargets({
        doc: ctx.doc,
        ids: nodeIds,
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
    return err('cancelled', 'No items selected.')
  }

  return ok({
    operations: [
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
