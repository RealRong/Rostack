import type {
  CanvasItemRef,
  Edge,
  EdgeId,
  MindmapLayout,
  Node,
  NodeId,
  Point,
  Rect,
  Size
} from '@whiteboard/core/types'
import { isListEqual } from '@shared/projection-runtime'
import type {
  ChromeOverlay,
  ChromeView,
  EdgeLabelView,
  EdgeView,
  GroupView,
  MindmapView,
  NodeDraft,
  NodePreview,
  NodeView,
  SceneItem,
  SceneLayer,
  SceneSnapshot,
  SelectionState,
  SelectionView,
  SessionInput
} from '../contracts/editor'
import type {
  GraphEdgeEntry,
  GraphNodeEntry,
  MindmapTreeState,
  SceneWorkingState,
  StructureWorkingState,
  WorkingState
} from '../contracts/working'

export const EMPTY_SIZE: Size = {
  width: 0,
  height: 0
}

export const EMPTY_RECT: Rect = {
  x: 0,
  y: 0,
  width: 0,
  height: 0
}

export const EMPTY_SCENE_LAYERS: readonly SceneLayer[] = [
  'owners',
  'edges',
  'nodes',
  'ui'
]

const isPointEqual = (
  left: Point | undefined,
  right: Point | undefined
): boolean => left === right || (
  left !== undefined
  && right !== undefined
  && left.x === right.x
  && left.y === right.y
)

export const isSizeEqual = (
  left: Size | undefined,
  right: Size | undefined
): boolean => left === right || (
  left !== undefined
  && right !== undefined
  && left.width === right.width
  && left.height === right.height
)

export const isRectEqual = (
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

const isCanvasItemRefEqual = (
  left: CanvasItemRef,
  right: CanvasItemRef
): boolean => left.kind === right.kind && left.id === right.id

const isSceneItemEqual = (
  left: SceneItem,
  right: SceneItem
): boolean => left.kind === right.kind && left.id === right.id

const isChromeOverlayEqual = (
  left: ChromeOverlay,
  right: ChromeOverlay
): boolean => left.kind === right.kind && left.id === right.id

const isSelectionStateEqual = (
  left: SelectionState,
  right: SelectionState
): boolean => (
  isListEqual(left.nodeIds, right.nodeIds)
  && isListEqual(left.edgeIds, right.edgeIds)
)

const isEdgeLabelViewEqual = (
  left: EdgeLabelView,
  right: EdgeLabelView
): boolean => (
  left.labelId === right.labelId
  && left.text === right.text
  && isSizeEqual(left.size, right.size)
  && isRectEqual(left.rect, right.rect)
)

const readNodePatch = (
  draft?: NodeDraft,
  preview?: NodePreview
) => preview?.patch ?? (
  draft?.kind === 'patch'
    ? draft.fields
    : undefined
)

const readNodeSize = (
  node: Node
): Size => node.size ?? EMPTY_SIZE

export const readProjectedNodeRect = (input: {
  entry: GraphNodeEntry
  measuredSize?: Size
  treeRect?: Rect
}): Rect => {
  if (input.treeRect) {
    return input.treeRect
  }

  const patch = readNodePatch(input.entry.draft, input.entry.preview)
  const position = patch?.position ?? input.entry.base.node.position
  const size = patch?.size
    ?? input.measuredSize
    ?? (
      input.entry.draft?.kind === 'size'
        ? input.entry.draft.size
        : undefined
    )
    ?? readNodeSize(input.entry.base.node)

  return {
    x: position.x,
    y: position.y,
    width: size.width,
    height: size.height
  }
}

const readEdgePoints = (
  edge: Edge
): readonly Point[] => edge.route?.kind === 'manual'
  ? edge.route.points
  : []

export const readSelectionKind = (
  selection: SelectionState
): SelectionView['kind'] => {
  if (selection.nodeIds.length > 0 && selection.edgeIds.length > 0) {
    return 'mixed'
  }

  if (selection.nodeIds.length > 0) {
    return 'nodes'
  }

  if (selection.edgeIds.length > 0) {
    return 'edges'
  }

  return 'none'
}

export const buildSelectionView = (
  selection: SelectionState
): SelectionView => ({
  target: selection,
  kind: readSelectionKind(selection)
})

export const buildChromeView = (input: {
  session: SessionInput
  selection: SelectionState
  hover: WorkingState['ui']['hover']
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

  if (input.session.preview.selection.guides.length > 0) {
    overlays.push({
      kind: 'guide'
    })
  }

  if (input.session.preview.selection.marquee) {
    overlays.push({
      kind: 'marquee'
    })
  }

  if (input.session.edit) {
    overlays.push({
      kind: 'edit'
    })
  }

  if (
    input.session.preview.mindmap?.rootMove
    || input.session.preview.mindmap?.subtreeMove
  ) {
    overlays.push({
      kind: 'mindmap-drop'
    })
  }

  return {
    overlays
  }
}

const toSceneItem = (
  ref: CanvasItemRef
): SceneItem => ({
  kind: ref.kind,
  id: ref.id
}) as SceneItem

const collectBoundingRect = (
  rects: readonly Rect[]
): Rect | undefined => {
  if (rects.length === 0) {
    return undefined
  }

  let minX = rects[0]!.x
  let minY = rects[0]!.y
  let maxX = rects[0]!.x + rects[0]!.width
  let maxY = rects[0]!.y + rects[0]!.height

  for (let index = 1; index < rects.length; index += 1) {
    const rect = rects[index]!
    minX = Math.min(minX, rect.x)
    minY = Math.min(minY, rect.y)
    maxX = Math.max(maxX, rect.x + rect.width)
    maxY = Math.max(maxY, rect.y + rect.height)
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  }
}

export const buildNodeView = (input: {
  entry: GraphNodeEntry
  measuredSize?: Size
  treeRect?: Rect
  edit: SessionInput['edit']
}): NodeView => {
  const rect = readProjectedNodeRect(input)

  return {
    base: input.entry.base,
    layout: {
      measuredSize: input.measuredSize,
      rect,
      bounds: rect
    },
    render: {
      hidden: input.entry.preview?.hidden ?? false,
      editing: input.edit?.kind === 'node'
        && input.edit.nodeId === input.entry.base.node.id
    }
  }
}

export const buildEdgeView = (input: {
  edgeId: EdgeId
  entry: GraphEdgeEntry
  labelMeasures?: ReadonlyMap<string, { size: Size }>
  edit: SessionInput['edit']
}): EdgeView => ({
  base: input.entry.base,
  route: {
    points: readEdgePoints(input.entry.base.edge),
    labels: (input.entry.base.edge.labels ?? []).map((label) => ({
      labelId: label.id,
      text: label.text ?? '',
      size: input.labelMeasures?.get(label.id)?.size
    }))
  },
  render: {
    hidden: false,
    editingLabelId: input.edit?.kind === 'edge-label'
      && input.edit.edgeId === input.edgeId
      ? input.edit.labelId
      : undefined
  }
})

const toMindmapLayout = (
  state: MindmapTreeState | undefined
): MindmapLayout | undefined => {
  if (!state || !state.bbox || state.nodeRects.size === 0) {
    return undefined
  }

  const node: Record<NodeId, Rect> = {}
  state.nodeRects.forEach((rect, nodeId) => {
    node[nodeId] = rect
  })

  return {
    node,
    bbox: state.bbox
  }
}

export const buildMindmapView = (input: {
  mindmapId: string
  working: WorkingState
}): MindmapView | undefined => {
  const mindmap = input.working.input.document.snapshot.state.facts.entities.owners.mindmaps.get(input.mindmapId)
  const structure = input.working.structure.mindmaps.get(input.mindmapId)
  const tree = input.working.tree.mindmaps.get(input.mindmapId)

  if (!mindmap || !structure) {
    return undefined
  }

  return {
    base: {
      mindmap
    },
    structure: {
      nodeIds: structure.nodeIds
    },
    tree: {
      layout: toMindmapLayout(tree),
      bbox: tree?.bbox
    }
  }
}

export const buildGroupView = (input: {
  groupId: string
  working: WorkingState
}): GroupView | undefined => {
  const group = input.working.input.document.snapshot.state.facts.entities.owners.groups.get(input.groupId)
  const structure = input.working.structure.groups.get(input.groupId)

  if (!group || !structure) {
    return undefined
  }

  const rects: Rect[] = []
  structure.itemIds.forEach((item) => {
    if (item.kind === 'node') {
      const rect = input.working.element.nodes.get(item.id)?.layout.bounds
      if (rect) {
        rects.push(rect)
      }
      return
    }

    if (item.kind === 'mindmap') {
      const rect = input.working.tree.mindmaps.get(item.id)?.bbox
      if (rect) {
        rects.push(rect)
      }
    }
  })

  return {
    base: {
      group
    },
    structure: {
      items: structure.itemIds
    },
    frame: {
      bounds: collectBoundingRect(rects)
    }
  }
}

export const buildSceneWorkingState = (input: {
  snapshot: WorkingState['input']['document']['snapshot']
  structure: StructureWorkingState
  element: WorkingState['element']
}): SceneWorkingState => ({
  layers: EMPTY_SCENE_LAYERS,
  items: input.snapshot.state.root.canvas.order.map(toSceneItem),
  visible: {
    nodeIds: [...input.element.nodes.keys()],
    edgeIds: [...input.element.edges.keys()],
    mindmapIds: [...input.structure.mindmaps.keys()]
  }
})

export const buildSceneSnapshot = (
  working: WorkingState
): SceneSnapshot => ({
  layers: working.scene.layers,
  items: working.scene.items,
  spatial: {
    nodes: working.scene.visible.nodeIds,
    edges: working.scene.visible.edgeIds
  },
  pick: {
    items: working.input.document.snapshot.state.root.canvas.order
  }
})

export const isNodeViewEqual = (
  left: NodeView,
  right: NodeView
): boolean => (
  left.base.node === right.base.node
  && left.base.owner?.kind === right.base.owner?.kind
  && left.base.owner?.id === right.base.owner?.id
  && isSizeEqual(left.layout.measuredSize, right.layout.measuredSize)
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
  && isListEqual(left.route.points, right.route.points, isPointEqual)
  && isListEqual(left.route.labels, right.route.labels, isEdgeLabelViewEqual)
  && left.render.hidden === right.render.hidden
  && left.render.editingLabelId === right.render.editingLabelId
)

export const isMindmapViewEqual = (
  left: MindmapView,
  right: MindmapView
): boolean => (
  left.base.mindmap === right.base.mindmap
  && isListEqual(left.structure.nodeIds, right.structure.nodeIds)
  && left.tree.layout === right.tree.layout
  && isRectEqual(left.tree.bbox, right.tree.bbox)
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
)

export const isChromeViewEqual = (
  left: ChromeView,
  right: ChromeView
): boolean => isListEqual(left.overlays, right.overlays, isChromeOverlayEqual)

export const isSceneSnapshotEqual = (
  left: SceneSnapshot,
  right: SceneSnapshot
): boolean => (
  isListEqual(left.layers, right.layers)
  && isListEqual(left.items, right.items, isSceneItemEqual)
  && isListEqual(left.spatial.nodes, right.spatial.nodes)
  && isListEqual(left.spatial.edges, right.spatial.edges)
  && isListEqual(left.pick.items, right.pick.items, isCanvasItemRefEqual)
)

export const collectRects = (
  values: Iterable<Rect>
): Rect | undefined => collectBoundingRect([...values])
