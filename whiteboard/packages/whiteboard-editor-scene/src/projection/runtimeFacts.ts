import { idDelta } from '@shared/delta'
import type {
  EdgeId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import type {
  EditSession,
  PreviewInput,
  SceneRuntimeFacts
} from '../contracts/editor'
import type { EditorSceneRuntimeDelta } from '../contracts/facts'

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

export const createRuntimeFacts = (input: {
  state: {
    edit: EditSession | null
    preview: PreviewInput
  }
  interaction: {
    selection: {
      edgeIds: readonly EdgeId[]
    }
    hover: {
      kind: string
      edgeId?: EdgeId
    }
  }
  delta: EditorSceneRuntimeDelta
}): SceneRuntimeFacts => {
  const touchedNodeIds = new Set<NodeId>([
    ...idDelta.touched(input.delta.preview.nodes),
    ...readEditedNodeIds(input.state.edit)
  ])
  const touchedEdgeIds = new Set<EdgeId>([
    ...idDelta.touched(input.delta.draft.edges),
    ...idDelta.touched(input.delta.preview.edges),
    ...readEditedEdgeIds(input.state.edit)
  ])
  const touchedMindmapIds = new Set<MindmapId>([
    ...idDelta.touched(input.delta.preview.mindmaps),
    ...readPreviewMindmapIds(input.state.preview.mindmap)
  ])

  const activeEdgeIds = new Set<EdgeId>([
    ...input.interaction.selection.edgeIds,
    ...readEditedEdgeIds(input.state.edit)
  ])
  if (input.interaction.hover.kind === 'edge' && input.interaction.hover.edgeId) {
    activeEdgeIds.add(input.interaction.hover.edgeId)
  }

  const uiChanged = Boolean(
    input.delta.tool
    || input.delta.selection
    || input.delta.hover
    || input.delta.edit
    || input.delta.interaction
    || input.delta.preview.marquee
    || input.delta.preview.guides
    || input.delta.preview.draw
    || input.delta.preview.edgeGuide
    || input.delta.preview.mindmaps.added.size > 0
    || input.delta.preview.mindmaps.updated.size > 0
    || input.delta.preview.mindmaps.removed.size > 0
  )

  const overlayChanged = Boolean(
    input.delta.hover
    || input.delta.preview.marquee
    || input.delta.preview.guides
    || input.delta.preview.draw
    || input.delta.preview.edgeGuide
    || input.delta.preview.mindmaps.added.size > 0
    || input.delta.preview.mindmaps.updated.size > 0
    || input.delta.preview.mindmaps.removed.size > 0
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
