import { isTextContentEmpty } from '@whiteboard/core/node'
import type { NodeId, Size } from '@whiteboard/core/types'
import type { EngineInstance } from '@whiteboard/engine'
import type {
  Editor,
  EditorPreviewWrite,
  EditorNodeAppearanceCommands,
  EditorNodeDocumentCommands,
  EditorSessionWrite,
  EditorNodeTextCommands
} from '../../../types/editor'
import {
  dataUpdate,
  mergeNodeUpdates,
  styleUpdate
} from './document'

type NodeTextHost = {
  read: Editor['read']
  committedNode: EngineInstance['read']['node']['item']
  preview: Pick<EditorPreviewWrite, 'node'>
  session: Pick<EditorSessionWrite, 'edit' | 'selection'>
  deleteCascade: Editor['commands']['node']['deleteCascade']
  document: EditorNodeDocumentCommands
  appearance: EditorNodeAppearanceCommands
}

const isSameSize = (
  left: Size | null | undefined,
  right: Size | null | undefined
) => (
  left?.width === right?.width
  && left?.height === right?.height
)

export const createNodeTextCommands = ({
  read,
  committedNode,
  preview,
  session,
  deleteCascade,
  document,
  appearance
}: NodeTextHost): EditorNodeTextCommands => ({
  preview: ({
    nodeId,
    size
  }) => {
    const item = read.node.item.get(nodeId)
    if (!item || item.node.type !== 'text') {
      return
    }

    preview.node.text.setSize(nodeId, size)
  },
  clearPreview: (nodeId) => {
    preview.node.text.clearSize(nodeId)
  },
  cancel: ({
    nodeId
  }) => {
    preview.node.text.clearSize(nodeId)
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
      preview.node.text.clearSize(nodeId)
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
    const sizeUpdate = nextMeasuredSize && !isSameSize(nextMeasuredSize, committed.rect)
      ? nextMeasuredSize
      : undefined

    preview.node.text.clearSize(nodeId)
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
      const sizeUpdate = committed && nextMeasuredSize && !isSameSize(nextMeasuredSize, committed.rect)
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
