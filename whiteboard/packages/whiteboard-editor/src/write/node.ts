import {
  compileNodeDataUpdate,
  compileNodeStyleUpdate,
} from '@whiteboard/core/schema'
import type { NodeId } from '@whiteboard/core/types'
import type { Engine } from '@whiteboard/engine'
import type {
  NodeLockWrite,
  NodeShapeWrite,
  NodeStyleWrite,
  NodeTextWrite,
  NodeUpdateWrite,
  NodeWrite
} from '@whiteboard/editor/write/types'
import type { EditorLayout } from '@whiteboard/editor/layout/runtime'
import type { EditorQuery } from '@whiteboard/editor/query'

type NodeTextCommitInput = Parameters<NodeTextWrite['commit']>[0]

type NodeContext = {
  read: {
    committed: (id: NodeId) => ReturnType<EditorQuery['node']['item']['get']>
  }
  write: NodeUpdateWrite & {
    textCommit: (input: NodeTextCommitInput) => ReturnType<NodeTextWrite['commit']>
  }
}

const createNodeUpdateWrite = (
  engine: Engine,
  {
    layout
  }: {
    layout: EditorLayout
  }
): NodeUpdateWrite => ({
  update: (id, input) => engine.execute({
    type: 'node.update',
    updates: [{
      id,
      input: layout.patchNodeUpdate(id, input)
    }]
  }),
  updateMany: (updates, options) => engine.execute({
    type: 'node.update',
    updates: updates.map((entry) => ({
      id: entry.id,
      input: layout.patchNodeUpdate(entry.id, entry.input, {
        origin: options?.origin
      })
    })),
    origin: options?.origin
  })
})

const createNodeContext = ({
  read,
  update,
  textCommit
}: {
  read: EditorQuery
  update: NodeUpdateWrite
  textCommit: (input: NodeTextCommitInput) => ReturnType<NodeTextWrite['commit']>
}): NodeContext => ({
  read: {
    committed: (id) => read.node.committed.get(id)
  },
  write: {
    update: update.update,
    updateMany: update.updateMany,
    textCommit
  }
})

const toNodeStyleBatchUpdates = (
  nodeIds: readonly NodeId[],
  path: string,
  value: unknown
) => nodeIds.map((id) => ({
  id,
  input: compileNodeStyleUpdate(path, value)
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
  }) => ctx.write.textCommit({
    nodeId,
    field,
    value,
    size,
    fontSize,
    wrapWidth
  }),
  color: (nodeIds, color) => ctx.write.updateMany(
    toNodeStyleBatchUpdates(nodeIds, 'color', color)
  ),
  size: ({
    nodeIds,
    value
  }) => ctx.write.updateMany(
    nodeIds.map((id) => ({
      id,
      input: compileNodeStyleUpdate('fontSize', value)
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
      input: {
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
        input: compileNodeDataUpdate('kind', kind)
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
  const update = createNodeUpdateWrite(engine, {
    layout
  })
  const ctx = createNodeContext({
    read,
    update,
    textCommit: (input) => engine.execute({
      type: 'node.text.commit',
      ...input
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
    update: ctx.write.update,
    updateMany: ctx.write.updateMany,
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
    lock: createNodeLockWrite(ctx),
    shape: createNodeShapeWrite(ctx),
    style: createNodeStyleWrite(ctx),
    text: createNodeTextWrite(ctx)
  }
}
