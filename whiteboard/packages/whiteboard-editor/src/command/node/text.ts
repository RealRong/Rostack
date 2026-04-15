import { isTextContentEmpty } from '@whiteboard/core/node'
import {
  compileNodeDataUpdate,
  compileNodeStyleUpdate
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
    value
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

    if (value === currentValue) {
      return undefined
    }

    return ctx.write.update(nodeId, compileNodeDataUpdate(field, value))
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
