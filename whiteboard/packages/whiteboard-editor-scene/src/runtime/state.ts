import { document as documentApi } from '@whiteboard/core/document'
import type {
  Document,
  EdgeId,
  GroupId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import type { Revision } from '@shared/projection'
import { family } from '@shared/core'
import {
  createDocumentDelta,
  createGraphDelta,
  createItemsDelta,
  renderChange,
  uiChange
} from '../contracts/delta'
import {
  createEmptyWhiteboardExecution
} from '../contracts/execution'
import type {
  EdgeStateView,
  EdgeUiView,
  EdgeView,
  EditorSceneLayout,
  GroupView,
  MindmapView,
  NodeStateView,
  NodeUiView,
  NodeView
} from '../contracts/editor'
import type {
  EdgeActiveView,
  NodeRenderView
} from '../contracts/render'
import type { WorkingState } from '../contracts/working'
import { createSpatialState } from '../model/spatial/state'
import { createSpatialDelta } from '../model/spatial/update'

export const createEmptyDocumentSnapshot = (): {
  revision: Revision
  document: Document
} => ({
  revision: 0,
  document: documentApi.create('__editor_scene_runtime__')
})

export const createWorking = (input: {
  layout?: EditorSceneLayout
} = {}): WorkingState => {
  const snapshot = createEmptyDocumentSnapshot()
  const graphNodes = family.createMutableState<NodeId, NodeView>()
  const graphEdges = family.createMutableState<EdgeId, EdgeView>()
  const graphMindmaps = family.createMutableState<MindmapId, MindmapView>()
  const graphGroups = family.createMutableState<GroupId, GroupView>()
  const nodeState = family.createMutableState<NodeId, NodeStateView>()
  const edgeState = family.createMutableState<EdgeId, EdgeStateView>()
  const chromeState = {
    overlays: [],
    hover: {
      kind: 'none' as const
    },
    preview: {
      guides: [],
      draw: null,
      mindmap: null
    },
    edit: null
  }
  const renderEdgeOverlay = {
    endpointHandles: [],
    routePoints: []
  }

  return {
    layout: input.layout,
    execution: createEmptyWhiteboardExecution(),
    draft: {
      node: new Map()
    },
    revision: {
      document: snapshot.revision as Revision
    },
    document: {
      snapshot: snapshot.document,
      background: snapshot.document.background
    },
    graph: {
      nodes: graphNodes,
      edges: graphEdges,
      owners: {
        mindmaps: graphMindmaps,
        groups: graphGroups
      },
      state: {
        node: nodeState,
        edge: edgeState,
        chrome: chromeState
      }
    },
    indexes: {
      ownerByNode: new Map(),
      mindmapNodes: new Map(),
      parentByNode: new Map(),
      childrenByNode: new Map(),
      edgeNodesByEdge: new Map(),
      edgeIdsByNode: new Map(),
      groupItems: new Map(),
      groupSignature: new Map(),
      groupIdsBySignature: new Map(),
      groupByEdge: new Map()
    },
    spatial: createSpatialState(),
    ui: {
      chrome: chromeState,
      nodes: nodeState,
      edges: edgeState
    },
    render: {
      node: family.createMutableState<NodeId, NodeRenderView>(),
      statics: {
        ids: [],
        byId: new Map(),
        styleKeyByEdge: new Map(),
        edgeIdsByStyleKey: new Map(),
        staticIdByEdge: new Map(),
        staticIdsByStyleKey: new Map()
      },
      labels: {
        ids: [],
        byId: new Map(),
        keysByEdge: new Map()
      },
      masks: {
        ids: [],
        byId: new Map()
      },
      active: family.createMutableState<EdgeId, EdgeActiveView>(),
      overlay: renderEdgeOverlay,
      chrome: {
        guides: [],
        draw: null,
        mindmap: null,
        edge: renderEdgeOverlay
      }
    },
    items: {
      ids: [],
      byId: new Map()
    },
    delta: {
      document: createDocumentDelta(),
      graph: createGraphDelta(),
      spatial: createSpatialDelta(),
      items: createItemsDelta(),
      ui: uiChange.create(),
      render: renderChange.create()
    }
  }
}
