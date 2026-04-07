import type { BoardConfig } from '@engine-types/instance'
import type { WriteCommandMap, WriteDomain, WriteInput, WriteOutput } from '@engine-types/command'
import type { TranslateResult } from '@engine-types/internal/translate'
import { buildInsertSliceOperations } from '@whiteboard/core/document'
import {
  bringOrderForward,
  bringOrderToFront,
  sendOrderBackward,
  sendOrderToBack
} from '@whiteboard/core/utils'
import type {
  CanvasItemRef,
  CoreRegistries,
  Document,
  EdgeId,
  MindmapId,
  MindmapNodeId,
  NodeId
} from '@whiteboard/core/types'
import { cancelled, invalid, success } from './result'
import { translateNode } from './node'
import { translateEdge } from './edge'
import { translateMindmap } from './mindmap'

type DocumentCommand = WriteCommandMap['document']
type OrderCommand = Extract<DocumentCommand, { type: 'order' }>

const isBackgroundEqual = (
  left: Document['background'] | undefined,
  right: Document['background'] | undefined
) => (
  left?.type === right?.type
  && left?.color === right?.color
)

export type WriteTranslateContext = {
  doc: Document
  config: BoardConfig
  registries: CoreRegistries
  ids: {
    node: () => NodeId
    edge: () => EdgeId
    group: () => NodeId
    mindmap: () => MindmapId
    mindmapNode: () => MindmapNodeId
  }
}

const translateDocument = <C extends DocumentCommand>(
  command: C,
  ctx: WriteTranslateContext
): TranslateResult<WriteOutput<'document', C>> => {
  const serializeRef = (ref: CanvasItemRef) => `${ref.kind}:${ref.id}`
  const parseRef = (key: string): CanvasItemRef => {
    const [kind, id] = key.split(':')
    return kind === 'edge'
      ? { kind: 'edge', id }
      : { kind: 'node', id }
  }
  const order = (
    command: OrderCommand
  ): TranslateResult<void> => {
    const current = ctx.doc.order.map(serializeRef)
    const target = command.refs.map(serializeRef)
    let nextOrder: string[]

    switch (command.mode) {
      case 'set':
        nextOrder = target
        break
      case 'front':
        nextOrder = bringOrderToFront(current, target)
        break
      case 'back':
        nextOrder = sendOrderToBack(current, target)
        break
      case 'forward':
        nextOrder = bringOrderForward(current, target)
        break
      case 'backward':
        nextOrder = sendOrderBackward(current, target)
        break
      default:
        nextOrder = target
        break
    }

    return success([{
      type: 'canvas.order.set',
      refs: nextOrder.map(parseRef)
    }])
  }

  switch (command.type) {
    case 'insert': {
      const planned = buildInsertSliceOperations({
        doc: ctx.doc,
        slice: command.slice,
        nodeSize: ctx.config.nodeSize,
        registries: ctx.registries,
        createNodeId: ctx.ids.node,
        createEdgeId: ctx.ids.edge,
        origin: command.options?.origin,
        delta: command.options?.delta,
        ownerId: command.options?.ownerId,
        roots: command.options?.roots
      })
      if (!planned.ok) {
        return invalid(planned.error.message, planned.error.details) as TranslateResult<WriteOutput<'document', C>>
      }

      return success(
        planned.data.operations,
        {
          roots: planned.data.roots,
          allNodeIds: planned.data.allNodeIds,
          allEdgeIds: planned.data.allEdgeIds
        } as WriteOutput<'document', C>
      )
    }
    case 'background': {
      if (isBackgroundEqual(ctx.doc.background, command.background)) {
        return cancelled('Background is already current.') as TranslateResult<WriteOutput<'document', C>>
      }

      return success(
        [{
          type: 'document.update',
          patch: {
            background: command.background
          }
        }],
        undefined as WriteOutput<'document', C>
      )
    }
    case 'order':
      return order(command) as TranslateResult<WriteOutput<'document', C>>
    default:
      return invalid('Unsupported document action.') as TranslateResult<WriteOutput<'document', C>>
  }
}

export const translateWrite = <
  D extends WriteDomain,
  C extends WriteCommandMap[D]
>(
  payload: WriteInput<D, C>,
  ctx: WriteTranslateContext
): TranslateResult<WriteOutput<D, C>> => {
  switch (payload.domain) {
    case 'document':
      return translateDocument(payload.command as WriteCommandMap['document'], ctx) as TranslateResult<WriteOutput<D, C>>
    case 'node':
      return translateNode(payload.command as WriteCommandMap['node'], ctx) as TranslateResult<WriteOutput<D, C>>
    case 'edge':
      return translateEdge(payload.command as WriteCommandMap['edge'], ctx) as TranslateResult<WriteOutput<D, C>>
    case 'mindmap':
      return translateMindmap(payload.command as WriteCommandMap['mindmap'], ctx) as TranslateResult<WriteOutput<D, C>>
    default:
      return invalid('Unsupported write action domain.') as TranslateResult<WriteOutput<D, C>>
  }
}
