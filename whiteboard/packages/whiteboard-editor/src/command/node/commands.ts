import { isNodeUpdateEmpty } from '@whiteboard/core/node'
import {
  compileNodeDataUpdate,
  compileNodeStyleUpdate
} from '@whiteboard/core/schema'
import type { NodeId } from '@whiteboard/core/types'
import type { Engine } from '@whiteboard/engine'
import { createNodeContext } from '@whiteboard/editor/command/node/context'
import type { NodeContext } from '@whiteboard/editor/command/node/context'
import {
  createNodeTextCommands
} from '@whiteboard/editor/command/node/text'
import type {
  NodeLayoutCommands,
  NodeCommands,
  NodeLockCommands,
  NodeShapeCommands,
  NodeStyleCommands,
  NodePatchWriter
} from '@whiteboard/editor/command/node/types'
import type { LayoutRuntime } from '@whiteboard/editor/layout/runtime'
import type { EditorQueryRead } from '@whiteboard/editor/query'
import type { LocalFeedbackActions } from '@whiteboard/editor/local/actions/feedback'
import type { SessionActions } from '@whiteboard/editor/types/commands'

const createNodePatchWriter = (
  engine: Engine,
  {
    layout
  }: {
    layout: LayoutRuntime
  }
): NodePatchWriter => ({
  update: (id, update) => engine.execute({
    type: 'node.patch',
    updates: [{
      id,
      update: layout.patchNodeUpdate(id, update)
    }]
  }),
  updateMany: (updates, options) => engine.execute({
    type: 'node.patch',
    updates: updates.map((entry) => ({
      id: entry.id,
      update: layout.patchNodeUpdate(entry.id, entry.update, {
        origin: options?.origin
      })
    })),
    origin: options?.origin
  })
})

const toNodeStyleBatchUpdates = (
  nodeIds: readonly NodeId[],
  path: string,
  value: unknown
) => nodeIds.map((id) => ({
  id,
  update: compileNodeStyleUpdate(path, value)
}))

const createNodeLockCommands = (
  ctx: NodeContext
): NodeLockCommands => {
  const set: NodeLockCommands['set'] = (nodeIds, locked) => ctx.write.updateMany(
    nodeIds.map((id) => ({
      id,
      update: {
        fields: {
          locked
        }
      }
    }))
  )

  return {
    set,
    toggle: (nodeIds) => {
      const shouldLock = nodeIds.some((id) => !ctx.read.committed(id)?.node.locked)
      return set(nodeIds, shouldLock)
    }
  }
}

const createNodeShapeCommands = (
  ctx: NodeContext
): NodeShapeCommands => ({
  set: (nodeIds, kind) => ctx.write.updateMany(
    nodeIds.flatMap((id) => {
      const node = ctx.read.committed(id)?.node
      if (node?.type !== 'shape') {
        return []
      }

      return [{
        id,
        update: compileNodeDataUpdate('kind', kind)
      }]
    })
  )
})

const createNodeStyleCommands = (
  ctx: NodeContext
): NodeStyleCommands => ({
  fill: (nodeIds, value) => ctx.write.updateMany(
    toNodeStyleBatchUpdates(nodeIds, 'fill', value)
  ),
  fillOpacity: (nodeIds, value) => ctx.write.updateMany(
    toNodeStyleBatchUpdates(nodeIds, 'fillOpacity', value)
  ),
  stroke: (nodeIds, value) => ctx.write.updateMany(
    toNodeStyleBatchUpdates(nodeIds, 'stroke', value)
  ),
  strokeWidth: (nodeIds, value) => ctx.write.updateMany(
    toNodeStyleBatchUpdates(nodeIds, 'strokeWidth', value)
  ),
  strokeOpacity: (nodeIds, value) => ctx.write.updateMany(
    toNodeStyleBatchUpdates(nodeIds, 'strokeOpacity', value)
  ),
  strokeDash: (nodeIds, value) => ctx.write.updateMany(
    toNodeStyleBatchUpdates(nodeIds, 'strokeDash', value)
  ),
  opacity: (nodeIds, value) => ctx.write.updateMany(
    toNodeStyleBatchUpdates(nodeIds, 'opacity', value)
  ),
  textColor: (nodeIds, value) => ctx.write.updateMany(
    toNodeStyleBatchUpdates(nodeIds, 'color', value)
  )
})

const createNodeLayoutCommands = (
  ctx: NodeContext
): NodeLayoutCommands => ({
  sync: (nodeIds) => {
    const updates = nodeIds.flatMap((id) => {
      const update = ctx.layout.syncNode(id)
      return update
        ? [{
            id,
            update
          }]
        : []
    })

    return updates.length > 0
      ? ctx.write.updateMany(updates, {
          origin: 'system'
        })
      : undefined
  }
})

export const createNodeCommands = ({
  engine,
  read,
  preview,
  layout,
  session
}: {
  engine: Engine
  read: EditorQueryRead
  preview: Pick<LocalFeedbackActions, 'node'>
  layout: LayoutRuntime
  session: Pick<SessionActions, 'edit' | 'selection'>
}): NodeCommands => {
  const patch = createNodePatchWriter(engine, {
    layout
  })
  const ctx = createNodeContext({
    read,
    patch,
    preview: preview.node,
    layout,
    session,
    deleteCascade: (ids) => engine.execute({
      type: 'node.deleteCascade',
      ids
    })
  })

  return {
    create: (payload) => engine.execute({
      type: 'node.create',
      payload
    }),
    patch: (ids, update, options) => {
      if (isNodeUpdateEmpty(update)) {
        return undefined
      }

      const updates = ids.flatMap((id) => ctx.read.committed(id)
        ? [{
            id,
            update
          }]
        : [])
      if (!updates.length) {
        return undefined
      }

      return ctx.write.updateMany(updates, {
        origin: options?.origin
      })
    },
    move: (input) => engine.execute({
      type: 'node.move',
      ids: input.ids,
      delta: input.delta
    }),
    align: (ids, mode) => engine.execute({
      type: 'node.align',
      ids,
      mode
    }),
    distribute: (ids, mode) => engine.execute({
      type: 'node.distribute',
      ids,
      mode
    }),
    delete: (ids) => engine.execute({
      type: 'node.delete',
      ids
    }),
    deleteCascade: (ids) => engine.execute({
      type: 'node.deleteCascade',
      ids
    }),
    duplicate: (ids) => engine.execute({
      type: 'node.duplicate',
      ids
    }),
    update: ctx.write.update,
    updateMany: ctx.write.updateMany,
    lock: createNodeLockCommands(ctx),
    shape: createNodeShapeCommands(ctx),
    style: createNodeStyleCommands(ctx),
    text: createNodeTextCommands(ctx),
    layout: createNodeLayoutCommands(ctx)
  }
}
