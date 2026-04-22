import type {
  EdgeId,
  GroupId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import type { EditorPhase } from './shared'
import { toMetric } from './shared'

export const createGraphPhase = (): EditorPhase => ({
  name: 'graph',
  deps: ['input'],
  run: (context) => {
    const snapshot = context.working.input.document.snapshot
    const session = context.working.input.session
    const nodes = new Map()
    const edges = new Map()
    const mindmaps = new Map()
    const groups = new Map()
    const dirtyNodeIds = new Set<NodeId>(snapshot.change.entities.nodes.all)
    const dirtyEdgeIds = new Set<EdgeId>(snapshot.change.entities.edges.all)
    const dirtyMindmapIds = new Set<MindmapId>(snapshot.change.entities.owners.mindmaps.all)
    const dirtyGroupIds = new Set<GroupId>(snapshot.change.entities.owners.groups.all)

    snapshot.state.facts.entities.nodes.forEach((node, nodeId) => {
      const draft = session.draft.nodes.get(nodeId)
      const preview = session.preview.nodes.get(nodeId)
      if (draft || preview) {
        dirtyNodeIds.add(nodeId)
      }

      if (session.edit?.kind === 'node' && session.edit.nodeId === nodeId) {
        dirtyNodeIds.add(nodeId)
      }

      nodes.set(nodeId, {
        base: {
          node,
          owner: snapshot.state.facts.relations.nodeOwner.get(nodeId)
        },
        draft,
        preview
      })
    })

    snapshot.state.facts.entities.edges.forEach((edge, edgeId) => {
      const draft = session.draft.edges.get(edgeId)
      const preview = session.preview.edges.get(edgeId)
      if (draft || preview) {
        dirtyEdgeIds.add(edgeId)
      }

      if (session.edit?.kind === 'edge-label' && session.edit.edgeId === edgeId) {
        dirtyEdgeIds.add(edgeId)
      }

      edges.set(edgeId, {
        base: {
          edge,
          nodes: snapshot.state.facts.relations.edgeNodes.get(edgeId) ?? {}
        },
        draft,
        preview
      })
    })

    snapshot.state.facts.entities.owners.mindmaps.forEach((mindmap, mindmapId) => {
      mindmaps.set(mindmapId, {
        base: {
          mindmap
        },
        nodeIds: snapshot.state.facts.relations.ownerNodes.mindmaps.get(mindmapId) ?? []
      })
    })

    snapshot.state.facts.entities.owners.groups.forEach((group, groupId) => {
      groups.set(groupId, {
        items: snapshot.state.facts.relations.groupItems.get(groupId) ?? []
      })
    })

    if (session.preview.mindmap?.rootMove) {
      dirtyMindmapIds.add(session.preview.mindmap.rootMove.mindmapId)
    }

    if (session.preview.mindmap?.subtreeMove) {
      dirtyMindmapIds.add(session.preview.mindmap.subtreeMove.mindmapId)
    }

    context.working.graph = {
      nodes,
      edges,
      owners: {
        mindmaps,
        groups
      },
      dirty: {
        nodeIds: dirtyNodeIds,
        edgeIds: dirtyEdgeIds,
        mindmapIds: dirtyMindmapIds,
        groupIds: dirtyGroupIds
      }
    }

    return {
      action: 'sync',
      change: undefined,
      metrics: toMetric(nodes.size + edges.size + mindmaps.size + groups.size)
    }
  }
})
