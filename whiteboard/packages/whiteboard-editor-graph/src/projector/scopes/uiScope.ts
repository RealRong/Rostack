import {
  idDelta,
  keySet,
  type KeySet
} from '@shared/projector/delta'
import type {
  EdgeId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import type {
  GraphDelta,
  UiPatchScope
} from '../../contracts/delta'
import type {
  HoverState,
  Input,
  Snapshot
} from '../../contracts/editor'
import type { WorkingState } from '../../contracts/working'

type ScopeKeys<TId extends string> =
  | Iterable<TId>
  | KeySet<TId>

const EMPTY_SCOPE_KEYS = new Set<never>()

const cloneScopeKeys = <TId extends string>(
  keys?: ScopeKeys<TId>
): KeySet<TId> => {
  if (!keys) {
    return keySet.none<TId>()
  }

  if (
    typeof keys === 'object'
    && keys !== null
    && 'kind' in keys
  ) {
    return keySet.clone(keys as KeySet<TId>)
  }

  return keySet.some(keys as Iterable<TId>)
}

const appendIds = <TId extends string>(
  target: Set<TId>,
  ids: Iterable<TId>
) => {
  for (const id of ids) {
    target.add(id)
  }
}

const appendMindmapNodeIds = (input: {
  target: Set<NodeId>
  mindmapIds: Iterable<MindmapId>
  nodesByMindmap: ReadonlyMap<MindmapId, readonly NodeId[]>
}) => {
  for (const mindmapId of input.mindmapIds) {
    input.nodesByMindmap.get(mindmapId)?.forEach((nodeId) => {
      input.target.add(nodeId)
    })
  }
}

const readHoveredNodeId = (
  hover: HoverState
): NodeId | undefined => hover.kind === 'node'
  ? hover.nodeId
  : undefined

const collectSelectedNodeIds = (
  snapshot: Snapshot
): ReadonlySet<NodeId> => {
  const ids = new Set<NodeId>()
  snapshot.ui.nodes.byId.forEach((view, nodeId) => {
    if (view.selected) {
      ids.add(nodeId)
    }
  })
  return ids
}

const collectSelectedEdgeIds = (
  snapshot: Snapshot
): ReadonlySet<EdgeId> => {
  const ids = new Set<EdgeId>()
  snapshot.ui.edges.byId.forEach((view, edgeId) => {
    if (view.selected) {
      ids.add(edgeId)
    }
  })
  return ids
}

const hasSelection = (
  snapshot: Snapshot
): boolean => {
  for (const view of snapshot.ui.nodes.byId.values()) {
    if (view.selected) {
      return true
    }
  }
  for (const view of snapshot.ui.edges.byId.values()) {
    if (view.selected) {
      return true
    }
  }
  return false
}

export const createUiPatchScope = (
  input: {
    reset?: boolean
    input: Input
    previous: Snapshot
    graphDelta?: GraphDelta
    mindmapNodeIndex: ReadonlyMap<MindmapId, readonly NodeId[]>
  }
): UiPatchScope => {
  const nodes = new Set<NodeId>()
  const edges = new Set<EdgeId>()
  let chrome = false

  if (input.graphDelta) {
    appendIds(nodes, idDelta.touched(input.graphDelta.entities.nodes))
    appendIds(edges, idDelta.touched(input.graphDelta.entities.edges))
    appendMindmapNodeIds({
      target: nodes,
      mindmapIds: idDelta.touched(input.graphDelta.entities.mindmaps),
      nodesByMindmap: input.mindmapNodeIndex
    })
  }

  appendIds(nodes, idDelta.touched(input.input.delta.graph.nodes.draft))
  appendIds(nodes, idDelta.touched(input.input.delta.graph.nodes.preview))
  appendIds(nodes, idDelta.touched(input.input.delta.graph.nodes.edit))
  appendIds(edges, idDelta.touched(input.input.delta.graph.edges.preview))
  appendIds(edges, idDelta.touched(input.input.delta.graph.edges.edit))

  const touchedPreviewMindmaps = idDelta.touched(
    input.input.delta.graph.mindmaps.preview
  )
  appendMindmapNodeIds({
    target: nodes,
    mindmapIds: touchedPreviewMindmaps,
    nodesByMindmap: input.mindmapNodeIndex
  })
  appendMindmapNodeIds({
    target: nodes,
    mindmapIds: input.input.delta.graph.mindmaps.tick,
    nodesByMindmap: input.mindmapNodeIndex
  })

  if (input.input.delta.graph.mindmaps.preview.added.size > 0
    || input.input.delta.graph.mindmaps.preview.updated.size > 0
    || input.input.delta.graph.mindmaps.preview.removed.size > 0) {
    chrome = true
  }

  if (input.input.delta.ui.selection) {
    const previousSelectedNodeIds = collectSelectedNodeIds(input.previous)
    const previousSelectedEdgeIds = collectSelectedEdgeIds(input.previous)
    appendIds(nodes, previousSelectedNodeIds)
    appendIds(edges, previousSelectedEdgeIds)
    appendIds(nodes, input.input.interaction.selection.nodeIds)
    appendIds(edges, input.input.interaction.selection.edgeIds)

    chrome = chrome || (
      hasSelection(input.previous)
      !== (
        input.input.interaction.selection.nodeIds.length > 0
        || input.input.interaction.selection.edgeIds.length > 0
      )
    )
  }

  if (input.input.delta.ui.hover) {
    chrome = true

    const previousNodeId = readHoveredNodeId(input.previous.ui.chrome.hover)
    const nextNodeId = readHoveredNodeId(input.input.interaction.hover)

    if (previousNodeId) {
      nodes.add(previousNodeId)
    }
    if (nextNodeId) {
      nodes.add(nextNodeId)
    }
  }

  if (input.input.delta.ui.marquee) {
    chrome = true
  }
  if (input.input.delta.ui.guides) {
    chrome = true
  }
  if (input.input.delta.ui.draw) {
    chrome = true
    appendIds(
      nodes,
      input.previous.ui.chrome.preview.draw?.hiddenNodeIds ?? []
    )
    appendIds(
      nodes,
      input.input.session.preview.draw?.hiddenNodeIds ?? []
    )
  }
  if (input.input.delta.ui.edit) {
    chrome = true
  }

  return createUiPatchScopeState({
    reset: input.reset ?? false,
    chrome,
    nodes,
    edges
  })
}

export const createMindmapNodeIndexFromSnapshot = (
  snapshot: Snapshot
): ReadonlyMap<MindmapId, readonly NodeId[]> => {
  const index = new Map<MindmapId, readonly NodeId[]>()

  snapshot.graph.owners.mindmaps.byId.forEach((view, mindmapId) => {
    index.set(mindmapId, view.structure.nodeIds)
  })

  return index
}

export const createMindmapNodeIndexFromState = (
  input: {
    previous: Snapshot
    working: WorkingState
  }
): ReadonlyMap<MindmapId, readonly NodeId[]> => {
  const index = new Map<MindmapId, readonly NodeId[]>()

  input.previous.graph.owners.mindmaps.byId.forEach((view, mindmapId) => {
    index.set(mindmapId, view.structure.nodeIds)
  })
  input.working.graph.owners.mindmaps.forEach((view, mindmapId) => {
    index.set(mindmapId, view.structure.nodeIds)
  })

  return index
}

export const createUiPatchScopeState = (
  input: Partial<{
    reset: boolean
    chrome: boolean
    nodes: ScopeKeys<NodeId>
    edges: ScopeKeys<EdgeId>
  }> = {}
): UiPatchScope => ({
  reset: input.reset ?? false,
  chrome: input.chrome ?? false,
  nodes: cloneScopeKeys(input.nodes),
  edges: cloneScopeKeys(input.edges)
})

export const normalizeUiPatchScope = (
  scope: UiPatchScope | undefined
): UiPatchScope => createUiPatchScopeState(scope)

export const mergeUiPatchScope = (
  current: UiPatchScope | undefined,
  next: UiPatchScope
): UiPatchScope => createUiPatchScopeState({
  reset: (current?.reset ?? false) || next.reset,
  chrome: (current?.chrome ?? false) || next.chrome,
  nodes: keySet.union(current?.nodes ?? keySet.none<NodeId>(), next.nodes),
  edges: keySet.union(current?.edges ?? keySet.none<EdgeId>(), next.edges)
})

export const hasUiPatchScope = (
  scope: UiPatchScope | undefined
): boolean => Boolean(
  scope?.reset
  || scope?.chrome
  || (scope && !keySet.isEmpty(scope.nodes))
  || (scope && !keySet.isEmpty(scope.edges))
)

export const readUiPatchScopeKeys = <TId extends string>(
  keys: KeySet<TId>
): ReadonlySet<TId> => {
  if (keys.kind === 'none') {
    return EMPTY_SCOPE_KEYS as ReadonlySet<TId>
  }
  if (keys.kind === 'all') {
    throw new Error('UiPatchScope key sets must not be all; use reset instead.')
  }
  return keys.keys
}
