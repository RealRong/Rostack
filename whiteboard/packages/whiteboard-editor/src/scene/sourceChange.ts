import type {
  EdgeId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import type {
  EditorSceneSourceChange,
  EditorSceneSourceSnapshot
} from '@whiteboard/editor-scene'
import type { MutationCommitRecord } from '@shared/mutation'
import { createEditorStateMutationDelta } from '@whiteboard/editor/state-engine/delta'
import { isMindmapPreviewEqual } from './sourceSnapshot'

const EMPTY_IDS: readonly string[] = Object.freeze([])

type SourcePreviewChange = NonNullable<
  NonNullable<EditorSceneSourceChange['session']>['preview']
>

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

export const createDocumentCommitSourceChange = (input: {
  commit: MutationCommitRecord<unknown, unknown>
  previous: EditorSceneSourceSnapshot
  next: EditorSceneSourceSnapshot
}): EditorSceneSourceChange => {
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
          session: {
            preview
          }
        }
      : {})
  }
}

export const createEditorStateCommitSourceChange = (input: {
  commit: MutationCommitRecord<unknown, unknown>
  previous: EditorSceneSourceSnapshot
  next: EditorSceneSourceSnapshot
}): EditorSceneSourceChange => {
  const delta = createEditorStateMutationDelta(input.commit.delta)

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

export const createTransientPreviewSourceChange = (input: {
  previous: EditorSceneSourceSnapshot
  next: EditorSceneSourceSnapshot
}): EditorSceneSourceChange => ({
  session: {
    preview: createPreviewChange({
      previous: input.previous.session.preview,
      next: input.next.session.preview,
      marquee: true,
      guides: true,
      draw: true,
      edgeGuide: true,
      hover: true
    })
  }
})

export const hasSourceChange = (
  change: EditorSceneSourceChange
): boolean => (
  change.document !== undefined
  || change.editor !== undefined
  || change.session !== undefined
  || change.view !== undefined
)
