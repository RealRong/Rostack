import { idDelta } from '@shared/projector'
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
  buildNodeUiView
} from '../runtime/ui'
import {
  resetUiPublishDelta
} from '../runtime/publish/delta'
import type { UiEditorPhase } from './shared'
import { toMetric } from './shared'

const appendIds = <TId extends string>(
  target: Set<TId>,
  ids: Iterable<TId>
) => {
  for (const id of ids) {
    target.add(id)
  }
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
  previous: {
    nodes: ReadonlyMap<NodeId, {
      selected: boolean
    }>
    edges: ReadonlyMap<EdgeId, {
      selected: boolean
    }>
  }
  next: SelectionState
}) => {
  input.previous.nodes.forEach((view, nodeId) => {
    if (view.selected) {
      idDelta.update(input.target.nodes, nodeId)
    }
  })
  input.previous.edges.forEach((view, edgeId) => {
    if (view.selected) {
      idDelta.update(input.target.edges, edgeId)
    }
  })

  input.next.nodeIds.forEach((nodeId) => {
    idDelta.update(input.target.nodes, nodeId)
  })
  input.next.edgeIds.forEach((edgeId) => {
    idDelta.update(input.target.edges, edgeId)
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
    const selection = context.input.interaction.selection

    resetUiPublishDelta(publishDelta)

    const nodes = new Map()
    context.working.graph.nodes.forEach((view, nodeId) => {
      nodes.set(nodeId, buildNodeUiView({
        nodeId,
        draft: context.input.session.draft.nodes.get(nodeId),
        preview: context.input.session.preview.nodes.get(nodeId),
        draw: context.input.session.preview.draw,
        edit: context.input.session.edit,
        selection,
        hover: context.input.interaction.hover
      }))
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
        selection
      }))
    })

    context.working.ui = {
      chrome: buildChromeView({
        session: context.input.session,
        selection,
        hover: context.input.interaction.hover
      }),
      nodes,
      edges
    }

    if (graphDelta) {
      graphDelta.entities.nodes.added.forEach((nodeId) => {
        idDelta.add(publishDelta.nodes, nodeId)
      })
      graphDelta.entities.nodes.updated.forEach((nodeId) => {
        idDelta.update(publishDelta.nodes, nodeId)
      })
      graphDelta.entities.nodes.removed.forEach((nodeId) => {
        idDelta.remove(publishDelta.nodes, nodeId)
      })

      graphDelta.entities.edges.added.forEach((edgeId) => {
        idDelta.add(publishDelta.edges, edgeId)
      })
      graphDelta.entities.edges.updated.forEach((edgeId) => {
        idDelta.update(publishDelta.edges, edgeId)
      })
      graphDelta.entities.edges.removed.forEach((edgeId) => {
        idDelta.remove(publishDelta.edges, edgeId)
      })

      const touchedMindmaps = idDelta.touched(graphDelta.entities.mindmaps)
      touchedMindmaps.forEach((mindmapId) => {
        mindmapNodeIndex.get(mindmapId)?.forEach((nodeId) => {
          idDelta.update(publishDelta.nodes, nodeId)
        })
      })
    }

    if (context.input.delta.ui.selection) {
      markSelectionUiDelta({
        target: publishDelta,
        previous: {
          nodes: context.previous.ui.nodes.byId,
          edges: context.previous.ui.edges.byId
        },
        next: selection
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
      publishDelta.chrome = true
    }

    if (context.input.delta.ui.hover) {
      const previousNodeId = readHoveredNodeId(context.previous.ui.chrome.hover)
      const nextNodeId = readHoveredNodeId(context.input.interaction.hover)

      if (previousNodeId) {
        idDelta.update(publishDelta.nodes, previousNodeId)
      }
      if (nextNodeId) {
        idDelta.update(publishDelta.nodes, nextNodeId)
      }
    }

    const touchedNodeUiIds = new Set<NodeId>()
    const touchedPreviewMindmaps = new Set<MindmapId>()
    appendIds(touchedNodeUiIds, idDelta.touched(context.input.delta.graph.nodes.draft))
    appendIds(touchedNodeUiIds, idDelta.touched(context.input.delta.graph.nodes.preview))
    appendIds(touchedNodeUiIds, idDelta.touched(context.input.delta.graph.nodes.edit))
    appendIds(touchedPreviewMindmaps, idDelta.touched(context.input.delta.graph.mindmaps.preview))
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
      idDelta.update(publishDelta.nodes, nodeId)
    })

    const touchedEdgeUiIds = new Set<EdgeId>()
    appendIds(touchedEdgeUiIds, idDelta.touched(context.input.delta.graph.edges.preview))
    appendIds(touchedEdgeUiIds, idDelta.touched(context.input.delta.graph.edges.edit))
    touchedEdgeUiIds.forEach((edgeId) => {
      idDelta.update(publishDelta.edges, edgeId)
    })

    return {
      action: 'sync',
      change: undefined,
      metrics: toMetric(
        selection.nodeIds.length
        + selection.edgeIds.length
        + context.working.ui.chrome.overlays.length
        + nodes.size
        + edges.size
      )
    }
  }
})
