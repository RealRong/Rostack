import { isTextContentEmpty } from '@whiteboard/core/node'
import { isSizeEqual } from '@whiteboard/core/geometry'
import type { NodeContext } from './context'
import type { NodeTextCommands } from './types'
import {
  dataUpdate,
  mergeNodeUpdates,
  styleUpdate,
  toNodeStyleUpdates
} from './patch'

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
        dataUpdate(field, value),
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
    toNodeStyleUpdates(nodeIds, 'color', color)
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
          styleUpdate('fontSize', value),
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
    toNodeStyleUpdates(nodeIds, 'fontWeight', weight)
  ),
  italic: (nodeIds, italic) => ctx.write.updateMany(
    toNodeStyleUpdates(nodeIds, 'fontStyle', italic ? 'italic' : 'normal')
  ),
  align: (nodeIds, align) => ctx.write.updateMany(
    toNodeStyleUpdates(nodeIds, 'textAlign', align)
  )
})
