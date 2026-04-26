import { scheduler, store } from '@shared/core'
import { edge as edgeApi } from '@whiteboard/core/edge'
import { mindmap as mindmapApi } from '@whiteboard/core/mindmap'
import type {
  DrawPreview as GraphDrawPreview,
  DragState,
  EdgePreview,
  HoverState,
  Input,
  InputDelta,
  MindmapPreview,
  NodeDraft,
  NodePreview
} from '@whiteboard/editor-scene'
import type {
  EditSession as EditorEditSession
} from '@whiteboard/editor/session/edit'
import type {
  EngineDelta,
  EnginePublish,
  IdDelta,
  Snapshot as DocumentSnapshot
} from '@whiteboard/engine'
import type { EditorLayout } from '@whiteboard/editor/layout/runtime'
import type { EditorSession } from '@whiteboard/editor/session/runtime'
import type {
  HoverState as EditorHoverState
} from '@whiteboard/editor/input/hover/store'
import { isEdgeInteractionMode } from '@whiteboard/editor/input/interaction/mode'
import type {
  EditorInputPreviewState,
  TextPreviewPatch
} from '@whiteboard/editor/session/preview/types'
import type { DraftMeasure } from '@whiteboard/editor/types/layout'

const EMPTY_DRAG_STATE: DragState = {
  kind: 'idle'
}

const EMPTY_HOVER_STATE: HoverState = {
  kind: 'none'
}

const EMPTY_NODE_DRAFTS = new Map<string, NodeDraft>()

const readInteractionEditingEdge = (
  mode: ReturnType<EditorSession['interaction']['read']['mode']['get']>
): boolean => isEdgeInteractionMode(mode)

const readInteractionHover = (
  hover: EditorHoverState
): HoverState => {
  switch (hover.target?.kind) {
    case 'node':
      return {
        kind: 'node',
        nodeId: hover.target.nodeId
      }
    case 'edge':
      return {
        kind: 'edge',
        edgeId: hover.target.edgeId
      }
    case 'mindmap':
      return {
        kind: 'mindmap',
        mindmapId: hover.target.mindmapId
      }
    case 'group':
      return {
        kind: 'group',
        groupId: hover.target.groupId
      }
    case 'selection-box':
      return {
        kind: 'selection-box'
      }
    default:
      return EMPTY_HOVER_STATE
  }
}

export const createTouchedIdDelta = <TId extends string>(
  ids: Iterable<TId>
): IdDelta<TId> => ({
  added: new Set(),
  updated: new Set(ids),
  removed: new Set()
})

const mergeNodePreviewPatch = (
  current: NodePreview | undefined,
  patch: Record<string, unknown>
): NodePreview => ({
  patch: {
    ...(current?.patch ?? {}),
    ...patch
  },
  hovered: current?.hovered ?? false,
  hidden: current?.hidden ?? false
})

const readNodePreviews = (
  preview: EditorInputPreviewState
): ReadonlyMap<string, NodePreview> => {
  const byId = new Map<string, NodePreview>()

  preview.selection.node.patches.forEach((entry) => {
    byId.set(
      entry.id,
      mergeNodePreviewPatch(byId.get(entry.id), entry.patch)
    )
  })

  preview.node.text.patches.forEach((entry) => {
    byId.set(
      entry.id,
      mergeNodePreviewPatch(
        byId.get(entry.id),
        entry.patch as unknown as TextPreviewPatch
      )
    )
  })

  preview.draw.hidden.forEach((nodeId) => {
    const current = byId.get(nodeId)
    byId.set(nodeId, {
      patch: current?.patch,
      hovered: current?.hovered ?? false,
      hidden: true
    })
  })

  return byId
}

const readEdgePreviews = (
  preview: EditorInputPreviewState
): ReadonlyMap<string, EdgePreview> => {
  const byId = new Map<string, EdgePreview>()

  preview.edge.interaction.forEach((entry) => {
    byId.set(entry.id, {
      patch: entry.patch,
      activeRouteIndex: entry.activeRouteIndex
    })
  })

  return byId
}

const readDrawPreview = (
  preview: EditorInputPreviewState
): GraphDrawPreview | null => {
  const current = preview.draw.preview
  if (!current) {
    return null
  }

  return {
    kind: current.kind,
    style: current.style,
    points: current.points,
    hiddenNodeIds: preview.draw.hidden
  }
}

const readMindmapPreview = (
  snapshot: DocumentSnapshot,
  preview: EditorInputPreviewState['mindmap']['preview']
): MindmapPreview | null => {
  if (!preview) {
    return null
  }

  const rootMoveMindmapId = preview.rootMove
    ? mindmapApi.tree.resolveId(snapshot.document, preview.rootMove.treeId)
    : undefined
  const subtreeMoveMindmapId = preview.subtreeMove
    ? mindmapApi.tree.resolveId(snapshot.document, preview.subtreeMove.treeId)
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
      : undefined,
    enter: preview.enter?.flatMap((entry) => {
      const mindmapId = mindmapApi.tree.resolveId(snapshot.document, entry.treeId)
      return mindmapId
        ? [{
            mindmapId,
            nodeId: entry.nodeId,
            parentId: entry.parentId,
            route: entry.route,
            fromRect: entry.fromRect,
            toRect: entry.toRect,
            startedAt: entry.startedAt,
            durationMs: entry.durationMs
          }]
        : []
    })
  }
}

const toNodeDraft = (
  draft: DraftMeasure
): NodeDraft | undefined => {
  if (!draft) {
    return undefined
  }

  return draft.kind === 'size'
    ? {
        kind: 'size',
        size: draft.size
      }
    : {
        kind: 'fit',
        fontSize: draft.fontSize
      }
}

const readNodeDrafts = ({
  session,
  layout
}: {
  session: Pick<EditorSession, 'state'>
  layout: Pick<EditorLayout, 'draft'>
}): ReadonlyMap<string, NodeDraft> => {
  const currentEdit = store.read(session.state.edit)
  if (!currentEdit || currentEdit.kind !== 'node') {
    return EMPTY_NODE_DRAFTS
  }

  const draft = toNodeDraft(
    store.read(layout.draft.node, currentEdit.nodeId)
  )
  if (!draft) {
    return EMPTY_NODE_DRAFTS
  }

  return new Map([[currentEdit.nodeId, draft]])
}

const readDragState = (
  snapshot: DocumentSnapshot,
  session: Pick<EditorSession, 'state' | 'interaction' | 'preview'>
): DragState => {
  const mode = store.read(session.interaction.read.mode)
  const selection = store.read(session.state.selection)
  const edit = store.read(session.state.edit)
  const preview = store.read(session.preview.state)

  switch (mode) {
    case 'node-drag':
      return {
        kind: 'selection-move',
        nodeIds: selection.nodeIds,
        edgeIds: selection.edgeIds
      }
    case 'marquee':
      return preview.selection.marquee
        ? {
            kind: 'selection-marquee',
            worldRect: preview.selection.marquee.worldRect,
            match: preview.selection.marquee.match
          }
        : EMPTY_DRAG_STATE
    case 'node-transform':
      return {
        kind: 'selection-transform',
        nodeIds: selection.nodeIds
      }
    case 'edge-label':
      return edit?.kind === 'edge-label'
        ? {
            kind: 'edge-label',
            edgeId: edit.edgeId,
            labelId: edit.labelId
          }
        : EMPTY_DRAG_STATE
    case 'edge-route':
      return edit?.kind === 'edge-label'
        ? {
            kind: 'edge-route',
            edgeId: edit.edgeId
          }
        : EMPTY_DRAG_STATE
    case 'draw':
      return {
        kind: 'draw'
      }
    case 'mindmap-drag': {
      const mindmap = preview.mindmap.preview
      const subtreeMove = mindmap?.subtreeMove
      if (!subtreeMove) {
        return EMPTY_DRAG_STATE
      }

      const mindmapId = mindmapApi.tree.resolveId(snapshot.document, subtreeMove.treeId)

      return mindmapId
        ? {
            kind: 'mindmap-drag',
            mindmapId,
            nodeId: subtreeMove.nodeId
          }
        : EMPTY_DRAG_STATE
    }
    default:
      return EMPTY_DRAG_STATE
  }
}

export const createDocumentInputDelta = (
  delta: EngineDelta
): InputDelta['document'] => ({
  reset: delta.reset,
  order: delta.order,
  nodes: {
    added: new Set(delta.nodes.added),
    updated: new Set(delta.nodes.updated),
    removed: new Set(delta.nodes.removed)
  },
  edges: {
    added: new Set(delta.edges.added),
    updated: new Set(delta.edges.updated),
    removed: new Set(delta.edges.removed)
  },
  mindmaps: {
    added: new Set(delta.mindmaps.added),
    updated: new Set(delta.mindmaps.updated),
    removed: new Set(delta.mindmaps.removed)
  },
  groups: {
    added: new Set(delta.groups.added),
    updated: new Set(delta.groups.updated),
    removed: new Set(delta.groups.removed)
  }
})

export const readEditedNodeIds = (
  edit: EditorEditSession | null
): ReadonlySet<string> => edit?.kind === 'node'
  ? new Set([edit.nodeId])
  : new Set()

export const readEditedEdgeIds = (
  edit: EditorEditSession | null
): ReadonlySet<string> => edit?.kind === 'edge-label'
  ? new Set([edit.edgeId])
  : new Set()

export const readPreviewNodeIds = (
  preview: EditorInputPreviewState
): ReadonlySet<string> => new Set([
  ...preview.selection.node.patches.map((entry) => entry.id),
  ...preview.node.text.patches.map((entry) => entry.id)
])

export const readPreviewEdgeIds = (
  preview: EditorInputPreviewState
): ReadonlySet<string> => new Set(
  preview.edge.interaction
    .filter((entry) => entry.patch !== undefined)
    .map((entry) => entry.id)
)

const readPreviewEdgeProjectionMap = (
  preview: EditorInputPreviewState
) => {
  const byId = new Map<string, {
    patch?: EdgePreview['patch']
    activeRouteIndex?: EdgePreview['activeRouteIndex']
  }>()

  preview.edge.interaction.forEach((entry) => {
    byId.set(entry.id, {
      patch: entry.patch,
      activeRouteIndex: entry.activeRouteIndex
    })
  })

  return byId
}

export const readChangedPreviewEdgeIds = (input: {
  previous: EditorInputPreviewState
  next: EditorInputPreviewState
}): ReadonlySet<string> => {
  const previous = readPreviewEdgeProjectionMap(input.previous)
  const next = readPreviewEdgeProjectionMap(input.next)
  const changed = new Set<string>()

  for (const edgeId of new Set([
    ...previous.keys(),
    ...next.keys()
  ])) {
    const left = previous.get(edgeId)
    const right = next.get(edgeId)

    if (
      !edgeApi.patch.equal(left?.patch, right?.patch)
      || left?.activeRouteIndex !== right?.activeRouteIndex
    ) {
      changed.add(edgeId)
    }
  }

  return changed
}

export const readPreviewMindmapIds = (
  snapshot: DocumentSnapshot,
  preview: EditorInputPreviewState['mindmap']['preview']
): ReadonlySet<string> => {
  const ids = new Set<string>()

  const rootMoveMindmapId = preview?.rootMove
    ? mindmapApi.tree.resolveId(snapshot.document, preview.rootMove.treeId)
    : undefined
  if (rootMoveMindmapId) {
    ids.add(rootMoveMindmapId)
  }

  const subtreeMoveMindmapId = preview?.subtreeMove
    ? mindmapApi.tree.resolveId(snapshot.document, preview.subtreeMove.treeId)
    : undefined
  if (subtreeMoveMindmapId) {
    ids.add(subtreeMoveMindmapId)
  }

  preview?.enter?.forEach((entry) => {
    const mindmapId = mindmapApi.tree.resolveId(snapshot.document, entry.treeId)
    if (mindmapId) {
      ids.add(mindmapId)
    }
  })

  return ids
}

export const readActiveMindmapTickIds = (input: {
  snapshot: DocumentSnapshot
  preview: EditorInputPreviewState['mindmap']['preview']
  now?: number
}): ReadonlySet<string> => {
  const ids = new Set<string>()
  const now = input.now ?? scheduler.readMonotonicNow()

  input.preview?.enter?.forEach((entry) => {
    if (entry.startedAt + entry.durationMs <= now) {
      return
    }

    const mindmapId = mindmapApi.tree.resolveId(input.snapshot.document, entry.treeId)
    if (mindmapId) {
      ids.add(mindmapId)
    }
  })

  return ids
}

export const createSceneInput = ({
  previous,
  publish,
  session,
  layout,
  delta,
  now = scheduler.readMonotonicNow()
}: {
  previous: DocumentSnapshot | null
  publish: EnginePublish
  session: Pick<EditorSession, 'state' | 'interaction' | 'preview'>
  layout: Pick<EditorLayout, 'draft'>
  delta: InputDelta
  now?: number
}): Input => {
  const snapshot = publish.snapshot
  const preview = store.read(session.preview.state)
  const selection = store.read(session.state.selection)

  return {
    document: {
      previous,
      snapshot,
      delta: publish.delta
    },
    session: {
      edit: store.read(session.state.edit),
      draft: {
        nodes: new Map(readNodeDrafts({
          session,
          layout
        })),
        edges: new Map()
      },
      preview: {
        nodes: new Map(readNodePreviews(preview)),
        edges: new Map(readEdgePreviews(preview)),
        edgeGuide: preview.edge.guide
          ? {
              path: preview.edge.guide.path,
              connect: preview.edge.guide.connect
                ? {
                    resolution: preview.edge.guide.connect.resolution
                  }
                : undefined
            }
          : undefined,
        draw: readDrawPreview(preview),
        selection: {
          marquee: preview.selection.marquee
            ? {
                worldRect: preview.selection.marquee.worldRect,
                match: preview.selection.marquee.match
              }
            : undefined,
          guides: preview.selection.guides
        },
        mindmap: readMindmapPreview(snapshot, preview.mindmap.preview)
      },
      tool: store.read(session.state.tool)
    },
    interaction: {
      selection,
      hover: readInteractionHover(
        store.read(session.interaction.read.hover)
      ),
      drag: readDragState(snapshot, session),
      chrome: store.read(session.interaction.read.chrome),
      editingEdge: readInteractionEditingEdge(
        store.read(session.interaction.read.mode)
      )
    },
    clock: {
      now
    },
    delta
  }
}
