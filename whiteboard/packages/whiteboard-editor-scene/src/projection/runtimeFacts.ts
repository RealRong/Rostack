import type {
  EdgeId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import type {
  EditorDelta,
  EditorStateDocument as EditorSnapshot,
  EditSession
} from '@whiteboard/editor/protocol'
import type {
  PreviewInput,
  SceneRuntimeFacts
} from '../contracts/editor'

const readEditedEdgeIds = (
  edit: EditSession | null
): ReadonlySet<EdgeId> => edit?.kind === 'edge-label'
  ? new Set([edit.edgeId])
  : new Set()

const readEditedNodeIds = (
  edit: EditSession | null
): ReadonlySet<NodeId> => edit?.kind === 'node'
  ? new Set([edit.nodeId])
  : new Set()

const readPreviewMindmapIds = (
  preview: PreviewInput['mindmap']
): ReadonlySet<MindmapId> => {
  const ids = new Set<MindmapId>()

  if (preview?.rootMove) {
    ids.add(preview.rootMove.mindmapId)
  }
  if (preview?.subtreeMove) {
    ids.add(preview.subtreeMove.mindmapId)
  }

  return ids
}

const readPreviewNodeIds = (
  preview: PreviewInput
): ReadonlySet<NodeId> => new Set(Object.keys(preview.nodes) as readonly NodeId[])

const readPreviewEdgeIds = (
  preview: PreviewInput
): ReadonlySet<EdgeId> => new Set(Object.keys(preview.edges) as readonly EdgeId[])

const readPreviewTouchedNodeIds = (
  snapshot: EditorSnapshot,
  delta: EditorDelta
): ReadonlySet<NodeId> => {
  if (delta.preview && delta.preview !== true) {
    return new Set(delta.preview.touchedNodeIds)
  }
  if (delta.hover && delta.hover !== true) {
    return new Set(delta.hover.touchedNodeIds)
  }
  return readPreviewNodeIds(snapshot.overlay.preview)
}

const readPreviewTouchedEdgeIds = (
  snapshot: EditorSnapshot,
  delta: EditorDelta
): ReadonlySet<EdgeId> => {
  if (delta.preview && delta.preview !== true) {
    return new Set(delta.preview.touchedEdgeIds)
  }
  if (delta.hover && delta.hover !== true) {
    return new Set(delta.hover.touchedEdgeIds)
  }
  return readPreviewEdgeIds(snapshot.overlay.preview)
}

const readPreviewTouchedMindmapIds = (
  snapshot: EditorSnapshot,
  delta: EditorDelta
): ReadonlySet<MindmapId> => {
  if (delta.preview && delta.preview !== true) {
    return new Set(delta.preview.touchedMindmapIds)
  }
  if (delta.hover && delta.hover !== true) {
    return new Set(delta.hover.touchedMindmapIds)
  }
  return readPreviewMindmapIds(snapshot.overlay.preview.mindmap)
}

export const createRuntimeFacts = (input: {
  snapshot: EditorSnapshot
  interaction: {
    selection: {
      edgeIds: readonly EdgeId[]
    }
    hover: {
      kind: string
      edgeId?: EdgeId
    }
  }
  delta: EditorDelta
}): SceneRuntimeFacts => {
  const touchedNodeIds = new Set<NodeId>([
    ...readPreviewTouchedNodeIds(input.snapshot, input.delta),
    ...readEditedNodeIds(input.snapshot.state.edit)
  ])
  const touchedEdgeIds = new Set<EdgeId>([
    ...readPreviewTouchedEdgeIds(input.snapshot, input.delta),
    ...readEditedEdgeIds(input.snapshot.state.edit)
  ])
  const touchedMindmapIds = new Set<MindmapId>([
    ...readPreviewTouchedMindmapIds(input.snapshot, input.delta)
  ])

  const activeEdgeIds = new Set<EdgeId>([
    ...input.interaction.selection.edgeIds,
    ...readEditedEdgeIds(input.snapshot.state.edit)
  ])
  if (input.interaction.hover.kind === 'edge' && input.interaction.hover.edgeId) {
    activeEdgeIds.add(input.interaction.hover.edgeId)
  }

  const preview = input.delta.preview
  const previewDelta = preview && preview !== true
    ? preview
    : undefined
  const previewMindmapChanged = Boolean(
    preview
    && (
      preview === true
      || previewDelta?.touchedMindmapIds.length
    )
  )
  const uiChanged = Boolean(
    input.delta.tool
    || input.delta.selection
    || input.delta.hover
    || input.delta.edit
    || input.delta.interaction
    || preview === true
    || previewMindmapChanged
    || (previewDelta && (
      previewDelta.marquee
      || previewDelta.guides
      || previewDelta.draw
      || previewDelta.edgeGuide
      || previewDelta.hover
    ))
  )

  const overlayChanged = Boolean(
    input.delta.hover
    || preview === true
    || previewMindmapChanged
    || (previewDelta && (
      previewDelta.marquee
      || previewDelta.guides
      || previewDelta.draw
      || previewDelta.edgeGuide
      || previewDelta.hover
    ))
  )

  return {
    touchedNodeIds,
    touchedEdgeIds,
    touchedMindmapIds,
    activeEdgeIds,
    uiChanged,
    overlayChanged,
    chromeChanged: uiChanged || overlayChanged
  }
}
