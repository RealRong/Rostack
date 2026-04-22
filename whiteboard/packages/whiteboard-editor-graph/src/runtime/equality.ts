import type {
  CanvasItemRef,
  MindmapLayout
} from '@whiteboard/core/types'
import { isListEqual } from '@shared/projection-runtime'
import type {
  ChromeView,
  EdgeView,
  GroupView,
  MindmapView,
  NodeView,
  SceneSnapshot,
  SelectionView
} from '../contracts/editor'
import {
  isCanvasItemRefEqual,
  isChromeOverlayEqual,
  isEdgeLabelViewEqual,
  isPointEqual,
  isRectEqual,
  isSceneItemEqual,
  isSelectionStateEqual,
  isSizeEqual
} from './geometry'

export const isNodeViewEqual = (
  left: NodeView,
  right: NodeView
): boolean => (
  left.base.node === right.base.node
  && left.base.owner?.kind === right.base.owner?.kind
  && left.base.owner?.id === right.base.owner?.id
  && isSizeEqual(left.layout.measuredSize, right.layout.measuredSize)
  && left.layout.rotation === right.layout.rotation
  && isRectEqual(left.layout.rect, right.layout.rect)
  && isRectEqual(left.layout.bounds, right.layout.bounds)
  && left.render.hidden === right.render.hidden
  && left.render.editing === right.render.editing
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
  && isListEqual(left.route.points, right.route.points, isPointEqual)
  && isListEqual(left.route.labels, right.route.labels, isEdgeLabelViewEqual)
  && left.render.hidden === right.render.hidden
  && left.render.editingLabelId === right.render.editingLabelId
)

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

export const isSelectionViewEqual = (
  left: SelectionView,
  right: SelectionView
): boolean => (
  left.kind === right.kind
  && isSelectionStateEqual(left.target, right.target)
  && left.summary.count === right.summary.count
  && left.summary.nodeCount === right.summary.nodeCount
  && left.summary.edgeCount === right.summary.edgeCount
  && isListEqual(left.summary.groupIds, right.summary.groupIds)
  && isRectEqual(left.summary.box, right.summary.box)
  && left.affordance.owner === right.affordance.owner
  && left.affordance.ownerNodeId === right.affordance.ownerNodeId
  && isRectEqual(left.affordance.displayBox, right.affordance.displayBox)
  && left.affordance.moveHit === right.affordance.moveHit
  && left.affordance.canMove === right.affordance.canMove
  && left.affordance.canResize === right.affordance.canResize
  && left.affordance.canRotate === right.affordance.canRotate
  && isListEqual(
    left.affordance.handles,
    right.affordance.handles,
    (leftHandle, rightHandle) => (
      leftHandle.id === rightHandle.id
      && leftHandle.visible === rightHandle.visible
      && leftHandle.enabled === rightHandle.enabled
      && leftHandle.family === rightHandle.family
      && leftHandle.cursor === rightHandle.cursor
    )
  )
)

const isHoverStateEqual = (
  left: ChromeView['hover'],
  right: ChromeView['hover']
): boolean => {
  if (left.kind !== right.kind) {
    return false
  }

  switch (left.kind) {
    case 'node':
      return right.kind === 'node' && left.nodeId === right.nodeId
    case 'edge':
      return right.kind === 'edge' && left.edgeId === right.edgeId
    case 'mindmap':
      return right.kind === 'mindmap' && left.mindmapId === right.mindmapId
    case 'group':
      return right.kind === 'group' && left.groupId === right.groupId
    default:
      return true
  }
}

const isGuideEqual = (
  left: ChromeView['preview']['guides'][number],
  right: ChromeView['preview']['guides'][number]
): boolean => (
  left.axis === right.axis
  && left.value === right.value
  && left.from === right.from
  && left.to === right.to
  && left.targetEdge === right.targetEdge
  && left.sourceEdge === right.sourceEdge
)

const isDrawPreviewEqual = (
  left: ChromeView['preview']['draw'],
  right: ChromeView['preview']['draw']
): boolean => left === right || (
  left !== null
  && right !== null
  && isListEqual(left.points, right.points, isPointEqual)
  && isRectEqual(left.bounds, right.bounds)
  && isListEqual(left.hiddenNodeIds, right.hiddenNodeIds)
)

const isMindmapPreviewEqual = (
  left: ChromeView['preview']['mindmap'],
  right: ChromeView['preview']['mindmap']
): boolean => {
  if (left === right) {
    return true
  }

  if (!left || !right) {
    return false
  }

  return (
    left.rootMove?.mindmapId === right.rootMove?.mindmapId
    && isPointEqual(left.rootMove?.delta, right.rootMove?.delta)
    && left.subtreeMove?.mindmapId === right.subtreeMove?.mindmapId
    && left.subtreeMove?.nodeId === right.subtreeMove?.nodeId
    && isRectEqual(left.subtreeMove?.ghost, right.subtreeMove?.ghost)
    && isListEqual(
      left.enter ?? [],
      right.enter ?? [],
      (leftEntry, rightEntry) => (
        leftEntry.mindmapId === rightEntry.mindmapId
        && leftEntry.nodeId === rightEntry.nodeId
        && leftEntry.parentId === rightEntry.parentId
        && isListEqual(leftEntry.route, rightEntry.route, isPointEqual)
        && isRectEqual(leftEntry.fromRect, rightEntry.fromRect)
        && isRectEqual(leftEntry.toRect, rightEntry.toRect)
        && leftEntry.startedAt === rightEntry.startedAt
        && leftEntry.durationMs === rightEntry.durationMs
      )
    )
  )
}

const isEditCaretEqual = (
  left: NonNullable<ChromeView['edit']>['caret'],
  right: NonNullable<ChromeView['edit']>['caret']
): boolean => left.kind === right.kind && (
  left.kind !== 'point'
  || (
    right.kind === 'point'
    && isPointEqual(left.client, right.client)
  )
)

const isEditSessionEqual = (
  left: ChromeView['edit'],
  right: ChromeView['edit']
): boolean => left === right || (
  left !== null
  && right !== null
  && left.kind === right.kind
  && left.text === right.text
  && left.composing === right.composing
  && isEditCaretEqual(left.caret, right.caret)
  && (
    left.kind === 'node'
      ? right.kind === 'node'
        && left.nodeId === right.nodeId
        && left.field === right.field
      : right.kind === 'edge-label'
        && left.edgeId === right.edgeId
        && left.labelId === right.labelId
      )
)

export const isChromeViewEqual = (
  left: ChromeView,
  right: ChromeView
): boolean => (
  isListEqual(left.overlays, right.overlays, isChromeOverlayEqual)
  && isHoverStateEqual(left.hover, right.hover)
  && isRectEqual(left.preview.marquee?.worldRect, right.preview.marquee?.worldRect)
  && isListEqual(left.preview.guides, right.preview.guides, isGuideEqual)
  && isDrawPreviewEqual(left.preview.draw, right.preview.draw)
  && isMindmapPreviewEqual(left.preview.mindmap, right.preview.mindmap)
  && isEditSessionEqual(left.edit, right.edit)
)

export const isSceneSnapshotEqual = (
  left: SceneSnapshot,
  right: SceneSnapshot
): boolean => (
  isListEqual(left.layers, right.layers)
  && isListEqual(left.items, right.items, isSceneItemEqual)
  && isListEqual(left.visible.items, right.visible.items, isSceneItemEqual)
  && isListEqual(left.visible.nodeIds, right.visible.nodeIds)
  && isListEqual(left.visible.edgeIds, right.visible.edgeIds)
  && isListEqual(left.visible.mindmapIds, right.visible.mindmapIds)
  && isListEqual(left.spatial.nodes, right.spatial.nodes)
  && isListEqual(left.spatial.edges, right.spatial.edges)
  && isListEqual(left.spatial.mindmaps, right.spatial.mindmaps)
  && isListEqual(left.pick.items as readonly CanvasItemRef[], right.pick.items as readonly CanvasItemRef[], isCanvasItemRefEqual)
)
