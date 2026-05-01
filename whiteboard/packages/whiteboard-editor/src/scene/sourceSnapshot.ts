import { store } from '@shared/core'
import { mindmap as mindmapApi } from '@whiteboard/core/mindmap'
import type {
  HoverState,
  DragState,
  DrawPreview as GraphDrawPreview,
  EdgePreview,
  EditorSceneSourceSnapshot,
  MindmapPreview,
  NodePreview
} from '@whiteboard/editor-scene'
import type {
  Engine
} from '@whiteboard/engine'
import type {
  HoverState as EditorHoverState
} from '@whiteboard/editor/input/hover/store'
import { isEdgeInteractionMode } from '@whiteboard/editor/input/interaction/mode'
import type {
  NodePresentationEntry,
  EditorInputPreviewState
} from '@whiteboard/editor/session/preview/types'
import type { EditorSession } from '@whiteboard/editor/session/runtime'

const EMPTY_DRAG_STATE: DragState = {
  kind: 'idle'
}

const EMPTY_HOVER_STATE: HoverState = {
  kind: 'none'
}

type EngineDocumentSnapshot = Pick<
  EditorSceneSourceSnapshot['document'],
  'doc'
>

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
  entry: NodePresentationEntry
): NodePreview => ({
  patch: current?.patch,
  presentation: entry.presentation,
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
        entry.patch
      )
    )
  })

  preview.node.presentation.forEach((entry) => {
    byId.set(
      entry.id,
      mergeNodePresentation(
        byId.get(entry.id),
        entry
      )
    )
  })

  preview.draw.hidden.forEach((nodeId) => {
    const current = byId.get(nodeId)
    byId.set(nodeId, {
      patch: current?.patch,
      presentation: current?.presentation,
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

  preview.selection.edge.forEach((entry) => {
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
  engine: EngineDocumentSnapshot,
  preview: EditorInputPreviewState['mindmap']['preview']
): MindmapPreview | null => {
  if (!preview) {
    return null
  }

  const rootMoveMindmapId = preview.rootMove
    ? mindmapApi.tree.resolveId(engine.doc, preview.rootMove.treeId)
    : undefined
  const subtreeMoveMindmapId = preview.subtreeMove
    ? mindmapApi.tree.resolveId(engine.doc, preview.subtreeMove.treeId)
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

const readDragState = (
  engine: EngineDocumentSnapshot,
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
      const subtreeMove = preview.mindmap.preview?.subtreeMove
      if (!subtreeMove) {
        return EMPTY_DRAG_STATE
      }

      const mindmapId = mindmapApi.tree.resolveId(
        engine.doc,
        subtreeMove.treeId
      )

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

export const isMindmapDropLineEqual = (
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
      && left.rootMove.delta?.x === right.rootMove.delta?.x
      && left.rootMove.delta?.y === right.rootMove.delta?.y
    )
  )
  && (
    left.subtreeMove === right.subtreeMove
    || (
      left.subtreeMove !== undefined
      && right.subtreeMove !== undefined
      && left.subtreeMove.mindmapId === right.subtreeMove.mindmapId
      && left.subtreeMove.nodeId === right.subtreeMove.nodeId
      && left.subtreeMove.ghost?.x === right.subtreeMove.ghost?.x
      && left.subtreeMove.ghost?.y === right.subtreeMove.ghost?.y
      && left.subtreeMove.ghost?.width === right.subtreeMove.ghost?.width
      && left.subtreeMove.ghost?.height === right.subtreeMove.ghost?.height
      && isMindmapDropTargetEqual(left.subtreeMove.drop, right.subtreeMove.drop)
    )
  )
)

export const buildEditorSceneSourceSnapshot = (input: {
  engine: Pick<Engine, 'doc' | 'rev'>
  session: Pick<EditorSession, 'state' | 'interaction' | 'preview' | 'viewport'>
}): EditorSceneSourceSnapshot => {
  const preview = store.read(input.session.preview.state)
  const viewport = input.session.viewport.read.get()
  const current = {
    rev: input.engine.rev(),
    doc: input.engine.doc()
  }

  return {
    document: {
      rev: current.rev,
      doc: current.doc
    },
    session: {
      selection: store.read(input.session.state.selection),
      edit: store.read(input.session.state.edit),
      draft: {
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
                    focusedNodeId: preview.edge.guide.connect.focusedNodeId,
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
        mindmap: readMindmapPreview(current, preview.mindmap.preview)
      },
      tool: store.read(input.session.state.tool)
    },
    interaction: {
      hover: readInteractionHover(
        store.read(input.session.interaction.read.hover)
      ),
      drag: readDragState(current, input.session),
      chrome: store.read(input.session.interaction.read.chrome),
      editingEdge: readInteractionEditingEdge(
        store.read(input.session.interaction.read.mode)
      )
    },
    view: {
      zoom: viewport.zoom,
      center: viewport.center,
      worldRect: input.session.viewport.read.worldRect()
    }
  }
}
