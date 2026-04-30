import { idDelta } from '@shared/delta'
import {
  type MutationDelta
} from '@shared/mutation'
import type {
  EdgeId,
  NodeId
} from '@whiteboard/core/types'
import type {
  EditSession,
  HoverState,
  Input
} from '../contracts/editor'
import type {
  EditorSceneRuntimeDelta
} from '../contracts/plan'
import {
  createEmptyEditorSceneRuntimeDelta
} from '../contracts/plan'
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

const BOOTSTRAP_DOCUMENT_DELTA: MutationDelta = {
  reset: true,
  changes: EMPTY_MUTATION_CHANGES
}

const EMPTY_DOCUMENT_DELTA: MutationDelta = {
  changes: EMPTY_MUTATION_CHANGES
}

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

const isHoverStateEqual = (
  left: HoverState,
  right: HoverState
): boolean => {
  if (left.kind !== right.kind) {
    return false
  }

  switch (left.kind) {
    case 'node':
      return left.nodeId === (right.kind === 'node' ? right.nodeId : undefined)
    case 'edge':
      return left.edgeId === (right.kind === 'edge' ? right.edgeId : undefined)
    case 'mindmap':
      return left.mindmapId === (right.kind === 'mindmap' ? right.mindmapId : undefined)
    case 'group':
      return left.groupId === (right.kind === 'group' ? right.groupId : undefined)
    case 'selection-box':
    case 'none':
      return true
    default:
      return false
  }
}

const isStringArrayEqual = (
  left: readonly string[],
  right: readonly string[]
): boolean => (
  left.length === right.length
  && left.every((value, index) => value === right[index])
)

const isDragStateEqual = (
  left: EditorSceneSourceSnapshot['interaction']['drag'],
  right: EditorSceneSourceSnapshot['interaction']['drag']
): boolean => {
  if (left.kind !== right.kind) {
    return false
  }

  switch (left.kind) {
    case 'idle':
    case 'draw':
      return true
    case 'selection-move':
      return isStringArrayEqual(left.nodeIds, right.kind === 'selection-move' ? right.nodeIds : [])
        && isStringArrayEqual(left.edgeIds, right.kind === 'selection-move' ? right.edgeIds : [])
    case 'selection-marquee':
      return right.kind === 'selection-marquee'
        && left.match === right.match
        && left.worldRect.x === right.worldRect.x
        && left.worldRect.y === right.worldRect.y
        && left.worldRect.width === right.worldRect.width
        && left.worldRect.height === right.worldRect.height
    case 'selection-transform':
      return isStringArrayEqual(left.nodeIds, right.kind === 'selection-transform' ? right.nodeIds : [])
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
    default:
      return false
  }
}

const isInteractionStateEqual = (
  left: EditorSceneSourceSnapshot['interaction'],
  right: EditorSceneSourceSnapshot['interaction']
): boolean => (
  left.chrome === right.chrome
  && left.editingEdge === right.editingEdge
  && isHoverStateEqual(left.hover, right.hover)
  && isDragStateEqual(left.drag, right.drag)
)

const createPreviewDelta = (input: {
  previous: EditorSceneSourceSnapshot['session']['preview']
  next: EditorSceneSourceSnapshot['session']['preview']
}): EditorSceneRuntimeDelta => {
  const delta = createEmptyEditorSceneRuntimeDelta()
  const touchedNodeIds = unionIds(
    readPreviewNodeIds(input.previous),
    readPreviewNodeIds(input.next)
  )
  const touchedEdgeIds = unionIds(
    readPreviewEdgeIds(input.previous),
    readPreviewEdgeIds(input.next)
  )
  const touchedMindmapIds = unionIds(
    readPreviewMindmapIds(input.previous.mindmap),
    readPreviewMindmapIds(input.next.mindmap)
  )

  if (touchedNodeIds.size > 0) {
    delta.session.preview.nodes = createTouchedIdDelta(touchedNodeIds)
  }
  if (touchedEdgeIds.size > 0) {
    delta.session.preview.edges = createTouchedIdDelta(touchedEdgeIds)
  }
  if (touchedMindmapIds.size > 0) {
    delta.session.preview.mindmaps = createTouchedIdDelta(touchedMindmapIds)
  }

  delta.session.preview.marquee = true
  delta.session.preview.guides = true
  delta.session.preview.draw = true
  delta.session.preview.edgeGuide = true
  delta.session.hover = true

  return delta
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
  previous: EditorSceneSourceSnapshot
  next: EditorSceneSourceSnapshot
  change: EditorSceneSourceChange
}): EditorSceneRuntimeDelta => {
  const delta = createEmptyEditorSceneRuntimeDelta()

  if (input.change.session?.tool) {
    delta.session.tool = true
  }
  if (input.change.session?.selection) {
    delta.session.selection = true
  }
  if (input.change.session?.edit) {
    delta.session.edit = true
    const touchedEdgeIds = unionIds(
      readEditedEdgeIds(input.previous.session.edit),
      readEditedEdgeIds(input.next.session.edit)
    )
    if (touchedEdgeIds.size > 0) {
      delta.session.draft.edges = createTouchedIdDelta(touchedEdgeIds)
    }
  }
  if (input.change.session?.preview) {
    const previewDelta = createPreviewDelta({
      previous: input.previous.session.preview,
      next: input.next.session.preview
    })
    delta.session.hover = delta.session.hover || previewDelta.session.hover
    delta.session.preview = previewDelta.session.preview
  }

  if (
    input.change.interaction?.hover
    || !isHoverStateEqual(
      input.previous.interaction.hover,
      input.next.interaction.hover
    )
  ) {
    delta.session.hover = true
  }

  if (
    !isInteractionStateEqual(
      input.previous.interaction,
      input.next.interaction
    )
  ) {
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
