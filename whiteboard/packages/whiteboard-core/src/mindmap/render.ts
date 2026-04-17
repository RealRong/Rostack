import { getSide } from '@whiteboard/core/mindmap/query'
import type {
  MindmapBranchStyle,
  MindmapLayout,
  MindmapNodeId,
  MindmapTree
} from '@whiteboard/core/mindmap/types'
import type { Point, Rect } from '@whiteboard/core/types'

export type MindmapRenderConnector = {
  id: string
  parentId: MindmapNodeId
  childId: MindmapNodeId
  path: string
  style: MindmapBranchStyle
}

export type MindmapRenderModel = {
  bbox: Rect
  connectors: readonly MindmapRenderConnector[]
}

const translateRect = (
  rect: Rect,
  delta: Point
): Rect => ({
  x: rect.x + delta.x,
  y: rect.y + delta.y,
  width: rect.width,
  height: rect.height
})

export const translateMindmapLayout = (
  computed: MindmapLayout,
  delta: Point
): MindmapLayout => {
  if (delta.x === 0 && delta.y === 0) {
    return computed
  }

  return {
    node: Object.fromEntries(
      Object.entries(computed.node).map(([nodeId, rect]) => [
        nodeId,
        translateRect(rect, delta)
      ])
    ),
    bbox: translateRect(computed.bbox, delta)
  }
}

export const anchorMindmapLayout = (input: {
  tree: MindmapTree
  computed: MindmapLayout
  position: Point
}): MindmapLayout => {
  const rootRect = input.computed.node[input.tree.rootNodeId]
  if (!rootRect) {
    return input.computed
  }

  return translateMindmapLayout(input.computed, {
    x: input.position.x - rootRect.x,
    y: input.position.y - rootRect.y
  })
}

const resolveConnectorPoints = ({
  tree,
  parentId,
  childId,
  parentRect,
  childRect
}: {
  tree: MindmapTree
  parentId: MindmapNodeId
  childId: MindmapNodeId
  parentRect: Rect
  childRect: Rect
}) => {
  const parentCenterX = parentRect.x + parentRect.width / 2
  const parentCenterY = parentRect.y + parentRect.height / 2
  const childCenterX = childRect.x + childRect.width / 2
  const childCenterY = childRect.y + childRect.height / 2
  const side = parentId === tree.rootNodeId
    ? tree.nodes[childId]?.side
    : getSide(tree, childId)

  if (side === 'left') {
    return {
      startX: parentRect.x,
      startY: parentCenterY,
      endX: childRect.x + childRect.width,
      endY: childCenterY,
      horizontal: false
    }
  }

  if (side === 'right') {
    return {
      startX: parentRect.x + parentRect.width,
      startY: parentCenterY,
      endX: childRect.x,
      endY: childCenterY,
      horizontal: true
    }
  }

  if (childCenterX >= parentCenterX) {
    return {
      startX: parentRect.x + parentRect.width,
      startY: parentCenterY,
      endX: childRect.x,
      endY: childCenterY,
      horizontal: true
    }
  }

  return {
    startX: parentRect.x,
    startY: parentCenterY,
    endX: childRect.x + childRect.width,
    endY: childCenterY,
    horizontal: false
  }
}

const buildCurvePath = (
  startX: number,
  startY: number,
  endX: number,
  endY: number
) => {
  const midX = startX + (endX - startX) / 2
  return `M${startX} ${startY} C${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`
}

const buildElbowPath = (
  startX: number,
  startY: number,
  endX: number,
  endY: number
) => {
  const midX = startX + (endX - startX) / 2
  return `M${startX} ${startY} L${midX} ${startY} L${midX} ${endY} L${endX} ${endY}`
}

const buildRailPath = (
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  horizontal: boolean
) => {
  const railX = horizontal
    ? startX + (endX - startX) * 0.35
    : startX + (endX - startX) * 0.65
  return `M${startX} ${startY} L${railX} ${startY} L${railX} ${endY} L${endX} ${endY}`
}

const buildConnectorPath = ({
  tree,
  parentId,
  childId,
  parentRect,
  childRect,
  style
}: {
  tree: MindmapTree
  parentId: MindmapNodeId
  childId: MindmapNodeId
  parentRect: Rect
  childRect: Rect
  style: MindmapBranchStyle
}) => {
  const points = resolveConnectorPoints({
    tree,
    parentId,
    childId,
    parentRect,
    childRect
  })

  switch (style.line) {
    case 'elbow':
      return buildElbowPath(points.startX, points.startY, points.endX, points.endY)
    case 'rail':
      return buildRailPath(points.startX, points.startY, points.endX, points.endY, points.horizontal)
    default:
      return buildCurvePath(points.startX, points.startY, points.endX, points.endY)
  }
}

export const resolveMindmapRender = (input: {
  tree: MindmapTree
  computed: MindmapLayout
}): MindmapRenderModel => {
  const connectors: MindmapRenderConnector[] = []
  Object.entries(input.tree.children).forEach(([parentId, childIds]) => {
    const parentRect = input.computed.node[parentId]
    const parent = input.tree.nodes[parentId]
    if (!parentRect || !parent) {
      return
    }

    childIds.forEach((childId) => {
      const childRect = input.computed.node[childId]
      if (!childRect) {
        return
      }

      connectors.push({
        id: `${parentId}-${childId}`,
        parentId,
        childId,
        path: buildConnectorPath({
          tree: input.tree,
          parentId,
          childId,
          parentRect,
          childRect,
          style: parent.branch
        }),
        style: parent.branch
      })
    })
  })

  return {
    bbox: input.computed.bbox,
    connectors
  }
}
