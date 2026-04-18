import { isSizeEqual } from '@whiteboard/core/geometry'
import { isTextContentEmpty } from '@whiteboard/core/node'
import {
  compileNodeDataUpdate,
  compileNodeStyleUpdate,
  mergeNodeUpdates
} from '@whiteboard/core/schema'
import type { NodeId } from '@whiteboard/core/types'
import type { NodeContext } from '@whiteboard/editor/command/node/context'
import type { NodeTextCommands } from '@whiteboard/editor/command/node/types'

const toNodeStyleBatchUpdates = (
  nodeIds: readonly NodeId[],
  path: string,
  value: unknown
) => nodeIds.map((id) => ({
  id,
  update: compileNodeStyleUpdate(path, value)
}))

export const createNodeTextCommands = (
  ctx: NodeContext
): NodeTextCommands => ({
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
