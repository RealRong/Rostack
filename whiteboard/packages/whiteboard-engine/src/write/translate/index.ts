import type { BoardConfig } from '@engine-types/instance'
import type { WriteCommandMap, WriteDomain, WriteInput, WriteOutput } from '@engine-types/command'
import type { TranslateResult } from '@engine-types/internal/translate'
import {
  buildInsertSliceOperations,
  exportSliceFromSelection
} from '@whiteboard/core/document'
import {
  expandNodeSelection
} from '@whiteboard/core/node'
import type {
  CanvasItemRef,
  CoreRegistries,
  Document,
  EdgeId,
  GroupId,
  MindmapId,
  MindmapNodeId,
  NodeId
} from '@whiteboard/core/types'
import {
  isNodeEdgeEnd,
  listEdges,
  listNodes
} from '@whiteboard/core/types'
import { cancelled, invalid, success } from './result'
import {
  isSameCanvasRef,
  normalizeCanvasOrderTargets
} from './order'
import { translateNode } from './node'
import { translateGroup } from './group'
import { translateEdge } from './edge'
import { translateMindmap } from './mindmap'
import { DEFAULT_TUNING } from '../../config'

type DocumentCommand = WriteCommandMap['document']
type DeleteCommand = Extract<DocumentCommand, { type: 'delete' }>
type DuplicateCommand = Extract<DocumentCommand, { type: 'duplicate' }>
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
    group: () => GroupId
    mindmap: () => MindmapId
    mindmapNode: () => MindmapNodeId
  }
}

const translateDocument = <C extends DocumentCommand>(
  command: C,
  ctx: WriteTranslateContext
): TranslateResult<WriteOutput<'document', C>> => {
  const splitRefs = (refs: readonly CanvasItemRef[]) => ({
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
  const remove = (
    command: DeleteCommand
  ): TranslateResult<void> => {
    const {
      nodeIds: selectedNodeIds,
      edgeIds: selectedEdgeIds
    } = splitRefs(command.refs)
    if (!selectedNodeIds.length && !selectedEdgeIds.length) {
      return cancelled('No items selected.')
    }

    const expandedIds = selectedNodeIds.length > 0
      ? expandNodeSelection(
          listNodes(ctx.doc),
          selectedNodeIds,
          ctx.config.nodeSize
        ).expandedIds
      : new Set<NodeId>()
    const nodeIds = Array.from(expandedIds)
    const edgeIdSet = new Set<EdgeId>(selectedEdgeIds)

    if (expandedIds.size > 0) {
      listEdges(ctx.doc).forEach((edge) => {
        if (
          (isNodeEdgeEnd(edge.source) && expandedIds.has(edge.source.nodeId))
          || (isNodeEdgeEnd(edge.target) && expandedIds.has(edge.target.nodeId))
        ) {
          edgeIdSet.add(edge.id)
        }
      })
    }

    if (!nodeIds.length && edgeIdSet.size === 0) {
      return cancelled('No items selected.')
    }

    return success([
      ...Array.from(edgeIdSet).map((id) => ({ type: 'edge.delete' as const, id })),
      ...nodeIds.map((id) => ({ type: 'node.delete' as const, id }))
    ])
  }
  const duplicate = (
    command: DuplicateCommand
  ): TranslateResult<WriteOutput<'document', DuplicateCommand>> => {
    const { nodeIds, edgeIds } = splitRefs(command.refs)
    if (!nodeIds.length && !edgeIds.length) {
      return cancelled('No items selected.')
    }

    const exported = exportSliceFromSelection({
      doc: ctx.doc,
      nodeIds,
      edgeIds,
      nodeSize: ctx.config.nodeSize
    })
    if (!exported.ok) {
      return invalid(exported.error.message, exported.error.details)
    }

    const planned = buildInsertSliceOperations({
      doc: ctx.doc,
      slice: exported.data.slice,
      nodeSize: ctx.config.nodeSize,
      registries: ctx.registries,
      createNodeId: ctx.ids.node,
      createEdgeId: ctx.ids.edge,
      delta: DEFAULT_TUNING.shortcuts.duplicateOffset,
      roots: exported.data.roots
    })
    if (!planned.ok) {
      return invalid(planned.error.message, planned.error.details)
    }

    return success(
      planned.data.operations,
      {
        roots: planned.data.roots,
        allNodeIds: planned.data.allNodeIds,
        allEdgeIds: planned.data.allEdgeIds
      }
    )
  }
  const order = (
    command: OrderCommand
  ): TranslateResult<void> => {
    const { current, next } = normalizeCanvasOrderTargets({
      doc: ctx.doc,
      refs: command.refs,
      mode: command.mode
    })
    if (
      current.length === next.length
      && current.every((ref, index) => isSameCanvasRef(ref, next[index]!))
    ) {
      return cancelled('Order is already current.')
    }

    return success([{
      type: 'canvas.order.set',
      refs: next
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
    case 'delete':
      return remove(command) as TranslateResult<WriteOutput<'document', C>>
    case 'duplicate':
      return duplicate(command) as TranslateResult<WriteOutput<'document', C>>
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
    case 'group':
      return translateGroup(payload.command as WriteCommandMap['group'], ctx) as TranslateResult<WriteOutput<D, C>>
    case 'edge':
      return translateEdge(payload.command as WriteCommandMap['edge'], ctx) as TranslateResult<WriteOutput<D, C>>
    case 'mindmap':
      return translateMindmap(payload.command as WriteCommandMap['mindmap'], ctx) as TranslateResult<WriteOutput<D, C>>
    default:
      return invalid('Unsupported write action domain.') as TranslateResult<WriteOutput<D, C>>
  }
}
