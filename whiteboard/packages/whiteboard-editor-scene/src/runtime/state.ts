import { document as documentApi } from '@whiteboard/core/document'
import type * as document from '@whiteboard/engine/contracts/document'
import type { Revision } from '@shared/projection'
import {
  createGraphChanges,
  createGraphDelta,
  createItemsDelta,
  createRenderDelta,
  createUiDelta
} from '../contracts/delta'
import type {
  TextMeasure
} from '../contracts/editor'
import type { WorkingState } from '../contracts/working'
import { createSpatialState } from '../model/spatial/state'
import { createSpatialDelta } from '../model/spatial/update'

export const createEmptyDocumentSnapshot = (): document.Snapshot => ({
  revision: 0,
  document: documentApi.create('__editor_scene_runtime__')
})

export const createWorking = (input: {
  measure?: TextMeasure
} = {}): WorkingState => {
  const snapshot = createEmptyDocumentSnapshot()
  const nodeState = new Map()
  const edgeState = new Map()
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
    measure: input.measure,
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
      nodes: new Map(),
      edges: new Map(),
      owners: {
        mindmaps: new Map(),
        groups: new Map()
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
      node: new Map(),
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
      active: new Map(),
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
      graph: createGraphDelta(),
      graphChanges: createGraphChanges(),
      spatial: createSpatialDelta(),
      items: createItemsDelta(),
      ui: createUiDelta(),
      render: createRenderDelta()
    }
  }
}
