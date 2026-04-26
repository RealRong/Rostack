import type { SelectionTarget } from '@whiteboard/core/selection'
import type { NodeId, Rect } from '@whiteboard/core/types'
import type {
  MindmapView
} from '@whiteboard/editor-scene'
import type { EditSession } from '@whiteboard/editor/session/edit'

export type EditorMindmapStructure = MindmapView['structure']

export type MindmapChrome = {
  addChildTargets: readonly {
    targetNodeId: NodeId
    x: number
    y: number
    placement: 'left' | 'right'
  }[]
}

const MINDMAP_ADD_BUTTON_OFFSET = 12

export const isMindmapChromeEqual = (
  left: MindmapChrome | undefined,
  right: MindmapChrome | undefined
) => (
  left === right
  || (
    left !== undefined
    && right !== undefined
    && left.addChildTargets.length === right.addChildTargets.length
    && left.addChildTargets.every((entry, index) => (
      entry.targetNodeId === right.addChildTargets[index]?.targetNodeId
      && entry.x === right.addChildTargets[index]?.x
      && entry.y === right.addChildTargets[index]?.y
      && entry.placement === right.addChildTargets[index]?.placement
    ))
  )
)

const readAddButtonY = (
  rect: Rect
) => rect.y + Math.max(rect.height / 2 - 14, 0)

export const readAddChildTargets = ({
  structure,
  selection,
  edit,
  readNodeLocked,
  readNodeRect
}: {
  structure: EditorMindmapStructure
  selection: SelectionTarget
  edit: EditSession
  readNodeLocked: (nodeId: NodeId) => boolean
  readNodeRect: (nodeId: NodeId) => Rect | undefined
}) => {
  const selectedNodeId = selection.nodeIds.length === 1
    ? selection.nodeIds[0]
    : undefined
  if (!selectedNodeId || structure.tree.nodes[selectedNodeId] === undefined) {
    return []
  }

  if (edit?.kind === 'node' && edit.nodeId === selectedNodeId) {
    return []
  }

  if (readNodeLocked(selectedNodeId)) {
    return []
  }

  const rect = readNodeRect(selectedNodeId)
  if (!rect) {
    return []
  }

  if (selectedNodeId === structure.rootId) {
    return [
      {
        targetNodeId: selectedNodeId,
        x: rect.x - 28 - MINDMAP_ADD_BUTTON_OFFSET,
        y: readAddButtonY(rect),
        placement: 'left' as const
      },
      {
        targetNodeId: selectedNodeId,
        x: rect.x + rect.width + MINDMAP_ADD_BUTTON_OFFSET,
        y: readAddButtonY(rect),
        placement: 'right' as const
      }
    ]
  }

  const side = structure.tree.nodes[selectedNodeId]?.side ?? 'right'
  return [{
    targetNodeId: selectedNodeId,
    x: side === 'left'
      ? rect.x - 28 - MINDMAP_ADD_BUTTON_OFFSET
      : rect.x + rect.width + MINDMAP_ADD_BUTTON_OFFSET,
    y: readAddButtonY(rect),
    placement: side === 'left'
      ? 'left' as const
      : 'right' as const
  }]
}
