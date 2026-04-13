import { isTextContentEmpty } from '@whiteboard/core/node'
import { isSizeEqual } from '@whiteboard/core/geometry'
import {
  compileNodeDataUpdate,
  compileNodeStyleUpdate,
  mergeNodeUpdates
} from '@whiteboard/core/schema'
import type { NodeId } from '@whiteboard/core/types'
import type { NodeContext } from '#whiteboard-editor/command/node/context'
import type { NodeTextCommands } from '#whiteboard-editor/command/node/types'

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
  preview: ({
    nodeId,
    position,
    size,
    fontSize,
    mode,
    wrapWidth,
    handle
  }) => {
    const item = ctx.read.live(nodeId)
    if (!item || item.node.type !== 'text') {
      return
    }

    ctx.preview.text.set(nodeId, {
      position,
      size,
      fontSize,
      mode,
      wrapWidth,
      handle
    })
  },
  clearPreview: (nodeId) => {
    ctx.preview.text.clearSize(nodeId)
  },
  cancel: ({
    nodeId
  }) => {
    ctx.preview.text.clear(nodeId)
    ctx.edit.clear()
  },
  commit: ({
    nodeId,
    field,
    value,
    size
  }) => {
    const committed = ctx.read.committed(nodeId)
    if (!committed) {
      ctx.preview.text.clear(nodeId)
      ctx.edit.clear()
      return undefined
    }

    const currentValue = typeof committed.node.data?.[field] === 'string'
      ? committed.node.data[field] as string
      : ''
    const previewItem = ctx.read.live(nodeId)
    const nextMeasuredSize = committed.node.type === 'text' && field === 'text'
      ? size ?? (
          previewItem
            ? {
                width: previewItem.rect.width,
                height: previewItem.rect.height
              }
            : undefined
        )
      : undefined
    const sizeUpdate = nextMeasuredSize && !isSizeEqual(nextMeasuredSize, committed.rect)
      ? nextMeasuredSize
      : undefined

    ctx.preview.text.clear(nodeId)
    ctx.edit.clear()

    if (
      committed.node.type === 'text'
      && field === 'text'
      && isTextContentEmpty(value)
    ) {
      ctx.selection.clear()
      return ctx.write.deleteCascade([nodeId])
    }

    if (value === currentValue && !sizeUpdate) {
      return undefined
    }

    return ctx.write.update(
      nodeId,
      mergeNodeUpdates(
        compileNodeDataUpdate(field, value),
        sizeUpdate
          ? {
              fields: {
                size: sizeUpdate
              }
            }
          : undefined
      )
    )
  },
  color: (nodeIds, color) => ctx.write.updateMany(
    toNodeStyleBatchUpdates(nodeIds, 'color', color)
  ),
  size: ({
    nodeIds,
    value,
    sizeById
  }) => ctx.write.updateMany(
    nodeIds.map((id) => {
      const committed = ctx.read.committed(id)
      const nextMeasuredSize = committed?.node.type === 'text'
        ? sizeById?.[id]
        : undefined
      const sizeUpdate = committed && nextMeasuredSize && !isSizeEqual(nextMeasuredSize, committed.rect)
        ? nextMeasuredSize
        : undefined

      return {
        id,
        update: mergeNodeUpdates(
          compileNodeStyleUpdate('fontSize', value),
          sizeUpdate
            ? {
                fields: {
                  size: sizeUpdate
                }
              }
            : undefined
        )
      }
    })
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
