import type {
  EditSession
} from '@whiteboard/editor/schema/edit'
import type {
  EditorStateDocument as EditorSnapshot
} from '@whiteboard/editor/state/document'
import type {
  EditorStateChange
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
  change: EditorStateChange
): ReadonlySet<string> => change.hover.node.changed()
  ? new Set(
      [previous.hover.node, next.hover.node].filter((id): id is string => id !== null)
    )
  : new Set()

const readHoverEdgeIds = (
  previous: EditorSnapshot,
  next: EditorSnapshot,
  change: EditorStateChange
): ReadonlySet<string> => change.hover.edge.changed()
  ? new Set(
      [previous.hover.edge, next.hover.edge].filter((id): id is string => id !== null)
    )
  : new Set()

const readHoverMindmapIds = (
  previous: EditorSnapshot,
  next: EditorSnapshot,
  change: EditorStateChange
): ReadonlySet<string> => change.hover.mindmap.changed()
  ? new Set(
      [previous.hover.mindmap, next.hover.mindmap].filter((id): id is string => id !== null)
    )
  : new Set()

const readChangedMapIds = <TId extends string, TValue>(
  previous: Readonly<Record<TId, TValue | undefined>>,
  next: Readonly<Record<TId, TValue | undefined>>,
  changed: boolean
): ReadonlySet<TId> => changed
  ? new Set<TId>([
      ...(Object.keys(previous) as TId[]),
      ...(Object.keys(next) as TId[])
    ])
  : new Set()

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
  change: EditorStateChange
}): SceneRuntimeFacts => {
  const touchedNodeIds = new Set<string>([
    ...readChangedMapIds(
      input.previous.preview.node,
      input.next.preview.node,
      input.change.preview.node.changed()
    ),
    ...readHoverNodeIds(input.previous, input.next, input.change),
    ...readEditedNodeIds(input.next.state.edit)
  ])
  const touchedEdgeIds = new Set<string>([
    ...readChangedMapIds(
      input.previous.preview.edge,
      input.next.preview.edge,
      input.change.preview.edge.changed()
    ),
    ...readHoverEdgeIds(input.previous, input.next, input.change),
    ...readEditedEdgeIds(input.next.state.edit)
  ])
  const touchedMindmapIds = new Set<string>([
    ...readChangedMapIds(
      input.previous.preview.mindmap,
      input.next.preview.mindmap,
      input.change.preview.mindmap.changed()
    ),
    ...readHoverMindmapIds(input.previous, input.next, input.change)
  ])

  const activeEdgeIds = new Set<string>([
    ...input.interaction.selection.edgeIds,
    ...readEditedEdgeIds(input.next.state.edit)
  ])
  if (input.interaction.hover.kind === 'edge' && input.interaction.hover.edgeId) {
    activeEdgeIds.add(input.interaction.hover.edgeId)
  }

  const overlayChanged = (
    input.change.hover.node.changed()
    || input.change.hover.edge.changed()
    || input.change.hover.mindmap.changed()
    || input.change.hover.group.changed()
    || input.change.hover.selectionBox.changed()
    || input.change.preview.node.changed()
    || input.change.preview.edge.changed()
    || input.change.preview.mindmap.changed()
    || input.change.preview.selection.changed()
    || input.change.preview.draw.changed()
    || input.change.preview.edgeGuide.changed()
  )

  const uiChanged = (
    input.change.state.tool.changed()
    || input.change.state.selection.changed()
    || input.change.state.edit.changed()
    || input.change.state.interaction.changed()
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
