import {
  createKeyedDerivedStore,
  read,
  type KeyedReadStore,
  type ReadStore
} from '@shared/core'
import type { NodeId, Rect } from '@whiteboard/core/types'
import type { MindmapNodeId } from '@whiteboard/core/mindmap'
import type { EngineRead, MindmapItem } from '@whiteboard/engine'
import type { MindmapDragFeedback } from '../overlay/types'

export type MindmapNodeView = {
  id: MindmapNodeId
  rect: Rect
  label: string
  dragActive: boolean
  attachTarget: boolean
  showActions: boolean
  dragPreviewActive: boolean
}

export type MindmapView = {
  treeId: NodeId
  rootId: NodeId
  rootPosition: {
    x: number
    y: number
  }
  tree: MindmapItem['tree']
  layout: MindmapItem['layout']
  bbox: {
    width: number
    height: number
  }
  shiftX: number
  shiftY: number
  lines: MindmapItem['lines']
  nodes: readonly MindmapNodeView[]
  ghost?: {
    width: number
    height: number
    x: number
    y: number
  }
  connectionLine?: {
    x1: number
    y1: number
    x2: number
    y2: number
  }
  insertLine?: {
    x1: number
    y1: number
    x2: number
    y2: number
  }
}

const isRectEqual = (
  left: Rect | undefined,
  right: Rect | undefined
) => (
  left?.x === right?.x
  && left?.y === right?.y
  && left?.width === right?.width
  && left?.height === right?.height
)

const isMindmapNodeViewEqual = (
  left: MindmapNodeView,
  right: MindmapNodeView
) => (
  left.id === right.id
  && isRectEqual(left.rect, right.rect)
  && left.label === right.label
  && left.dragActive === right.dragActive
  && left.attachTarget === right.attachTarget
  && left.showActions === right.showActions
  && left.dragPreviewActive === right.dragPreviewActive
)

const isLineEqual = (
  left: MindmapView['lines'][number],
  right: MindmapView['lines'][number]
) => (
  left.id === right.id
  && left.x1 === right.x1
  && left.y1 === right.y1
  && left.x2 === right.x2
  && left.y2 === right.y2
)

const isMindmapViewEqual = (
  left: MindmapView | undefined,
  right: MindmapView | undefined
) => (
  left === right
  || (
    left !== undefined
    && right !== undefined
    && left.treeId === right.treeId
    && left.rootId === right.rootId
    && left.rootPosition.x === right.rootPosition.x
    && left.rootPosition.y === right.rootPosition.y
    && left.tree === right.tree
    && left.layout === right.layout
    && left.bbox.width === right.bbox.width
    && left.bbox.height === right.bbox.height
    && left.shiftX === right.shiftX
    && left.shiftY === right.shiftY
    && left.lines.length === right.lines.length
    && left.lines.every((line, index) => isLineEqual(line, right.lines[index]!))
    && left.nodes.length === right.nodes.length
    && left.nodes.every((node, index) => isMindmapNodeViewEqual(node, right.nodes[index]!))
    && isRectEqual(left.ghost, right.ghost)
    && left.connectionLine?.x1 === right.connectionLine?.x1
    && left.connectionLine?.y1 === right.connectionLine?.y1
    && left.connectionLine?.x2 === right.connectionLine?.x2
    && left.connectionLine?.y2 === right.connectionLine?.y2
    && left.insertLine?.x1 === right.insertLine?.x1
    && left.insertLine?.y1 === right.insertLine?.y1
    && left.insertLine?.x2 === right.insertLine?.x2
    && left.insertLine?.y2 === right.insertLine?.y2
  )
)

const toMindmapView = (
  treeId: NodeId,
  treeView: MindmapItem,
  drag: MindmapDragFeedback | undefined
): MindmapView | undefined => {
  const root = treeView.node
  if (!root.position) {
    return undefined
  }

  const dragPreview = drag?.treeId === treeId ? drag.preview : undefined

  return {
    treeId,
    rootId: root.id,
    rootPosition: root.position,
    tree: treeView.tree,
    layout: treeView.layout,
    bbox: treeView.computed.bbox,
    shiftX: treeView.shiftX,
    shiftY: treeView.shiftY,
    lines: treeView.lines,
    nodes: Object.entries(treeView.computed.node).map(([id, rect]) => ({
      id,
      rect,
      label: treeView.labels[id] ?? 'mindmap',
      dragActive: dragPreview?.nodeId === id,
      attachTarget: dragPreview?.drop?.type === 'attach' && dragPreview.drop.targetId === id,
      showActions: !dragPreview,
      dragPreviewActive: Boolean(dragPreview)
    })),
    ghost: dragPreview?.ghost,
    connectionLine: dragPreview?.drop?.connectionLine,
    insertLine: dragPreview?.drop?.insertLine
  }
}

export const createMindmapViewStore = ({
  item,
  drag
}: {
  item: EngineRead['mindmap']['item']
  drag: ReadStore<MindmapDragFeedback | undefined>
}): KeyedReadStore<NodeId, MindmapView | undefined> => createKeyedDerivedStore({
  get: (treeId: NodeId) => {
    const treeView = read(item, treeId)
    if (!treeView) {
      return undefined
    }

    return toMindmapView(
      treeId,
      treeView,
      read(drag)
    )
  },
  isEqual: isMindmapViewEqual
})
