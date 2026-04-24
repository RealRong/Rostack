import {
  path as mutationPath,
  type Path
} from '@shared/mutation'
import { schema as schemaApi } from '@whiteboard/core/schema'
import type { NodeId } from '@whiteboard/core/types'
import type { Engine } from '@whiteboard/engine'
import type { DocumentRead } from '@whiteboard/editor/document/read'
import type {
  NodeLockWrite,
  NodeShapeWrite,
  NodeStyleWrite,
  NodeTextWrite,
  NodeUpdateWrite,
  NodeWrite
} from '@whiteboard/editor/write/types'
import type { EditorLayout } from '@whiteboard/editor/layout/runtime'

type NodeTextCommitInput = Parameters<NodeTextWrite['commit']>[0]

type NodeContext = {
  read: {
    committed: (id: NodeId) => ReturnType<DocumentRead['node']['committed']['get']>
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
  read: Pick<DocumentRead, 'node'>
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
  path: Path,
  value: unknown
) => nodeIds.map((id) => ({
  id,
  input: schemaApi.node.compileStyleUpdate(path, value)
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
    toNodeStyleBatchUpdates(nodeIds, mutationPath.of('color'), color)
  ),
  size: ({
    nodeIds,
    value
  }) => ctx.write.updateMany(
    nodeIds.map((id) => ({
      id,
      input: schemaApi.node.compileStyleUpdate(mutationPath.of('fontSize'), value)
    }))
  ),
  weight: (nodeIds, weight) => ctx.write.updateMany(
    toNodeStyleBatchUpdates(nodeIds, mutationPath.of('fontWeight'), weight)
  ),
  italic: (nodeIds, italic) => ctx.write.updateMany(
    toNodeStyleBatchUpdates(nodeIds, mutationPath.of('fontStyle'), italic ? 'italic' : 'normal')
  ),
  align: (nodeIds, align) => ctx.write.updateMany(
    toNodeStyleBatchUpdates(nodeIds, mutationPath.of('textAlign'), align)
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
        input: schemaApi.node.compileDataUpdate(mutationPath.of('kind'), kind)
      }]
    })
  )
})

const createNodeStyleWrite = (
  ctx: NodeContext
): NodeStyleWrite => ({
  fill: (nodeIds, value) => ctx.write.updateMany(
    toNodeStyleBatchUpdates(nodeIds, mutationPath.of('fill'), value)
  ),
  fillOpacity: (nodeIds, value) => ctx.write.updateMany(
    toNodeStyleBatchUpdates(nodeIds, mutationPath.of('fillOpacity'), value)
  ),
  stroke: (nodeIds, value) => ctx.write.updateMany(
    toNodeStyleBatchUpdates(nodeIds, mutationPath.of('stroke'), value)
  ),
  strokeWidth: (nodeIds, value) => ctx.write.updateMany(
    toNodeStyleBatchUpdates(nodeIds, mutationPath.of('strokeWidth'), value)
  ),
  strokeOpacity: (nodeIds, value) => ctx.write.updateMany(
    toNodeStyleBatchUpdates(nodeIds, mutationPath.of('strokeOpacity'), value)
  ),
  strokeDash: (nodeIds, value) => ctx.write.updateMany(
    toNodeStyleBatchUpdates(nodeIds, mutationPath.of('strokeDash'), value)
  ),
  opacity: (nodeIds, value) => ctx.write.updateMany(
    toNodeStyleBatchUpdates(nodeIds, mutationPath.of('opacity'), value)
  ),
  textColor: (nodeIds, value) => ctx.write.updateMany(
    toNodeStyleBatchUpdates(nodeIds, mutationPath.of('color'), value)
  )
})

export const createNodeWrite = ({
  engine,
  read,
  layout
}: {
  engine: Engine
  read: Pick<DocumentRead, 'node'>
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
