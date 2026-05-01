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
  createDeltaState,
  createGraphPhaseDelta,
  createRenderPhaseDeltaState,
  createUiPhaseDeltaState
} from '../contracts/delta'
import {
  createEmptyEditorSceneFacts
} from '../contracts/facts'
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
    facts: createEmptyEditorSceneFacts(),
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
    runtime: {
      session: {
        edit: null,
        draft: {
          edges: new Map()
        },
        preview: {
          nodes: {},
          edges: {},
          draw: null,
          selection: {
            guides: []
          },
          mindmap: null
        },
        tool: {
          type: 'select'
        }
      },
      interaction: {
        selection: {
          nodeIds: [],
          edgeIds: []
        },
        hover: {
          kind: 'none'
        },
        drag: {
          kind: 'idle'
        },
        chrome: false,
        editingEdge: false
      },
      view: {
        zoom: 1,
        center: { x: 0, y: 0 },
        worldRect: { x: 0, y: 0, width: 0, height: 0 }
      },
      facts: {
        touchedNodeIds: new Set(),
        touchedEdgeIds: new Set(),
        touchedMindmapIds: new Set(),
        activeEdgeIds: new Set(),
        uiChanged: false,
        overlayChanged: false,
        chromeChanged: false
      }
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
      ...createDeltaState()
    },
    phase: {
      graph: createGraphPhaseDelta(),
      ui: createUiPhaseDeltaState(),
      render: createRenderPhaseDeltaState(),
      spatial: createSpatialDelta()
    }
  }
}
