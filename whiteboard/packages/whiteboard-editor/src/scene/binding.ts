import {
  equal,
  store
} from '@shared/core'
import { mindmap as mindmapApi } from '@whiteboard/core/mindmap'
import type {
  EdgeId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
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
import type {
  Engine,
  EngineCurrent
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

const EMPTY_IDS: readonly string[] = Object.freeze([])

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
  engine: EngineCurrent,
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
  engine: EngineCurrent,
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

const unionIds = <TId extends string>(
  ...values: readonly Iterable<TId>[]
): readonly TId[] => [...new Set(
  values.flatMap((value) => [...value])
)]

const readEditedEdgeIds = (
  edit: EditorSceneSourceSnapshot['session']['edit']
): readonly EdgeId[] => edit?.kind === 'edge-label'
  ? [edit.edgeId]
  : EMPTY_IDS as readonly EdgeId[]

const readPreviewNodeIds = (
  preview: EditorSceneSourceSnapshot['session']['preview']
): readonly NodeId[] => [...preview.nodes.keys()]

const readPreviewEdgeIds = (
  preview: EditorSceneSourceSnapshot['session']['preview']
): readonly EdgeId[] => [...preview.edges.keys()]

const readPreviewMindmapIds = (
  preview: EditorSceneSourceSnapshot['session']['preview']['mindmap']
): readonly MindmapId[] => {
  const ids = new Set<MindmapId>()

  if (preview?.rootMove) {
    ids.add(preview.rootMove.mindmapId)
  }
  if (preview?.subtreeMove) {
    ids.add(preview.subtreeMove.mindmapId)
  }

  return [...ids]
}

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

  return false
}

const isDragStateEqual = (
  left: DragState,
  right: DragState
): boolean => {
  if (left.kind !== right.kind) {
    return false
  }

  switch (left.kind) {
    case 'idle':
    case 'draw':
      return true
    case 'selection-move':
      return right.kind === 'selection-move'
        && equal.sameOrder(left.nodeIds, right.nodeIds)
        && equal.sameOrder(left.edgeIds, right.edgeIds)
    case 'selection-marquee':
      return right.kind === 'selection-marquee'
        && left.match === right.match
        && equal.sameRect(left.worldRect, right.worldRect)
    case 'selection-transform':
      return right.kind === 'selection-transform'
        && equal.sameOrder(left.nodeIds, right.nodeIds)
    case 'edge-label':
      return right.kind === 'edge-label'
        && left.edgeId === right.edgeId
        && left.labelId === right.labelId
    case 'edge-route':
      return right.kind === 'edge-route'
        && left.edgeId === right.edgeId
    case 'mindmap-drag':
      return right.kind === 'mindmap-drag'
        && left.mindmapId === right.mindmapId
        && left.nodeId === right.nodeId
  }

  return false
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

const readInteractionChange = (input: {
  previous: EditorSceneSourceSnapshot
  next: EditorSceneSourceSnapshot
  forced?: EditorSceneSourceChange['interaction']
}): EditorSceneSourceChange['interaction'] | undefined => {
  const change: NonNullable<EditorSceneSourceChange['interaction']> = {
    ...(input.forced ?? {})
  }

  if (!isHoverStateEqual(input.previous.interaction.hover, input.next.interaction.hover)) {
    change.hover = true
  }
  if (!isDragStateEqual(input.previous.interaction.drag, input.next.interaction.drag)) {
    change.drag = true
  }
  if (input.previous.interaction.chrome !== input.next.interaction.chrome) {
    change.chrome = true
  }
  if (input.previous.interaction.editingEdge !== input.next.interaction.editingEdge) {
    change.editingEdge = true
  }

  return Object.keys(change).length > 0
    ? change
    : undefined
}

const createPreviewChange = (input: {
  previous: EditorSceneSourceSnapshot['session']['preview']
  next: EditorSceneSourceSnapshot['session']['preview']
  marquee: boolean
  guides: boolean
  draw: boolean
  edgeGuide: boolean
  hover: boolean
}): NonNullable<NonNullable<EditorSceneSourceChange['session']>['preview']> => ({
  touchedNodeIds: unionIds(
    readPreviewNodeIds(input.previous),
    readPreviewNodeIds(input.next)
  ),
  touchedEdgeIds: unionIds(
    readPreviewEdgeIds(input.previous),
    readPreviewEdgeIds(input.next)
  ),
  touchedMindmapIds: unionIds(
    readPreviewMindmapIds(input.previous.mindmap),
    readPreviewMindmapIds(input.next.mindmap)
  ),
  marquee: input.marquee,
  guides: input.guides,
  draw: input.draw,
  edgeGuide: input.edgeGuide,
  hover: input.hover
})

const hasSourceChange = (
  change: EditorSceneSourceChange
): boolean => (
  change.document !== undefined
  || change.session !== undefined
  || change.interaction !== undefined
  || change.view !== undefined
)

const withInteractionChange = (input: {
  previous: EditorSceneSourceSnapshot
  next: EditorSceneSourceSnapshot
  forced?: EditorSceneSourceChange['interaction']
}): Pick<EditorSceneSourceChange, 'interaction'> | Record<string, never> => {
  const interaction = readInteractionChange(input)

  return interaction
    ? {
        interaction
      }
    : {}
}

export interface EditorSceneBinding extends EditorSceneSource {
  dispose(): void
}

export const createEditorSceneBinding = ({
  engine,
  session
}: {
  engine: Pick<Engine, 'doc' | 'rev' | 'commits'>
  session: Pick<EditorSession, 'state' | 'interaction' | 'preview' | 'viewport'>
}): EditorSceneBinding => {
  const listeners = new Set<(change: EditorSceneSourceChange) => void>()
  let disposed = false
  const buildSnapshot = (): EditorSceneSourceSnapshot => {
    const preview = store.read(session.preview.state)
    const viewport = session.viewport.read.get()
    const current = {
      rev: engine.rev(),
      doc: engine.doc()
    }

    return {
      document: {
        rev: current.rev,
        doc: current.doc
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
          mindmap: readMindmapPreview(current, preview.mindmap.preview)
        },
        tool: store.read(session.state.tool)
      },
      interaction: {
        hover: readInteractionHover(
          store.read(session.interaction.read.hover)
        ),
        drag: readDragState(current, session),
        chrome: store.read(session.interaction.read.chrome),
        editingEdge: readInteractionEditingEdge(
          store.read(session.interaction.read.mode)
        )
      },
      view: {
        zoom: viewport.zoom,
        center: viewport.center,
        worldRect: session.viewport.read.worldRect()
      }
    }
  }
  let currentSource = buildSnapshot()

  const notify = (change: EditorSceneSourceChange) => {
    if (disposed) {
      return
    }

    listeners.forEach((listener) => {
      listener(change)
    })
  }

  const publish = (
    compile: (input: {
      previous: EditorSceneSourceSnapshot
      next: EditorSceneSourceSnapshot
    }) => EditorSceneSourceChange
  ) => {
    const previous = currentSource
    const next = buildSnapshot()
    currentSource = next

    const change = compile({
      previous,
      next
    })
    if (!hasSourceChange(change)) {
      return
    }

    notify(change)
  }

  const unsubscribes = [
    engine.commits.subscribe((commit) => {
      publish(({ previous, next }) => {
        const preview = !isMindmapPreviewEqual(
          previous.session.preview.mindmap,
          next.session.preview.mindmap
        )
          ? createPreviewChange({
              previous: previous.session.preview,
              next: next.session.preview,
              marquee: false,
              guides: false,
              draw: false,
              edgeGuide: false,
              hover: false
            })
          : undefined

        return {
          document: {
            rev: commit.rev,
            delta: commit.delta,
            reset: commit.kind === 'replace' || commit.delta.reset === true
          },
          ...(preview
            ? {
                session: {
                  preview
                }
              }
            : {}),
          ...withInteractionChange({
            previous,
            next
          })
        }
      })
    }),
    session.state.tool.subscribe(() => {
      publish(({ previous, next }) => ({
        session: {
          tool: true
        },
        ...withInteractionChange({
          previous,
          next
        })
      }))
    }),
    session.state.selection.subscribe(() => {
      publish(({ previous, next }) => ({
        session: {
          selection: true
        },
        ...withInteractionChange({
          previous,
          next
        })
      }))
    }),
    session.state.edit.subscribe(() => {
      publish(({ previous, next }) => ({
        session: {
          edit: {
            touchedDraftEdgeIds: unionIds(
              readEditedEdgeIds(previous.session.edit),
              readEditedEdgeIds(next.session.edit)
            )
          }
        },
        ...withInteractionChange({
          previous,
          next
        })
      }))
    }),
    session.preview.state.subscribe(() => {
      publish(({ previous, next }) => ({
        session: {
          preview: createPreviewChange({
            previous: previous.session.preview,
            next: next.session.preview,
            marquee: true,
            guides: true,
            draw: true,
            edgeGuide: true,
            hover: true
          })
        },
        ...withInteractionChange({
          previous,
          next
        })
      }))
    }),
    session.interaction.read.hover.subscribe(() => {
      publish(({ previous, next }) => ({
        interaction: readInteractionChange({
          previous,
          next,
          forced: {
            hover: true
          }
        })
      }))
    }),
    session.interaction.read.mode.subscribe(() => {
      publish(({ previous, next }) => ({
        interaction: readInteractionChange({
          previous,
          next,
          forced: {
            drag: true,
            editingEdge: true
          }
        })
      }))
    }),
    session.interaction.read.chrome.subscribe(() => {
      publish(({ previous, next }) => ({
        interaction: readInteractionChange({
          previous,
          next,
          forced: {
            chrome: true
          }
        })
      }))
    }),
    session.viewport.read.subscribe(() => {
      publish(() => ({
        view: true
      }))
    })
  ]

  return {
    get: () => currentSource,
    subscribe: (listener) => {
      if (disposed) {
        return () => {}
      }

      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
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
