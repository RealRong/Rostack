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
import type { EditorSceneRuntimeDelta } from '../contracts/plan'

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
  session: {
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
    ...idDelta.touched(input.delta.session.preview.nodes),
    ...readEditedNodeIds(input.session.edit)
  ])
  const touchedEdgeIds = new Set<EdgeId>([
    ...idDelta.touched(input.delta.session.draft.edges),
    ...idDelta.touched(input.delta.session.preview.edges),
    ...readEditedEdgeIds(input.session.edit)
  ])
  const touchedMindmapIds = new Set<MindmapId>([
    ...idDelta.touched(input.delta.session.preview.mindmaps),
    ...readPreviewMindmapIds(input.session.preview.mindmap)
  ])

  const activeEdgeIds = new Set<EdgeId>([
    ...input.interaction.selection.edgeIds,
    ...readEditedEdgeIds(input.session.edit)
  ])
  if (input.interaction.hover.kind === 'edge' && input.interaction.hover.edgeId) {
    activeEdgeIds.add(input.interaction.hover.edgeId)
  }

  const uiChanged = Boolean(
    input.delta.session.tool
    || input.delta.session.selection
    || input.delta.session.hover
    || input.delta.session.edit
    || input.delta.session.interaction
    || input.delta.session.preview.marquee
    || input.delta.session.preview.guides
    || input.delta.session.preview.draw
    || input.delta.session.preview.edgeGuide
    || input.delta.session.preview.mindmaps.added.size > 0
    || input.delta.session.preview.mindmaps.updated.size > 0
    || input.delta.session.preview.mindmaps.removed.size > 0
  )

  const overlayChanged = Boolean(
    input.delta.session.hover
    || input.delta.session.preview.marquee
    || input.delta.session.preview.guides
    || input.delta.session.preview.draw
    || input.delta.session.preview.edgeGuide
    || input.delta.session.preview.mindmaps.added.size > 0
    || input.delta.session.preview.mindmaps.updated.size > 0
    || input.delta.session.preview.mindmaps.removed.size > 0
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
