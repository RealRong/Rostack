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
import type { EditSession } from '@whiteboard/editor/session/edit'
import type {
  NodePreviewProjection
} from '@whiteboard/editor/session/preview/types'
import type { MindmapItem } from '@whiteboard/engine'

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
    size: edit.field === 'text' && item.node.type === 'text'
      ? edit.layout.size
      : undefined,
    fontSize: edit.field === 'text' && item.node.type === 'sticky'
      ? edit.layout.fontSize
      : undefined
  }
}

const applyMindmapProjectedLayout = (
  item: NodeItem,
  mindmap: MindmapItem | undefined
) => {
  if (!mindmap) {
    return item
  }

  const rect = mindmap.computed.node[item.node.id]
  if (!rect) {
    return item
  }

  return applyNodeGeometryPatch(item, {
    position: {
      x: rect.x,
      y: rect.y
    },
    size: {
      width: rect.width,
      height: rect.height
    }
  })
}

export const projectNodeItem = (
  item: NodeItem,
  feedback: NodePreviewProjection,
  edit: EditSession,
  mindmap?: MindmapItem
): NodeItem => applyNodeTextDraft(
  applyNodeTextPreview(
    applyMindmapProjectedLayout(
      applyNodeGeometryPatch(item, feedback.patch),
      mindmap
    ),
    feedback.text
  ),
  readNodeTextDraft(item, edit)
)
