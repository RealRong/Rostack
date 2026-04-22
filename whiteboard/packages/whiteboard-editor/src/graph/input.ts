import { createFlags } from '@shared/projection-runtime'
import { scheduler, store } from '@shared/core'
import type {
  DrawPreview as GraphDrawPreview,
  DragState,
  EdgePreview,
  HoverState,
  ImpactInput,
  Input,
  MindmapPreview,
  NodeDraft,
  NodePreview
} from '@whiteboard/editor-graph'
import type { Snapshot as DocumentSnapshot } from '@whiteboard/engine'
import type { EditorLayout } from '@whiteboard/editor/layout/runtime'
import type { EditorSession } from '@whiteboard/editor/session/runtime'
import type {
  EditorInputPreviewState,
  TextPreviewPatch
} from '@whiteboard/editor/session/preview/types'
import type { DraftMeasure } from '@whiteboard/editor/types/layout'

export type EditorGraphInputReason = keyof ImpactInput

const EMPTY_DRAG_STATE: DragState = {
  kind: 'idle'
}

const EMPTY_HOVER_STATE: HoverState = {
  kind: 'none'
}
const EMPTY_NODE_DRAFTS = new Map<string, NodeDraft>()

const EMPTY_IMPACT = (): ImpactInput => ({
  document: createFlags(false),
  session: createFlags(false),
  measure: createFlags(false),
  interaction: createFlags(false),
  viewport: createFlags(false),
  clock: createFlags(false)
})

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

export const createEditorGraphImpact = (
  reasons: readonly EditorGraphInputReason[]
): ImpactInput => {
  const impact = EMPTY_IMPACT()

  reasons.forEach((reason) => {
    impact[reason] = createFlags(true)
  })

  return impact
}

export const createEditorGraphInput = ({
  snapshot,
  session,
  layout,
  reasons,
  now = scheduler.readMonotonicNow()
}: {
  snapshot: DocumentSnapshot
  session: Pick<EditorSession, 'state' | 'interaction' | 'preview' | 'viewport'>
  layout: Pick<EditorLayout, 'draft'>
  reasons: readonly EditorGraphInputReason[]
  now?: number
}): Input => {
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
    impact: createEditorGraphImpact(reasons)
  }
}
