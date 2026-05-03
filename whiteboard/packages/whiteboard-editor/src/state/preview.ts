import { geometry as geometryApi } from '@whiteboard/core/geometry'
import type {
  EdgeId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import { json } from '@shared/core'
import type {
  EdgePreviewRecord,
  EdgeGuidePreview,
  EdgePreview,
  MindmapPreviewEntry,
  MindmapPreview,
  NodePreviewRecord,
  NodePreview,
  PreviewInput
} from '@whiteboard/editor-scene'
import {
  EMPTY_EDGE_GUIDE,
  isEdgeGuideEqual
} from '@whiteboard/editor/state/preview-edge'
import {
  EMPTY_NODE_HIDDEN,
  EMPTY_NODE_PATCHES
} from '@whiteboard/editor/state/preview-node'
import {
  EMPTY_GUIDES
} from '@whiteboard/editor/state/preview-selection'
import type {
  EdgeFeedbackEntry,
  EdgeGuide,
  NodePreviewEntry
} from '@whiteboard/editor/state/preview-types'

export type EditorPreviewState = PreviewInput

const EMPTY_NODE_PREVIEWS = Object.freeze({}) as NodePreviewRecord
const EMPTY_EDGE_PREVIEWS = Object.freeze({}) as EdgePreviewRecord
const EMPTY_MINDMAP_PREVIEWS = Object.freeze({}) as MindmapPreview

const readRecordIds = <TId extends string, TValue>(
  value: Readonly<Record<TId, TValue | undefined>>
): readonly TId[] => {
  const ids: TId[] = []
  for (const id in value) {
    ids.push(id as TId)
  }
  return ids
}

export const readNodePreviewIds = (
  value: NodePreviewRecord
): readonly NodeId[] => readRecordIds(value)

export const readEdgePreviewIds = (
  value: EdgePreviewRecord
): readonly EdgeId[] => readRecordIds(value)

export const readMindmapPreviewIds = (
  value: MindmapPreview
): readonly MindmapId[] => readRecordIds(value)

const isNodePreviewPatchEqual = (
  left: NodePreview['patch'],
  right: NodePreview['patch']
): boolean => json.stableStringify(left) === json.stableStringify(right)

const isNodePresentationEqual = (
  left: NodePreview['presentation'],
  right: NodePreview['presentation']
): boolean => geometryApi.equal.point(left?.position, right?.position)

const isNodePreviewEqual = (
  left: NodePreview | undefined,
  right: NodePreview | undefined
): boolean => left === right || (
  left !== undefined
  && right !== undefined
  && isNodePreviewPatchEqual(left.patch, right.patch)
  && isNodePresentationEqual(left.presentation, right.presentation)
  && left.hovered === right.hovered
  && left.hidden === right.hidden
)

const isEdgePreviewEqual = (
  left: EdgePreview | undefined,
  right: EdgePreview | undefined
): boolean => left === right || (
  left !== undefined
  && right !== undefined
  && json.stableStringify(left.patch) === json.stableStringify(right.patch)
  && left.activeRouteIndex === right.activeRouteIndex
)

const isPreviewRecordEqual = <TId extends string, TValue>(
  left: Readonly<Record<TId, TValue | undefined>>,
  right: Readonly<Record<TId, TValue | undefined>>,
  isEqual: (left: TValue | undefined, right: TValue | undefined) => boolean
): boolean => {
  if (left === right) {
    return true
  }

  const leftKeys = readRecordIds(left)
  const rightKeys = readRecordIds(right)
  if (leftKeys.length !== rightKeys.length) {
    return false
  }

  for (let index = 0; index < leftKeys.length; index += 1) {
    const id = leftKeys[index]!
    if (!isEqual(left[id], right[id])) {
      return false
    }
  }

  return true
}

export const isDrawPreviewEqual = (
  left: PreviewInput['draw'],
  right: PreviewInput['draw']
): boolean => left === right || (
  left !== null
  && right !== null
  && left.kind === right.kind
  && left.style.kind === right.style.kind
  && left.style.color === right.style.color
  && left.style.width === right.style.width
  && left.style.opacity === right.style.opacity
  && left.points.length === right.points.length
  && left.points.every((point, index) => geometryApi.equal.point(point, right.points[index]))
  && isRectEqual(left.bounds, right.bounds)
  && left.hiddenNodeIds.length === right.hiddenNodeIds.length
  && left.hiddenNodeIds.every((nodeId, index) => nodeId === right.hiddenNodeIds[index])
)

const isRectEqual = (
  left: {
    x: number
    y: number
    width: number
    height: number
  } | undefined,
  right: {
    x: number
    y: number
    width: number
    height: number
  } | undefined
): boolean => left === right || (
  left !== undefined
  && right !== undefined
  && left.x === right.x
  && left.y === right.y
  && left.width === right.width
  && left.height === right.height
)

export const isSelectionPreviewEqual = (
  left: PreviewInput['selection'],
  right: PreviewInput['selection']
): boolean => (
  left.guides === right.guides
  && (
    left.marquee === right.marquee
    || (
      left.marquee !== undefined
      && right.marquee !== undefined
      && left.marquee.match === right.marquee.match
      && isRectEqual(left.marquee.worldRect, right.marquee.worldRect)
    )
  )
)

export const isMindmapPreviewEntryEqual = (
  left: MindmapPreviewEntry | undefined,
  right: MindmapPreviewEntry | undefined
): boolean => left === right || (
  left !== undefined
  && right !== undefined
  && (
    left.rootMove === right.rootMove
    || (
      left.rootMove !== undefined
      && right.rootMove !== undefined
      && left.rootMove.delta.x === right.rootMove.delta.x
      && left.rootMove.delta.y === right.rootMove.delta.y
    )
  )
  && (
    left.subtreeMove === right.subtreeMove
    || (
      left.subtreeMove !== undefined
      && right.subtreeMove !== undefined
      && left.subtreeMove.nodeId === right.subtreeMove.nodeId
      && isRectEqual(left.subtreeMove.ghost, right.subtreeMove.ghost)
      && json.stableStringify(left.subtreeMove.drop) === json.stableStringify(right.subtreeMove.drop)
    )
  )
)

const normalizeMindmapPreviewRecord = (
  value: MindmapPreview
): MindmapPreview => {
  const ids = readMindmapPreviewIds(value)
  if (ids.length === 0) {
    return EMPTY_MINDMAP_PREVIEWS
  }

  const next: Record<string, MindmapPreviewEntry | undefined> = {}
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index]!
    const preview = value[id]
    if (!preview) {
      continue
    }
    if (!preview.rootMove && !preview.subtreeMove) {
      continue
    }
    next[id] = preview
  }

  return Object.keys(next).length === 0
    ? EMPTY_MINDMAP_PREVIEWS
    : next
}

const mergeNodePreviewPatch = (
  current: NodePreview | undefined,
  patch: Record<string, unknown>
): NodePreview => ({
  patch: {
    ...(current?.patch ?? {}),
    ...patch
  },
  presentation: current?.presentation,
  hovered: current?.hovered ?? false,
  hidden: current?.hidden ?? false
})

const mergeNodePresentation = (
  current: NodePreview | undefined,
  presentation: NodePreview['presentation']
): NodePreview => ({
  patch: current?.patch,
  presentation,
  hovered: current?.hovered ?? false,
  hidden: current?.hidden ?? false
})

const mergeEdgePreview = (
  current: EdgePreview | undefined,
  next: EdgePreview
): EdgePreview => ({
  patch: next.patch ?? current?.patch,
  activeRouteIndex: next.activeRouteIndex ?? current?.activeRouteIndex
})

const normalizeEdgeGuide = (
  edgeGuide: EdgeGuidePreview | undefined
): EdgeGuidePreview | undefined => (
  edgeGuide && (edgeGuide.path || edgeGuide.connect)
    ? edgeGuide
    : undefined
)

const normalizeDrawPreview = (
  draw: PreviewInput['draw']
): PreviewInput['draw'] => draw
  ? {
      ...draw,
      hiddenNodeIds: draw.hiddenNodeIds.length > 0
        ? draw.hiddenNodeIds
        : EMPTY_NODE_HIDDEN
    }
  : null

const normalizeNodePreviewRecord = (
  value: NodePreviewRecord
): NodePreviewRecord => {
  const ids = readNodePreviewIds(value)
  if (ids.length === 0) {
    return EMPTY_NODE_PREVIEWS
  }

  const next: Record<NodeId, NodePreview | undefined> = {}
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index]!
    const preview = value[id]
    if (!preview) {
      continue
    }

    if (
      preview.patch === undefined
      && preview.presentation === undefined
      && preview.hovered === false
      && preview.hidden === false
    ) {
      continue
    }

    next[id] = preview
  }

  return Object.keys(next).length > 0
    ? next
    : EMPTY_NODE_PREVIEWS
}

const normalizeEdgePreviewRecord = (
  value: EdgePreviewRecord
): EdgePreviewRecord => {
  const ids = readEdgePreviewIds(value)
  if (ids.length === 0) {
    return EMPTY_EDGE_PREVIEWS
  }

  const next: Record<EdgeId, EdgePreview | undefined> = {}
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index]!
    const preview = value[id]
    if (!preview) {
      continue
    }

    if (
      preview.patch === undefined
      && preview.activeRouteIndex === undefined
    ) {
      continue
    }

    next[id] = preview
  }

  return Object.keys(next).length > 0
    ? next
    : EMPTY_EDGE_PREVIEWS
}

export const EMPTY_PREVIEW_STATE: EditorPreviewState = {
  node: EMPTY_NODE_PREVIEWS,
  edge: EMPTY_EDGE_PREVIEWS,
  mindmap: EMPTY_MINDMAP_PREVIEWS,
  draw: null,
  selection: {
    guides: EMPTY_GUIDES
  }
}

export const normalizeEditorPreviewState = (
  state: PreviewInput
): EditorPreviewState => {
  const node = normalizeNodePreviewRecord(state.node)
  const edge = normalizeEdgePreviewRecord(state.edge)
  const mindmap = normalizeMindmapPreviewRecord(state.mindmap)
  const draw = normalizeDrawPreview(state.draw)
  const guides = state.selection.guides.length > 0
    ? state.selection.guides
    : EMPTY_GUIDES
  const edgeGuide = normalizeEdgeGuide(state.edgeGuide)
  const marquee = state.selection.marquee

  if (
    node === EMPTY_NODE_PREVIEWS
    && edge === EMPTY_EDGE_PREVIEWS
    && mindmap === EMPTY_MINDMAP_PREVIEWS
    && draw === null
    && guides === EMPTY_GUIDES
    && marquee === undefined
    && edgeGuide === undefined
  ) {
    return EMPTY_PREVIEW_STATE
  }

  return {
    node,
    edge,
    mindmap,
    ...(edgeGuide
      ? {
          edgeGuide
        }
      : {}),
    draw,
    selection: {
      ...(marquee
        ? {
            marquee
          }
        : {}),
      guides
    }
  }
}

export const isEditorPreviewStateEqual = (
  left: PreviewInput,
  right: PreviewInput
): boolean => (
  isPreviewNodeRecordEqual(left.node, right.node)
  && isPreviewEdgeRecordEqual(left.edge, right.edge)
  && isPreviewMindmapRecordEqual(left.mindmap, right.mindmap)
  && isEdgeGuideEqual(left.edgeGuide ?? EMPTY_EDGE_GUIDE, right.edgeGuide ?? EMPTY_EDGE_GUIDE)
  && isDrawPreviewEqual(left.draw, right.draw)
  && isSelectionPreviewEqual(left.selection, right.selection)
)

export const isPreviewEqual = isEditorPreviewStateEqual

export const isPreviewNodeRecordEqual = (
  left: NodePreviewRecord,
  right: NodePreviewRecord
): boolean => isPreviewRecordEqual(left, right, isNodePreviewEqual)

export const isPreviewEdgeRecordEqual = (
  left: EdgePreviewRecord,
  right: EdgePreviewRecord
): boolean => isPreviewRecordEqual(left, right, isEdgePreviewEqual)

export const isPreviewMindmapRecordEqual = (
  left: MindmapPreview,
  right: MindmapPreview
): boolean => isPreviewRecordEqual(left, right, isMindmapPreviewEntryEqual)

export const replacePreviewNodeInteraction = (
  state: EditorPreviewState,
  input: {
    patches?: readonly NodePreviewEntry[]
    hiddenNodeIds?: readonly NodeId[]
  }
): EditorPreviewState => {
  const next: Record<NodeId, NodePreview | undefined> = {}

  readNodePreviewIds(state.node).forEach((nodeId) => {
    const current = state.node[nodeId]
    if (!current?.presentation) {
      return
    }

    next[nodeId] = {
      presentation: current.presentation,
      hovered: false,
      hidden: false
    }
  })

  ;(input.patches ?? EMPTY_NODE_PATCHES).forEach((entry) => {
    next[entry.id] = mergeNodePreviewPatch(next[entry.id], entry.patch)
  })

  ;(input.hiddenNodeIds ?? EMPTY_NODE_HIDDEN).forEach((nodeId) => {
    const current = next[nodeId]
    next[nodeId] = {
      patch: current?.patch,
      presentation: current?.presentation,
      hovered: current?.hovered ?? false,
      hidden: true
    }
  })

  return normalizeEditorPreviewState({
    ...state,
    node: next
  })
}

export const replacePreviewEdgeInteraction = (
  state: EditorPreviewState,
  entries: readonly EdgeFeedbackEntry[]
): EditorPreviewState => {
  const next: Record<EdgeId, EdgePreview | undefined> = {}

  entries.forEach((entry) => {
    next[entry.id] = mergeEdgePreview(next[entry.id], {
      patch: entry.patch,
      activeRouteIndex: entry.activeRouteIndex
    })
  })

  return normalizeEditorPreviewState({
    ...state,
    edge: next
  })
}

export const setPreviewEdgeGuide = (
  state: EditorPreviewState,
  edgeGuide: EdgeGuidePreview | EdgeGuide | undefined
): EditorPreviewState => {
  if (!edgeGuide) {
    const {
      edgeGuide: _edgeGuide,
      ...rest
    } = state
    return normalizeEditorPreviewState(rest)
  }

  return normalizeEditorPreviewState({
    ...state,
    edgeGuide
  })
}

export const setPreviewDraw = (
  state: EditorPreviewState,
  draw: PreviewInput['draw']
): EditorPreviewState => normalizeEditorPreviewState({
  ...state,
  draw
})

export const setPreviewSelection = (
  state: EditorPreviewState,
  selection: PreviewInput['selection']
): EditorPreviewState => normalizeEditorPreviewState({
  ...state,
  selection
})

export const setPreviewMindmap = (
  state: EditorPreviewState,
  mindmap: MindmapPreview
): EditorPreviewState => normalizeEditorPreviewState({
  ...state,
  mindmap
})

export const updatePreviewNodePresentation = (
  state: EditorPreviewState,
  nodeId: NodeId,
  position?: {
    x: number
    y: number
  }
): EditorPreviewState => {
  const current = state.node[nodeId]
  const nextPresentation = position
    ? {
        position
      }
    : undefined

  if (isNodePresentationEqual(current?.presentation, nextPresentation)) {
    return state
  }

  const node: Record<NodeId, NodePreview | undefined> = {
    ...state.node
  }
  const nextNode = nextPresentation
    ? mergeNodePresentation(current, nextPresentation)
    : current
      ? {
          patch: current.patch,
          hovered: current.hovered,
          hidden: current.hidden
        }
      : undefined

  if (!nextNode) {
    return state
  }

  if (
    nextNode.patch === undefined
    && nextNode.presentation === undefined
    && nextNode.hovered === false
    && nextNode.hidden === false
  ) {
    delete node[nodeId]
  } else {
    node[nodeId] = nextNode
  }

  return normalizeEditorPreviewState({
    ...state,
    node
  })
}
