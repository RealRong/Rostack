import {
  emitMindmapTopicUpdateOps,
  getNodeMindmapId
} from '@whiteboard/core/mindmap/ops'
import { node as nodeApi } from '@whiteboard/core/node'
import type {
  DocumentReader
} from '@whiteboard/core/document/reader'
import type {
  WhiteboardCompileContext,
  WhiteboardCompileHandlerTable
} from '@whiteboard/core/operations/compile/helpers'
import {
  failCancelled,
  failInvalid,
  readCompileRegistries,
  readCompileServices,
  runCustomPlanner,
} from '@whiteboard/core/operations/compile/helpers'
import {
  planMindmapMove,
  planMindmapTopicPatch,
} from '@whiteboard/core/operations/custom/mindmap'
import { resolveLockDecision } from '@whiteboard/core/operations/lock'
import type {
  NodeId,
  NodeUpdateInput,
} from '@whiteboard/core/types'
import { ok } from '@whiteboard/core/utils/result'
import {
  compileCanvasDelete,
  compileCanvasDuplicate
} from './canvas'
import {
  writeNodeCreate,
  writeNodePatch,
} from './write'

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

const writeMindmapTopicUpdate = (
  ctx: WhiteboardCompileContext,
  nodeId: NodeId,
  update: NodeUpdateInput
) => {
  const reader = ctx.reader
  const node = reader.nodes.get(nodeId)
  if (!node) {
    return
  }

  const mindmapId = getNodeMindmapId(node)
  if (!mindmapId) {
    const patch = nodeApi.update.toPatch(update)
    if (Object.keys(patch).length > 0) {
      writeNodePatch(ctx.program, nodeId, patch)
    }
    return
  }

  const fields = update.fields
  const isRoot = reader.mindmaps.isRoot(node.id)

  if (fields?.position) {
    if (!isRoot) {
      throw failInvalid(ctx, 'Mindmap member position is reconcile-owned.')
    }

    runCustomPlanner(ctx, {
      type: 'mindmap.move',
      id: mindmapId,
      position: fields.position
    }, planMindmapMove)
  }

  if (fields && hasOwn(fields, 'groupId')) {
    throw failInvalid(ctx, 'Mindmap topic group is not writable.')
  }
  if (fields && hasOwn(fields, 'owner')) {
    throw failInvalid(ctx, 'Mindmap topic owner is aggregate-owned.')
  }

  const patch = nodeApi.update.toPatch({
    ...(fields
      ? {
          fields: {
            ...(hasOwn(fields, 'size') ? { size: fields.size } : {}),
            ...(hasOwn(fields, 'rotation') ? { rotation: fields.rotation } : {}),
            ...(hasOwn(fields, 'locked') ? { locked: fields.locked } : {})
          }
        }
      : {}),
    ...(update.record ? { record: update.record } : {})
  })

  if (Object.keys(patch).length === 0) {
    return
  }

  runCustomPlanner(ctx, {
    type: 'mindmap.topic.patch',
    id: mindmapId,
    topicId: nodeId,
    patch
  }, planMindmapTopicPatch)
}

const compileNodeTextCommit = (
  ctx: WhiteboardCompileContext<'node.text.commit'>
) => {
  const {
    intent
  } = ctx
  const reader = ctx.reader
  const node = reader.nodes.get(intent.nodeId)
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
    reader,
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

  const input = readCompileServices(ctx).layout.commit({
    kind: 'node.text.commit',
    nodeId: intent.nodeId,
    node,
    field: intent.field,
    value: intent.value
  }).update

  if (!input || nodeApi.update.isEmpty(input)) {
    return
  }

  try {
    writeMindmapTopicUpdate(ctx, intent.nodeId, input)
  } catch (error) {
    if (error && typeof error === 'object' && 'kind' in error) {
      return error as never
    }
    return failInvalid(ctx, error instanceof Error ? error.message : 'Node update failed.', readErrorDetails(error))
  }
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
    const input = readCompileServices(ctx).layout.commit({
      kind: 'node.create',
      node: ctx.intent.input,
      position: ctx.intent.input.position
    }).node
    const built = nodeApi.op.create({
      payload: input,
      doc: document,
      registries: readCompileRegistries(ctx),
      createNodeId: readCompileServices(ctx).ids.node
    })
    if (!built.ok) {
      return failInvalid(ctx, built.error.message, built.error.details)
    }

    writeNodeCreate(ctx.program, built.data.node)
    ctx.output({
      nodeId: built.data.nodeId
    })
  },
  'node.update': (ctx) => {
    const reader = ctx.reader
    const decision = resolveLockDecision({
      reader,
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
      const current = reader.nodes.get(entry.id)
      const update = current
        ? readCompileServices(ctx).layout.commit({
            kind: 'node.update',
            nodeId: entry.id,
            node: current,
            update: entry.input,
            origin: ctx.intent.origin
          }).update
        : entry.input
      try {
        writeMindmapTopicUpdate(ctx, entry.id, update)
      } catch (error) {
        if (error && typeof error === 'object' && 'kind' in error) {
          return error as never
        }
        return failInvalid(ctx, error instanceof Error ? error.message : 'Node update failed.', readErrorDetails(error))
      }
    }
  },
  'node.move': (ctx) => {
    const { intent } = ctx
    const reader = ctx.reader
    const decision = resolveLockDecision({
      reader,
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
      const node = reader.nodes.get(id)
      if (!node) {
        return failInvalid(ctx, `Node ${id} not found.`)
      }

      const mindmapId = getNodeMindmapId(node)
      if (!mindmapId) {
        writeNodePatch(ctx.program, id, nodeApi.update.toPatch({
          fields: {
            position: {
              x: node.position.x + intent.delta.x,
              y: node.position.y + intent.delta.y
            }
          }
        }))
        continue
      }

      if (!reader.mindmaps.isRoot(id)) {
        return failInvalid(ctx, 'Mindmap member move must use mindmap drag.')
      }

      runCustomPlanner(ctx, {
        type: 'mindmap.move',
        id: mindmapId,
        position: {
          x: node.position.x + intent.delta.x,
          y: node.position.y + intent.delta.y
        }
      }, planMindmapMove)
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

    built.data.updates.forEach((update) => {
      writeNodePatch(ctx.program, update.id, nodeApi.update.toPatch({
        fields: {
          position: update.position
        }
      }))
    })
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

    built.data.updates.forEach((update) => {
      writeNodePatch(ctx.program, update.id, nodeApi.update.toPatch({
        fields: {
          position: update.position
        }
      }))
    })
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
