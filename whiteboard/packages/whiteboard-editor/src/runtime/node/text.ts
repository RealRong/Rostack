import { isTextContentEmpty } from '@whiteboard/core/node'
import { isSizeEqual } from '@whiteboard/core/geometry'
import type { NodeId } from '@whiteboard/core/types'
import type { Engine } from '@whiteboard/engine'
import type { CommandResult } from '@engine-types/result'
import type {
  NodePatchWriter,
  NodeTextMutations
} from './types'
import type { NodeAppearanceMutations } from './mutations'
import type {
  PreviewRuntime,
} from '../preview/types'
import type { SessionRuntime } from '../session/types'
import type { EditorRead } from '../../types/editor'
import {
  dataUpdate,
  mergeNodeUpdates,
  styleUpdate
} from './patch'

type NodeTextHost = {
  read: EditorRead
  committedNode: Engine['read']['node']['item']
  preview: Pick<PreviewRuntime, 'node'>
  session: Pick<SessionRuntime, 'edit' | 'selection'>
  deleteCascade: (ids: NodeId[]) => CommandResult
  document: NodePatchWriter
  appearance: NodeAppearanceMutations
}

export const createNodeTextMutations = ({
  read,
  committedNode,
  preview,
  session,
  deleteCascade,
  document,
  appearance
}: NodeTextHost): NodeTextMutations => ({
  preview: ({
    nodeId,
    position,
    size,
    fontSize,
    mode,
    wrapWidth,
    handle
  }) => {
    const item = read.node.item.get(nodeId)
    if (!item || item.node.type !== 'text') {
      return
    }

    preview.node.text.set(nodeId, {
      position,
      size,
      fontSize,
      mode,
      wrapWidth,
      handle
    })
  },
  clearPreview: (nodeId) => {
    preview.node.text.clearSize(nodeId)
  },
  cancel: ({
    nodeId
  }) => {
    preview.node.text.clear(nodeId)
    session.edit.clear()
  },
  commit: ({
    nodeId,
    field,
    value,
    size
  }) => {
    const committed = committedNode.get(nodeId)
    if (!committed) {
      preview.node.text.clear(nodeId)
      session.edit.clear()
      return undefined
    }

    const nextValue = value
    const currentValue = typeof committed.node.data?.[field] === 'string'
      ? committed.node.data[field] as string
      : ''
    const previewItem = read.node.item.get(nodeId)
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

    preview.node.text.clear(nodeId)
    session.edit.clear()

    if (
      committed.node.type === 'text'
      && field === 'text'
      && isTextContentEmpty(nextValue)
    ) {
      session.selection.clear()
      return deleteCascade([nodeId])
    }

    if (nextValue === currentValue && !sizeUpdate) {
      return undefined
    }

    return document.update(
      nodeId,
      mergeNodeUpdates(
        dataUpdate(field, nextValue),
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
  setColor: (nodeIds, color) =>
    appearance.setTextColor(nodeIds, color),
  setSize: ({
    nodeIds,
    value,
    sizeById
  }) => document.updateMany(
    nodeIds.map((id) => {
      const committed = committedNode.get(id)
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
  setWeight: (nodeIds, weight) => document.updateMany(
    nodeIds.map((id) => ({
      id,
      update: styleUpdate('fontWeight', weight)
    }))
  ),
  setItalic: (nodeIds, italic) => document.updateMany(
    nodeIds.map((id) => ({
      id,
      update: styleUpdate('fontStyle', italic ? 'italic' : 'normal')
    }))
  ),
  setAlign: (nodeIds, align) => document.updateMany(
    nodeIds.map((id) => ({
      id,
      update: styleUpdate('textAlign', align)
    }))
  )
})
