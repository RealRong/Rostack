import { scheduler, store } from '@shared/core'
import { mindmap as mindmapApi } from '@whiteboard/core/mindmap'
import type {
  DragState,
  DrawPreview as GraphDrawPreview,
  EdgePreview,
  EditorSceneSource,
  EditorSceneSourceChange,
  EditorSceneSourceSnapshot,
  HoverState,
  MindmapPreview,
  NodePreview
} from '@whiteboard/editor-scene'
import type { Engine } from '@whiteboard/engine'
import type {
  HoverState as EditorHoverState
} from '@whiteboard/editor/input/hover/store'
import { isEdgeInteractionMode } from '@whiteboard/editor/input/interaction/mode'
import type {
  EditSession as EditorEditSession
} from '@whiteboard/editor/session/edit'
import type {
  EditorInputPreviewState,
  TextPreviewPatch
} from '@whiteboard/editor/session/preview/types'
import type { EditorSession } from '@whiteboard/editor/session/runtime'

const EMPTY_DRAG_STATE: DragState = {
  kind: 'idle'
}

const EMPTY_HOVER_STATE: HoverState = {
  kind: 'none'
}

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
  engine: ReturnType<Engine['current']>,
  preview: EditorInputPreviewState['mindmap']['preview']
): MindmapPreview | null => {
  if (!preview) {
    return null
  }

  const rootMoveMindmapId = preview.rootMove
    ? mindmapApi.tree.resolveId(engine.snapshot.document, preview.rootMove.treeId)
    : undefined
  const subtreeMoveMindmapId = preview.subtreeMove
    ? mindmapApi.tree.resolveId(engine.snapshot.document, preview.subtreeMove.treeId)
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
      const mindmapId = mindmapApi.tree.resolveId(engine.snapshot.document, entry.treeId)
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

const readDragState = (
  engine: ReturnType<Engine['current']>,
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
        engine.snapshot.document,
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

export interface EditorSceneSourceBinding extends EditorSceneSource {
  emit(change: EditorSceneSourceChange): void
  dispose(): void
}

export const readActiveMindmapTickIds = (input: {
  engine: Pick<Engine, 'current'>
  preview: EditorInputPreviewState['mindmap']['preview']
  now?: number
}): ReadonlySet<string> => {
  const ids = new Set<string>()
  const now = input.now ?? scheduler.readMonotonicNow()
  const snapshot = input.engine.current().snapshot

  input.preview?.enter?.forEach((entry) => {
    if (entry.startedAt + entry.durationMs <= now) {
      return
    }

    const mindmapId = mindmapApi.tree.resolveId(snapshot.document, entry.treeId)
    if (mindmapId) {
      ids.add(mindmapId)
    }
  })

  return ids
}

export const createEditorSceneSource = ({
  engine,
  session
}: {
  engine: Pick<Engine, 'current' | 'subscribe'>
  session: Pick<EditorSession, 'state' | 'interaction' | 'preview' | 'viewport'>
}): EditorSceneSourceBinding => {
  const listeners = new Set<(change: EditorSceneSourceChange) => void>()
  let disposed = false

  const notify = (change: EditorSceneSourceChange) => {
    if (disposed) {
      return
    }

    listeners.forEach((listener) => {
      listener(change)
    })
  }

  const get = (): EditorSceneSourceSnapshot => {
    const publish = engine.current()
    const preview = store.read(session.preview.state)
    const viewport = session.viewport.read.get()

    return {
      document: {
        publish
      },
      session: {
        selection: store.read(session.state.selection),
        edit: store.read(session.state.edit),
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
          mindmap: readMindmapPreview(publish, preview.mindmap.preview)
        },
        tool: store.read(session.state.tool)
      },
      interaction: {
        hover: readInteractionHover(
          store.read(session.interaction.read.hover)
        ),
        drag: readDragState(publish, session),
        chrome: store.read(session.interaction.read.chrome),
        editingEdge: readInteractionEditingEdge(
          store.read(session.interaction.read.mode)
        )
      },
      view: {
        zoom: viewport.zoom,
        center: viewport.center,
        worldRect: session.viewport.read.worldRect()
      },
      clock: {
        now: scheduler.readMonotonicNow()
      }
    }
  }

  const unsubscribes = [
    engine.subscribe(() => {
      notify({
        document: true,
        interaction: {
          drag: true
        }
      })
    }),
    session.state.tool.subscribe(() => {
      notify({
        session: {
          tool: true
        }
      })
    }),
    session.state.selection.subscribe(() => {
      notify({
        session: {
          selection: true
        },
        interaction: {
          drag: true
        }
      })
    }),
    session.state.edit.subscribe(() => {
      notify({
        session: {
          edit: true
        },
        interaction: {
          drag: true
        }
      })
    }),
    session.preview.state.subscribe(() => {
      notify({
        session: {
          preview: true
        },
        interaction: {
          drag: true
        }
      })
    }),
    session.interaction.read.hover.subscribe(() => {
      notify({
        interaction: {
          hover: true
        }
      })
    }),
    session.interaction.read.mode.subscribe(() => {
      notify({
        interaction: {
          drag: true,
          editingEdge: true
        }
      })
    }),
    session.interaction.read.chrome.subscribe(() => {
      notify({
        interaction: {
          chrome: true
        }
      })
    }),
    session.viewport.read.subscribe(() => {
      notify({
        view: true
      })
    })
  ]

  return {
    get,
    subscribe: (listener) => {
      if (disposed) {
        return () => {}
      }

      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    emit: (change) => {
      notify(change)
    },
    dispose: () => {
      if (disposed) {
        return
      }

      disposed = true
      listeners.clear()
      unsubscribes.forEach((unsubscribe) => {
        unsubscribe()
      })
    }
  }
}
