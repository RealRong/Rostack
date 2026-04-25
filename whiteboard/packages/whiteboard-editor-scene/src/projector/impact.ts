import {
  createPlan,
  type ProjectorScopeInputValue
} from '@shared/projector'
import { idDelta } from '@shared/projector/delta'
import type {
  EdgeId,
  GroupId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import type {
  EditorPhaseScopeMap,
  GraphDelta
} from '../contracts/delta'
import type {
  HoverState,
  Input,
  Snapshot
} from '../contracts/editor'

type EditorPhaseName = keyof EditorPhaseScopeMap & string

type GraphScopeInput =
  NonNullable<ProjectorScopeInputValue<EditorPhaseScopeMap['graph']>>

type UiScopeInput =
  NonNullable<ProjectorScopeInputValue<EditorPhaseScopeMap['ui']>>

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

const readGraphPlanScope = (
  input: Input
): GraphScopeInput => {
  if (input.delta.document.reset) {
    return {
      reset: true,
      order: true
    }
  }

  const { delta } = input
  const nodes = new Set<NodeId>()
  const edges = new Set<EdgeId>()
  const mindmaps = new Set<MindmapId>()
  const groups = new Set<GroupId>()

  appendIds(nodes, idDelta.touched(delta.document.nodes))
  appendIds(edges, idDelta.touched(delta.document.edges))
  appendIds(mindmaps, idDelta.touched(delta.document.mindmaps))
  appendIds(groups, idDelta.touched(delta.document.groups))

  appendIds(nodes, idDelta.touched(delta.graph.nodes.draft))
  appendIds(nodes, idDelta.touched(delta.graph.nodes.preview))
  appendIds(nodes, idDelta.touched(delta.graph.nodes.edit))
  appendIds(edges, idDelta.touched(delta.graph.edges.preview))
  appendIds(edges, idDelta.touched(delta.graph.edges.edit))
  appendIds(mindmaps, idDelta.touched(delta.graph.mindmaps.preview))
  appendIds(mindmaps, delta.graph.mindmaps.tick)

  appendIds(nodes, input.session.draft.nodes.keys())
  appendIds(edges, input.session.draft.edges.keys())
  appendIds(nodes, input.session.preview.nodes.keys())
  appendIds(edges, input.session.preview.edges.keys())

  if (input.session.edit?.kind === 'node') {
    nodes.add(input.session.edit.nodeId)
  }
  if (input.session.edit?.kind === 'edge-label') {
    edges.add(input.session.edit.edgeId)
  }

  if (input.session.preview.mindmap?.rootMove) {
    mindmaps.add(input.session.preview.mindmap.rootMove.mindmapId)
  }
  if (input.session.preview.mindmap?.subtreeMove) {
    mindmaps.add(input.session.preview.mindmap.subtreeMove.mindmapId)
  }
  input.session.preview.mindmap?.enter?.forEach((entry) => {
    mindmaps.add(entry.mindmapId)
  })

  return {
    order: delta.document.order,
    nodes,
    edges,
    mindmaps,
    groups
  }
}

const hasGraphPlanScope = (
  scope: GraphScopeInput
): boolean => Boolean(
  scope.reset
  || scope.order
  || (scope.nodes instanceof Set && scope.nodes.size > 0)
  || (scope.edges instanceof Set && scope.edges.size > 0)
  || (scope.mindmaps instanceof Set && scope.mindmaps.size > 0)
  || (scope.groups instanceof Set && scope.groups.size > 0)
)

export const readUiPlanScope = (input: {
  reset?: boolean
  input: Input
  previous: Snapshot
  graphDelta?: GraphDelta
  readMindmapNodeIds: (mindmapId: MindmapId) => readonly NodeId[] | undefined
}): UiScopeInput => {
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

  if (
    input.input.delta.graph.mindmaps.preview.added.size > 0
    || input.input.delta.graph.mindmaps.preview.updated.size > 0
    || input.input.delta.graph.mindmaps.preview.removed.size > 0
  ) {
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

  return {
    reset: input.reset,
    chrome,
    nodes,
    edges
  }
}

export const planEditorGraphPhases = (input: {
  input: Input
  previous: Snapshot
}) => {
  const bootstrap = input.previous.revision === 0
  const graphScope = bootstrap
    ? {
        reset: true,
        order: true
      }
    : readGraphPlanScope(input.input)

  if (bootstrap || hasGraphPlanScope(graphScope)) {
    return createPlan<EditorPhaseName, EditorPhaseScopeMap>({
      phases: ['graph'],
      scope: {
        graph: graphScope
      }
    })
  }

  return createPlan<EditorPhaseName, EditorPhaseScopeMap>({
    scope: {
      ui: readUiPlanScope({
        input: input.input,
        previous: input.previous,
        readMindmapNodeIds: (mindmapId) => (
          readSnapshotMindmapNodeIds(input.previous, mindmapId)
        )
      })
    }
  })
}
