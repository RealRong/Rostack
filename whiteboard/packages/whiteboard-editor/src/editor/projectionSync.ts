import { mindmap as mindmapApi } from '@whiteboard/core/mindmap'
import type { MutationDelta } from '@shared/mutation'
import type {
  EdgeId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import type {
  EditorSceneDelta,
  EditorScenePreviewDelta,
  EditorSceneSnapshot,
  HoverState,
  MindmapPreview,
  NodePreview,
  EdgePreview
} from '@whiteboard/editor-scene'
import type { Engine } from '@whiteboard/engine'
import type { HoverState as EditorHoverState } from '@whiteboard/editor/input/hover/store'
import type {
  NodePresentationEntry,
  EditorInputPreviewState
} from '@whiteboard/editor/session/preview/types'
import {
  createEditorStateMutationDelta,
  type EditorStateMutationDelta
} from '@whiteboard/editor/state-engine/delta'
import type { EditorStateRuntime } from '@whiteboard/editor/state-engine/runtime'

const EMPTY_HOVER_STATE: HoverState = {
  kind: 'none'
}

const EMPTY_IDS: readonly string[] = Object.freeze([])

type CommitFlags = {
  tool: boolean
  draw: boolean
  selection: boolean
  edit: boolean
  interaction: boolean
  preview: boolean
  viewport: boolean
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
    byId.set(entry.id, mergeNodePreviewPatch(byId.get(entry.id), entry.patch))
  })
  preview.node.text.patches.forEach((entry) => {
    byId.set(entry.id, mergeNodePreviewPatch(byId.get(entry.id), entry.patch))
  })
  preview.node.presentation.forEach((entry) => {
    byId.set(entry.id, mergeNodePresentation(byId.get(entry.id), entry))
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
) => {
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

const readMindmapPreview = (input: {
  document: Pick<Engine, 'doc'>
  preview: EditorInputPreviewState['mindmap']['preview']
}): MindmapPreview | null => {
  if (!input.preview) {
    return null
  }

  const rootMoveMindmapId = input.preview.rootMove
    ? mindmapApi.tree.resolveId(input.document.doc(), input.preview.rootMove.treeId)
    : undefined
  const subtreeMoveMindmapId = input.preview.subtreeMove
    ? mindmapApi.tree.resolveId(input.document.doc(), input.preview.subtreeMove.treeId)
    : undefined

  return {
    rootMove: rootMoveMindmapId && input.preview.rootMove
      ? {
          mindmapId: rootMoveMindmapId,
          delta: input.preview.rootMove.delta
        }
      : undefined,
    subtreeMove: subtreeMoveMindmapId && input.preview.subtreeMove
      ? {
          mindmapId: subtreeMoveMindmapId,
          nodeId: input.preview.subtreeMove.nodeId,
          ghost: input.preview.subtreeMove.ghost,
          drop: input.preview.subtreeMove.drop
        }
      : undefined
  }
}

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

const isHoverEqual = (
  left: HoverState,
  right: HoverState
): boolean => {
  if (left.kind !== right.kind) {
    return false
  }

  switch (left.kind) {
    case 'node':
      return right.kind === 'node' && left.nodeId === right.nodeId
    case 'edge':
      return right.kind === 'edge' && left.edgeId === right.edgeId
    case 'mindmap':
      return right.kind === 'mindmap' && left.mindmapId === right.mindmapId
    case 'group':
      return right.kind === 'group' && left.groupId === right.groupId
    case 'selection-box':
      return right.kind === 'selection-box'
    default:
      return true
  }
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

export const buildEditorSceneSnapshot = (input: {
  engine: Pick<Engine, 'doc' | 'rev'>
  runtime: EditorStateRuntime
  preview: EditorInputPreviewState
}): EditorSceneSnapshot => {
  const interaction = input.runtime.stores.interaction.store.get()
  const viewport = input.runtime.viewport.read.get()

  return {
    tool: input.runtime.stores.tool.store.get(),
    draw: input.runtime.stores.draw.store.get(),
    selection: input.runtime.stores.selection.store.get(),
    edit: input.runtime.stores.edit.store.get(),
    interaction: {
      mode: interaction.mode,
      chrome: interaction.chrome,
      space: interaction.space,
      hover: readInteractionHover(interaction.hover)
    },
    preview: {
      nodes: new Map(readNodePreviews(input.preview)),
      edges: new Map(readEdgePreviews(input.preview)),
      edgeGuide: input.preview.edge.guide
        ? {
            path: input.preview.edge.guide.path,
            connect: input.preview.edge.guide.connect
              ? {
                  focusedNodeId: input.preview.edge.guide.connect.focusedNodeId,
                  resolution: input.preview.edge.guide.connect.resolution
                }
              : undefined
          }
        : undefined,
      draw: readDrawPreview(input.preview),
      selection: {
        marquee: input.preview.selection.marquee
          ? {
              worldRect: input.preview.selection.marquee.worldRect,
              match: input.preview.selection.marquee.match
            }
          : undefined,
        guides: input.preview.selection.guides
      },
      mindmap: readMindmapPreview({
        document: input.engine,
        preview: input.preview.mindmap.preview
      })
    },
    viewport,
    view: {
      zoom: viewport.zoom,
      center: viewport.center,
      worldRect: input.runtime.viewport.read.worldRect()
    }
  }
}

const unionIds = <TId extends string>(
  ...values: readonly Iterable<TId>[]
): readonly TId[] => [...new Set(
  values.flatMap((value) => [...value])
)]

const readEditedEdgeIds = (
  edit: EditorSceneSnapshot['edit']
): readonly EdgeId[] => edit?.kind === 'edge-label'
  ? [edit.edgeId]
  : EMPTY_IDS as readonly EdgeId[]

const readPreviewNodeIds = (
  preview: EditorSceneSnapshot['preview']
): readonly NodeId[] => [...preview.nodes.keys()]

const readPreviewEdgeIds = (
  preview: EditorSceneSnapshot['preview']
): readonly EdgeId[] => [...preview.edges.keys()]

const readPreviewMindmapIds = (
  preview: EditorSceneSnapshot['preview']['mindmap']
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

const createPreviewDelta = (input: {
  previous: EditorSceneSnapshot['preview']
  next: EditorSceneSnapshot['preview']
  marquee: boolean
  guides: boolean
  draw: boolean
  edgeGuide: boolean
  hover: boolean
}): EditorScenePreviewDelta => ({
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

const createHoverDelta = (input: {
  previous: HoverState
  next: HoverState
}) => {
  const touchedNodeIds = new Set<NodeId>()
  const touchedEdgeIds = new Set<EdgeId>()
  const touchedMindmapIds = new Set<MindmapId>()

  const append = (
    hover: HoverState
  ) => {
    switch (hover.kind) {
      case 'node':
        touchedNodeIds.add(hover.nodeId)
        return
      case 'edge':
        touchedEdgeIds.add(hover.edgeId)
        return
      case 'mindmap':
        touchedMindmapIds.add(hover.mindmapId)
        return
      default:
        return
    }
  }

  append(input.previous)
  append(input.next)

  return {
    touchedNodeIds: [...touchedNodeIds],
    touchedEdgeIds: [...touchedEdgeIds],
    touchedMindmapIds: [...touchedMindmapIds]
  }
}

export const createBootstrapEditorSceneDelta = (
  snapshot: EditorSceneSnapshot
): EditorSceneDelta => ({
  tool: true,
  draw: true,
  selection: true,
  edit: {
    touchedDraftEdgeIds: [...readEditedEdgeIds(snapshot.edit)]
  },
  interaction: {
    mode: true,
    chrome: true,
    space: true,
    hover: true
  },
  preview: createPreviewDelta({
    previous: snapshot.preview,
    next: snapshot.preview,
    marquee: true,
    guides: true,
    draw: true,
    edgeGuide: true,
    hover: true
  }),
  viewport: true
})

const toCommitFlags = (
  delta: EditorStateMutationDelta
): CommitFlags => ({
  tool: delta.tool.changed(),
  draw: delta.draw.changed(),
  selection: delta.selection.changed(),
  edit: delta.edit.changed(),
  interaction: delta.interaction.changed(),
  preview: delta.preview.changed(),
  viewport: delta.viewport.changed()
})

export const collectEditorSceneCommitFlags = (
  commits: readonly MutationDelta[]
): CommitFlags => commits.reduce<CommitFlags>((result, commit) => {
  const current = toCommitFlags(createEditorStateMutationDelta(commit))
  return {
    tool: result.tool || current.tool,
    draw: result.draw || current.draw,
    selection: result.selection || current.selection,
    edit: result.edit || current.edit,
    interaction: result.interaction || current.interaction,
    preview: result.preview || current.preview,
    viewport: result.viewport || current.viewport
  }
}, {
  tool: false,
  draw: false,
  selection: false,
  edit: false,
  interaction: false,
  preview: false,
  viewport: false
})

export const createEditorSceneDeltaFromCommitFlags = (input: {
  flags: CommitFlags
  previous: EditorSceneSnapshot
  next: EditorSceneSnapshot
}): EditorSceneDelta => {
  const delta: EditorSceneDelta = {}

  if (input.flags.tool) {
    delta.tool = true
  }
  if (input.flags.draw) {
    delta.draw = true
  }
  if (input.flags.selection) {
    delta.selection = true
  }
  if (input.flags.edit) {
    delta.edit = {
      touchedDraftEdgeIds: unionIds(
        readEditedEdgeIds(input.previous.edit),
        readEditedEdgeIds(input.next.edit)
      )
    }
  }
  if (input.flags.interaction) {
    const hoverChanged = !isHoverEqual(
      input.previous.interaction.hover,
      input.next.interaction.hover
    )

    delta.interaction = {
      mode: true,
      chrome: true,
      space: true,
      ...(hoverChanged
        ? {
            hover: createHoverDelta({
              previous: input.previous.interaction.hover,
              next: input.next.interaction.hover
            })
          }
        : {})
    }
  }
  if (input.flags.preview) {
    delta.preview = createPreviewDelta({
      previous: input.previous.preview,
      next: input.next.preview,
      marquee: true,
      guides: true,
      draw: true,
      edgeGuide: true,
      hover: true
    })
  }
  if (input.flags.viewport) {
    delta.viewport = true
  }

  return delta
}

export const createDocumentEditorSceneDelta = (input: {
  previous: EditorSceneSnapshot
  next: EditorSceneSnapshot
}): EditorSceneDelta => {
  if (isMindmapPreviewEqual(input.previous.preview.mindmap, input.next.preview.mindmap)) {
    return {}
  }

  return {
    preview: createPreviewDelta({
      previous: input.previous.preview,
      next: input.next.preview,
      marquee: false,
      guides: false,
      draw: false,
      edgeGuide: false,
      hover: false
    })
  }
}

export const mergeEditorSceneDelta = (
  left: EditorSceneDelta,
  right: EditorSceneDelta
): EditorSceneDelta => ({
  ...(left.tool || right.tool
    ? {
        tool: true
      }
    : {}),
  ...(left.draw || right.draw
    ? {
        draw: true
      }
    : {}),
  ...(left.selection || right.selection
    ? {
        selection: true
      }
    : {}),
  ...(left.edit || right.edit
    ? {
        edit: {
          touchedDraftEdgeIds: unionIds(
            left.edit && left.edit !== true
              ? left.edit.touchedDraftEdgeIds
              : [],
            right.edit && right.edit !== true
              ? right.edit.touchedDraftEdgeIds
              : []
          )
        }
      }
    : {}),
  ...(left.interaction || right.interaction
    ? {
        interaction: {
          ...(left.interaction?.mode || right.interaction?.mode
            ? {
                mode: true
              }
            : {}),
          ...(left.interaction?.chrome || right.interaction?.chrome
            ? {
                chrome: true
              }
            : {}),
          ...(left.interaction?.space || right.interaction?.space
            ? {
                space: true
              }
            : {}),
          ...((left.interaction?.hover && left.interaction.hover !== true)
            || (right.interaction?.hover && right.interaction.hover !== true)
            ? {
                hover: {
                  touchedNodeIds: unionIds(
                    left.interaction?.hover && left.interaction.hover !== true
                      ? left.interaction.hover.touchedNodeIds
                      : [],
                    right.interaction?.hover && right.interaction.hover !== true
                      ? right.interaction.hover.touchedNodeIds
                      : []
                  ),
                  touchedEdgeIds: unionIds(
                    left.interaction?.hover && left.interaction.hover !== true
                      ? left.interaction.hover.touchedEdgeIds
                      : [],
                    right.interaction?.hover && right.interaction.hover !== true
                      ? right.interaction.hover.touchedEdgeIds
                      : []
                  ),
                  touchedMindmapIds: unionIds(
                    left.interaction?.hover && left.interaction.hover !== true
                      ? left.interaction.hover.touchedMindmapIds
                      : [],
                    right.interaction?.hover && right.interaction.hover !== true
                      ? right.interaction.hover.touchedMindmapIds
                      : []
                  )
                }
              }
            : {})
        }
      }
    : {}),
  ...(left.preview || right.preview
    ? {
        preview: {
          touchedNodeIds: unionIds(
            left.preview && left.preview !== true
              ? left.preview.touchedNodeIds
              : [],
            right.preview && right.preview !== true
              ? right.preview.touchedNodeIds
              : []
          ),
          touchedEdgeIds: unionIds(
            left.preview && left.preview !== true
              ? left.preview.touchedEdgeIds
              : [],
            right.preview && right.preview !== true
              ? right.preview.touchedEdgeIds
              : []
          ),
          touchedMindmapIds: unionIds(
            left.preview && left.preview !== true
              ? left.preview.touchedMindmapIds
              : [],
            right.preview && right.preview !== true
              ? right.preview.touchedMindmapIds
              : []
          ),
          marquee: left.preview !== undefined || right.preview !== undefined,
          guides: left.preview !== undefined || right.preview !== undefined,
          draw: left.preview !== undefined || right.preview !== undefined,
          edgeGuide: left.preview !== undefined || right.preview !== undefined,
          hover: left.preview !== undefined || right.preview !== undefined
        }
      }
    : {}),
  ...(left.viewport || right.viewport
    ? {
        viewport: true
      }
    : {})
})

export const hasEditorSceneDelta = (
  delta: EditorSceneDelta
): boolean => (
  delta.tool === true
  || delta.draw === true
  || delta.selection === true
  || delta.edit !== undefined
  || delta.interaction !== undefined
  || delta.preview !== undefined
  || delta.viewport === true
)
