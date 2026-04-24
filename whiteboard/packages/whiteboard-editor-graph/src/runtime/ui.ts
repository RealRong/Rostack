import type {
  EdgeId,
  NodeId
} from '@whiteboard/core/types'
import type {
  ChromeOverlay,
  ChromeView,
  EdgeLabelUiView,
  EdgeUiView,
  EdgeView,
  HoverState,
  NodeUiEdit,
  NodeUiView,
  SelectionState,
  SessionInput
} from '../contracts/editor'
import type {
  GraphEdgeEntry,
  GraphNodeEntry
} from '../contracts/working'

export const readSelectionKind = (
  selection: SelectionState
): 'none' | 'nodes' | 'edges' | 'mixed' => {
  if (selection.nodeIds.length > 0 && selection.edgeIds.length > 0) {
    return 'mixed'
  }

  if (selection.nodeIds.length > 0) {
    return 'nodes'
  }

  if (selection.edgeIds.length > 0) {
    return 'edges'
  }

  return 'none'
}

const readNodeUiEdit = (
  nodeId: NodeId,
  edit: SessionInput['edit']
): NodeUiEdit | undefined => edit?.kind === 'node' && edit.nodeId === nodeId
  ? {
      field: edit.field,
      caret: edit.caret
    }
  : undefined

export const buildNodeUiView = (input: {
  nodeId: NodeId
  draft?: GraphNodeEntry['draft']
  preview?: GraphNodeEntry['preview']
  draw: SessionInput['preview']['draw']
  edit: SessionInput['edit']
  selection: SelectionState
  hover: HoverState
}): NodeUiView => {
  const edit = readNodeUiEdit(input.nodeId, input.edit)
  const patch = input.preview?.patch
  const handle = patch && 'handle' in patch
    ? patch.handle
    : undefined

  return {
    hidden: input.preview?.hidden ?? input.draw?.hiddenNodeIds.includes(input.nodeId) ?? false,
    selected: input.selection.nodeIds.includes(input.nodeId),
    hovered: (
      input.hover.kind === 'node'
      && input.hover.nodeId === input.nodeId
    ) || Boolean(input.preview?.hovered),
    editing: edit !== undefined,
    patched: Boolean(
      patch
      || (input.draft?.kind === 'patch' ? input.draft.fields : undefined)
    ),
    resizing: Boolean(patch?.size || handle),
    edit
  }
}

const isEditingEdgeLabel = (
  edgeId: EdgeId,
  labelId: string,
  edit: SessionInput['edit']
) => edit?.kind === 'edge-label'
  && edit.edgeId === edgeId
  && edit.labelId === labelId

export const buildEdgeUiView = (input: {
  edgeId: EdgeId
  entry: GraphEdgeEntry
  view: EdgeView
  edit: SessionInput['edit']
  selection: SelectionState
}): EdgeUiView => {
  const labelIds = new Set<string>()

  input.entry.base.edge.labels?.forEach((label) => {
    labelIds.add(label.id)
  })
  input.view.route.labels.forEach((label) => {
    labelIds.add(label.labelId)
  })
  if (input.edit?.kind === 'edge-label' && input.edit.edgeId === input.edgeId) {
    labelIds.add(input.edit.labelId)
  }

  const labels = new Map<string, EdgeLabelUiView>()
  labelIds.forEach((labelId) => {
    const editing = isEditingEdgeLabel(input.edgeId, labelId, input.edit)
    labels.set(labelId, {
      editing,
      caret: editing && input.edit?.kind === 'edge-label'
        ? input.edit.caret
        : undefined
    })
  })

  return {
    selected: input.selection.edgeIds.includes(input.edgeId),
    patched: Boolean(input.entry.preview?.patch ?? input.entry.draft?.patch),
    activeRouteIndex: input.entry.preview?.activeRouteIndex ?? input.entry.draft?.activeRouteIndex,
    editingLabelId: input.edit?.kind === 'edge-label'
      && input.edit.edgeId === input.edgeId
      ? input.edit.labelId
      : undefined,
    labels
  }
}

export const buildChromeView = (input: {
  session: SessionInput
  selection: SelectionState
  hover: HoverState
}): ChromeView => {
  const overlays: ChromeOverlay[] = []

  if (input.hover.kind !== 'none') {
    overlays.push({
      kind: 'hover'
    })
  }

  if (
    input.selection.nodeIds.length > 0
    || input.selection.edgeIds.length > 0
  ) {
    overlays.push({
      kind: 'selection'
    })
  }

  if (input.session.preview.selection.guides.length > 0) {
    overlays.push({
      kind: 'guide'
    })
  }

  if (input.session.preview.selection.marquee) {
    overlays.push({
      kind: 'marquee'
    })
  }

  if (input.session.preview.draw) {
    overlays.push({
      kind: 'draw'
    })
  }

  if (input.session.edit) {
    overlays.push({
      kind: 'edit'
    })
  }

  if (
    input.session.preview.mindmap?.rootMove
    || input.session.preview.mindmap?.subtreeMove
  ) {
    overlays.push({
      kind: 'mindmap-drop'
    })
  }

  return {
    overlays,
    hover: input.hover,
    preview: {
      marquee: input.session.preview.selection.marquee,
      guides: input.session.preview.selection.guides,
      draw: input.session.preview.draw,
      mindmap: input.session.preview.mindmap
    },
    edit: input.session.edit
  }
}
