import { equal } from '@shared/core'
import type { MindmapRenderConnector } from '@whiteboard/core/mindmap'
import type { SelectionTarget } from '@whiteboard/core/selection'
import type { NodeId, Rect } from '@whiteboard/core/types'
import type {
  MindmapSceneItem,
  MindmapStructureItem
} from '@whiteboard/editor/committed/read'
import type { EditSession } from '@whiteboard/editor/session/edit'

export type MindmapChrome = {
  addChildTargets: readonly {
    targetNodeId: NodeId
    x: number
    y: number
    placement: 'left' | 'right'
  }[]
}

const MINDMAP_ADD_BUTTON_OFFSET = 12

const isConnectorEqual = (
  left: MindmapRenderConnector,
  right: MindmapRenderConnector
) => (
  left.id === right.id
  && left.parentId === right.parentId
  && left.childId === right.childId
  && left.path === right.path
  && left.style.color === right.style.color
  && left.style.line === right.style.line
  && left.style.width === right.style.width
  && left.style.stroke === right.style.stroke
)

export const isMindmapSceneEqual = (
  left: MindmapSceneItem | undefined,
  right: MindmapSceneItem | undefined
) => (
  left === right
  || (
    left !== undefined
    && right !== undefined
    && left.id === right.id
    && left.rootId === right.rootId
    && left.nodeIds.length === right.nodeIds.length
    && left.nodeIds.every((nodeId, index) => nodeId === right.nodeIds[index])
    && equal.sameRect(left.bbox, right.bbox)
    && left.connectors.length === right.connectors.length
    && left.connectors.every((connector, index) => isConnectorEqual(connector, right.connectors[index]!))
  )
)

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
  structure: MindmapStructureItem
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

export const readMindmapNavigateTarget = ({
  structure,
  fromNodeId,
  direction
}: {
  structure: MindmapStructureItem
  fromNodeId: NodeId
  direction: 'parent' | 'first-child' | 'prev-sibling' | 'next-sibling'
}) => {
  const tree = structure.tree

  switch (direction) {
    case 'parent':
      return tree.nodes[fromNodeId]?.parentId
    case 'first-child':
      return tree.children[fromNodeId]?.[0]
    case 'prev-sibling': {
      const parentId = tree.nodes[fromNodeId]?.parentId
      if (!parentId) {
        return undefined
      }

      const siblings = tree.children[parentId] ?? []
      const index = siblings.indexOf(fromNodeId)
      return index > 0 ? siblings[index - 1] : undefined
    }
    case 'next-sibling': {
      const parentId = tree.nodes[fromNodeId]?.parentId
      if (!parentId) {
        return undefined
      }

      const siblings = tree.children[parentId] ?? []
      const index = siblings.indexOf(fromNodeId)
      return index >= 0 ? siblings[index + 1] : undefined
    }
  }
}

export const toMindmapScene = (
  structure: MindmapStructureItem,
  bbox: Rect,
  connectors: readonly MindmapRenderConnector[]
): MindmapSceneItem => ({
  id: structure.id,
  rootId: structure.rootId,
  nodeIds: structure.nodeIds,
  bbox,
  connectors
})
