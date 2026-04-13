import {
  applyNodeGeometryPatch,
  applyNodeTextDraft,
  applyNodeTextPreview,
  getNodeBounds,
  getNodeGeometry,
  readNodeRotation
} from '@whiteboard/core/node'
import type {
  NodeGeometry,
  Rect
} from '@whiteboard/core/types'
import type { NodeItem } from '@whiteboard/engine'
import type { EditSession } from '../../local/session/edit'
import type { NodeFeedbackProjection } from '../../local/feedback/types'

export const readNodeProjectionRotation = (
  node: NodeItem['node']
) => readNodeRotation(node)

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
  feedback: NodeFeedbackProjection,
  edit: EditSession
): NodeItem => applyNodeTextDraft(
  applyNodeTextPreview(
    applyNodeGeometryPatch(item, feedback.patch),
    feedback.text
  ),
  readNodeTextDraft(item, edit)
)
