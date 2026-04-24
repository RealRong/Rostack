import type {
  EdgeId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import type {
  HoverState,
  SelectionState
} from '../contracts/editor'
import type { UiPublishDelta } from '../contracts/delta'
import {
  buildEdgeUiView,
  buildChromeView,
  buildNodeUiView,
  buildSelectionView
} from '../runtime/ui'
import {
  markUiChromeChanged,
  markUiEdgeAdded,
  markUiEdgeRemoved,
  markUiEdgeUpdated,
  markUiNodeAdded,
  markUiNodeRemoved,
  markUiNodeUpdated,
  markUiSelectionChanged,
  resetUiPublishDelta
} from '../runtime/publish/delta'
import type { UiEditorPhase } from './shared'
import { toMetric } from './shared'

const appendIdDelta = <TId extends string>(
  target: Set<TId>,
  delta: {
    added: ReadonlySet<TId>
    updated: ReadonlySet<TId>
    removed: ReadonlySet<TId>
  }
) => {
  delta.added.forEach((id) => {
    target.add(id)
  })
  delta.updated.forEach((id) => {
    target.add(id)
  })
  delta.removed.forEach((id) => {
    target.add(id)
  })
}

const appendIds = <TId extends string>(
  target: Set<TId>,
  ids: readonly TId[]
) => {
  ids.forEach((id) => {
    target.add(id)
  })
}

const readHoveredNodeId = (
  hover: HoverState
): NodeId | undefined => hover.kind === 'node'
  ? hover.nodeId
  : undefined

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

const createMindmapNodeIndex = (
  context: Parameters<UiEditorPhase['run']>[0]
): ReadonlyMap<MindmapId, readonly NodeId[]> => {
  const index = new Map<MindmapId, readonly NodeId[]>()

  context.previous.graph.owners.mindmaps.byId.forEach((view, mindmapId) => {
    index.set(mindmapId, view.structure.nodeIds)
  })
  context.working.graph.owners.mindmaps.forEach((view, mindmapId) => {
    index.set(mindmapId, view.structure.nodeIds)
  })

  return index
}

const markSelectionUiDelta = (input: {
  target: UiPublishDelta
  previous: SelectionState
  next: SelectionState
}) => {
  markUiSelectionChanged(input.target)

  input.previous.nodeIds.forEach((nodeId) => {
    markUiNodeUpdated(input.target, nodeId)
  })
  input.next.nodeIds.forEach((nodeId) => {
    markUiNodeUpdated(input.target, nodeId)
  })
  input.previous.edgeIds.forEach((edgeId) => {
    markUiEdgeUpdated(input.target, edgeId)
  })
  input.next.edgeIds.forEach((edgeId) => {
    markUiEdgeUpdated(input.target, edgeId)
  })
}

export const createUiPhase = (): UiEditorPhase => ({
  name: 'ui',
  deps: ['graph'],
  run: (context) => {
    const currentRevision = context.previous.revision + 1
    const publishDelta = context.working.delta.publish.ui
    const graphDelta = context.working.delta.graph.revision === currentRevision
      ? context.working.delta.graph
      : undefined
    const mindmapNodeIndex = createMindmapNodeIndex(context)

    resetUiPublishDelta(publishDelta)

    const nodes = new Map()
    context.working.graph.nodes.forEach((view, nodeId) => {
      nodes.set(nodeId, buildNodeUiView({
        nodeId,
        draft: context.input.session.draft.nodes.get(nodeId),
        preview: context.input.session.preview.nodes.get(nodeId),
        draw: context.input.session.preview.draw,
        edit: context.input.session.edit,
        selection: context.input.interaction.selection,
        hover: context.input.interaction.hover
      }))
    })

    const selection = buildSelectionView({
      selection: context.input.interaction.selection,
      nodes: context.working.graph.nodes,
      edges: context.working.graph.edges
    })

    const edges = new Map()
    context.working.graph.edges.forEach((view, edgeId) => {
      edges.set(edgeId, buildEdgeUiView({
        edgeId,
        entry: {
          base: {
            edge: view.base.edge,
            nodes: view.base.nodes
          },
          draft: context.input.session.draft.edges.get(edgeId),
          preview: context.input.session.preview.edges.get(edgeId)
        },
        view,
        edit: context.input.session.edit,
        selection: context.input.interaction.selection
      }))
    })

    context.working.ui = {
      selection,
      chrome: buildChromeView({
        session: context.input.session,
        selection: selection.target,
        hover: context.input.interaction.hover
      }),
      nodes,
      edges
    }

    if (graphDelta) {
      graphDelta.entities.nodes.added.forEach((nodeId) => {
        markUiNodeAdded(publishDelta, nodeId)
      })
      graphDelta.entities.nodes.updated.forEach((nodeId) => {
        markUiNodeUpdated(publishDelta, nodeId)
      })
      graphDelta.entities.nodes.removed.forEach((nodeId) => {
        markUiNodeRemoved(publishDelta, nodeId)
      })

      graphDelta.entities.edges.added.forEach((edgeId) => {
        markUiEdgeAdded(publishDelta, edgeId)
      })
      graphDelta.entities.edges.updated.forEach((edgeId) => {
        markUiEdgeUpdated(publishDelta, edgeId)
      })
      graphDelta.entities.edges.removed.forEach((edgeId) => {
        markUiEdgeRemoved(publishDelta, edgeId)
      })

      const touchedMindmaps = new Set<MindmapId>()
      appendIdDelta(touchedMindmaps, graphDelta.entities.mindmaps)
      touchedMindmaps.forEach((mindmapId) => {
        mindmapNodeIndex.get(mindmapId)?.forEach((nodeId) => {
          markUiNodeUpdated(publishDelta, nodeId)
        })
      })
    }

    if (context.input.delta.ui.selection) {
      markSelectionUiDelta({
        target: publishDelta,
        previous: context.previous.ui.selection.target,
        next: context.input.interaction.selection
      })
    }

    if (
      context.input.delta.ui.selection
      || context.input.delta.ui.tool
      || context.input.delta.ui.hover
      || context.input.delta.ui.marquee
      || context.input.delta.ui.guides
      || context.input.delta.ui.draw
      || context.input.delta.ui.edit
    ) {
      markUiChromeChanged(publishDelta)
    }

    if (context.input.delta.ui.hover) {
      const previousNodeId = readHoveredNodeId(context.previous.ui.chrome.hover)
      const nextNodeId = readHoveredNodeId(context.input.interaction.hover)

      if (previousNodeId) {
        markUiNodeUpdated(publishDelta, previousNodeId)
      }
      if (nextNodeId) {
        markUiNodeUpdated(publishDelta, nextNodeId)
      }
    }

    const touchedNodeUiIds = new Set<NodeId>()
    const touchedPreviewMindmaps = new Set<MindmapId>()
    appendIdDelta(touchedNodeUiIds, context.input.delta.graph.nodes.draft)
    appendIdDelta(touchedNodeUiIds, context.input.delta.graph.nodes.preview)
    appendIdDelta(touchedNodeUiIds, context.input.delta.graph.nodes.edit)
    appendIdDelta(touchedPreviewMindmaps, context.input.delta.graph.mindmaps.preview)
    appendMindmapNodeIds({
      target: touchedNodeUiIds,
      mindmapIds: touchedPreviewMindmaps,
      nodesByMindmap: mindmapNodeIndex
    })
    appendMindmapNodeIds({
      target: touchedNodeUiIds,
      mindmapIds: context.input.delta.graph.mindmaps.tick,
      nodesByMindmap: mindmapNodeIndex
    })

    if (context.input.delta.ui.draw) {
      appendIds(
        touchedNodeUiIds,
        context.previous.ui.chrome.preview.draw?.hiddenNodeIds ?? []
      )
      appendIds(
        touchedNodeUiIds,
        context.input.session.preview.draw?.hiddenNodeIds ?? []
      )
    }

    touchedNodeUiIds.forEach((nodeId) => {
      markUiNodeUpdated(publishDelta, nodeId)
    })

    const touchedEdgeUiIds = new Set<EdgeId>()
    appendIdDelta(touchedEdgeUiIds, context.input.delta.graph.edges.preview)
    appendIdDelta(touchedEdgeUiIds, context.input.delta.graph.edges.edit)
    touchedEdgeUiIds.forEach((edgeId) => {
      markUiEdgeUpdated(publishDelta, edgeId)
    })

    return {
      action: 'sync',
      change: undefined,
      metrics: toMetric(
        selection.target.nodeIds.length
        + selection.target.edgeIds.length
        + context.working.ui.chrome.overlays.length
        + nodes.size
        + edges.size
      )
    }
  }
})
