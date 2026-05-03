import type {
  EditSession
} from '@whiteboard/editor/schema/edit'
import type {
  EditorStateDocument as EditorSnapshot
} from '@whiteboard/editor/state/document'
import type {
  EditorStateMutationDelta
} from '@whiteboard/editor/state/runtime'
import type {
  SceneRuntimeFacts
} from '../contracts/editor'

const readEditedEdgeIds = (
  edit: EditSession | null
): ReadonlySet<string> => edit?.kind === 'edge-label'
  ? new Set([edit.edgeId])
  : new Set()

const readEditedNodeIds = (
  edit: EditSession | null
): ReadonlySet<string> => edit?.kind === 'node'
  ? new Set([edit.nodeId])
  : new Set()

const readHoverNodeIds = (
  previous: EditorSnapshot,
  next: EditorSnapshot,
  delta: EditorStateMutationDelta
): ReadonlySet<string> => delta.hover.node.changed()
  ? new Set(
      [previous.hover.node, next.hover.node].filter((id): id is string => id !== null)
    )
  : new Set()

const readHoverEdgeIds = (
  previous: EditorSnapshot,
  next: EditorSnapshot,
  delta: EditorStateMutationDelta
): ReadonlySet<string> => delta.hover.edge.changed()
  ? new Set(
      [previous.hover.edge, next.hover.edge].filter((id): id is string => id !== null)
    )
  : new Set()

const readHoverMindmapIds = (
  previous: EditorSnapshot,
  next: EditorSnapshot,
  delta: EditorStateMutationDelta
): ReadonlySet<string> => delta.hover.mindmap.changed()
  ? new Set(
      [previous.hover.mindmap, next.hover.mindmap].filter((id): id is string => id !== null)
    )
  : new Set()

const toTouchedSet = <TId extends string>(
  value: ReadonlySet<TId> | 'all',
  fallback: readonly TId[]
): ReadonlySet<TId> => value === 'all'
  ? new Set(fallback)
  : new Set(value)

export const createRuntimeFacts = (input: {
  previous: EditorSnapshot
  next: EditorSnapshot
  interaction: {
    selection: {
      edgeIds: readonly string[]
    }
    hover: {
      kind: string
      edgeId?: string
    }
  }
  delta: EditorStateMutationDelta
}): SceneRuntimeFacts => {
  const touchedNodeIds = new Set<string>([
    ...toTouchedSet(
      input.delta.preview.node.touchedIds(),
      Object.keys(input.next.preview.node)
    ),
    ...readHoverNodeIds(input.previous, input.next, input.delta),
    ...readEditedNodeIds(input.next.state.edit)
  ])
  const touchedEdgeIds = new Set<string>([
    ...toTouchedSet(
      input.delta.preview.edge.touchedIds(),
      Object.keys(input.next.preview.edge)
    ),
    ...readHoverEdgeIds(input.previous, input.next, input.delta),
    ...readEditedEdgeIds(input.next.state.edit)
  ])
  const touchedMindmapIds = new Set<string>([
    ...toTouchedSet(
      input.delta.preview.mindmap.touchedIds(),
      Object.keys(input.next.preview.mindmap)
    ),
    ...readHoverMindmapIds(input.previous, input.next, input.delta)
  ])

  const activeEdgeIds = new Set<string>([
    ...input.interaction.selection.edgeIds,
    ...readEditedEdgeIds(input.next.state.edit)
  ])
  if (input.interaction.hover.kind === 'edge' && input.interaction.hover.edgeId) {
    activeEdgeIds.add(input.interaction.hover.edgeId)
  }

  const overlayChanged = (
    input.delta.hover.node.changed()
    || input.delta.hover.edge.changed()
    || input.delta.hover.mindmap.changed()
    || input.delta.hover.group.changed()
    || input.delta.hover.selectionBox.changed()
    || input.delta.preview.node.changed()
    || input.delta.preview.edge.changed()
    || input.delta.preview.mindmap.changed()
    || input.delta.preview.selection.changed()
    || input.delta.preview.draw.changed()
    || input.delta.preview.edgeGuide.changed()
  )

  const uiChanged = (
    input.delta.state.tool.changed()
    || input.delta.state.selection.changed()
    || input.delta.state.edit.changed()
    || input.delta.state.interaction.changed()
    || overlayChanged
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
