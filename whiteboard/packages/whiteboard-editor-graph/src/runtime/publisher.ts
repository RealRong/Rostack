import {
  createFlags,
  publishFamily,
  publishValue,
  type RuntimePublisher
} from '@shared/projection-runtime'
import type {
  Change,
  EdgeView,
  GraphSnapshot,
  GroupView,
  MindmapView,
  NodeView,
  Snapshot
} from '../contracts/editor'
import type { WorkingState } from '../contracts/working'
import {
  isChromeViewEqual,
  isEdgeViewEqual,
  isGroupViewEqual,
  isMindmapViewEqual,
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

export const createEditorGraphPublisher = (): RuntimePublisher<
  WorkingState,
  Snapshot,
  Change
> => ({
  publish: ({ revision, previous, working }) => {
    const publishedGraph = publishGraphSnapshot(previous.graph, working)
    const scene = publishValue({
      previous: previous.scene,
      next: working.scene,
      isEqual: isSceneSnapshotEqual
    })
    const selection = publishValue({
      previous: previous.ui.selection,
      next: working.ui.selection,
      isEqual: isSelectionViewEqual
    })
    const chrome = publishValue({
      previous: previous.ui.chrome,
      next: working.ui.chrome,
      isEqual: isChromeViewEqual
    })
    const ui = selection.value === previous.ui.selection
      && chrome.value === previous.ui.chrome
      ? previous.ui
      : {
          selection: selection.value,
          chrome: chrome.value
        }

    return {
      snapshot: {
        revision,
        documentRevision: working.revision.document,
        graph: publishedGraph.graph,
        scene: scene.value,
        ui
      },
      change: {
        graph: publishedGraph.change,
        scene: createFlags(scene.changed),
        ui: {
          selection: createFlags(selection.changed),
          chrome: createFlags(chrome.changed)
        }
      }
    }
  }
})
