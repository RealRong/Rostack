import type { NodeWriteOutput, WriteCommandMap } from '@engine-types/command'
import type { TranslateResult } from '@engine-types/internal/translate'
import type { WriteTranslateContext } from './index'
import { cancelled, invalid, fromOps, success } from './result'
import {
  applyNodeUpdate,
  buildDeleteOwnerOps,
  buildNodeAlignOperations,
  buildNodeCreateOperation,
  buildNodeDistributeOperations,
  buildNodeDuplicateOperations,
  createNodeFieldsUpdateOperation,
  createNodeUpdateOperation,
  buildNodeGroupOperations,
  buildMoveSet,
  buildNodeUngroupManyOperations,
  buildNodeUngroupOperations,
  buildOwnerOps,
  expandNodeSelection,
  isNodeUpdateEmpty,
  resolveMoveEffect
} from '@whiteboard/core/node'
import {
  listEdges,
  listNodes,
  getNode,
  isNodeEdgeEnd,
  type EdgeId,
  type Node,
  type NodeId,
} from '@whiteboard/core/types'
import {
  bringOrderForward,
  bringOrderToFront,
  sanitizeOrderIds,
  sendOrderToBack,
  sendOrderBackward
} from '@whiteboard/core/utils'
import { DEFAULT_TUNING } from '../../config'

type NodeCommand = WriteCommandMap['node']
type CreateCommand = Extract<NodeCommand, { type: 'create' }>
type GroupCommand = Extract<NodeCommand, { type: 'group.create' }>
type UngroupCommand = Extract<NodeCommand, { type: 'group.ungroup' }>
type UngroupManyCommand = Extract<NodeCommand, { type: 'group.ungroupMany' }>
type MoveCommand = Extract<NodeCommand, { type: 'move' }>
type UpdateManyCommand = Extract<NodeCommand, { type: 'updateMany' }>
type DeleteCascadeCommand = Extract<NodeCommand, { type: 'deleteCascade' }>
type DuplicateCommand = Extract<NodeCommand, { type: 'duplicate' }>
type OrderCommand = Extract<NodeCommand, { type: 'order' }>
type AlignCommand = Extract<NodeCommand, { type: 'align' }>
type DistributeCommand = Extract<NodeCommand, { type: 'distribute' }>

export const translateNode = <C extends NodeCommand>(
  command: C,
  ctx: WriteTranslateContext
): TranslateResult<NodeWriteOutput<C>> => {
  const doc = ctx.doc

  const create = (command: CreateCommand): TranslateResult<{ nodeId: NodeId }> => {
    const planned = buildNodeCreateOperation({
      payload: command.payload,
      doc,
      registries: ctx.registries,
      createNodeId: ctx.ids.node
    })
    if (!planned.ok) {
      return invalid(planned.error.message, planned.error.details)
    }

    const owner = buildOwnerOps({
      document: doc,
      changes: command.payload.ownerId
        ? [{
            id: planned.data.nodeId,
            ownerId: command.payload.ownerId
          }]
        : []
    })
    if (!owner.ok) {
      return invalid(owner.error.message, owner.error.details)
    }

    return success(
      [
        planned.data.operation,
        ...owner.data
      ],
      {
        nodeId: planned.data.nodeId
      }
    )
  }

  const group = (command: GroupCommand): TranslateResult<{ groupId: NodeId }> => {
    if (command.ids.length < 2) {
      return cancelled('At least two nodes are required.')
    }

    return fromOps(
      buildNodeGroupOperations({
        ids: command.ids,
        doc,
        createGroupId: ctx.ids.group
      }),
      ({ groupId }) => ({ groupId })
    )
  }

  const ungroup = (command: UngroupCommand): TranslateResult<{ nodeIds: NodeId[] }> =>
    fromOps(
      buildNodeUngroupOperations(command.id, doc),
      ({ nodeIds }) => ({ nodeIds })
    )

  const ungroupMany = (command: UngroupManyCommand): TranslateResult<{ nodeIds: NodeId[] }> => {
    if (!command.ids.length) {
      return cancelled('No groups selected.')
    }

    return fromOps(
      buildNodeUngroupManyOperations(command.ids, doc),
      ({ nodeIds }) => ({ nodeIds })
    )
  }

  const updateMany = (command: UpdateManyCommand): TranslateResult => {
    const nextNodeById = new Map<NodeId, Node>()
    const operations: Array<{
      type: 'node.update'
      id: NodeId
      update: UpdateManyCommand['updates'][number]['update']
    }> = []

    for (const { id, update } of command.updates) {
      const current = nextNodeById.get(id) ?? getNode(doc, id)
      if (!current) {
        return invalid(`Node ${id} not found.`)
      }

      const result = applyNodeUpdate(current, update)
      if (!result.ok) {
        return invalid(result.message, {
          nodeId: id,
          update
        })
      }

      if (isNodeUpdateEmpty(update)) {
        continue
      }

      nextNodeById.set(id, result.next)
      operations.push(createNodeUpdateOperation(id, update))
    }

    if (!operations.length) {
      return cancelled('No node updates provided.')
    }
    return success(operations)
  }

  const move = (command: MoveCommand): TranslateResult => {
    if (!command.ids.length) {
      return cancelled('No nodes selected.')
    }
    if (command.delta.x === 0 && command.delta.y === 0) {
      return cancelled('Nodes are already current.')
    }

    const moveSet = buildMoveSet({
      nodes: listNodes(doc),
      ids: command.ids,
      nodeSize: ctx.config.nodeSize
    })
    if (!moveSet.members.length) {
      return cancelled('No movable nodes selected.')
    }

    const effect = resolveMoveEffect({
      nodes: listNodes(doc),
      edges: listEdges(doc),
      move: moveSet,
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
      return cancelled('Nodes are already current.')
    }

    return success(operations)
  }

  const align = (command: AlignCommand): TranslateResult => {
    if (command.ids.length < 2) {
      return cancelled('At least two nodes are required.')
    }

    const result = buildNodeAlignOperations({
      ids: command.ids,
      doc,
      nodeSize: ctx.config.nodeSize,
      mode: command.mode
    })
    if (!result.ok) {
      return fromOps(result)
    }
    if (!result.data.operations.length) {
      return cancelled('Nodes are already aligned.')
    }
    return fromOps(result)
  }

  const distribute = (command: DistributeCommand): TranslateResult => {
    if (command.ids.length < 3) {
      return cancelled('At least three nodes are required.')
    }

    const result = buildNodeDistributeOperations({
      ids: command.ids,
      doc,
      nodeSize: ctx.config.nodeSize,
      mode: command.mode
    })
    if (!result.ok) {
      return fromOps(result)
    }
    if (!result.data.operations.length) {
      return cancelled('Nodes are already distributed.')
    }
    return fromOps(result)
  }

  const order = (command: OrderCommand): TranslateResult => {
    const current = [...doc.nodes.order]
    const target = sanitizeOrderIds(command.ids) as NodeId[]
    let nextOrder: NodeId[]
    switch (command.mode) {
      case 'set':
        nextOrder = target
        break
      case 'front':
        nextOrder = bringOrderToFront(current, target) as NodeId[]
        break
      case 'back':
        nextOrder = sendOrderToBack(current, target) as NodeId[]
        break
      case 'forward':
        nextOrder = bringOrderForward(current, target) as NodeId[]
        break
      case 'backward':
        nextOrder = sendOrderBackward(current, target) as NodeId[]
        break
      default:
        nextOrder = target
        break
    }
    return success([{ type: 'node.order.set', ids: nextOrder }])
  }

  const deleteCascade = (command: DeleteCascadeCommand): TranslateResult => {
    if (!command.ids.length) {
      return cancelled('No nodes selected.')
    }

    const { expandedIds } = expandNodeSelection(
      listNodes(doc),
      command.ids,
      ctx.config.nodeSize
    )
    if (!expandedIds.size) {
      return cancelled('No nodes selected.')
    }

    const nodeIds = Array.from(expandedIds)
    const edgeIds = listEdges(doc)
      .filter(
        (edge) =>
          (isNodeEdgeEnd(edge.source) && expandedIds.has(edge.source.nodeId))
          || (isNodeEdgeEnd(edge.target) && expandedIds.has(edge.target.nodeId))
      )
      .map((edge) => edge.id)
    const detach = buildDeleteOwnerOps({
      document: doc,
      ids: nodeIds
    })
    if (!detach.ok) {
      return invalid(detach.error.message, detach.error.details)
    }

    return success([
      ...edgeIds.map((id) => ({ type: 'edge.delete' as const, id })),
      ...detach.data,
      ...nodeIds.map((id) => ({ type: 'node.delete' as const, id }))
    ])
  }

  const duplicate = (
    command: DuplicateCommand
  ): TranslateResult<{ nodeIds: NodeId[]; edgeIds: EdgeId[] }> =>
    fromOps(
      buildNodeDuplicateOperations({
        doc,
        ids: command.ids,
        registries: ctx.registries,
        createNodeId: ctx.ids.node,
        createEdgeId: ctx.ids.edge,
        nodeSize: ctx.config.nodeSize,
        offset: DEFAULT_TUNING.shortcuts.duplicateOffset
      }),
      ({ nodeIds, edgeIds }) => ({ nodeIds, edgeIds })
    )

  switch (command.type) {
    case 'create':
      return create(command) as TranslateResult<NodeWriteOutput<C>>
    case 'updateMany':
      return updateMany(command) as TranslateResult<NodeWriteOutput<C>>
    case 'move':
      return move(command) as TranslateResult<NodeWriteOutput<C>>
    case 'align':
      return align(command) as TranslateResult<NodeWriteOutput<C>>
    case 'distribute':
      return distribute(command) as TranslateResult<NodeWriteOutput<C>>
    case 'delete':
      if (!command.ids.length) {
        return cancelled('No nodes selected.') as TranslateResult<NodeWriteOutput<C>>
      }

      {
        const detach = buildDeleteOwnerOps({
          document: doc,
          ids: command.ids
        })
        if (!detach.ok) {
          return invalid(
            detach.error.message,
            detach.error.details
          ) as TranslateResult<NodeWriteOutput<C>>
        }

        return success([
          ...detach.data,
          ...command.ids.map((id) => ({ type: 'node.delete' as const, id }))
        ]) as TranslateResult<NodeWriteOutput<C>>
      }
    case 'deleteCascade':
      return deleteCascade(command) as TranslateResult<NodeWriteOutput<C>>
    case 'duplicate':
      return duplicate(command) as TranslateResult<NodeWriteOutput<C>>
    case 'group.create':
      return group(command) as TranslateResult<NodeWriteOutput<C>>
    case 'group.ungroup':
      return ungroup(command) as TranslateResult<NodeWriteOutput<C>>
    case 'group.ungroupMany':
      return ungroupMany(command) as TranslateResult<NodeWriteOutput<C>>
    case 'order':
      return order(command) as TranslateResult<NodeWriteOutput<C>>
    default:
      return invalid('Unsupported node action.') as TranslateResult<NodeWriteOutput<C>>
  }
}
