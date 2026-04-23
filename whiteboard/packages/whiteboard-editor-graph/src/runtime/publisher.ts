import {
  createFlags,
  publishFamily,
  publishValue,
  type RuntimePublisher
} from '@shared/projection-runtime'
import type {
  Change,
  EdgeUiView,
  EdgeView,
  GraphSnapshot,
  GroupView,
  MindmapView,
  NodeUiView,
  NodeView,
  Snapshot
} from '../contracts/editor'
import type { WorkingState } from '../contracts/working'
import {
  isChromeViewEqual,
  isEdgeUiViewEqual,
  isEdgeViewEqual,
  isGroupViewEqual,
  isMindmapViewEqual,
  isNodeUiViewEqual,
  isNodeViewEqual,
  isSceneSnapshotEqual,
  isSelectionViewEqual
} from './equality'

const publishEntry = <TValue>(
  previous: TValue | undefined,
  next: TValue,
  isEqual: (left: TValue, right: TValue) => boolean
) => previous === undefined
  ? {
      value: next,
      changed: true,
      action: 'rebuild' as const
    }
  : publishValue({
      previous,
      next,
      isEqual
    })

const publishGraphSnapshot = (
  previous: GraphSnapshot,
  working: WorkingState
) => {
  const nodes = publishFamily<string, NodeView, NodeView>({
    previous: previous.nodes,
    ids: [...working.graph.nodes.keys()],
    read: (nodeId) => working.graph.nodes.get(nodeId)!,
    publish: ({ previous: previousNode, next }) => publishEntry(
      previousNode,
      next,
      isNodeViewEqual
    )
  })
  const edges = publishFamily<string, EdgeView, EdgeView>({
    previous: previous.edges,
    ids: [...working.graph.edges.keys()],
    read: (edgeId) => working.graph.edges.get(edgeId)!,
    publish: ({ previous: previousEdge, next }) => publishEntry(
      previousEdge,
      next,
      isEdgeViewEqual
    )
  })
  const mindmaps = publishFamily<string, MindmapView, MindmapView>({
    previous: previous.owners.mindmaps,
    ids: [...working.graph.owners.mindmaps.keys()],
    read: (mindmapId) => working.graph.owners.mindmaps.get(mindmapId)!,
    publish: ({ previous: previousMindmap, next }) => publishEntry(
      previousMindmap,
      next,
      isMindmapViewEqual
    )
  })
  const groups = publishFamily<string, GroupView, GroupView>({
    previous: previous.owners.groups,
    ids: [...working.graph.owners.groups.keys()],
    read: (groupId) => working.graph.owners.groups.get(groupId)!,
    publish: ({ previous: previousGroup, next }) => publishEntry(
      previousGroup,
      next,
      isGroupViewEqual
    )
  })

  const owners = mindmaps.value === previous.owners.mindmaps
    && groups.value === previous.owners.groups
    ? previous.owners
    : {
        mindmaps: mindmaps.value,
        groups: groups.value
      }

  const graph = nodes.value === previous.nodes
    && edges.value === previous.edges
    && owners === previous.owners
    ? previous
    : {
        nodes: nodes.value,
        edges: edges.value,
        owners
      }

  return {
    graph,
    change: {
      nodes: nodes.ids,
      edges: edges.ids,
      owners: {
        mindmaps: mindmaps.ids,
        groups: groups.ids
      }
    }
  }
}

const publishUiSnapshot = (
  previous: Snapshot['ui'],
  working: WorkingState
) => {
  const selection = publishValue({
    previous: previous.selection,
    next: working.ui.selection,
    isEqual: isSelectionViewEqual
  })
  const chrome = publishValue({
    previous: previous.chrome,
    next: working.ui.chrome,
    isEqual: isChromeViewEqual
  })
  const nodes = publishFamily<string, NodeUiView, NodeUiView>({
    previous: previous.nodes,
    ids: [...working.ui.nodes.keys()],
    read: (nodeId) => working.ui.nodes.get(nodeId)!,
    publish: ({ previous: previousNode, next }) => publishEntry(
      previousNode,
      next,
      isNodeUiViewEqual
    )
  })
  const edges = publishFamily<string, EdgeUiView, EdgeUiView>({
    previous: previous.edges,
    ids: [...working.ui.edges.keys()],
    read: (edgeId) => working.ui.edges.get(edgeId)!,
    publish: ({ previous: previousEdge, next }) => publishEntry(
      previousEdge,
      next,
      isEdgeUiViewEqual
    )
  })

  const ui = selection.value === previous.selection
    && chrome.value === previous.chrome
    && nodes.value === previous.nodes
    && edges.value === previous.edges
    ? previous
    : {
        selection: selection.value,
        chrome: chrome.value,
        nodes: nodes.value,
        edges: edges.value
      }

  return {
    ui,
    change: {
      selection: createFlags(selection.changed),
      chrome: createFlags(chrome.changed),
      nodes: nodes.ids,
      edges: edges.ids
    }
  }
}

export const createEditorGraphPublisher = (): RuntimePublisher<
  WorkingState,
  Snapshot,
  Change
> => ({
  publish: ({ revision, previous, working }) => {
    const publishedGraph = publishGraphSnapshot(previous.graph, working)
    const publishedUi = publishUiSnapshot(previous.ui, working)
    const scene = publishValue({
      previous: previous.scene,
      next: working.scene,
      isEqual: isSceneSnapshotEqual
    })

    return {
      snapshot: {
        revision,
        documentRevision: working.revision.document,
        graph: publishedGraph.graph,
        scene: scene.value,
        ui: publishedUi.ui
      },
      change: {
        graph: publishedGraph.change,
        scene: createFlags(scene.changed),
        ui: publishedUi.change
      }
    }
  }
})
