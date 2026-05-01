import type {
  EdgeId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import { normalizeMutationDelta } from '@shared/mutation'
import type {
  EditorSceneSourceEvent,
  EditorSceneSourceSnapshot
} from '@whiteboard/editor-scene'
import type { MutationCommitRecord } from '@shared/mutation'
import { createEditorStateMutationDelta } from '@whiteboard/editor/state-engine/delta'
import { isMindmapPreviewEqual } from './sourceSnapshot'

const EMPTY_IDS: readonly string[] = Object.freeze([])

type SourcePreviewChange = {
  touchedNodeIds: readonly NodeId[]
  touchedEdgeIds: readonly EdgeId[]
  touchedMindmapIds: readonly MindmapId[]
  marquee: boolean
  guides: boolean
  draw: boolean
  edgeGuide: boolean
  hover: boolean
}

type SourceHoverChange = {
  touchedNodeIds: readonly NodeId[]
  touchedEdgeIds: readonly EdgeId[]
  touchedMindmapIds: readonly MindmapId[]
}

export const unionIds = <TId extends string>(
  ...values: readonly Iterable<TId>[]
): readonly TId[] => [...new Set(
  values.flatMap((value) => [...value])
)]

export const readEditedEdgeIds = (
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

export const createPreviewChange = (input: {
  previous: EditorSceneSourceSnapshot['session']['preview']
  next: EditorSceneSourceSnapshot['session']['preview']
  marquee: boolean
  guides: boolean
  draw: boolean
  edgeGuide: boolean
  hover: boolean
}): SourcePreviewChange => ({
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

const createHoverChange = (input: {
  previous: EditorSceneSourceSnapshot['interaction']['hover']
  next: EditorSceneSourceSnapshot['interaction']['hover']
}): SourceHoverChange => {
  const touchedNodeIds = new Set<NodeId>()
  const touchedEdgeIds = new Set<EdgeId>()
  const touchedMindmapIds = new Set<MindmapId>()

  const append = (
    hover: EditorSceneSourceSnapshot['interaction']['hover']
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

const createPreviewDelta = (
  preview: SourcePreviewChange
) => normalizeMutationDelta({
  changes: {
    'preview.value': {
      ids: [
        ...preview.touchedNodeIds,
        ...preview.touchedEdgeIds,
        ...preview.touchedMindmapIds
      ]
    }
  }
})

export const createDocumentCommitSourceEvent = (input: {
  commit: MutationCommitRecord<unknown, unknown>
  previous: EditorSceneSourceSnapshot
  next: EditorSceneSourceSnapshot
}): Omit<EditorSceneSourceEvent, 'source'> => {
  const preview = !isMindmapPreviewEqual(
    input.previous.session.preview.mindmap,
    input.next.session.preview.mindmap
  )
    ? createPreviewChange({
        previous: input.previous.session.preview,
        next: input.next.session.preview,
        marquee: false,
        guides: false,
        draw: false,
        edgeGuide: false,
        hover: false
      })
    : undefined

  return {
    document: {
      rev: input.commit.rev,
      delta: input.commit.delta,
      reset: input.commit.kind === 'replace' || input.commit.delta.reset === true
    },
    ...(preview
      ? {
          editor: {
            delta: createPreviewDelta(preview),
            preview
          }
        }
      : {})
  }
}

export const createEditorStateCommitSourceEvent = (input: {
  commit: MutationCommitRecord<unknown, unknown>
  previous: EditorSceneSourceSnapshot
  next: EditorSceneSourceSnapshot
}): Omit<EditorSceneSourceEvent, 'source'> => {
  const delta = createEditorStateMutationDelta(input.commit.delta)
  const hover = delta.interaction.changed()
    ? createHoverChange({
        previous: input.previous.interaction.hover,
        next: input.next.interaction.hover
      })
    : undefined

  return {
    ...(delta.tool.changed()
      || delta.selection.changed()
      || delta.edit.changed()
      || delta.interaction.changed()
      || delta.preview.changed()
      || delta.viewport.changed()
      ? {
          editor: {
            delta: input.commit.delta,
            ...(delta.edit.changed()
              ? {
                  edit: {
                    touchedDraftEdgeIds: unionIds(
                      readEditedEdgeIds(input.previous.session.edit),
                      readEditedEdgeIds(input.next.session.edit)
                    )
                  }
                }
              : {}),
            ...(hover
              ? {
                  hover
                }
              : {})
          }
        }
      : {}),
    ...(delta.viewport.changed()
      ? {
          view: true
        }
      : {})
  }
}

export const createTransientPreviewSourceEvent = (input: {
  previous: EditorSceneSourceSnapshot
  next: EditorSceneSourceSnapshot
}): Omit<EditorSceneSourceEvent, 'source'> => {
  const preview = createPreviewChange({
    previous: input.previous.session.preview,
    next: input.next.session.preview,
    marquee: true,
    guides: true,
    draw: true,
    edgeGuide: true,
    hover: true
  })

  return {
    editor: {
      delta: createPreviewDelta(preview),
      preview
    }
  }
}

export const hasSourceEvent = (
  event: Omit<EditorSceneSourceEvent, 'source'> | EditorSceneSourceEvent
): boolean => (
  event.document !== undefined
  || event.editor !== undefined
  || event.view !== undefined
)
