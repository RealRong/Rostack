import { isSizeEqual } from '@whiteboard/core/geometry'
import { isTextContentEmpty, isNodeUpdateEmpty } from '@whiteboard/core/node'
import {
  compileNodeDataUpdate,
  compileNodeStyleUpdate,
  mergeNodeUpdates
} from '@whiteboard/core/schema'
import type { NodeId } from '@whiteboard/core/types'
import type { Engine } from '@whiteboard/engine'
import type {
  NodeLockWrite,
  NodePatchWrite,
  NodeShapeWrite,
  NodeStyleWrite,
  NodeTextWrite,
  NodeWrite
} from '@whiteboard/editor/write/types'
import type { EditorLayout } from '@whiteboard/editor/layout/runtime'
import type { EditorQuery } from '@whiteboard/editor/query'

type NodeContext = {
  read: {
    committed: (id: NodeId) => ReturnType<EditorQuery['node']['item']['get']>
    live: (id: NodeId) => ReturnType<EditorQuery['node']['item']['get']>
  }
  write: NodePatchWrite & {
    deleteCascade: (ids: NodeId[]) => ReturnType<NodePatchWrite['update']> | undefined
  }
}

const createNodePatchWrite = (
  engine: Engine,
  {
    layout
  }: {
    layout: EditorLayout
  }
): NodePatchWrite => ({
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

const createNodeContext = ({
  read,
  patch,
  deleteCascade
}: {
  read: EditorQuery
  patch: NodePatchWrite
  deleteCascade: (ids: NodeId[]) => ReturnType<NodePatchWrite['update']> | undefined
}): NodeContext => ({
  read: {
    committed: (id) => read.node.committed.get(id),
    live: (id) => read.node.item.get(id)
  },
  write: {
    update: patch.update,
    updateMany: patch.updateMany,
    deleteCascade
  }
})

const toNodeStyleBatchUpdates = (
  nodeIds: readonly NodeId[],
  path: string,
  value: unknown
) => nodeIds.map((id) => ({
  id,
  update: compileNodeStyleUpdate(path, value)
}))

export const createNodeTextWrite = (
  ctx: NodeContext
): NodeTextWrite => ({
  commit: ({
    nodeId,
    field,
    value,
    size,
    fontSize,
    wrapWidth
  }) => {
    const committed = ctx.read.committed(nodeId)
    if (!committed) {
      return undefined
    }

    const currentValue = typeof committed.node.data?.[field] === 'string'
      ? committed.node.data[field] as string
      : ''

    if (
      committed.node.type === 'text'
      && field === 'text'
      && isTextContentEmpty(value)
    ) {
      return ctx.write.deleteCascade([nodeId])
    }

    if (value === currentValue) {
      if (
        isSizeEqual(size, committed.rect)
        && (
          fontSize === undefined
          || committed.node.style?.fontSize === fontSize
        )
        && (
          wrapWidth === undefined
          || committed.node.data?.wrapWidth === wrapWidth
        )
      ) {
        return undefined
      }
    }

    const update = mergeNodeUpdates(
      value === currentValue
        ? undefined
        : compileNodeDataUpdate(field, value),
      size && !isSizeEqual(size, committed.rect)
        ? {
            fields: {
              size
            }
          }
        : undefined,
      fontSize !== undefined && committed.node.style?.fontSize !== fontSize
        ? compileNodeStyleUpdate('fontSize', fontSize)
        : undefined,
      committed.node.type === 'text' && committed.node.data?.wrapWidth !== wrapWidth
        ? compileNodeDataUpdate('wrapWidth', wrapWidth)
        : undefined
    )

    return ctx.write.update(nodeId, update)
  },
  color: (nodeIds, color) => ctx.write.updateMany(
    toNodeStyleBatchUpdates(nodeIds, 'color', color)
  ),
  size: ({
    nodeIds,
    value
  }) => ctx.write.updateMany(
    nodeIds.map((id) => ({
      id,
      update: compileNodeStyleUpdate('fontSize', value)
    }))
  ),
  weight: (nodeIds, weight) => ctx.write.updateMany(
    toNodeStyleBatchUpdates(nodeIds, 'fontWeight', weight)
  ),
  italic: (nodeIds, italic) => ctx.write.updateMany(
    toNodeStyleBatchUpdates(nodeIds, 'fontStyle', italic ? 'italic' : 'normal')
  ),
  align: (nodeIds, align) => ctx.write.updateMany(
    toNodeStyleBatchUpdates(nodeIds, 'textAlign', align)
  )
})

const createNodeLockWrite = (
  ctx: NodeContext
): NodeLockWrite => {
  const set: NodeLockWrite['set'] = (nodeIds, locked) => ctx.write.updateMany(
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

const createNodeShapeWrite = (
  ctx: NodeContext
): NodeShapeWrite => ({
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

const createNodeStyleWrite = (
  ctx: NodeContext
): NodeStyleWrite => ({
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

export const createNodeWrite = ({
  engine,
  read,
  layout
}: {
  engine: Engine
  read: EditorQuery
  layout: EditorLayout
}): NodeWrite => {
  const patch = createNodePatchWrite(engine, {
    layout
  })
  const ctx = createNodeContext({
    read,
    patch,
    deleteCascade: (ids) => engine.execute({
      type: 'node.deleteCascade',
      ids
    })
  })

  return {
    create: (input) => engine.execute({
      type: 'node.create',
      input: layout.patchNodeCreatePayload({
        ...input.template,
        position: {
          x: input.position.x,
          y: input.position.y
        }
      })
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
    lock: createNodeLockWrite(ctx),
    shape: createNodeShapeWrite(ctx),
    style: createNodeStyleWrite(ctx),
    text: createNodeTextWrite(ctx)
  }
}
