import { scheduler, store } from '@shared/core'
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
} from '@whiteboard/editor-graph'
import type {
  EditSession as EditorEditSession
} from '@whiteboard/editor/session/edit'
import type {
  EngineChange,
  EnginePublish,
  IdDelta,
  Snapshot as DocumentSnapshot
} from '@whiteboard/engine'
import type { EditorLayout } from '@whiteboard/editor/layout/runtime'
import type { EditorSession } from '@whiteboard/editor/session/runtime'
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

export const createEmptyIdDelta = <TId extends string>(): IdDelta<TId> => ({
  added: new Set(),
  updated: new Set(),
  removed: new Set()
})

export const createTouchedIdDelta = <TId extends string>(
  ids: Iterable<TId>
): IdDelta<TId> => ({
  added: new Set(),
  updated: new Set(ids),
  removed: new Set()
})

export const hasIdDelta = <TId extends string>(
  delta: IdDelta<TId>
): boolean => (
  delta.added.size > 0
  || delta.updated.size > 0
  || delta.removed.size > 0
)

const mergeIdDelta = <TId extends string>(
  target: IdDelta<TId>,
  source: IdDelta<TId>
) => {
  source.added.forEach((id) => {
    ;(target.added as Set<TId>).add(id)
  })
  source.updated.forEach((id) => {
    ;(target.updated as Set<TId>).add(id)
  })
  source.removed.forEach((id) => {
    ;(target.removed as Set<TId>).add(id)
  })
}

export const createEmptyEditorGraphInputDelta = (): InputDelta => ({
  document: {
    reset: false,
    order: false,
    nodes: createEmptyIdDelta(),
    edges: createEmptyIdDelta(),
    mindmaps: createEmptyIdDelta(),
    groups: createEmptyIdDelta()
  },
  graph: {
    nodes: {
      draft: createEmptyIdDelta(),
      preview: createEmptyIdDelta(),
      edit: createEmptyIdDelta()
    },
    edges: {
      preview: createEmptyIdDelta(),
      edit: createEmptyIdDelta()
    },
    mindmaps: {
      preview: createEmptyIdDelta(),
      tick: new Set()
    },
    interaction: {
      selection: false,
      drag: false
    }
  },
  ui: {
    tool: false,
    selection: false,
    marquee: false,
    guides: false,
    draw: false,
    edit: false
  },
  scene: {
    viewport: false
  }
})

export const cloneEditorGraphInputDelta = (
  delta: InputDelta
): InputDelta => ({
  document: {
    reset: delta.document.reset,
    order: delta.document.order,
    nodes: {
      added: new Set(delta.document.nodes.added),
      updated: new Set(delta.document.nodes.updated),
      removed: new Set(delta.document.nodes.removed)
    },
    edges: {
      added: new Set(delta.document.edges.added),
      updated: new Set(delta.document.edges.updated),
      removed: new Set(delta.document.edges.removed)
    },
    mindmaps: {
      added: new Set(delta.document.mindmaps.added),
      updated: new Set(delta.document.mindmaps.updated),
      removed: new Set(delta.document.mindmaps.removed)
    },
    groups: {
      added: new Set(delta.document.groups.added),
      updated: new Set(delta.document.groups.updated),
      removed: new Set(delta.document.groups.removed)
    }
  },
  graph: {
    nodes: {
      draft: {
        added: new Set(delta.graph.nodes.draft.added),
        updated: new Set(delta.graph.nodes.draft.updated),
        removed: new Set(delta.graph.nodes.draft.removed)
      },
      preview: {
        added: new Set(delta.graph.nodes.preview.added),
        updated: new Set(delta.graph.nodes.preview.updated),
        removed: new Set(delta.graph.nodes.preview.removed)
      },
      edit: {
        added: new Set(delta.graph.nodes.edit.added),
        updated: new Set(delta.graph.nodes.edit.updated),
        removed: new Set(delta.graph.nodes.edit.removed)
      }
    },
    edges: {
      preview: {
        added: new Set(delta.graph.edges.preview.added),
        updated: new Set(delta.graph.edges.preview.updated),
        removed: new Set(delta.graph.edges.preview.removed)
      },
      edit: {
        added: new Set(delta.graph.edges.edit.added),
        updated: new Set(delta.graph.edges.edit.updated),
        removed: new Set(delta.graph.edges.edit.removed)
      }
    },
    mindmaps: {
      preview: {
        added: new Set(delta.graph.mindmaps.preview.added),
        updated: new Set(delta.graph.mindmaps.preview.updated),
        removed: new Set(delta.graph.mindmaps.preview.removed)
      },
      tick: new Set(delta.graph.mindmaps.tick)
    },
    interaction: {
      selection: delta.graph.interaction.selection,
      drag: delta.graph.interaction.drag
    }
  },
  ui: {
    tool: delta.ui.tool,
    selection: delta.ui.selection,
    marquee: delta.ui.marquee,
    guides: delta.ui.guides,
    draw: delta.ui.draw,
    edit: delta.ui.edit
  },
  scene: {
    viewport: delta.scene.viewport
  }
})

export const mergeEditorGraphInputDelta = (
  target: InputDelta,
  source: InputDelta
) => {
  target.document.reset = target.document.reset || source.document.reset
  target.document.order = target.document.order || source.document.order
  mergeIdDelta(target.document.nodes, source.document.nodes)
  mergeIdDelta(target.document.edges, source.document.edges)
  mergeIdDelta(target.document.mindmaps, source.document.mindmaps)
  mergeIdDelta(target.document.groups, source.document.groups)

  mergeIdDelta(target.graph.nodes.draft, source.graph.nodes.draft)
  mergeIdDelta(target.graph.nodes.preview, source.graph.nodes.preview)
  mergeIdDelta(target.graph.nodes.edit, source.graph.nodes.edit)
  mergeIdDelta(target.graph.edges.preview, source.graph.edges.preview)
  mergeIdDelta(target.graph.edges.edit, source.graph.edges.edit)
  mergeIdDelta(target.graph.mindmaps.preview, source.graph.mindmaps.preview)
  source.graph.mindmaps.tick.forEach((mindmapId) => {
    ;(target.graph.mindmaps.tick as Set<string>).add(mindmapId)
  })
  target.graph.interaction.selection = (
    target.graph.interaction.selection
    || source.graph.interaction.selection
  )
  target.graph.interaction.drag = (
    target.graph.interaction.drag
    || source.graph.interaction.drag
  )

  target.ui.tool = target.ui.tool || source.ui.tool
  target.ui.selection = target.ui.selection || source.ui.selection
  target.ui.marquee = target.ui.marquee || source.ui.marquee
  target.ui.guides = target.ui.guides || source.ui.guides
  target.ui.draw = target.ui.draw || source.ui.draw
  target.ui.edit = target.ui.edit || source.ui.edit

  target.scene.viewport = target.scene.viewport || source.scene.viewport
}

export const takeEditorGraphInputDelta = (
  pending: InputDelta
): InputDelta => {
  const current = cloneEditorGraphInputDelta(pending)
  const empty = createEmptyEditorGraphInputDelta()
  pending.document = empty.document
  pending.graph = empty.graph
  pending.ui = empty.ui
  pending.scene = empty.scene
  return current
}

export const hasEditorGraphInputDelta = (
  delta: InputDelta
): boolean => (
  delta.document.reset
  || delta.document.order
  || hasIdDelta(delta.document.nodes)
  || hasIdDelta(delta.document.edges)
  || hasIdDelta(delta.document.mindmaps)
  || hasIdDelta(delta.document.groups)
  || hasIdDelta(delta.graph.nodes.draft)
  || hasIdDelta(delta.graph.nodes.preview)
  || hasIdDelta(delta.graph.nodes.edit)
  || hasIdDelta(delta.graph.edges.preview)
  || hasIdDelta(delta.graph.edges.edit)
  || hasIdDelta(delta.graph.mindmaps.preview)
  || delta.graph.mindmaps.tick.size > 0
  || delta.graph.interaction.selection
  || delta.graph.interaction.drag
  || delta.ui.tool
  || delta.ui.selection
  || delta.ui.marquee
  || delta.ui.guides
  || delta.ui.draw
  || delta.ui.edit
  || delta.scene.viewport
)

const readMindmapId = (
  snapshot: DocumentSnapshot,
  value: string
): string | undefined => {
  if (snapshot.state.facts.entities.owners.mindmaps.has(value)) {
    return value
  }

  const owner = snapshot.state.facts.relations.nodeOwner.get(value)
  return owner?.kind === 'mindmap'
    ? owner.id
    : undefined
}

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
    ? readMindmapId(snapshot, preview.rootMove.treeId)
    : undefined
  const subtreeMoveMindmapId = preview.subtreeMove
    ? readMindmapId(snapshot, preview.subtreeMove.treeId)
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
      const mindmapId = readMindmapId(snapshot, entry.treeId)
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

      const mindmapId = readMindmapId(snapshot, subtreeMove.treeId)

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
  change: EngineChange
): InputDelta['document'] => ({
  reset: change.root.doc,
  order: change.root.order,
  nodes: {
    added: new Set(change.entities.nodes.added),
    updated: new Set(change.entities.nodes.updated),
    removed: new Set(change.entities.nodes.removed)
  },
  edges: {
    added: new Set(change.entities.edges.added),
    updated: new Set(change.entities.edges.updated),
    removed: new Set(change.entities.edges.removed)
  },
  mindmaps: {
    added: new Set(change.entities.mindmaps.added),
    updated: new Set(change.entities.mindmaps.updated),
    removed: new Set(change.entities.mindmaps.removed)
  },
  groups: {
    added: new Set(change.entities.groups.added),
    updated: new Set(change.entities.groups.updated),
    removed: new Set(change.entities.groups.removed)
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
  ...preview.node.text.patches.map((entry) => entry.id),
  ...preview.draw.hidden
])

export const readPreviewEdgeIds = (
  preview: EditorInputPreviewState
): ReadonlySet<string> => new Set(
  preview.edge.interaction.map((entry) => entry.id)
)

export const readPreviewMindmapIds = (
  snapshot: DocumentSnapshot,
  preview: EditorInputPreviewState['mindmap']['preview']
): ReadonlySet<string> => {
  const ids = new Set<string>()

  const rootMoveMindmapId = preview?.rootMove
    ? readMindmapId(snapshot, preview.rootMove.treeId)
    : undefined
  if (rootMoveMindmapId) {
    ids.add(rootMoveMindmapId)
  }

  const subtreeMoveMindmapId = preview?.subtreeMove
    ? readMindmapId(snapshot, preview.subtreeMove.treeId)
    : undefined
  if (subtreeMoveMindmapId) {
    ids.add(subtreeMoveMindmapId)
  }

  preview?.enter?.forEach((entry) => {
    const mindmapId = readMindmapId(snapshot, entry.treeId)
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

    const mindmapId = readMindmapId(input.snapshot, entry.treeId)
    if (mindmapId) {
      ids.add(mindmapId)
    }
  })

  return ids
}

export const createEditorGraphInput = ({
  publish,
  session,
  layout,
  delta,
  now = scheduler.readMonotonicNow()
}: {
  publish: EnginePublish
  session: Pick<EditorSession, 'state' | 'interaction' | 'preview' | 'viewport'>
  layout: Pick<EditorLayout, 'draft'>
  delta: InputDelta
  now?: number
}): Input => {
  const snapshot = publish.snapshot
  const preview = store.read(session.preview.state)
  const selection = store.read(session.state.selection)

  return {
    document: {
      snapshot
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
    measure: {
      text: {
        ready: false,
        nodes: new Map(),
        edgeLabels: new Map()
      }
    },
    interaction: {
      selection,
      hover: EMPTY_HOVER_STATE,
      drag: readDragState(snapshot, session)
    },
    viewport: {
      viewport: store.read(session.viewport.read)
    },
    clock: {
      now
    },
    delta
  }
}
