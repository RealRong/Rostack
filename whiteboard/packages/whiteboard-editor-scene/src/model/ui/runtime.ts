import type { Input } from '../../contracts/editor'
import type { WorkingState } from '../../contracts/working'
import { appendIds } from '../scope'

const readHoveredNodeId = (
  hover: WorkingState['ui']['chrome']['hover'] | WorkingState['runtime']['editor']['interaction']['hover']
): string | undefined => hover.kind === 'node'
  ? hover.nodeId
  : undefined

const readHoveredEdgeId = (
  hover: WorkingState['ui']['chrome']['hover'] | WorkingState['runtime']['editor']['interaction']['hover']
): string | undefined => hover.kind === 'edge'
  ? hover.edgeId
  : undefined

const readEditingEdgeId = (
  edit: WorkingState['runtime']['editor']['snapshot']['state']['edit'] | WorkingState['ui']['chrome']['edit']
): string | undefined => edit?.kind === 'edge-label'
  ? edit.edgeId
  : undefined

const readEditingNodeId = (
  edit: WorkingState['runtime']['editor']['snapshot']['state']['edit'] | WorkingState['ui']['chrome']['edit']
): string | undefined => edit?.kind === 'node'
  ? edit.nodeId
  : undefined

const collectSelectedNodeIds = (
  state: WorkingState
): ReadonlySet<string> => {
  const ids = new Set<string>()
  state.ui.nodes.forEach((view, nodeId) => {
    if (view.selected) {
      ids.add(nodeId)
    }
  })
  return ids
}

const collectSelectedEdgeIds = (
  state: WorkingState
): ReadonlySet<string> => {
  const ids = new Set<string>()
  state.ui.edges.forEach((view, edgeId) => {
    if (view.selected) {
      ids.add(edgeId)
    }
  })
  return ids
}

const hasSelection = (
  state: WorkingState
): boolean => {
  for (const view of state.ui.nodes.values()) {
    if (view.selected) {
      return true
    }
  }
  for (const view of state.ui.edges.values()) {
    if (view.selected) {
      return true
    }
  }
  return false
}

export interface UiRuntimeTouch {
  node: ReadonlySet<string>
  edge: ReadonlySet<string>
  chrome: boolean
}

export const collectUiRuntimeTouch = (input: {
  current: Input
  working: WorkingState
}): UiRuntimeTouch => {
  const node = new Set<string>()
  const edge = new Set<string>()

  appendIds(node, collectSelectedNodeIds(input.working))
  appendIds(edge, collectSelectedEdgeIds(input.working))
  appendIds(node, input.working.runtime.editor.interaction.selection.nodeIds)
  appendIds(edge, input.working.runtime.editor.interaction.selection.edgeIds)

  const chrome = hasSelection(input.working) !== (
    input.working.runtime.editor.interaction.selection.nodeIds.length > 0
    || input.working.runtime.editor.interaction.selection.edgeIds.length > 0
  )

  const previousNodeId = readHoveredNodeId(input.working.ui.chrome.hover)
  const nextNodeId = readHoveredNodeId(input.working.runtime.editor.interaction.hover)
  const previousEdgeId = readHoveredEdgeId(input.working.ui.chrome.hover)
  const nextEdgeId = readHoveredEdgeId(input.working.runtime.editor.interaction.hover)

  if (previousNodeId) {
    node.add(previousNodeId)
  }
  if (nextNodeId) {
    node.add(nextNodeId)
  }
  if (previousEdgeId) {
    edge.add(previousEdgeId)
  }
  if (nextEdgeId) {
    edge.add(nextEdgeId)
  }

  appendIds(
    node,
    input.working.ui.chrome.preview.draw?.hiddenNodeIds ?? []
  )
  appendIds(
    node,
    input.current.editor.snapshot.preview.draw?.hiddenNodeIds ?? []
  )

  const previousEditingNode = readEditingNodeId(input.working.ui.chrome.edit)
  const nextEditingNode = readEditingNodeId(input.current.editor.snapshot.state.edit)
  const previousEditingEdge = readEditingEdgeId(input.working.ui.chrome.edit)
  const nextEditingEdge = readEditingEdgeId(input.current.editor.snapshot.state.edit)

  if (previousEditingNode) {
    node.add(previousEditingNode)
  }
  if (nextEditingNode) {
    node.add(nextEditingNode)
  }
  if (previousEditingEdge) {
    edge.add(previousEditingEdge)
  }
  if (nextEditingEdge) {
    edge.add(nextEditingEdge)
  }

  return {
    node,
    edge,
    chrome
  }
}
