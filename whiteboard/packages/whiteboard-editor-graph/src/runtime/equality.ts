import type {
  MindmapLayout
} from '@whiteboard/core/types'
import { edge as edgeApi } from '@whiteboard/core/edge'
import { isListEqual } from '@shared/projection-runtime'
import type {
  EdgeView,
  GroupView,
  MindmapView,
  NodeView
} from '../contracts/editor'
import {
  isCanvasItemRefEqual,
  isEdgeLabelViewEqual,
  isPointEqual,
  isRectEqual
} from './geometry'

export const isNodeViewEqual = (
  left: NodeView,
  right: NodeView
): boolean => (
  left.base.node === right.base.node
  && left.base.owner?.kind === right.base.owner?.kind
  && left.base.owner?.id === right.base.owner?.id
  && left.geometry.rotation === right.geometry.rotation
  && isRectEqual(left.geometry.rect, right.geometry.rect)
  && isRectEqual(left.geometry.bounds, right.geometry.bounds)
)

export const isEdgeViewEqual = (
  left: EdgeView,
  right: EdgeView
): boolean => (
  left.base.edge === right.base.edge
  && left.base.nodes.source === right.base.nodes.source
  && left.base.nodes.target === right.base.nodes.target
  && left.route.svgPath === right.route.svgPath
  && isRectEqual(left.route.bounds, right.route.bounds)
  && isPointEqual(left.route.source, right.route.source)
  && isPointEqual(left.route.target, right.route.target)
  && isEdgeEndsEqual(left.route.ends, right.route.ends)
  && isListEqual(left.route.points, right.route.points, isPointEqual)
  && isListEqual(left.route.handles, right.route.handles, isEdgeHandleEqual)
  && isListEqual(left.route.labels, right.route.labels, isEdgeLabelViewEqual)
  && left.box?.pad === right.box?.pad
  && isRectEqual(left.box?.rect, right.box?.rect)
)

const isEdgeEndsEqual = (
  left: EdgeView['route']['ends'],
  right: EdgeView['route']['ends']
) => left === right || (
  left !== undefined
  && right !== undefined
  && edgeApi.equal.resolvedEnd(left.source, right.source)
  && edgeApi.equal.resolvedEnd(left.target, right.target)
)

const isEdgeHandleEqual = (
  left: EdgeView['route']['handles'][number],
  right: EdgeView['route']['handles'][number]
) => {
  if (left === right) {
    return true
  }

  if (left.kind !== right.kind || !isPointEqual(left.point, right.point)) {
    return false
  }

  switch (left.kind) {
    case 'end':
      return right.kind === 'end' && left.end === right.end
    case 'anchor':
      return (
        right.kind === 'anchor'
        && left.index === right.index
        && left.mode === right.mode
      )
    case 'segment':
      return (
        right.kind === 'segment'
        && left.role === right.role
        && left.insertIndex === right.insertIndex
        && left.segmentIndex === right.segmentIndex
        && left.axis === right.axis
      )
  }
}

const isMindmapRenderConnectorEqual = (
  left: MindmapView['render']['connectors'][number],
  right: MindmapView['render']['connectors'][number]
): boolean => (
  left.id === right.id
  && left.parentId === right.parentId
  && left.childId === right.childId
  && left.path === right.path
  && left.style.color === right.style.color
  && left.style.line === right.style.line
  && left.style.width === right.style.width
  && left.style.stroke === right.style.stroke
)

export const isMindmapLayoutEqual = (
  left: MindmapLayout | undefined,
  right: MindmapLayout | undefined
): boolean => {
  if (left === right) {
    return true
  }

  if (!left || !right) {
    return false
  }

  if (!isRectEqual(left.bbox, right.bbox)) {
    return false
  }

  const leftNodeIds = Object.keys(left.node)
  const rightNodeIds = Object.keys(right.node)
  if (leftNodeIds.length !== rightNodeIds.length) {
    return false
  }

  for (const nodeId of leftNodeIds) {
    if (!isRectEqual(left.node[nodeId], right.node[nodeId])) {
      return false
    }
  }

  return true
}

export const isMindmapViewEqual = (
  left: MindmapView,
  right: MindmapView
): boolean => (
  left.base.mindmap === right.base.mindmap
  && isListEqual(left.structure.nodeIds, right.structure.nodeIds)
  && isMindmapLayoutEqual(left.tree.layout, right.tree.layout)
  && isRectEqual(left.tree.bbox, right.tree.bbox)
  && isListEqual(left.render.connectors, right.render.connectors, isMindmapRenderConnectorEqual)
)

export const isGroupViewEqual = (
  left: GroupView,
  right: GroupView
): boolean => (
  left.base.group === right.base.group
  && isListEqual(left.structure.items, right.structure.items, isCanvasItemRefEqual)
  && isRectEqual(left.frame.bounds, right.frame.bounds)
)
