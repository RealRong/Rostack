import {
  type Path
} from '@shared/draft'
import type { Node, NodeId } from '@whiteboard/core/types'
import type { Engine } from '@whiteboard/engine'
import type { DocumentQuery, Query } from '@whiteboard/editor-scene'
import type {
  NodeLockWrite,
  NodeShapeWrite,
  NodeStyleWrite,
  NodeTextWrite,
  NodeUpdateWrite,
  NodeWrite
} from '@whiteboard/editor/write/types'
import {
  patchNodeCreateByTextMeasure,
  patchNodeUpdateByTextMeasure,
  type TextLayoutMeasure
} from '@whiteboard/editor/layout/textLayout'
import type { NodeSpecReader } from '@whiteboard/editor/types/node'

type NodeTextCommitInput = Parameters<NodeTextWrite['commit']>[0]

const createStyleRecordUpdate = (
  path: Path,
  value: unknown
) => ({
  record: {
    [`style.${path}`]: value
  }
})

const createDataRecordUpdate = (
  path: Path,
  value: unknown
) => ({
  record: {
    [`data.${path}`]: value
  }
})

type NodeContext = {
  read: {
    node: (id: NodeId) => Node | undefined
  }
  write: NodeUpdateWrite & {
    textCommit: (input: NodeTextCommitInput) => ReturnType<NodeTextWrite['commit']>
  }
}

const createNodeUpdateWrite = (
  engine: Engine,
  {
    document,
    projection,
    nodes,
    measure
  }: {
    document: Pick<DocumentQuery, 'node'>
    projection: Pick<Query, 'node'>
    nodes: NodeSpecReader
    measure: TextLayoutMeasure
  }
): NodeUpdateWrite => ({
  update: (id, input) => {
    const node = document.node(id)
    const rect = projection.node.get(id)?.geometry.rect
    return engine.execute({
      type: 'node.update',
      updates: [{
        id,
        input: node && rect
          ? patchNodeUpdateByTextMeasure({
              nodeId: id,
              node,
              rect,
              update: input,
              nodes,
              measure
            })
          : input
      }]
    })
  },
  updateMany: (updates, options) => engine.execute({
    type: 'node.update',
    updates: updates.map((entry) => ({
      id: entry.id,
      input: (() => {
        const node = document.node(entry.id)
        const rect = projection.node.get(entry.id)?.geometry.rect
        return node && rect
          ? patchNodeUpdateByTextMeasure({
              nodeId: entry.id,
              node,
              rect,
              update: entry.input,
              nodes,
              measure,
              origin: options?.origin
            })
          : entry.input
      })()
    })),
    origin: options?.origin
  })
})

const createNodeContext = ({
  read,
  update,
  textCommit
}: {
  read: {
    document: Pick<DocumentQuery, 'node'>
  }
  update: NodeUpdateWrite
  textCommit: (input: NodeTextCommitInput) => ReturnType<NodeTextWrite['commit']>
}): NodeContext => ({
  read: {
    node: (id) => read.document.node(id)
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
  input: createStyleRecordUpdate(path, value)
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
      input: createStyleRecordUpdate('fontSize', value)
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
      const shouldLock = nodeIds.some((id) => !ctx.read.node(id)?.locked)
      return set(nodeIds, shouldLock)
    }
  }
}

const createNodeShapeWrite = (
  ctx: NodeContext
): NodeShapeWrite => ({
  set: (nodeIds, kind) => ctx.write.updateMany(
    nodeIds.flatMap((id) => {
      const node = ctx.read.node(id)
      if (node?.type !== 'shape') {
        return []
      }

      return [{
        id,
        input: createDataRecordUpdate('kind', kind)
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
  nodes,
  measure
}: {
  engine: Engine
  read: {
    document: Pick<DocumentQuery, 'node'>
    projection: Pick<Query, 'node'>
  }
  nodes: NodeSpecReader
  measure: TextLayoutMeasure
}): NodeWrite => {
  const update = createNodeUpdateWrite(engine, {
    document: read.document,
    projection: read.projection,
    nodes,
    measure
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
      input: patchNodeCreateByTextMeasure({
        payload: {
          ...input.template,
          position: {
            x: input.position.x,
            y: input.position.y
          }
        },
        nodes,
        measure
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
