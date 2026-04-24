import type {
  MindmapLayout
} from '@whiteboard/core/types'
import { edge as edgeApi } from '@whiteboard/core/edge'
import { isListEqual } from '@shared/projector'
import type {
  ChromeView,
  DrawPreview,
  EdgeUiView,
  EditSession,
  EdgeView,
  GroupView,
  HoverState,
  MindmapView,
  MindmapPreview,
  NodeUiView,
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
  && left.structure.rootId === right.structure.rootId
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

const isHoverStateEqual = (
  left: HoverState,
  right: HoverState
): boolean => {
  if (left === right) {
    return true
  }
  if (left.kind !== right.kind) {
    return false
  }

  switch (left.kind) {
    case 'none':
    case 'selection-box':
      return true
    case 'node':
      return right.kind === 'node' && left.nodeId === right.nodeId
    case 'edge':
      return right.kind === 'edge' && left.edgeId === right.edgeId
    case 'mindmap':
      return right.kind === 'mindmap' && left.mindmapId === right.mindmapId
    case 'group':
      return right.kind === 'group' && left.groupId === right.groupId
  }
}

const isEditCaretEqual = (
  left: EditSession['caret'] | undefined,
  right: EditSession['caret'] | undefined
): boolean => left?.kind === right?.kind && (
  left?.kind !== 'point'
  || (
    right?.kind === 'point'
    && isPointEqual(left.client, right.client)
  )
)

const isEditSessionEqual = (
  left: EditSession | null,
  right: EditSession | null
): boolean => {
  if (left === right) {
    return true
  }
  if (!left || !right || left.kind !== right.kind) {
    return false
  }

  switch (left.kind) {
    case 'node':
      return (
        right.kind === 'node'
        && left.nodeId === right.nodeId
        && left.field === right.field
        && left.text === right.text
        && left.composing === right.composing
        && isEditCaretEqual(left.caret, right.caret)
      )
    case 'edge-label':
      return (
        right.kind === 'edge-label'
        && left.edgeId === right.edgeId
        && left.labelId === right.labelId
        && left.text === right.text
        && left.composing === right.composing
        && isEditCaretEqual(left.caret, right.caret)
      )
  }
}

const isChromeOverlayEqual = (
  left: ChromeView['overlays'][number],
  right: ChromeView['overlays'][number]
): boolean => left.kind === right.kind && left.id === right.id

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

const isDrawStyleEqual = (
  left: DrawPreview['style'],
  right: DrawPreview['style']
): boolean => (
  left.kind === right.kind
  && left.color === right.color
  && left.width === right.width
  && left.opacity === right.opacity
)

const isDrawPreviewEqual = (
  left: DrawPreview | null,
  right: DrawPreview | null
): boolean => (
  left === right
  || (
    left !== null
    && right !== null
    && left.kind === right.kind
    && isDrawStyleEqual(left.style, right.style)
    && isListEqual(left.points, right.points, isPointEqual)
    && isRectEqual(left.bounds, right.bounds)
    && isListEqual(left.hiddenNodeIds, right.hiddenNodeIds)
  )
)

const isMindmapDropLineEqual = (
  left: NonNullable<NonNullable<MindmapPreview['subtreeMove']>['drop']>['connectionLine'],
  right: NonNullable<NonNullable<MindmapPreview['subtreeMove']>['drop']>['connectionLine']
): boolean => left === right || (
  left !== undefined
  && right !== undefined
  && left.x1 === right.x1
  && left.y1 === right.y1
  && left.x2 === right.x2
  && left.y2 === right.y2
)

const isMindmapDropTargetEqual = (
  left: NonNullable<MindmapPreview['subtreeMove']>['drop'],
  right: NonNullable<MindmapPreview['subtreeMove']>['drop']
): boolean => left === right || (
  left !== undefined
  && right !== undefined
  && left.type === right.type
  && left.parentId === right.parentId
  && left.index === right.index
  && left.side === right.side
  && left.targetId === right.targetId
  && isMindmapDropLineEqual(left.connectionLine, right.connectionLine)
  && isMindmapDropLineEqual(left.insertLine, right.insertLine)
)

const isMindmapEnterPreviewEqual = (
  left: NonNullable<MindmapPreview['enter']>[number],
  right: NonNullable<MindmapPreview['enter']>[number]
): boolean => (
  left.mindmapId === right.mindmapId
  && left.nodeId === right.nodeId
  && left.parentId === right.parentId
  && isListEqual(left.route, right.route, isPointEqual)
  && isRectEqual(left.fromRect, right.fromRect)
  && isRectEqual(left.toRect, right.toRect)
  && left.startedAt === right.startedAt
  && left.durationMs === right.durationMs
)

const isMindmapPreviewEqual = (
  left: MindmapPreview | null,
  right: MindmapPreview | null
): boolean => left === right || (
  left !== null
  && right !== null
  && (
    left.rootMove === right.rootMove
    || (
      left.rootMove !== undefined
      && right.rootMove !== undefined
      && left.rootMove.mindmapId === right.rootMove.mindmapId
      && isPointEqual(left.rootMove.delta, right.rootMove.delta)
    )
  )
  && (
    left.subtreeMove === right.subtreeMove
    || (
      left.subtreeMove !== undefined
      && right.subtreeMove !== undefined
      && left.subtreeMove.mindmapId === right.subtreeMove.mindmapId
      && left.subtreeMove.nodeId === right.subtreeMove.nodeId
      && isRectEqual(left.subtreeMove.ghost, right.subtreeMove.ghost)
      && isMindmapDropTargetEqual(left.subtreeMove.drop, right.subtreeMove.drop)
    )
  )
  && isListEqual(left.enter ?? [], right.enter ?? [], isMindmapEnterPreviewEqual)
)

export const isChromeViewEqual = (
  left: ChromeView,
  right: ChromeView
): boolean => (
  isListEqual(left.overlays, right.overlays, isChromeOverlayEqual)
  && isHoverStateEqual(left.hover, right.hover)
  && (
    left.preview.marquee === right.preview.marquee
    || (
      left.preview.marquee !== undefined
      && right.preview.marquee !== undefined
      && left.preview.marquee.match === right.preview.marquee.match
      && isRectEqual(left.preview.marquee.worldRect, right.preview.marquee.worldRect)
    )
  )
  && isListEqual(left.preview.guides, right.preview.guides, isGuideEqual)
  && isDrawPreviewEqual(left.preview.draw, right.preview.draw)
  && isMindmapPreviewEqual(left.preview.mindmap, right.preview.mindmap)
  && isEditSessionEqual(left.edit, right.edit)
)

export const isNodeUiViewEqual = (
  left: NodeUiView,
  right: NodeUiView
): boolean => (
  left.hidden === right.hidden
  && left.selected === right.selected
  && left.hovered === right.hovered
  && left.editing === right.editing
  && left.patched === right.patched
  && left.resizing === right.resizing
  && left.edit?.field === right.edit?.field
  && isEditCaretEqual(left.edit?.caret, right.edit?.caret)
)

const isEdgeLabelUiViewEqual = (
  left: EdgeUiView['labels'] extends ReadonlyMap<string, infer TValue> ? TValue : never,
  right: EdgeUiView['labels'] extends ReadonlyMap<string, infer TValue> ? TValue : never
): boolean => (
  left.editing === right.editing
  && isEditCaretEqual(left.caret, right.caret)
)

const isEdgeUiLabelsEqual = (
  left: EdgeUiView['labels'],
  right: EdgeUiView['labels']
): boolean => {
  if (left === right) {
    return true
  }
  if (left.size !== right.size) {
    return false
  }

  for (const [labelId, leftLabel] of left) {
    const rightLabel = right.get(labelId)
    if (!rightLabel || !isEdgeLabelUiViewEqual(leftLabel, rightLabel)) {
      return false
    }
  }

  return true
}

export const isEdgeUiViewEqual = (
  left: EdgeUiView,
  right: EdgeUiView
): boolean => (
  left.selected === right.selected
  && left.patched === right.patched
  && left.activeRouteIndex === right.activeRouteIndex
  && left.editingLabelId === right.editingLabelId
  && isEdgeUiLabelsEqual(left.labels, right.labels)
)
