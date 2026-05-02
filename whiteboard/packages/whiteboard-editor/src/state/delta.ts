import type {
  MutationDeltaOf
} from '@shared/mutation'
import type {
  EdgeId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import type {
  HoverState,
  MindmapPreview
} from '@whiteboard/editor-scene'
import type {
  EditorStateDocument
} from './document'
import {
  editorStateMutationModel
} from './model'

export interface EditorTouchedIds {
  touchedNodeIds: readonly NodeId[]
  touchedEdgeIds: readonly EdgeId[]
  touchedMindmapIds: readonly MindmapId[]
}

export interface EditorEditDelta {
  touchedDraftEdgeIds: readonly EdgeId[]
}

export interface EditorPreviewDelta extends EditorTouchedIds {
  marquee: boolean
  guides: boolean
  draw: boolean
  edgeGuide: boolean
  hover: boolean
}

export interface EditorDelta {
  tool?: true
  draw?: true
  selection?: true
  edit?: true | EditorEditDelta
  interaction?: {
    mode?: true
    chrome?: true
    space?: true
  }
  hover?: true | EditorTouchedIds
  preview?: true | EditorPreviewDelta
  viewport?: true
  reset?: true
}

export type EditorStateMutationDelta = MutationDeltaOf<
  typeof editorStateMutationModel
>

const EMPTY_IDS: readonly string[] = Object.freeze([])

type CommitFlags = {
  tool: boolean
  draw: boolean
  selection: boolean
  edit: boolean
  interaction: boolean
  hover: boolean
  preview: boolean
  viewport: boolean
}

const unionIds = <TId extends string>(
  ...values: readonly Iterable<TId>[]
): readonly TId[] => [...new Set(
  values.flatMap((value) => [...value])
)]

const readEditedEdgeIds = (
  edit: EditorStateDocument['state']['edit']
): readonly EdgeId[] => edit?.kind === 'edge-label'
  ? [edit.edgeId]
  : EMPTY_IDS as readonly EdgeId[]

const readPreviewNodeIds = (
  snapshot: EditorStateDocument
): readonly NodeId[] => Object.keys(snapshot.overlay.preview.nodes) as readonly NodeId[]

const readPreviewEdgeIds = (
  snapshot: EditorStateDocument
): readonly EdgeId[] => Object.keys(snapshot.overlay.preview.edges) as readonly EdgeId[]

const readPreviewMindmapIds = (
  preview: MindmapPreview | null
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
  previous: EditorStateDocument
  next: EditorStateDocument
  marquee: boolean
  guides: boolean
  draw: boolean
  edgeGuide: boolean
  hover: boolean
}): EditorPreviewDelta => {
  const previous = input.previous.overlay.preview
  const next = input.next.overlay.preview

  return {
    touchedNodeIds: unionIds(
      readPreviewNodeIds(input.previous),
      readPreviewNodeIds(input.next)
    ),
    touchedEdgeIds: unionIds(
      readPreviewEdgeIds(input.previous),
      readPreviewEdgeIds(input.next)
    ),
    touchedMindmapIds: unionIds(
      readPreviewMindmapIds(previous.mindmap),
      readPreviewMindmapIds(next.mindmap)
    ),
    marquee: input.marquee,
    guides: input.guides,
    draw: input.draw,
    edgeGuide: input.edgeGuide,
    hover: input.hover
  }
}

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

const isMindmapPreviewEqual = (
  left: MindmapPreview | null,
  right: MindmapPreview | null
): boolean => JSON.stringify(left) === JSON.stringify(right)

const toCommitFlags = (
  delta: EditorStateMutationDelta
): CommitFlags => ({
  tool: delta.state.tool.changed(),
  draw: delta.state.draw.changed(),
  selection: delta.state.selection.changed(),
  edit: delta.state.edit.changed(),
  interaction: delta.state.interaction.changed(),
  hover: delta.overlay.hover.changed(),
  preview: delta.overlay.preview.changed(),
  viewport: delta.state.viewport.changed()
})

export const collectEditorCommitFlags = (
  commits: readonly EditorStateMutationDelta[]
): CommitFlags => commits.reduce<CommitFlags>((result, commit) => {
  const current = toCommitFlags(commit)
  return {
    tool: result.tool || current.tool,
    draw: result.draw || current.draw,
    selection: result.selection || current.selection,
    edit: result.edit || current.edit,
    interaction: result.interaction || current.interaction,
    hover: result.hover || current.hover,
    preview: result.preview || current.preview,
    viewport: result.viewport || current.viewport
  }
}, {
  tool: false,
  draw: false,
  selection: false,
  edit: false,
  interaction: false,
  hover: false,
  preview: false,
  viewport: false
})

export const createBootstrapEditorDelta = (
  snapshot: EditorStateDocument
): EditorDelta => ({
  tool: true,
  draw: true,
  selection: true,
  edit: {
    touchedDraftEdgeIds: [...readEditedEdgeIds(snapshot.state.edit)]
  },
  interaction: {
    mode: true,
    chrome: true,
    space: true
  },
  hover: true,
  preview: createPreviewDelta({
    previous: snapshot,
    next: snapshot,
    marquee: true,
    guides: true,
    draw: true,
    edgeGuide: true,
    hover: true
  }),
  viewport: true
})

export const createEditorDeltaFromCommitFlags = (input: {
  flags: CommitFlags
  previous: EditorStateDocument
  next: EditorStateDocument
}): EditorDelta => {
  const delta: EditorDelta = {}

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
        readEditedEdgeIds(input.previous.state.edit),
        readEditedEdgeIds(input.next.state.edit)
      )
    }
  }
  if (input.flags.interaction) {
    delta.interaction = {
      mode: true,
      chrome: true,
      space: true
    }
  }
  if (input.flags.hover) {
    delta.hover = isHoverEqual(
      input.previous.overlay.hover,
      input.next.overlay.hover
    )
      ? true
      : createHoverDelta({
          previous: input.previous.overlay.hover,
          next: input.next.overlay.hover
        })
  }
  if (input.flags.preview) {
    delta.preview = createPreviewDelta({
      previous: input.previous,
      next: input.next,
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

export const createDocumentDrivenEditorDelta = (input: {
  previous: EditorStateDocument
  next: EditorStateDocument
}): EditorDelta => {
  const previousPreview = input.previous.overlay.preview
  const nextPreview = input.next.overlay.preview
  if (isMindmapPreviewEqual(previousPreview.mindmap, nextPreview.mindmap)) {
    return {}
  }

  return {
    preview: createPreviewDelta({
      previous: input.previous,
      next: input.next,
      marquee: false,
      guides: false,
      draw: false,
      edgeGuide: false,
      hover: false
    })
  }
}

export const mergeEditorDeltas = (
  left: EditorDelta,
  right: EditorDelta
): EditorDelta => ({
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
            : {})
        }
      }
    : {}),
  ...(left.hover || right.hover
    ? {
        hover: (left.hover && left.hover !== true) || (right.hover && right.hover !== true)
          ? {
              touchedNodeIds: unionIds(
                left.hover && left.hover !== true
                  ? left.hover.touchedNodeIds
                  : [],
                right.hover && right.hover !== true
                  ? right.hover.touchedNodeIds
                  : []
              ),
              touchedEdgeIds: unionIds(
                left.hover && left.hover !== true
                  ? left.hover.touchedEdgeIds
                  : [],
                right.hover && right.hover !== true
                  ? right.hover.touchedEdgeIds
                  : []
              ),
              touchedMindmapIds: unionIds(
                left.hover && left.hover !== true
                  ? left.hover.touchedMindmapIds
                  : [],
                right.hover && right.hover !== true
                  ? right.hover.touchedMindmapIds
                  : []
              )
            }
          : true
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
