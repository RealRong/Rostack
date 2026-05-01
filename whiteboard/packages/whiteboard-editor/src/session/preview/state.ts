import { geometry as geometryApi } from '@whiteboard/core/geometry'
import { mindmap as mindmapApi } from '@whiteboard/core/mindmap'
import type {
  Document,
  EdgeId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import { json } from '@shared/core'
import type {
  EdgeGuidePreview,
  EdgePreview,
  HoverState,
  MindmapPreview,
  NodePreview,
  PreviewInput
} from '@whiteboard/editor-scene'
import type {
  ActiveGesture
} from '@whiteboard/editor/input/core/gesture'
import {
  EMPTY_EDGE_FEEDBACK_ENTRIES,
  EMPTY_EDGE_GUIDE,
  isEdgeGuideEqual
} from '@whiteboard/editor/session/preview/edge'
import {
  EMPTY_NODE_HIDDEN,
  EMPTY_NODE_PATCHES
} from '@whiteboard/editor/session/preview/node'
import {
  EMPTY_GUIDES
} from '@whiteboard/editor/session/preview/selection'
import type {
  MindmapPreviewState
} from '@whiteboard/editor/session/preview/types'

const EMPTY_NODE_PREVIEWS = new Map<NodeId, NodePreview>()
const EMPTY_EDGE_PREVIEWS = new Map<EdgeId, EdgePreview>()

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

const isPreviewMapEqual = <TId extends string, TValue>(
  left: ReadonlyMap<TId, TValue>,
  right: ReadonlyMap<TId, TValue>,
  isEqual: (left: TValue | undefined, right: TValue | undefined) => boolean
): boolean => {
  if (left === right) {
    return true
  }
  if (left.size !== right.size) {
    return false
  }

  for (const [id, value] of left) {
    if (!isEqual(value, right.get(id))) {
      return false
    }
  }

  return true
}

const isDrawPreviewEqual = (
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

const isSelectionPreviewEqual = (
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

export const isMindmapPreviewEqual = (
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
      && left.rootMove.delta.x === right.rootMove.delta.x
      && left.rootMove.delta.y === right.rootMove.delta.y
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
      && json.stableStringify(left.subtreeMove.drop) === json.stableStringify(right.subtreeMove.drop)
    )
  )
)

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

const toMindmapPreview = (
  document: Document,
  preview: MindmapPreviewState | undefined
): MindmapPreview | null => {
  if (!preview) {
    return null
  }

  const rootMoveMindmapId = preview.rootMove
    ? mindmapApi.tree.resolveId(document, preview.rootMove.treeId)
    : undefined
  const subtreeMoveMindmapId = preview.subtreeMove
    ? mindmapApi.tree.resolveId(document, preview.subtreeMove.treeId)
    : undefined

  return {
    rootMove: rootMoveMindmapId && preview.rootMove
      ? {
          mindmapId: rootMoveMindmapId,
          delta: preview.rootMove.delta
        }
      : undefined,
    subtreeMove: subtreeMoveMindmapId && preview.subtreeMove
      ? {
          mindmapId: subtreeMoveMindmapId,
          nodeId: preview.subtreeMove.nodeId,
          ghost: preview.subtreeMove.ghost,
          drop: preview.subtreeMove.drop
        }
      : undefined
  }
}

const mergeMindmapPreview = (
  base: MindmapPreview | null,
  draft: MindmapPreview | null
): MindmapPreview | null => {
  if (!base) {
    return draft
  }

  if (!draft) {
    return base
  }

  return {
    ...base,
    ...draft
  }
}

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

export const EMPTY_PREVIEW_STATE: PreviewInput = {
  nodes: EMPTY_NODE_PREVIEWS,
  edges: EMPTY_EDGE_PREVIEWS,
  draw: null,
  selection: {
    guides: EMPTY_GUIDES
  },
  mindmap: null
}

export const normalizeEditorPreviewState = (
  state: PreviewInput
): PreviewInput => {
  const nodes = state.nodes.size > 0
    ? state.nodes
    : EMPTY_NODE_PREVIEWS
  const edges = state.edges.size > 0
    ? state.edges
    : EMPTY_EDGE_PREVIEWS
  const draw = normalizeDrawPreview(state.draw)
  const guides = state.selection.guides.length > 0
    ? state.selection.guides
    : EMPTY_GUIDES
  const edgeGuide = normalizeEdgeGuide(state.edgeGuide)
  const marquee = state.selection.marquee
  const mindmap = state.mindmap ?? null

  if (
    nodes === EMPTY_NODE_PREVIEWS
    && edges === EMPTY_EDGE_PREVIEWS
    && draw === null
    && guides === EMPTY_GUIDES
    && marquee === undefined
    && edgeGuide === undefined
    && mindmap === null
  ) {
    return EMPTY_PREVIEW_STATE
  }

  return {
    nodes,
    edges,
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
    },
    mindmap
  }
}

export const isEditorPreviewStateEqual = (
  left: PreviewInput,
  right: PreviewInput
): boolean => (
  isPreviewMapEqual(left.nodes, right.nodes, isNodePreviewEqual)
  && isPreviewMapEqual(left.edges, right.edges, isEdgePreviewEqual)
  && isEdgeGuideEqual(left.edgeGuide ?? EMPTY_EDGE_GUIDE, right.edgeGuide ?? EMPTY_EDGE_GUIDE)
  && isDrawPreviewEqual(left.draw, right.draw)
  && isSelectionPreviewEqual(left.selection, right.selection)
  && isMindmapPreviewEqual(left.mindmap, right.mindmap)
)

const readNodePreviews = (input: {
  base: ReadonlyMap<NodeId, NodePreview>
  gesture: ActiveGesture | null
}): ReadonlyMap<NodeId, NodePreview> => {
  const next = new Map(input.base)
  const draft = input.gesture?.draft

  ;(draft?.nodePatches ?? EMPTY_NODE_PATCHES).forEach((entry) => {
    next.set(entry.id, mergeNodePreviewPatch(next.get(entry.id), entry.patch))
  })
  ;(draft?.hiddenNodeIds ?? EMPTY_NODE_HIDDEN).forEach((nodeId) => {
    const current = next.get(nodeId)
    next.set(nodeId, {
      patch: current?.patch,
      presentation: current?.presentation,
      hovered: current?.hovered ?? false,
      hidden: true
    })
  })

  return next.size > 0
    ? next
    : EMPTY_NODE_PREVIEWS
}

const readEdgePreviews = (input: {
  base: ReadonlyMap<EdgeId, EdgePreview>
  gesture: ActiveGesture | null
}): ReadonlyMap<EdgeId, EdgePreview> => {
  const draft = input.gesture?.draft
  if (!draft?.edgePatches?.length) {
    return input.base.size > 0
      ? input.base
      : EMPTY_EDGE_PREVIEWS
  }

  const next = new Map(input.base)
  draft.edgePatches.forEach((entry) => {
    next.set(entry.id, mergeEdgePreview(next.get(entry.id), {
      patch: entry.patch,
      activeRouteIndex: entry.activeRouteIndex
    }))
  })

  return next
}

const readDrawPreview = (
  gesture: ActiveGesture | null
): PreviewInput['draw'] => {
  const draft = gesture?.draft
  if (!draft?.drawPreview) {
    return null
  }

  return {
    ...draft.drawPreview,
    hiddenNodeIds: draft.hiddenNodeIds ?? EMPTY_NODE_HIDDEN
  }
}

export const composeEditorPreviewState = (input: {
  base: PreviewInput
  gesture: ActiveGesture | null
  hover: HoverState
  edgeGuide?: EdgeGuidePreview
  readDocument: () => Document
}): PreviewInput => {
  const draft = input.gesture?.draft
  const base = normalizeEditorPreviewState(input.base)
  const draftMindmap = toMindmapPreview(
    input.readDocument(),
    draft?.mindmap
  )

  return normalizeEditorPreviewState({
    nodes: readNodePreviews({
      base: base.nodes,
      gesture: input.gesture
    }),
    edges: readEdgePreviews({
      base: base.edges,
      gesture: input.gesture
    }),
    edgeGuide: draft?.edgeGuide ?? input.edgeGuide ?? base.edgeGuide,
    draw: draft
      ? readDrawPreview(input.gesture)
      : base.draw,
    selection: draft
      ? {
          ...(draft.marquee
            ? {
                marquee: draft.marquee
              }
            : {}),
          guides: draft.guides ?? EMPTY_GUIDES
        }
      : base.selection,
    mindmap: mergeMindmapPreview(base.mindmap, draftMindmap)
  })
}

export const updatePreviewNodePresentation = (
  state: PreviewInput,
  nodeId: NodeId,
  position?: {
    x: number
    y: number
  }
): PreviewInput => {
  const current = state.nodes.get(nodeId)
  const nextPresentation = position
    ? {
        position
      }
    : undefined

  if (isNodePresentationEqual(current?.presentation, nextPresentation)) {
    return state
  }

  const nodes = new Map(state.nodes)
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
    nodes.delete(nodeId)
  } else {
    nodes.set(nodeId, nextNode)
  }

  return normalizeEditorPreviewState({
    ...state,
    nodes
  })
}
