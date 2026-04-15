import { isSizeEqual } from '@whiteboard/core/geometry'
import {
  applyNodeUpdate,
  isTextNode
} from '@whiteboard/core/node'
import { mergeNodeUpdates } from '@whiteboard/core/schema'
import type {
  NodeId,
  NodeUpdateInput
} from '@whiteboard/core/types'
import type { EditorQueryRead } from '@whiteboard/editor/query'
import type { TextLayoutMeasurer } from '@whiteboard/editor/types/textLayout'

const hasOwn = <T extends object>(
  value: T,
  key: PropertyKey
) => Object.prototype.hasOwnProperty.call(value, key)

const TEXT_LAYOUT_STYLE_PATHS = new Set([
  'fontSize',
  'fontWeight',
  'fontStyle'
])

const TEXT_LAYOUT_DATA_PATHS = new Set([
  'text',
  'widthMode',
  'wrapWidth'
])

const hasExplicitSize = (
  update: NodeUpdateInput
) => Boolean(
  update.fields
  && hasOwn(update.fields, 'size')
)

const isTextLayoutAffectingUpdate = (
  update: NodeUpdateInput
) => (update.records ?? []).some((record) => (
    record.scope === 'style'
      ? TEXT_LAYOUT_STYLE_PATHS.has(record.path ?? '')
      : TEXT_LAYOUT_DATA_PATHS.has(record.path ?? '')
  ))

export const resolveMeasuredTextNodeUpdate = ({
  nodeId,
  update,
  read,
  measureText
}: {
  nodeId: NodeId
  update: NodeUpdateInput
  read: Pick<EditorQueryRead, 'node'>
  measureText?: TextLayoutMeasurer
}): NodeUpdateInput => {
  if (!measureText || hasExplicitSize(update)) {
    return update
  }

  const committed = read.node.committed.get(nodeId)
  if (!committed || !isTextNode(committed.node) || !isTextLayoutAffectingUpdate(update)) {
    return update
  }

  const live = read.node.item.get(nodeId) ?? committed
  const applied = applyNodeUpdate(live.node, update)
  if (!applied.ok || !isTextNode(applied.next)) {
    return update
  }

  const measuredSize = measureText({
    nodeId,
    node: applied.next,
    rect: live.rect
  })
  if (!measuredSize || isSizeEqual(measuredSize, committed.rect)) {
    return update
  }

  return mergeNodeUpdates(update, {
    fields: {
      size: measuredSize
    }
  })
}
