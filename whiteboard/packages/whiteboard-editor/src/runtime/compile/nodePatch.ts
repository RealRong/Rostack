import { compileNodeFieldUpdates } from '@whiteboard/core/schema'
import type {
  NodeId,
  NodeUpdateInput,
  Size
} from '@whiteboard/core/types'
import type { EditorNodePatch } from '../../types/editor'
import {
  dataUpdate,
  mergeNodeUpdates,
  styleUpdate
} from '../node/patch'

const isSameSize = (
  left: Size | null | undefined,
  right: Size | null | undefined
) => (
  left?.width === right?.width
  && left?.height === right?.height
)

const hasUpdateContent = (
  update: NodeUpdateInput
) => Boolean(update.fields) || Boolean(update.records?.length)

export const compileNodePatch = ({
  ids,
  patch,
  measuredSizeById,
  readNode
}: {
  ids: readonly NodeId[]
  patch: EditorNodePatch
  measuredSizeById?: Readonly<Record<NodeId, Size>>
  readNode: (id: NodeId) => {
    node: {
      type: string
    }
    rect: Size
  } | undefined
}): Array<{
  id: NodeId
  update: NodeUpdateInput
}> => ids.flatMap((id) => {
  const item = readNode(id)
  if (!item) {
    return []
  }

  const nextMeasuredSize = measuredSizeById?.[id]
  const sizeHint = nextMeasuredSize && !isSameSize(nextMeasuredSize, item.rect)
    ? {
        fields: {
          size: nextMeasuredSize
        }
      }
    : undefined
  const fillUpdate = patch.style?.fill !== undefined
    ? (
        item.node.type === 'sticky'
          ? compileNodeFieldUpdates([
              {
                field: {
                  scope: 'style',
                  path: 'fill'
                },
                value: patch.style.fill
              },
              {
                field: {
                  scope: 'data',
                  path: 'background'
                },
                value: patch.style.fill
              }
            ])
          : styleUpdate('fill', patch.style.fill)
      )
    : undefined
  const fieldUpdate = (
    patch.fields?.position !== undefined
    || patch.fields?.size !== undefined
    || patch.fields?.locked !== undefined
  )
    ? {
        fields: {
          ...(patch.fields?.position !== undefined ? { position: patch.fields.position } : {}),
          ...(patch.fields?.size !== undefined ? { size: patch.fields.size } : {}),
          ...(patch.fields?.locked !== undefined ? { locked: patch.fields.locked } : {})
        }
      }
    : undefined
  const dataPatch = patch.data
  const update = mergeNodeUpdates(
    fieldUpdate,
    fillUpdate,
    patch.style?.fillOpacity !== undefined
      ? styleUpdate('fillOpacity', patch.style.fillOpacity)
      : undefined,
    patch.style?.stroke !== undefined
      ? styleUpdate('stroke', patch.style.stroke)
      : undefined,
    patch.style?.strokeWidth !== undefined
      ? styleUpdate('strokeWidth', patch.style.strokeWidth)
      : undefined,
    patch.style?.strokeOpacity !== undefined
      ? styleUpdate('strokeOpacity', patch.style.strokeOpacity)
      : undefined,
    patch.style?.strokeDash !== undefined
      ? styleUpdate('strokeDash', patch.style.strokeDash)
      : undefined,
    patch.style?.opacity !== undefined
      ? styleUpdate('opacity', patch.style.opacity)
      : undefined,
    patch.style?.color !== undefined
      ? styleUpdate('color', patch.style.color)
      : undefined,
    patch.style?.fontSize !== undefined
      ? styleUpdate('fontSize', patch.style.fontSize)
      : undefined,
    patch.style?.fontWeight !== undefined
      ? styleUpdate('fontWeight', patch.style.fontWeight)
      : undefined,
    patch.style?.fontStyle !== undefined
      ? styleUpdate('fontStyle', patch.style.fontStyle)
      : undefined,
    patch.style?.textAlign !== undefined
      ? styleUpdate('textAlign', patch.style.textAlign)
      : undefined,
    dataPatch?.text !== undefined
      ? dataUpdate('text', dataPatch.text)
      : undefined,
    dataPatch?.title !== undefined
      ? dataUpdate('title', dataPatch.title)
      : undefined,
    dataPatch?.kind !== undefined
      ? dataUpdate('kind', dataPatch.kind)
      : undefined,
    dataPatch?.background !== undefined
      ? dataUpdate('background', dataPatch.background)
      : undefined,
    sizeHint
  )

  return hasUpdateContent(update)
    ? [{
        id,
        update
      }]
    : []
})
