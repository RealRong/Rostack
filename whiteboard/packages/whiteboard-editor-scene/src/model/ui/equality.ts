import { equal } from '@shared/core'
import type {
  EdgeId,
  NodeId
} from '@whiteboard/core/types'
import type { EditCaret } from '@whiteboard/editor/protocol'
import type {
  ChromeOverlay,
  ChromeView,
  DrawPreview,
  EditorStateInput,
  EdgeGuidePreview,
  EdgeLabelUiView,
  EdgeUiView,
  EdgeView,
  HoverState,
  MindmapPreview,
  NodeUiEdit,
  NodeUiView,
  SelectionState
} from '../../contracts/editor'
import type {
  GraphEdgeEntry,
  GraphNodeEntry
} from '../../contracts/working'

const isChromeOverlayEqual = (
  left: ChromeOverlay,
  right: ChromeOverlay
): boolean => left.kind === right.kind
  && left.id === right.id

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
  left: EditCaret | undefined,
  right: EditCaret | undefined
): boolean => left?.kind === right?.kind && (
  left?.kind !== 'point'
  || (
    right?.kind === 'point'
    && equal.samePoint(left.client, right.client)
  )
)

const isEditSessionEqual = (
  left: EditorStateInput['edit'],
  right: EditorStateInput['edit']
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
    default:
      return false
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
    && equal.sameOrder(left.points, right.points, equal.samePoint)
    && equal.sameOptionalRect(left.bounds, right.bounds)
    && equal.sameOrder(left.hiddenNodeIds, right.hiddenNodeIds)
  )
)

const isEdgeGuidePreviewEqual = (
  left: EdgeGuidePreview | undefined,
  right: EdgeGuidePreview | undefined
): boolean => {
  const leftResolution = left?.connect?.resolution
  const rightResolution = right?.connect?.resolution

  if (
    left?.path?.svgPath !== right?.path?.svgPath
    || left?.path?.style?.color !== right?.path?.style?.color
    || left?.path?.style?.width !== right?.path?.style?.width
    || left?.path?.style?.dash !== right?.path?.style?.dash
    || left?.path?.style?.start !== right?.path?.style?.start
    || left?.path?.style?.end !== right?.path?.style?.end
    || left?.connect?.focusedNodeId !== right?.connect?.focusedNodeId
    || leftResolution?.mode !== rightResolution?.mode
    || !equal.sameOptionalPoint(leftResolution?.pointWorld, rightResolution?.pointWorld)
  ) {
    return false
  }

  if (!leftResolution || !rightResolution) {
    return leftResolution === rightResolution
  }

  if (leftResolution.mode === 'free' || rightResolution.mode === 'free') {
    return leftResolution.mode === rightResolution.mode
  }

  if (leftResolution.nodeId !== rightResolution.nodeId) {
    return false
  }

  if (
    leftResolution.anchor.side !== rightResolution.anchor.side
    || leftResolution.anchor.offset !== rightResolution.anchor.offset
  ) {
    return false
  }

  if (leftResolution.mode === 'handle' || rightResolution.mode === 'handle') {
    return leftResolution.mode === 'handle'
      && rightResolution.mode === 'handle'
      && leftResolution.side === rightResolution.side
  }

  return true
}

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
      && equal.sameOptionalPoint(left.rootMove.delta, right.rootMove.delta)
    )
  )
  && (
    left.subtreeMove === right.subtreeMove
    || (
      left.subtreeMove !== undefined
      && right.subtreeMove !== undefined
      && left.subtreeMove.mindmapId === right.subtreeMove.mindmapId
      && left.subtreeMove.nodeId === right.subtreeMove.nodeId
      && equal.sameOptionalRect(left.subtreeMove.ghost, right.subtreeMove.ghost)
      && isMindmapDropTargetEqual(left.subtreeMove.drop, right.subtreeMove.drop)
    )
  )
)

const readNodeUiEdit = (
  nodeId: NodeId,
  edit: EditorStateInput['edit']
): NodeUiEdit | undefined => edit?.kind === 'node' && edit.nodeId === nodeId
  ? {
      field: edit.field,
      caret: edit.caret
    }
  : undefined

const isEditingEdgeLabel = (
  edgeId: EdgeId,
  labelId: string,
  edit: EditorStateInput['edit']
) => edit?.kind === 'edge-label'
  && edit.edgeId === edgeId
  && edit.labelId === labelId

const isEdgeLabelUiViewEqual = (
  left: EdgeLabelUiView,
  right: EdgeLabelUiView
): boolean => (
  left.editing === right.editing
  && isEditCaretEqual(left.caret, right.caret)
)

export const buildNodeUiView = (input: {
  nodeId: NodeId
  preview?: GraphNodeEntry['preview']
  draw: EditorStateInput['preview']['draw']
  edit: EditorStateInput['edit']
  selection: SelectionState
  hover: HoverState
}): NodeUiView => {
  const edit = readNodeUiEdit(input.nodeId, input.edit)
  const patch = input.preview?.patch
  const handle = patch && 'handle' in patch
    ? patch.handle
    : undefined

  return {
    hidden: input.preview?.hidden ?? input.draw?.hiddenNodeIds.includes(input.nodeId) ?? false,
    selected: input.selection.nodeIds.includes(input.nodeId),
    hovered: (
      input.hover.kind === 'node'
      && input.hover.nodeId === input.nodeId
    ) || Boolean(input.preview?.hovered),
    editing: edit !== undefined,
    patched: Boolean(patch),
    resizing: Boolean(patch?.size || handle),
    edit
  }
}

export const buildEdgeUiView = (input: {
  edgeId: EdgeId
  entry: GraphEdgeEntry
  view: EdgeView
  edit: EditorStateInput['edit']
  selection: SelectionState
}): EdgeUiView => {
  const labelIds = new Set<string>()

  input.entry.base.edge.labels?.forEach((label) => {
    labelIds.add(label.id)
  })
  input.view.route.labels.forEach((label) => {
    labelIds.add(label.labelId)
  })
  if (input.edit?.kind === 'edge-label' && input.edit.edgeId === input.edgeId) {
    labelIds.add(input.edit.labelId)
  }

  const labels = new Map<string, EdgeLabelUiView>()
  labelIds.forEach((labelId) => {
    const editing = isEditingEdgeLabel(input.edgeId, labelId, input.edit)
    labels.set(labelId, {
      editing,
      caret: editing && input.edit?.kind === 'edge-label'
        ? input.edit.caret
        : undefined
    })
  })

  return {
    selected: input.selection.edgeIds.includes(input.edgeId),
    patched: Boolean(input.entry.preview?.patch),
    activeRouteIndex: input.entry.preview?.activeRouteIndex,
    editingLabelId: input.edit?.kind === 'edge-label'
      && input.edit.edgeId === input.edgeId
      ? input.edit.labelId
      : undefined,
    labels
  }
}

export const buildChromeView = (input: {
  state: EditorStateInput
  selection: SelectionState
  hover: HoverState
}): ChromeView => {
  const overlays: ChromeOverlay[] = []

  if (input.hover.kind !== 'none') {
    overlays.push({
      kind: 'hover'
    })
  }

  if (
    input.selection.nodeIds.length > 0
    || input.selection.edgeIds.length > 0
  ) {
    overlays.push({
      kind: 'selection'
    })
  }

  if (input.state.preview.selection.guides.length > 0) {
    overlays.push({
      kind: 'guide'
    })
  }

  if (input.state.preview.selection.marquee) {
    overlays.push({
      kind: 'marquee'
    })
  }

  if (input.state.preview.draw) {
    overlays.push({
      kind: 'draw'
    })
  }

  if (input.state.edit) {
    overlays.push({
      kind: 'edit'
    })
  }

  if (
    input.state.preview.mindmap?.rootMove
    || input.state.preview.mindmap?.subtreeMove
  ) {
    overlays.push({
      kind: 'mindmap-drop'
    })
  }

  return {
    overlays,
    hover: input.hover,
    preview: {
      edgeGuide: input.state.preview.edgeGuide,
      marquee: input.state.preview.selection.marquee,
      guides: input.state.preview.selection.guides,
      draw: input.state.preview.draw,
      mindmap: input.state.preview.mindmap
    },
    edit: input.state.edit
  }
}

export const isChromeViewEqual = (
  left: ChromeView,
  right: ChromeView
): boolean => (
  equal.sameOrder(left.overlays, right.overlays, isChromeOverlayEqual)
  && isHoverStateEqual(left.hover, right.hover)
  && isEdgeGuidePreviewEqual(left.preview.edgeGuide, right.preview.edgeGuide)
  && (
    left.preview.marquee === right.preview.marquee
    || (
      left.preview.marquee !== undefined
      && right.preview.marquee !== undefined
      && left.preview.marquee.match === right.preview.marquee.match
      && equal.sameOptionalRect(left.preview.marquee.worldRect, right.preview.marquee.worldRect)
    )
  )
  && equal.sameOrder(left.preview.guides, right.preview.guides, isGuideEqual)
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

export const isEdgeUiViewEqual = (
  left: EdgeUiView,
  right: EdgeUiView
): boolean => (
  left.selected === right.selected
  && left.patched === right.patched
  && left.activeRouteIndex === right.activeRouteIndex
  && left.editingLabelId === right.editingLabelId
  && equal.sameMap(left.labels, right.labels, isEdgeLabelUiViewEqual)
)
