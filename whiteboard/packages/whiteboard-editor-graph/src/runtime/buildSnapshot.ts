import type { CanvasItemRef, EdgeId, GroupId, MindmapId, NodeId } from '@whiteboard/core/types'
import type * as document from '@whiteboard/engine/contracts/document'
import type {
  Change,
  GraphSnapshot,
  GroupView,
  MindmapView,
  SceneItem,
  SceneSnapshot,
  Snapshot
} from '../contracts/editor'

const toSceneItem = (
  ref: CanvasItemRef
): SceneItem => ({
  kind: ref.kind,
  id: ref.id
}) as SceneItem

const buildGraphSnapshot = (
  snapshot: document.Snapshot
): GraphSnapshot => {
  const nodeEntries = [...snapshot.state.facts.entities.nodes.entries()]
  const edgeEntries = [...snapshot.state.facts.entities.edges.entries()]
  const mindmapEntries = [...snapshot.state.facts.entities.owners.mindmaps.entries()]
  const groupEntries = [...snapshot.state.facts.entities.owners.groups.entries()]

  return {
    nodes: {
      ids: nodeEntries.map(([id]) => id),
      byId: new Map(nodeEntries.map(([nodeId, node]) => [nodeId, {
        node,
        owner: snapshot.state.facts.relations.nodeOwner.get(nodeId)
      }] as const))
    },
    edges: {
      ids: edgeEntries.map(([id]) => id),
      byId: new Map(edgeEntries.map(([edgeId, edge]) => [edgeId, {
        edge,
        nodes: snapshot.state.facts.relations.edgeNodes.get(edgeId) ?? {}
      }] as const))
    },
    owners: {
      mindmaps: {
        ids: mindmapEntries.map(([id]) => id),
        byId: new Map<MindmapId, MindmapView>(mindmapEntries.map(([mindmapId, mindmap]) => [
          mindmapId,
          {
            mindmap,
            nodeIds: snapshot.state.facts.relations.ownerNodes.mindmaps.get(mindmapId) ?? []
          }
        ] as const))
      },
      groups: {
        ids: groupEntries.map(([id]) => id),
        byId: new Map<GroupId, GroupView>(groupEntries.map(([groupId, group]) => [
          groupId,
          {
            group,
            items: snapshot.state.facts.relations.groupItems.get(groupId) ?? []
          }
        ] as const))
      }
    }
  }
}

const buildSceneSnapshot = (
  snapshot: document.Snapshot
): SceneSnapshot => {
  const canvasRefs = snapshot.state.root.canvas.order
  return {
    layers: ['owners', 'edges', 'nodes', 'ui'],
    items: canvasRefs.map(toSceneItem),
    spatial: {
      nodes: [...snapshot.state.facts.entities.nodes.keys()] as readonly NodeId[],
      edges: [...snapshot.state.facts.entities.edges.keys()] as readonly EdgeId[]
    },
    pick: {
      items: canvasRefs
    }
  }
}

export const buildEditorChange = (
  snapshot: document.Snapshot
): Change => ({
  graph: {
    nodes: {
      all: snapshot.change.entities.nodes.all
    },
    edges: {
      all: snapshot.change.entities.edges.all
    },
    owners: {
      mindmaps: {
        all: snapshot.change.entities.owners.mindmaps.all
      },
      groups: {
        all: snapshot.change.entities.owners.groups.all
      }
    }
  },
  scene: {
    changed: snapshot.change.root.changed || snapshot.change.relations.graph.changed
  },
  ui: {
    selection: {
      changed: true
    },
    chrome: {
      changed: true
    }
  }
})

export const buildEditorSnapshot = (input: {
  revision: number
  inputRevision: number
  document: document.Snapshot
  selection?: {
    nodeIds: readonly NodeId[]
    edgeIds: readonly EdgeId[]
  }
}): Snapshot => ({
  revision: input.revision,
  base: {
    documentRevision: input.document.revision,
    inputRevision: input.inputRevision
  },
  graph: buildGraphSnapshot(input.document),
  scene: buildSceneSnapshot(input.document),
  ui: {
    selection: {
      nodeIds: input.selection?.nodeIds ?? [],
      edgeIds: input.selection?.edgeIds ?? []
    },
    chrome: {
      overlays: []
    }
  }
})
