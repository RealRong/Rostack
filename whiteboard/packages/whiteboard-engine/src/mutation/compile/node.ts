import { path as mutationPath } from '@shared/mutation'
import { geometry as geometryApi } from '@whiteboard/core/geometry'
import { node as nodeApi } from '@whiteboard/core/node'
import { schema as schemaApi } from '@whiteboard/core/schema'
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
import type { NodeIntent } from '../../types/intent'
import type { IntentCompileContext } from '../types'
import {
  compileCanvasDelete,
  compileCanvasDuplicate
} from './canvas'

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
    return ok(nodeApi.update.createOperation(nodeId, update))
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
      type: 'mindmap.move',
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
      path: record.path ?? mutationPath.root(),
      value: record.value
    })
  }

  return ok(ops)
}

const compileNodeTextCommit = (
  command: Extract<NodeIntent, { type: 'node.text.commit' }>,
  ctx: IntentCompileContext
) => {
  const document = ctx.tx.read.document.get()
  const node = document.nodes[command.nodeId]
  if (!node) {
    return
  }

  if (
    node.type === 'text'
    && command.field === 'text'
    && nodeApi.text.isContentEmpty(command.value)
  ) {
    return compileCanvasDelete(
      [{
        kind: 'node',
        id: command.nodeId
      }],
      ctx
    )
  }

  const decision = resolveLockDecision({
    document,
    target: {
      kind: 'nodes',
      nodeIds: [command.nodeId]
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

  const currentValue = typeof node.data?.[command.field] === 'string'
    ? node.data[command.field] as string
    : ''
  const currentFontSize = typeof node.style?.fontSize === 'number'
    ? node.style.fontSize
    : undefined
  const input = schemaApi.node.mergeUpdates(
    command.value === currentValue
      ? undefined
      : schemaApi.node.compileDataUpdate(mutationPath.of(command.field), command.value),
    command.size && !geometryApi.equal.size(command.size, node.size)
      ? {
          fields: {
            size: command.size
          }
        }
      : undefined,
    command.fontSize !== undefined && currentFontSize !== command.fontSize
      ? schemaApi.node.compileStyleUpdate(mutationPath.of('fontSize'), command.fontSize)
      : undefined,
    node.type === 'text' && node.data?.wrapWidth !== command.wrapWidth
      ? schemaApi.node.compileDataUpdate(mutationPath.of('wrapWidth'), command.wrapWidth)
      : undefined
  )

  if (nodeApi.update.isEmpty(input)) {
    return
  }

  const planned = compileMindmapTopicUpdate(document, command.nodeId, input)
  if (!planned.ok) {
    return ctx.tx.fail.invalid(planned.error.message, readErrorDetails(planned.error))
  }
  planned.data.forEach((op) => ctx.tx.emit(op))
}

export const compileNodeIntent = (
  command: NodeIntent,
  ctx: IntentCompileContext
) => {
  const document = ctx.tx.read.document.get()

  switch (command.type) {
    case 'node.create': {
      const built = nodeApi.command.buildCreate({
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
          type: 'mindmap.move',
          id: mindmapId,
          position: {
            x: node.position.x + command.delta.x,
            y: node.position.y + command.delta.y
          }
        })
      }
      return
    }
    case 'node.text.commit':
      return compileNodeTextCommit(command, ctx)
    case 'node.align': {
      const built = nodeApi.command.buildAlign({
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
      const built = nodeApi.command.buildDistribute({
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
