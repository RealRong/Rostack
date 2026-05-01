import { idDelta } from '@shared/delta'
import {
  normalizeMutationDelta,
  type MutationDelta
} from '@shared/mutation'
import type {
  EdgeId,
  NodeId
} from '@whiteboard/core/types'
import type {
  EditSession,
  Input
} from '../contracts/editor'
import type {
  EditorSceneRuntimeDelta
} from '../contracts/facts'
import {
  createEmptyEditorSceneRuntimeDelta
} from '../contracts/facts'
import {
  createWhiteboardMutationDelta
} from '@whiteboard/engine/mutation'
import { createRuntimeFacts } from './runtimeFacts'
import type {
  EditorSceneSourceEvent,
  EditorSceneSourceSnapshot
} from '../contracts/source'

const BOOTSTRAP_DOCUMENT_DELTA: MutationDelta = normalizeMutationDelta({
  reset: true
})

const EMPTY_DOCUMENT_DELTA: MutationDelta = normalizeMutationDelta()

const createTouchedIdDelta = <TId extends string>(
  ids: Iterable<TId>
): EditorSceneRuntimeDelta['session']['draft']['edges'] => ({
  added: new Set(),
  updated: new Set(ids),
  removed: new Set()
})

const unionIds = <TId extends string>(
  ...values: readonly Iterable<TId>[]
): ReadonlySet<TId> => new Set(
  values.flatMap((value) => [...value])
)

const readEditedEdgeIds = (
  edit: EditSession | null
): ReadonlySet<EdgeId> => edit?.kind === 'edge-label'
  ? new Set([edit.edgeId])
  : new Set()

const readPreviewNodeIds = (
  preview: EditorSceneSourceSnapshot['session']['preview']
): ReadonlySet<NodeId> => new Set(preview.nodes.keys())

const readPreviewEdgeIds = (
  preview: EditorSceneSourceSnapshot['session']['preview']
): ReadonlySet<EdgeId> => new Set(preview.edges.keys())

const readPreviewMindmapIds = (
  preview: EditorSceneSourceSnapshot['session']['preview']['mindmap']
): ReadonlySet<string> => {
  const ids = new Set<string>()

  if (preview?.rootMove) {
    ids.add(preview.rootMove.mindmapId)
  }
  if (preview?.subtreeMove) {
    ids.add(preview.subtreeMove.mindmapId)
  }

  return ids
}

const readEventPreviewIds = (
  preview: Pick<NonNullable<EditorSceneSourceEvent['editor']>, 'preview'>
) => ({
  nodes: new Set(preview.preview?.touchedNodeIds ?? []),
  edges: new Set(preview.preview?.touchedEdgeIds ?? []),
  mindmaps: new Set(preview.preview?.touchedMindmapIds ?? [])
})

const readEventHoverIds = (
  hover: Pick<NonNullable<EditorSceneSourceEvent['editor']>, 'hover'>
) => ({
  nodes: new Set(hover.hover?.touchedNodeIds ?? []),
  edges: new Set(hover.hover?.touchedEdgeIds ?? []),
  mindmaps: new Set(hover.hover?.touchedMindmapIds ?? [])
})

export const createBootstrapRuntimeInputDelta = (
  source: EditorSceneSourceSnapshot
): EditorSceneRuntimeDelta => {
  const delta = createEmptyEditorSceneRuntimeDelta()

  delta.session.tool = true
  delta.session.selection = true
  delta.session.hover = true
  delta.session.edit = true
  delta.session.interaction = true
  delta.session.preview.marquee = true
  delta.session.preview.guides = true
  delta.session.preview.draw = true
  delta.session.preview.edgeGuide = true

  const editedEdgeIds = readEditedEdgeIds(source.session.edit)
  const previewNodeIds = readPreviewNodeIds(source.session.preview)
  const previewEdgeIds = readPreviewEdgeIds(source.session.preview)
  const previewMindmapIds = readPreviewMindmapIds(source.session.preview.mindmap)

  if (editedEdgeIds.size > 0) {
    delta.session.draft.edges = createTouchedIdDelta(editedEdgeIds)
  }
  if (previewNodeIds.size > 0) {
    delta.session.preview.nodes = createTouchedIdDelta(previewNodeIds)
  }
  if (previewEdgeIds.size > 0) {
    delta.session.preview.edges = createTouchedIdDelta(previewEdgeIds)
  }
  if (previewMindmapIds.size > 0) {
    delta.session.preview.mindmaps = createTouchedIdDelta(previewMindmapIds)
  }

  return delta
}

export const createEditorRuntimeInputDelta = (input: {
  source: EditorSceneSourceSnapshot
  event: Pick<EditorSceneSourceEvent, 'editor'>
}): EditorSceneRuntimeDelta => {
  const delta = createEmptyEditorSceneRuntimeDelta()

  const editorDelta = input.event.editor?.delta
  if (editorDelta) {
    if (editorDelta.has('tool.value')) {
      delta.session.tool = true
    }
    if (editorDelta.has('selection.value')) {
      delta.session.selection = true
    }
    if (editorDelta.has('edit.value')) {
      delta.session.edit = true
      const touchedDraftEdgeIds = input.event.editor?.edit?.touchedDraftEdgeIds
        ?? [...readEditedEdgeIds(input.source.session.edit)]
      if (touchedDraftEdgeIds.length > 0) {
        delta.session.draft.edges = createTouchedIdDelta(touchedDraftEdgeIds)
      }
    }
    if (editorDelta.has('interaction.value')) {
      delta.session.interaction = true
      delta.session.hover = true
      const hoverIds = readEventHoverIds({
        hover: input.event.editor?.hover
      })
      if (hoverIds.nodes.size > 0) {
        delta.session.preview.nodes = createTouchedIdDelta(hoverIds.nodes)
      }
      if (hoverIds.edges.size > 0) {
        delta.session.preview.edges = createTouchedIdDelta(hoverIds.edges)
      }
      if (hoverIds.mindmaps.size > 0) {
        delta.session.preview.mindmaps = createTouchedIdDelta(hoverIds.mindmaps)
      }
    }
    if (editorDelta.has('preview.value')) {
      const previewIds = readEventPreviewIds({
        preview: input.event.editor?.preview
      })
      const previewNodeIds = previewIds.nodes.size > 0
        ? previewIds.nodes
        : readPreviewNodeIds(input.source.session.preview)
      const previewEdgeIds = previewIds.edges.size > 0
        ? previewIds.edges
        : readPreviewEdgeIds(input.source.session.preview)
      const previewMindmapIds = previewIds.mindmaps.size > 0
        ? previewIds.mindmaps
        : readPreviewMindmapIds(input.source.session.preview.mindmap)

      if (previewNodeIds.size > 0) {
        delta.session.preview.nodes = createTouchedIdDelta(previewNodeIds)
      }
      if (previewEdgeIds.size > 0) {
        delta.session.preview.edges = createTouchedIdDelta(previewEdgeIds)
      }
      if (previewMindmapIds.size > 0) {
        delta.session.preview.mindmaps = createTouchedIdDelta(previewMindmapIds)
      }

      delta.session.preview.marquee = true
      delta.session.preview.guides = true
      delta.session.preview.draw = true
      delta.session.preview.edgeGuide = true
    }
  }

  return delta
}

export const createSceneInput = (input: {
  source: EditorSceneSourceSnapshot
  delta: MutationDelta
  runtimeDelta: EditorSceneRuntimeDelta
}): Input => {
  const session = {
    edit: input.source.session.edit,
    draft: input.source.session.draft,
    preview: input.source.session.preview,
    tool: input.source.session.tool
  }
  const interaction = {
    selection: input.source.session.selection,
    hover: input.source.interaction.hover,
    drag: input.source.interaction.drag,
    chrome: input.source.interaction.chrome,
    editingEdge: input.source.interaction.editingEdge
  }

  return {
    document: {
      rev: input.source.document.rev,
      doc: input.source.document.doc
    },
    runtime: {
      session,
      interaction,
      view: input.source.view,
      facts: createRuntimeFacts({
        session,
        interaction,
        delta: input.runtimeDelta
      }),
      delta: input.runtimeDelta
    },
    delta: createWhiteboardMutationDelta(input.delta)
  }
}

export const readEventDocumentDelta = (
  event: Pick<EditorSceneSourceEvent, 'document'>
): MutationDelta => event.document?.delta ?? EMPTY_DOCUMENT_DELTA

export const readBootstrapMutationDelta = (): MutationDelta => BOOTSTRAP_DOCUMENT_DELTA
