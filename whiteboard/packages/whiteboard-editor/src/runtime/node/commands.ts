import { isNodeUpdateEmpty } from '@whiteboard/core/node'
import type { Engine } from '@whiteboard/engine'
import {
  createNodePatchWriter,
  dataUpdate,
  styleUpdate,
  toNodeDataUpdates,
  toNodeStyleUpdates
} from './patch'
import {
  createNodeContext,
  type NodeContext
} from './context'
import {
  createNodeTextCommands
} from './text'
import type {
  NodeCommands,
  NodeLockCommands,
  NodeShapeCommands,
  NodeStyleCommands
} from './types'
import type { EditorRead } from '../../types/editor'
import type { PreviewCommands } from '../overlay/preview'
import type { SessionCommands } from '../commands/session'

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
        update: dataUpdate('kind', kind)
      }]
    })
  )
})

const createNodeStyleCommands = (
  ctx: NodeContext
): NodeStyleCommands => ({
  fill: (nodeIds, value) => ctx.write.updateMany(
    toNodeStyleUpdates(nodeIds, 'fill', value)
  ),
  fillOpacity: (nodeIds, value) => ctx.write.updateMany(
    toNodeStyleUpdates(nodeIds, 'fillOpacity', value)
  ),
  stroke: (nodeIds, value) => ctx.write.updateMany(
    toNodeStyleUpdates(nodeIds, 'stroke', value)
  ),
  strokeWidth: (nodeIds, value) => ctx.write.updateMany(
    toNodeStyleUpdates(nodeIds, 'strokeWidth', value)
  ),
  strokeOpacity: (nodeIds, value) => ctx.write.updateMany(
    toNodeStyleUpdates(nodeIds, 'strokeOpacity', value)
  ),
  strokeDash: (nodeIds, value) => ctx.write.updateMany(
    toNodeStyleUpdates(nodeIds, 'strokeDash', value)
  ),
  opacity: (nodeIds, value) => ctx.write.updateMany(
    toNodeStyleUpdates(nodeIds, 'opacity', value)
  ),
  textColor: (nodeIds, value) => ctx.write.updateMany(
    toNodeStyleUpdates(nodeIds, 'color', value)
  )
})

export const createNodeCommands = ({
  engine,
  read,
  preview,
  session
}: {
  engine: Engine
  read: EditorRead
  preview: Pick<PreviewCommands, 'node'>
  session: Pick<SessionCommands, 'edit' | 'selection'>
}): NodeCommands => {
  const patch = createNodePatchWriter(engine)
  const ctx = createNodeContext({
    engineRead: engine.read.node.item,
    read,
    patch,
    preview: preview.node,
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
    text: createNodeTextCommands(ctx)
  }
}
