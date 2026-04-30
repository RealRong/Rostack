import { geometry as geometryApi } from '@whiteboard/core/geometry'
import {
  computeMindmapLayout,
  getSubtreeIds
} from '@whiteboard/core/mindmap/tree'
import {
  anchorMindmapLayout,
  translateMindmapLayout
} from '@whiteboard/core/mindmap/render'
import type {
  MindmapLayout,
  MindmapNodeId,
  MindmapTree
} from '@whiteboard/core/mindmap/types'
import type {
  Point,
  Rect,
  Size
} from '@whiteboard/core/types'

const sameRect = (
  left: Rect | undefined,
  right: Rect | undefined
): boolean => left === right || (
  left !== undefined
  && right !== undefined
  && left.x === right.x
  && left.y === right.y
  && left.width === right.width
  && left.height === right.height
)

const translateRect = (
  rect: Rect,
  delta: Point
): Rect => ({
  x: rect.x + delta.x,
  y: rect.y + delta.y,
  width: rect.width,
  height: rect.height
})

export const equalMindmapLayout = (
  left: MindmapLayout | undefined,
  right: MindmapLayout | undefined
): boolean => {
  if (left === right) {
    return true
  }

  if (!left || !right || !sameRect(left.bbox, right.bbox)) {
    return false
  }

  const leftNodeIds = Object.keys(left.node)
  const rightNodeIds = Object.keys(right.node)
  if (leftNodeIds.length !== rightNodeIds.length) {
    return false
  }

  for (const nodeId of leftNodeIds) {
    const leftRect = left.node[nodeId]
    const rightRect = right.node[nodeId]
    if (!sameRect(leftRect, rightRect)) {
      if (!leftRect || !rightRect || !sameRect(leftRect, rightRect)) {
        return false
      }
    }
  }

  return true
}

export const applySubtreeMovePreview = (input: {
  layout: MindmapLayout
  tree: MindmapTree
  nodeId: MindmapNodeId
  ghost: Rect
}): MindmapLayout => {
  const sourceRect = input.layout.node[input.nodeId]
  if (!sourceRect) {
    return input.layout
  }

  const delta = {
    x: input.ghost.x - sourceRect.x,
    y: input.ghost.y - sourceRect.y
  }
  if (delta.x === 0 && delta.y === 0) {
    return input.layout
  }

  const node = {
    ...input.layout.node
  }
  getSubtreeIds(input.tree, input.nodeId).forEach((nodeId) => {
    const rect = node[nodeId]
    if (!rect) {
      return
    }

    node[nodeId] = translateRect(rect, delta)
  })

  return {
    node,
    bbox: geometryApi.rect.boundingRect(Object.values(node)) ?? input.layout.bbox
  }
}

export const resolveProjectedMindmapLayout = (input: {
  tree: MindmapTree
  rootRect: Rect
  readNodeSize: (nodeId: MindmapNodeId) => Size
  preview?: {
    rootDelta?: Point
    subtreeMove?: {
      nodeId: MindmapNodeId
      ghost: Rect
    }
  }
}): MindmapLayout => {
  let layout = anchorMindmapLayout({
    tree: input.tree,
    computed: computeMindmapLayout(
      input.tree,
      input.readNodeSize,
      input.tree.layout
    ),
    position: {
      x: input.rootRect.x,
      y: input.rootRect.y
    }
  })

  if (input.preview?.rootDelta) {
    layout = translateMindmapLayout(layout, input.preview.rootDelta)
  }

  if (input.preview?.subtreeMove) {
    layout = applySubtreeMovePreview({
      layout,
      tree: input.tree,
      nodeId: input.preview.subtreeMove.nodeId,
      ghost: input.preview.subtreeMove.ghost
    })
  }

  return layout
}
