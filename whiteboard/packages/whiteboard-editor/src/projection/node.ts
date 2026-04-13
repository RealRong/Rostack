import {
  applyNodeGeometryPatch,
  applyNodeTextDraft,
  applyNodeTextPreview,
  getNodeBounds,
  getNodeGeometry
} from '@whiteboard/core/node'
import type {
  NodeGeometry,
  Rect
} from '@whiteboard/core/types'
import type { NodeItem } from '@whiteboard/engine'
import type { NodeOverlayProjection } from '../overlay/types'
import type { EditSession } from '../state/edit'

export const readNodeProjectionRotation = (
  node: NodeItem['node']
) => (typeof node.rotation === 'number' ? node.rotation : 0)

export const readProjectedNodeBounds = (
  item: NodeItem
): Rect => getNodeBounds(
  item.node,
  item.rect,
  readNodeProjectionRotation(item.node)
)

export const readProjectedNodeGeometry = (
  item: NodeItem
): NodeGeometry => getNodeGeometry(
  item.node,
  item.rect,
  readNodeProjectionRotation(item.node)
)

const readNodeTextDraft = (
  item: NodeItem,
  edit: EditSession
) => {
  if (!edit || edit.kind !== 'node' || edit.nodeId !== item.node.id) {
    return undefined
  }

  return {
    field: edit.field,
    value: edit.draft.text,
    liveSize:
      edit.field === 'text'
      && item.node.type === 'text'
        ? edit.layout.liveSize
        : undefined
  }
}

export const projectNodeItem = (
  item: NodeItem,
  projection: NodeOverlayProjection,
  edit: EditSession
): NodeItem => applyNodeTextDraft(
  applyNodeTextPreview(
    applyNodeGeometryPatch(item, projection.patch),
    projection.text
  ),
  readNodeTextDraft(item, edit)
)
