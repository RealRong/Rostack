import { selection as selectionApi } from '@whiteboard/core/selection'
import type { MindmapId, NodeId } from '@whiteboard/core/types'
import { store } from '@shared/core'
import type { EditorDefaults } from '@whiteboard/editor/types/defaults'
import type { NodeTypeSupport } from '@whiteboard/editor/types/node'
import type {
  EditorPolicyDerived,
  EditorSceneApi,
  EditorSceneDerived,
  EditorState
} from '@whiteboard/editor/types/editor'
import type {
  SelectionEdgeStats,
  SelectionNodeStats
} from '@whiteboard/editor/types/selectionPresentation'
import {
  readEdgeScope,
  readNodeScope,
  resolveSelectionOverlay,
  resolveSelectionToolbar
} from '@whiteboard/editor/editor/derived/selection-policy'
import { createSelectionNodeStats } from './policy-selection-stats'

export const createEditorPolicyDerived = (input: {
  scene: EditorSceneApi
  state: EditorState
  sceneDerived: EditorSceneDerived
  nodeType: NodeTypeSupport
  defaults: EditorDefaults['selection']
}): EditorPolicyDerived => {
  const nodeSelected = store.createProjectedKeyedStore({
    source: input.state.selection,
    select: (target) => {
      const byId = new Map<NodeId, boolean>()
      target.nodeIds.forEach((nodeId) => {
        byId.set(nodeId, true)
      })
      return byId
    },
    emptyValue: false
  })

  const nodeStats = store.createDerivedStore<SelectionNodeStats>({
    get: () => createSelectionNodeStats({
      summary: store.read(input.sceneDerived.selection.summary),
      nodeType: input.nodeType
    })
  })

  const edgeStats = store.createDerivedStore<SelectionEdgeStats>({
    get: () => selectionApi.derive.edgeStats(
      store.read(input.sceneDerived.selection.summary)
    )
  })

  const nodeScope = store.createDerivedStore({
    get: () => {
      const currentNodeStats = store.read(nodeStats)
      if (currentNodeStats.count === 0) {
        return undefined
      }

      const members = store.read(input.sceneDerived.selection.members)
      return readNodeScope({
        nodes: members.nodes,
        nodeIds: currentNodeStats.ids,
        primaryNode: members.primaryNode,
        nodeType: input.nodeType,
        nodeStats: currentNodeStats,
        readMindmapStructure: (mindmapId: MindmapId) => input.scene.query.mindmap.structure(mindmapId),
        defaults: input.defaults
      })
    }
  })

  const edgeScope = store.createDerivedStore({
    get: () => {
      const currentEdgeStats = store.read(edgeStats)
      if (currentEdgeStats.count === 0) {
        return undefined
      }

      const members = store.read(input.sceneDerived.selection.members)
      return readEdgeScope({
        edges: members.edges,
        edgeIds: currentEdgeStats.ids,
        primaryEdge: members.primaryEdge,
        defaults: input.defaults
      })
    }
  })

  const overlay = store.createDerivedStore({
    get: () => {
      const interaction = store.read(input.state.interaction)
      return resolveSelectionOverlay({
        summary: store.read(input.sceneDerived.selection.summary),
        affordance: store.read(input.sceneDerived.selection.affordance),
        tool: store.read(input.state.tool),
        edit: store.read(input.state.edit),
        interactionChrome: interaction.chrome,
        transforming: interaction.transforming
      })
    }
  })

  const toolbar = store.createDerivedStore({
    get: () => {
      const interaction = store.read(input.state.interaction)
      return resolveSelectionToolbar({
        members: store.read(input.sceneDerived.selection.members),
        summary: store.read(input.sceneDerived.selection.summary),
        affordance: store.read(input.sceneDerived.selection.affordance),
        nodeStats: store.read(nodeStats),
        edgeStats: store.read(edgeStats),
        nodeScope: store.read(nodeScope),
        edgeScope: store.read(edgeScope),
        nodeType: input.nodeType,
        readMindmapStructure: (mindmapId: MindmapId) => input.scene.query.mindmap.structure(mindmapId),
        tool: store.read(input.state.tool),
        edit: store.read(input.state.edit),
        interactionChrome: interaction.chrome,
        editingEdge: interaction.editingEdge,
        defaults: input.defaults
      })
    }
  })

  return {
    selection: {
      toolbar,
      overlay,
      node: {
        selected: nodeSelected,
        stats: nodeStats,
        scope: nodeScope
      },
      edge: {
        stats: edgeStats,
        scope: edgeScope
      }
    }
  }
}
