import type { Point, Rect, NodeId } from '@whiteboard/core/types'
import type {
  MindmapDragDropTarget,
  MindmapLayout,
  MindmapLayoutSpec,
  MindmapNodeId,
  MindmapTree
} from '@whiteboard/core/mindmap/types'
import type {
  MindmapDragState,
  RootMindmapDrag,
  SubtreeDropTargetOptions,
  SubtreeMindmapDrag
} from '@whiteboard/core/types/mindmap'
import {
  getSide,
  getSubtreeIds
} from '@whiteboard/core/mindmap/tree'

type ComputeEdgeAlignmentResult = {
  key: 'left-to-right' | 'right-to-left' | 'top-to-bottom' | 'bottom-to-top'
  value: number
  line: {
    x1: number
    y1: number
    x2: number
    y2: number
  }
}

const DEFAULT_DROP_SNAP_THRESHOLD = 24
const DEFAULT_SIDE: 'left' | 'right' = 'right'
const DEFAULT_REORDER_LINE_GAP = 6
const DEFAULT_REORDER_LINE_OVERFLOW = 12

type MindmapTreeView = {
  id: NodeId
  tree: MindmapTree
  layout: MindmapLayoutSpec
  computed: MindmapLayout
}

const getNodeSide = (
  tree: MindmapTree,
  nodeId: MindmapNodeId,
  defaultSide: 'left' | 'right'
) => getSide(tree, nodeId) ?? defaultSide

const getRootSide = (
  layout: MindmapLayoutSpec,
  rootRect: Rect,
  pointer: { x: number; y: number },
  defaultSide: 'left' | 'right',
  preferred?: 'left' | 'right'
): 'left' | 'right' => {
  const mode = layout.side
  if (mode === 'left' || mode === 'right') return mode
  if (preferred) return preferred
  const centerX = rootRect.x + rootRect.width / 2
  return pointer.x < centerX ? 'left' : defaultSide
}

const mapSideIndexToGlobalIndex = (
  tree: MindmapTree,
  children: MindmapNodeId[],
  side: 'left' | 'right',
  sideIndex: number,
  defaultSide: 'left' | 'right'
) => {
  const sideChildren = children.filter((id) => getNodeSide(tree, id, defaultSide) === side)
  if (sideChildren.length === 0) return children.length
  if (sideIndex <= 0) return children.indexOf(sideChildren[0])
  if (sideIndex >= sideChildren.length) {
    return children.indexOf(sideChildren[sideChildren.length - 1]) + 1
  }
  return children.indexOf(sideChildren[sideIndex])
}

const computeEdgeAlignment = (ghost: Rect, target: Rect): ComputeEdgeAlignmentResult => {
  const ghostCenterX = ghost.x + ghost.width / 2
  const ghostCenterY = ghost.y + ghost.height / 2
  const targetCenterX = target.x + target.width / 2
  const targetCenterY = target.y + target.height / 2
  const dx = ghostCenterX - targetCenterX
  const dy = ghostCenterY - targetCenterY
  const horizontal = Math.abs(dx) >= Math.abs(dy)

  if (horizontal) {
    const gap = Math.max(0, Math.abs(dx) - (ghost.width + target.width) / 2)
    if (dx >= 0) {
      return {
        key: 'left-to-right',
        value: gap,
        line: {
          x1: ghost.x,
          y1: ghostCenterY,
          x2: target.x + target.width,
          y2: targetCenterY
        }
      }
    }
    return {
      key: 'right-to-left',
      value: gap,
      line: {
        x1: ghost.x + ghost.width,
        y1: ghostCenterY,
        x2: target.x,
        y2: targetCenterY
      }
    }
  }

  const gap = Math.max(0, Math.abs(dy) - (ghost.height + target.height) / 2)
  if (dy >= 0) {
    return {
      key: 'top-to-bottom',
      value: gap,
      line: {
        x1: ghostCenterX,
        y1: ghost.y,
        x2: targetCenterX,
        y2: target.y + target.height
      }
    }
  }
  return {
    key: 'bottom-to-top',
    value: gap,
    line: {
      x1: ghostCenterX,
      y1: ghost.y + ghost.height,
      x2: targetCenterX,
      y2: target.y
    }
  }
}

const buildNodeRectMap = (
  item: MindmapTreeView
) => {
  const rectMap = new Map<MindmapNodeId, Rect>()
  Object.entries(item.computed.node).forEach(([id, rect]) => {
    if (!rect) return
    rectMap.set(id as MindmapNodeId, {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height
    })
  })
  return rectMap
}

const buildGhostRect = (
  pointerWorld: Point,
  pointerOffset: Point,
  nodeRect: Rect
): Rect => ({
  x: pointerWorld.x - pointerOffset.x,
  y: pointerWorld.y - pointerOffset.y,
  width: nodeRect.width,
  height: nodeRect.height
})

export const computeSubtreeDropTarget = ({
  tree,
  nodeRects,
  ghost,
  dragNodeId,
  dragExcludeIds,
  layout,
  snapThreshold = DEFAULT_DROP_SNAP_THRESHOLD,
  defaultSide = DEFAULT_SIDE,
  reorderLineGap = DEFAULT_REORDER_LINE_GAP,
  reorderLineOverflow = DEFAULT_REORDER_LINE_OVERFLOW
}: SubtreeDropTargetOptions): MindmapDragDropTarget | undefined => {
  let hoveredId: MindmapNodeId | undefined
  let hoveredRect: Rect | undefined
  let hoveredAlign: ComputeEdgeAlignmentResult | undefined
  let hoveredDistance = Number.POSITIVE_INFINITY

  nodeRects.forEach((rect, id) => {
    if (dragExcludeIds.has(id)) return
    const alignment = computeEdgeAlignment(ghost, rect)
    if (alignment.value < hoveredDistance) {
      hoveredDistance = alignment.value
      hoveredId = id
      hoveredRect = rect
      hoveredAlign = alignment
    }
  })

  if (!hoveredId || !hoveredRect || !hoveredAlign) return
  if (hoveredDistance > snapThreshold) return

  const rootRect = nodeRects.get(tree.rootNodeId)
  if (!rootRect) return

  const ghostCenter = { x: ghost.x + ghost.width / 2, y: ghost.y + ghost.height / 2 }
  const isHorizontal = hoveredAlign.key === 'left-to-right' || hoveredAlign.key === 'right-to-left'
  const isAttach = hoveredId === tree.rootNodeId || isHorizontal

  if (isAttach) {
    const parentId = hoveredId
    const children = (tree.children[parentId] ?? []).filter((id) => id !== dragNodeId)
    const side =
      parentId === tree.rootNodeId
        ? getRootSide(layout, rootRect, ghostCenter, defaultSide)
        : undefined
    const index =
      parentId === tree.rootNodeId && side
        ? mapSideIndexToGlobalIndex(tree, children, side, children.length, defaultSide)
        : children.length

    return {
      type: 'attach',
      parentId,
      index,
      side,
      hoveredId,
      connectionLine: hoveredAlign.line
    }
  }

  const parentId = tree.nodes[hoveredId]?.parentId
  if (!parentId) return

  const filteredChildren = (tree.children[parentId] ?? []).filter((id) => id !== dragNodeId)
  const targetIndex = filteredChildren.indexOf(hoveredId)
  if (targetIndex < 0) return

  const before = ghostCenter.y < hoveredRect.y + hoveredRect.height / 2
  const side =
    parentId === tree.rootNodeId
      ? getRootSide(layout, rootRect, ghostCenter, defaultSide, tree.nodes[hoveredId]?.side)
      : undefined
  const index =
    parentId === tree.rootNodeId && side
      ? mapSideIndexToGlobalIndex(
          tree,
          filteredChildren,
          side,
          before ? targetIndex : targetIndex + 1,
          defaultSide
        )
      : before
        ? targetIndex
        : targetIndex + 1

  const lineY = before ? hoveredRect.y - reorderLineGap : hoveredRect.y + hoveredRect.height + reorderLineGap

  return {
    type: 'reorder',
    parentId,
    index,
    side,
    hoveredId,
    insertLine: {
      x1: hoveredRect.x - reorderLineOverflow,
      y1: lineY,
      x2: hoveredRect.x + hoveredRect.width + reorderLineOverflow,
      y2: lineY
    }
  }
}

export const createRootDrag = (options: {
  treeId: NodeId
  pointerId: number
  start: Point
  origin: Point
}): RootMindmapDrag => ({
  kind: 'root',
  treeId: options.treeId,
  pointerId: options.pointerId,
  start: options.start,
  origin: options.origin,
  position: options.origin
})

export const createSubtreeDrag = (options: {
  treeId: NodeId
  treeView: MindmapTreeView
  nodeId: MindmapNodeId
  pointerId: number
  world: Point
}): SubtreeMindmapDrag | undefined => {
  const {
    treeId,
    treeView,
    nodeId,
    pointerId,
    world
  } = options
  const nodeRects = buildNodeRectMap(treeView)
  const rect = nodeRects.get(nodeId)
  if (!rect) {
    return undefined
  }

  const originParentId = treeView.tree.nodes[nodeId]?.parentId
  const originIndex =
    originParentId !== undefined
      ? (treeView.tree.children[originParentId] ?? []).indexOf(nodeId)
      : undefined

  return {
    kind: 'subtree',
    treeId,
    pointerId,
    nodeId,
    originParentId,
    originIndex,
    offset: {
      x: world.x - rect.x,
      y: world.y - rect.y
    },
    rect,
    ghost: rect,
    excludeIds: getSubtreeIds(treeView.tree, nodeId),
    layout: treeView.layout
  }
}

const projectRootDrag = (
  active: RootMindmapDrag,
  world: Point
): RootMindmapDrag => ({
  ...active,
  position: {
    x: active.origin.x + (world.x - active.start.x),
    y: active.origin.y + (world.y - active.start.y)
  }
})

const projectSubtreeDrop = (
  active: SubtreeMindmapDrag,
  treeView: MindmapTreeView | undefined,
  ghost: Rect
) => (
  treeView
    ? computeSubtreeDropTarget({
        tree: treeView.tree,
        nodeRects: buildNodeRectMap(treeView),
        ghost,
        dragNodeId: active.nodeId,
        dragExcludeIds: new Set(active.excludeIds),
        layout: treeView.layout
      })
    : active.drop
)

export const projectMindmapDrag = (options: {
  active: MindmapDragState
  world: Point
  treeView?: MindmapTreeView
}): MindmapDragState => {
  const {
    active,
    world,
    treeView
  } = options

  if (active.kind === 'root') {
    return projectRootDrag(active, world)
  }

  const ghost = buildGhostRect(world, active.offset, active.rect)
  return {
    ...active,
    ghost,
    drop: projectSubtreeDrop(active, treeView, ghost),
    layout: treeView?.layout ?? active.layout
  }
}
