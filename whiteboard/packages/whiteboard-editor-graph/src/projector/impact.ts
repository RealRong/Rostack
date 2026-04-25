import { createPlan } from '@shared/projector'
import {
  idDelta,
  keySet,
  type KeySet
} from '@shared/projector/delta'
import type {
  EdgeId,
  GroupId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import type {
  EditorPhaseScopeMap,
  GraphDelta,
  GraphPatchScope,
  SpatialPatchScope,
  UiPatchScope
} from '../contracts/delta'
import type {
  HoverState,
  Input,
  Snapshot
} from '../contracts/editor'

type EditorPhaseName = keyof EditorPhaseScopeMap & string

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
  readNodeIds: (mindmapId: MindmapId) => readonly NodeId[] | undefined
}) => {
  for (const mindmapId of input.mindmapIds) {
    input.readNodeIds(mindmapId)?.forEach((nodeId) => {
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

const readSnapshotMindmapNodeIds = (
  snapshot: Snapshot,
  mindmapId: MindmapId
): readonly NodeId[] | undefined => snapshot.graph.owners.mindmaps.byId.get(mindmapId)?.structure.nodeIds

const createGraphPlannerScope = (
  input: Input
): GraphPatchScope => {
  const scope = createGraphPatchScope()
  const { delta } = input

  if (delta.document.reset) {
    return createGraphPatchScope({
      reset: true,
      order: true
    })
  }

  scope.order = delta.document.order

  scope.nodes = keySet.addMany(scope.nodes, idDelta.touched(delta.document.nodes))
  scope.edges = keySet.addMany(scope.edges, idDelta.touched(delta.document.edges))
  scope.mindmaps = keySet.addMany(scope.mindmaps, idDelta.touched(delta.document.mindmaps))
  scope.groups = keySet.addMany(scope.groups, idDelta.touched(delta.document.groups))

  scope.nodes = keySet.addMany(scope.nodes, idDelta.touched(delta.graph.nodes.draft))
  scope.nodes = keySet.addMany(scope.nodes, idDelta.touched(delta.graph.nodes.preview))
  scope.nodes = keySet.addMany(scope.nodes, idDelta.touched(delta.graph.nodes.edit))
  scope.edges = keySet.addMany(scope.edges, idDelta.touched(delta.graph.edges.preview))
  scope.edges = keySet.addMany(scope.edges, idDelta.touched(delta.graph.edges.edit))
  scope.mindmaps = keySet.addMany(scope.mindmaps, idDelta.touched(delta.graph.mindmaps.preview))
  delta.graph.mindmaps.tick.forEach((mindmapId) => {
    scope.mindmaps = keySet.add(scope.mindmaps, mindmapId)
  })

  scope.nodes = keySet.addMany(scope.nodes, input.session.draft.nodes.keys())
  scope.edges = keySet.addMany(scope.edges, input.session.draft.edges.keys())
  scope.nodes = keySet.addMany(scope.nodes, input.session.preview.nodes.keys())
  scope.edges = keySet.addMany(scope.edges, input.session.preview.edges.keys())

  if (input.session.edit?.kind === 'node') {
    scope.nodes = keySet.add(scope.nodes, input.session.edit.nodeId)
  }
  if (input.session.edit?.kind === 'edge-label') {
    scope.edges = keySet.add(scope.edges, input.session.edit.edgeId)
  }

  if (input.session.preview.mindmap?.rootMove) {
    scope.mindmaps = keySet.add(
      scope.mindmaps,
      input.session.preview.mindmap.rootMove.mindmapId
    )
  }
  if (input.session.preview.mindmap?.subtreeMove) {
    scope.mindmaps = keySet.add(
      scope.mindmaps,
      input.session.preview.mindmap.subtreeMove.mindmapId
    )
  }
  input.session.preview.mindmap?.enter?.forEach((entry) => {
    scope.mindmaps = keySet.add(scope.mindmaps, entry.mindmapId)
  })

  return scope
}

export const createGraphPatchScope = (
  input: Partial<{
    reset: boolean
    order: boolean
    nodes: ScopeKeys<NodeId>
    edges: ScopeKeys<EdgeId>
    mindmaps: ScopeKeys<MindmapId>
    groups: ScopeKeys<GroupId>
  }> = {}
): GraphPatchScope => ({
  reset: input.reset ?? false,
  order: input.order ?? false,
  nodes: cloneScopeKeys(input.nodes),
  edges: cloneScopeKeys(input.edges),
  mindmaps: cloneScopeKeys(input.mindmaps),
  groups: cloneScopeKeys(input.groups)
})

export const normalizeGraphPatchScope = (
  scope: GraphPatchScope | undefined
): GraphPatchScope => createGraphPatchScope(scope)

export const mergeGraphPatchScope = (
  current: GraphPatchScope | undefined,
  next: GraphPatchScope
): GraphPatchScope => createGraphPatchScope({
  reset: (current?.reset ?? false) || next.reset,
  order: (current?.order ?? false) || next.order,
  nodes: keySet.union(current?.nodes ?? keySet.none<NodeId>(), next.nodes),
  edges: keySet.union(current?.edges ?? keySet.none<EdgeId>(), next.edges),
  mindmaps: keySet.union(current?.mindmaps ?? keySet.none<MindmapId>(), next.mindmaps),
  groups: keySet.union(current?.groups ?? keySet.none<GroupId>(), next.groups)
})

export const hasGraphPatchScope = (
  scope: GraphPatchScope | undefined
): boolean => Boolean(
  scope?.reset
  || scope?.order
  || (scope && !keySet.isEmpty(scope.nodes))
  || (scope && !keySet.isEmpty(scope.edges))
  || (scope && !keySet.isEmpty(scope.mindmaps))
  || (scope && !keySet.isEmpty(scope.groups))
)

export const readGraphPatchScopeKeys = <TId extends string>(
  keys: KeySet<TId>
): ReadonlySet<TId> => {
  if (keys.kind === 'none') {
    return EMPTY_SCOPE_KEYS as ReadonlySet<TId>
  }
  if (keys.kind === 'all') {
    throw new Error('GraphPatchScope key sets must not be all; use reset instead.')
  }
  return keys.keys
}

export const createSpatialPatchScope = (
  input: Partial<SpatialPatchScope> = {}
): SpatialPatchScope => ({
  reset: input.reset ?? false,
  graph: input.graph ?? false
})

export const normalizeSpatialPatchScope = (
  scope: SpatialPatchScope | undefined
): SpatialPatchScope => createSpatialPatchScope(scope)

export const mergeSpatialPatchScope = (
  current: SpatialPatchScope | undefined,
  next: SpatialPatchScope
): SpatialPatchScope => createSpatialPatchScope({
  reset: (current?.reset ?? false) || next.reset,
  graph: (current?.graph ?? false) || next.graph
})

export const hasSpatialPatchScope = (
  scope: SpatialPatchScope | undefined
): boolean => Boolean(
  scope?.reset
  || scope?.graph
)

export const createUiPatchScope = (input: {
  reset?: boolean
  input: Input
  previous: Snapshot
  graphDelta?: GraphDelta
  readMindmapNodeIds: (mindmapId: MindmapId) => readonly NodeId[] | undefined
}): UiPatchScope => {
  const nodes = new Set<NodeId>()
  const edges = new Set<EdgeId>()
  let chrome = false

  if (input.graphDelta) {
    appendIds(nodes, idDelta.touched(input.graphDelta.entities.nodes))
    appendIds(edges, idDelta.touched(input.graphDelta.entities.edges))
    appendMindmapNodeIds({
      target: nodes,
      mindmapIds: idDelta.touched(input.graphDelta.entities.mindmaps),
      readNodeIds: input.readMindmapNodeIds
    })
  }

  appendIds(nodes, idDelta.touched(input.input.delta.graph.nodes.draft))
  appendIds(nodes, idDelta.touched(input.input.delta.graph.nodes.preview))
  appendIds(nodes, idDelta.touched(input.input.delta.graph.nodes.edit))
  appendIds(edges, idDelta.touched(input.input.delta.graph.edges.preview))
  appendIds(edges, idDelta.touched(input.input.delta.graph.edges.edit))

  appendMindmapNodeIds({
    target: nodes,
    mindmapIds: idDelta.touched(input.input.delta.graph.mindmaps.preview),
    readNodeIds: input.readMindmapNodeIds
  })
  appendMindmapNodeIds({
    target: nodes,
    mindmapIds: input.input.delta.graph.mindmaps.tick,
    readNodeIds: input.readMindmapNodeIds
  })

  if (input.input.delta.graph.mindmaps.preview.added.size > 0
    || input.input.delta.graph.mindmaps.preview.updated.size > 0
    || input.input.delta.graph.mindmaps.preview.removed.size > 0) {
    chrome = true
  }

  if (input.input.delta.ui.selection) {
    appendIds(nodes, collectSelectedNodeIds(input.previous))
    appendIds(edges, collectSelectedEdgeIds(input.previous))
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

export const planEditorGraphPhases = (input: {
  input: Input
  previous: Snapshot
}) => {
  const bootstrap = input.previous.revision === 0
  const graphScope = bootstrap
    ? createGraphPatchScope({
        reset: true,
        order: true
      })
    : createGraphPlannerScope(input.input)

  if (hasGraphPatchScope(graphScope)) {
    return createPlan<EditorPhaseName, EditorPhaseScopeMap>({
      phases: ['graph'],
      scope: {
        graph: graphScope
      }
    })
  }

  const uiScope = createUiPatchScope({
    input: input.input,
    previous: input.previous,
    readMindmapNodeIds: (mindmapId) => readSnapshotMindmapNodeIds(input.previous, mindmapId)
  })

  return hasUiPatchScope(uiScope)
    ? createPlan<EditorPhaseName, EditorPhaseScopeMap>({
        scope: {
          ui: uiScope
        }
      })
    : createPlan<EditorPhaseName, EditorPhaseScopeMap>()
}
