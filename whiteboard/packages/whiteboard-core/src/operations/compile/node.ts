import { geometry as geometryApi } from '@whiteboard/core/geometry'
import {
  emitMindmapTopicUpdateOps,
  getNodeMindmapId,
  isMindmapRoot
} from '@whiteboard/core/mindmap/ops'
import { node as nodeApi } from '@whiteboard/core/node'
import type {
  WhiteboardCompileContext,
  WhiteboardCompileHandlerTable
} from '@whiteboard/core/operations/compile/helpers'
import {
  failCancelled,
  failInvalid,
  readCompileRegistries,
  readCompileServices
} from '@whiteboard/core/operations/compile/helpers'
import { resolveLockDecision } from '@whiteboard/core/operations/lock'
import type {
  Document,
  NodeId,
  NodeUpdateInput,
  Operation
} from '@whiteboard/core/types'
import { ok } from '@whiteboard/core/utils/result'
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

const compileMindmapTopicUpdate = (
  document: Document,
  nodeId: NodeId,
  update: NodeUpdateInput
) => {
  const node = document.nodes[nodeId]
  if (!node) {
    return ok([] as Operation[])
  }

  const mindmapId = getNodeMindmapId(node)
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

  emitMindmapTopicUpdateOps({
    mindmapId,
    topicId: nodeId,
    update,
    emit: (op) => {
      ops.push(op)
    }
  })

  return ok(ops)
}

const compileNodeTextCommit = (
  ctx: WhiteboardCompileContext<'node.text.commit'>
) => {
  const {
    intent,
    document
  } = ctx
  const node = document.nodes[intent.nodeId]
  if (!node) {
    return
  }

  if (
    node.type === 'text'
    && intent.field === 'text'
    && nodeApi.text.isContentEmpty(intent.value)
  ) {
    return compileCanvasDelete(
      [{
        kind: 'node',
        id: intent.nodeId
      }],
      ctx
    )
  }

  const decision = resolveLockDecision({
    document,
    target: {
      kind: 'nodes',
      nodeIds: [intent.nodeId]
    }
  })
  if (!decision.allowed) {
    return failCancelled(
      ctx,
      decision.reason === 'locked-node'
        ? 'Locked nodes cannot be modified.'
        : decision.reason === 'locked-edge'
          ? 'Locked edges cannot be modified.'
          : 'Locked node relations cannot be modified.'
    )
  }

  const currentValue = typeof node.data?.[intent.field] === 'string'
    ? node.data[intent.field] as string
    : ''
  const currentFontSize = typeof node.style?.fontSize === 'number'
    ? node.style.fontSize
    : undefined
  const input = nodeApi.update.merge(
    intent.value === currentValue
      ? undefined
      : {
          record: {
            [`data.${intent.field}`]: intent.value
          }
        },
    intent.size && !geometryApi.equal.size(intent.size, node.size)
      ? {
          fields: {
            size: intent.size
          }
        }
      : undefined,
    intent.fontSize !== undefined && currentFontSize !== intent.fontSize
      ? {
          record: {
            'style.fontSize': intent.fontSize
          }
        }
      : undefined,
    node.type === 'text' && node.data?.wrapWidth !== intent.wrapWidth
      ? {
          record: {
            'data.wrapWidth': intent.wrapWidth
          }
        }
      : undefined
  )

  if (nodeApi.update.isEmpty(input)) {
    return
  }

  const planned = compileMindmapTopicUpdate(document, intent.nodeId, input)
  if (!planned.ok) {
    return failInvalid(ctx, planned.error.message, readErrorDetails(planned.error))
  }

  planned.data.forEach((op) => ctx.emit(op))
}

type NodeIntentHandlers = Pick<
  WhiteboardCompileHandlerTable,
  'node.create'
  | 'node.update'
  | 'node.move'
  | 'node.text.commit'
  | 'node.align'
  | 'node.distribute'
  | 'node.delete'
  | 'node.deleteCascade'
  | 'node.duplicate'
>

export const nodeIntentHandlers: NodeIntentHandlers = {
  'node.create': (ctx) => {
    const document = ctx.document
    const built = nodeApi.op.create({
      payload: ctx.intent.input,
      doc: document,
      registries: readCompileRegistries(ctx),
      createNodeId: readCompileServices(ctx).ids.node
    })
    if (!built.ok) {
      return failInvalid(ctx, built.error.message, built.error.details)
    }

    ctx.emit(built.data.operation)
    ctx.output({
      nodeId: built.data.nodeId
    })
  },
  'node.update': (ctx) => {
    const document = ctx.document
    const decision = resolveLockDecision({
      document,
      target: {
        kind: 'nodes',
        nodeIds: ctx.intent.updates.map((entry) => entry.id)
      }
    })
    if (!decision.allowed) {
      return failCancelled(
        ctx,
        decision.reason === 'locked-node'
          ? 'Locked nodes cannot be modified.'
          : decision.reason === 'locked-edge'
            ? 'Locked edges cannot be modified.'
            : 'Locked node relations cannot be modified.'
      )
    }

    for (const entry of ctx.intent.updates) {
      const planned = compileMindmapTopicUpdate(document, entry.id, entry.input)
      if (!planned.ok) {
        return failInvalid(ctx, planned.error.message, readErrorDetails(planned.error))
      }
      planned.data.forEach((op) => ctx.emit(op))
    }
  },
  'node.move': (ctx) => {
    const {
      intent,
      document
    } = ctx
    const decision = resolveLockDecision({
      document,
      target: {
        kind: 'nodes',
        nodeIds: intent.ids
      }
    })
    if (!decision.allowed) {
      return failCancelled(
        ctx,
        decision.reason === 'locked-node'
          ? 'Locked nodes cannot be modified.'
          : decision.reason === 'locked-edge'
            ? 'Locked edges cannot be modified.'
            : 'Locked node relations cannot be modified.'
      )
    }

    for (const id of intent.ids) {
      const node = document.nodes[id]
      if (!node) {
        return failInvalid(ctx, `Node ${id} not found.`)
      }

      const mindmapId = getNodeMindmapId(node)
      if (!mindmapId) {
        ctx.emitMany(...nodeApi.update.createFieldsOperation(id, {
          position: {
            x: node.position.x + intent.delta.x,
            y: node.position.y + intent.delta.y
          }
        }))
        continue
      }

      if (!isMindmapRoot(document, node)) {
        return failInvalid(ctx, 'Mindmap member move must use mindmap drag.')
      }

      ctx.emit({
        type: 'mindmap.move',
        id: mindmapId,
        position: {
          x: node.position.x + intent.delta.x,
          y: node.position.y + intent.delta.y
        }
      })
    }
  },
  'node.text.commit': compileNodeTextCommit,
  'node.align': (ctx) => {
    const document = ctx.document
    const built = nodeApi.op.align({
      ids: ctx.intent.ids,
      doc: document,
      mode: ctx.intent.mode
    })
    if (!built.ok) {
      return failInvalid(ctx, built.error.message, built.error.details)
    }

    built.data.operations.forEach((op) => ctx.emit(op))
  },
  'node.distribute': (ctx) => {
    const document = ctx.document
    const built = nodeApi.op.distribute({
      ids: ctx.intent.ids,
      doc: document,
      mode: ctx.intent.mode
    })
    if (!built.ok) {
      return failInvalid(ctx, built.error.message, built.error.details)
    }

    built.data.operations.forEach((op) => ctx.emit(op))
  },
  'node.delete': (ctx) => compileCanvasDelete(
    ctx.intent.ids.map((id) => ({ kind: 'node' as const, id })),
    ctx
  ),
  'node.deleteCascade': (ctx) => compileCanvasDelete(
    ctx.intent.ids.map((id) => ({ kind: 'node' as const, id })),
    ctx
  ),
  'node.duplicate': (ctx) => {
    const result = compileCanvasDuplicate(
      ctx.intent.ids.map((id) => ({ kind: 'node' as const, id })),
      ctx
    )
    if (!result) {
      return
    }
    if ('kind' in result) {
      return result
    }

    ctx.output({
      nodeIds: result.allNodeIds,
      edgeIds: result.allEdgeIds
    })
  }
}
