import type {
  EdgeId,
  NodeId
} from '@whiteboard/core/types'
import type { Input } from '../../contracts/editor'
import type { WorkingState } from '../../contracts/working'
import { appendIds } from '../scope'

const readHoveredNodeId = (
  hover: WorkingState['ui']['chrome']['hover'] | Input['runtime']['editor']['interaction']['hover']
): NodeId | undefined => hover.kind === 'node'
  ? hover.nodeId
  : undefined

const readHoveredEdgeId = (
  hover: WorkingState['ui']['chrome']['hover'] | Input['runtime']['editor']['interaction']['hover']
): EdgeId | undefined => hover.kind === 'edge'
  ? hover.edgeId
  : undefined

const readEditingEdgeId = (
  edit: Input['runtime']['editor']['state']['edit'] | WorkingState['ui']['chrome']['edit']
): EdgeId | undefined => edit?.kind === 'edge-label'
  ? edit.edgeId
  : undefined

const readEditingNodeId = (
  edit: Input['runtime']['editor']['state']['edit'] | WorkingState['ui']['chrome']['edit']
): NodeId | undefined => edit?.kind === 'node'
  ? edit.nodeId
  : undefined

const collectSelectedNodeIds = (
  state: WorkingState
): ReadonlySet<NodeId> => {
  const ids = new Set<NodeId>()
  state.ui.nodes.forEach((view, nodeId) => {
    if (view.selected) {
      ids.add(nodeId)
    }
  })
  return ids
}

const collectSelectedEdgeIds = (
  state: WorkingState
): ReadonlySet<EdgeId> => {
  const ids = new Set<EdgeId>()
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
  node: ReadonlySet<NodeId>
  edge: ReadonlySet<EdgeId>
  chrome: boolean
}

export const collectUiRuntimeTouch = (input: {
  current: Input
  working: WorkingState
}): UiRuntimeTouch => {
  const node = new Set<NodeId>()
  const edge = new Set<EdgeId>()

  appendIds(node, collectSelectedNodeIds(input.working))
  appendIds(edge, collectSelectedEdgeIds(input.working))
  appendIds(node, input.current.runtime.editor.interaction.selection.nodeIds)
  appendIds(edge, input.current.runtime.editor.interaction.selection.edgeIds)

  const chrome = hasSelection(input.working) !== (
    input.current.runtime.editor.interaction.selection.nodeIds.length > 0
    || input.current.runtime.editor.interaction.selection.edgeIds.length > 0
  )

  const previousNodeId = readHoveredNodeId(input.working.ui.chrome.hover)
  const nextNodeId = readHoveredNodeId(input.current.runtime.editor.interaction.hover)
  const previousEdgeId = readHoveredEdgeId(input.working.ui.chrome.hover)
  const nextEdgeId = readHoveredEdgeId(input.current.runtime.editor.interaction.hover)

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
    input.current.runtime.editor.state.preview.draw?.hiddenNodeIds ?? []
  )

  const previousEditingNode = readEditingNodeId(input.working.ui.chrome.edit)
  const nextEditingNode = readEditingNodeId(input.current.runtime.editor.state.edit)
  const previousEditingEdge = readEditingEdgeId(input.working.ui.chrome.edit)
  const nextEditingEdge = readEditingEdgeId(input.current.runtime.editor.state.edit)

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
