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
  EditorSceneSourceChange,
  EditorSceneSourceSnapshot
} from '../contracts/source'

const EMPTY_MUTATION_CHANGES = Object.freeze(
  Object.create(null)
) as Record<string, never>

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

export const createSourceRuntimeInputDelta = (input: {
  change: EditorSceneSourceChange
}): EditorSceneRuntimeDelta => {
  const delta = createEmptyEditorSceneRuntimeDelta()

  if (input.change.session?.tool) {
    delta.session.tool = true
  }
  if (input.change.session?.selection) {
    delta.session.selection = true
  }
  const editChange = input.change.session?.edit
  if (editChange) {
    delta.session.edit = true
    if (editChange.touchedDraftEdgeIds.length > 0) {
      delta.session.draft.edges = createTouchedIdDelta(editChange.touchedDraftEdgeIds)
    }
  }
  const previewChange = input.change.session?.preview
  if (previewChange) {
    if (previewChange.touchedNodeIds.length > 0) {
      delta.session.preview.nodes = createTouchedIdDelta(previewChange.touchedNodeIds)
    }
    if (previewChange.touchedEdgeIds.length > 0) {
      delta.session.preview.edges = createTouchedIdDelta(previewChange.touchedEdgeIds)
    }
    if (previewChange.touchedMindmapIds.length > 0) {
      delta.session.preview.mindmaps = createTouchedIdDelta(previewChange.touchedMindmapIds)
    }

    delta.session.preview.marquee = previewChange.marquee
    delta.session.preview.guides = previewChange.guides
    delta.session.preview.draw = previewChange.draw
    delta.session.preview.edgeGuide = previewChange.edgeGuide
    delta.session.hover = delta.session.hover || previewChange.hover
  }

  if (input.change.interaction?.hover) {
    delta.session.hover = true
  }

  if (input.change.interaction) {
    delta.session.interaction = true
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

export const readSourceMutationDelta = (
  change: EditorSceneSourceChange
): MutationDelta => change.document?.delta ?? EMPTY_DOCUMENT_DELTA

export const readBootstrapMutationDelta = (): MutationDelta => BOOTSTRAP_DOCUMENT_DELTA
