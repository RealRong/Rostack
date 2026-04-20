import {
  buildNodeAlignOperations,
  buildNodeCreateOperation,
  buildNodeDistributeOperations,
  createNodeUpdateOperation
} from '@whiteboard/core/node'
import { resolveLockDecision } from '@whiteboard/core/lock'
import { ok } from '@whiteboard/core/result'
import type {
  Document,
  MindmapId,
  MindmapTopicField,
  Node,
  NodeId,
  NodeUpdateInput,
  Operation
} from '@whiteboard/core/types'
import type { NodeCommand } from '@whiteboard/engine/types/command'
import type { CommandCompileContext } from '@whiteboard/engine/write/types'
import {
  compileCanvasDelete,
  compileCanvasDuplicate
} from '@whiteboard/engine/write/compile/canvas'

const hasOwn = <T extends object>(
  target: T,
  key: PropertyKey
) => Object.prototype.hasOwnProperty.call(target, key)

const readErrorDetails = (
  error: unknown
) => (
  typeof error === 'object'
  && error !== null
  && 'details' in error
    ? (error as { details?: unknown }).details
    : undefined
)

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

const compileMindmapTopicUpdate = (
  document: Document,
  nodeId: NodeId,
  update: NodeUpdateInput
) => {
  const node = document.nodes[nodeId]
  if (!node) {
    return ok([] as Operation[])
  }

  const mindmapId = readNodeMindmapId(node)
  if (!mindmapId) {
    return ok(createNodeUpdateOperation(nodeId, update))
  }

  const ops: Operation[] = []
  const fields = update.fields
  const isRoot = isMindmapRoot(document, node)

  if (fields?.position) {
    if (!isRoot) {
      return {
        ok: false as const,
        error: {
          code: 'invalid' as const,
          message: 'Mindmap member position is reconcile-owned.'
        }
      }
    }
    ops.push({
      type: 'mindmap.root.move',
      id: mindmapId,
      position: fields.position
    })
  }

  if (fields && hasOwn(fields, 'groupId')) {
    return {
      ok: false as const,
      error: {
        code: 'invalid' as const,
        message: 'Mindmap topic group is not writable.'
      }
    }
  }
  if (fields && hasOwn(fields, 'owner')) {
    return {
      ok: false as const,
      error: {
        code: 'invalid' as const,
        message: 'Mindmap topic owner is aggregate-owned.'
      }
    }
  }

  const topicFieldMap: Record<'size' | 'rotation' | 'locked', MindmapTopicField> = {
    size: 'size',
    rotation: 'rotation',
    locked: 'locked'
  }

  ;(['size', 'rotation', 'locked'] as const).forEach((key) => {
    if (!fields || !hasOwn(fields, key)) {
      return
    }

    const value = fields[key]
    if (value === undefined && key !== 'size') {
      ops.push({
        type: 'mindmap.topic.field.unset',
        id: mindmapId,
        topicId: nodeId,
        field: topicFieldMap[key] as Extract<Operation, { type: 'mindmap.topic.field.unset' }>['field']
      })
      return
    }

    ops.push({
      type: 'mindmap.topic.field.set',
      id: mindmapId,
      topicId: nodeId,
      field: topicFieldMap[key],
      value
    })
  })

  for (const record of update.records ?? []) {
    if (record.op === 'unset') {
      ops.push({
        type: 'mindmap.topic.record.unset',
        id: mindmapId,
        topicId: nodeId,
        scope: record.scope,
        path: record.path
      })
      continue
    }

    ops.push({
      type: 'mindmap.topic.record.set',
      id: mindmapId,
      topicId: nodeId,
      scope: record.scope,
      path: record.path ?? '',
      value: record.value
    })
  }

  return ok(ops)
}

export const compileNodeCommand = (
  command: NodeCommand,
  ctx: CommandCompileContext
) => {
  const document = ctx.tx.read.document.get()

  switch (command.type) {
    case 'node.create': {
      const built = buildNodeCreateOperation({
        payload: command.input,
        doc: document,
        registries: ctx.registries,
        createNodeId: ctx.tx.ids.node
      })
      if (!built.ok) {
        return ctx.tx.fail.invalid(built.error.message, built.error.details)
      }

      ctx.tx.emit(built.data.operation)
      return {
        nodeId: built.data.nodeId
      }
    }
    case 'node.update': {
      const decision = resolveLockDecision({
        document,
        target: {
          kind: 'nodes',
          nodeIds: command.updates.map((entry) => entry.id)
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

      for (const entry of command.updates) {
        const planned = compileMindmapTopicUpdate(document, entry.id, entry.input)
        if (!planned.ok) {
          return ctx.tx.fail.invalid(planned.error.message, readErrorDetails(planned.error))
        }
        planned.data.forEach((op) => ctx.tx.emit(op))
      }
      return
    }
    case 'node.move': {
      const decision = resolveLockDecision({
        document,
        target: {
          kind: 'nodes',
          nodeIds: command.ids
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

      for (const id of command.ids) {
        const node = document.nodes[id]
        if (!node) {
          return ctx.tx.fail.invalid(`Node ${id} not found.`)
        }

        const mindmapId = readNodeMindmapId(node)
        if (!mindmapId) {
          ctx.tx.emit({
            type: 'node.field.set',
            id,
            field: 'position',
            value: {
              x: node.position.x + command.delta.x,
              y: node.position.y + command.delta.y
            }
          })
          continue
        }

        if (!isMindmapRoot(document, node)) {
          return ctx.tx.fail.invalid('Mindmap member move must use mindmap drag.')
        }

        ctx.tx.emit({
          type: 'mindmap.root.move',
          id: mindmapId,
          position: {
            x: node.position.x + command.delta.x,
            y: node.position.y + command.delta.y
          }
        })
      }
      return
    }
    case 'node.align': {
      const built = buildNodeAlignOperations({
        ids: command.ids,
        doc: document,
        nodeSize: ctx.nodeSize,
        mode: command.mode
      })
      if (!built.ok) {
        return ctx.tx.fail.invalid(built.error.message, built.error.details)
      }
      built.data.operations.forEach((op) => ctx.tx.emit(op))
      return
    }
    case 'node.distribute': {
      const built = buildNodeDistributeOperations({
        ids: command.ids,
        doc: document,
        nodeSize: ctx.nodeSize,
        mode: command.mode
      })
      if (!built.ok) {
        return ctx.tx.fail.invalid(built.error.message, built.error.details)
      }
      built.data.operations.forEach((op) => ctx.tx.emit(op))
      return
    }
    case 'node.delete':
    case 'node.deleteCascade':
      return compileCanvasDelete(
        command.ids.map((id) => ({ kind: 'node' as const, id })),
        ctx
      )
    case 'node.duplicate':
      return compileCanvasDuplicate(
        command.ids.map((id) => ({ kind: 'node' as const, id })),
        ctx
      )
  }
}
