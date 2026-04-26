import { document as documentApi } from '@whiteboard/core/document'
import type * as document from '@whiteboard/engine/contracts/document'
import type { Revision } from '@shared/projector/phase'
import { createGraphDelta } from '../contracts/delta'
import type {
  SceneItem,
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
    revision: {
      document: snapshot.revision as Revision
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
        styleKeyByEdge: new Map(),
        edgeIdsByStyleKey: new Map(),
        staticIdByEdge: new Map(),
        staticIdsByStyleKey: new Map(),
        statics: new Map()
      },
      labels: new Map(),
      masks: new Map(),
      active: new Map(),
      overlay: renderEdgeOverlay,
      chrome: {
        guides: [],
        draw: null,
        mindmap: null,
        edge: renderEdgeOverlay
      }
    },
    items: [] as readonly SceneItem[],
    delta: {
      graph: createGraphDelta(),
      spatial: createSpatialDelta()
    }
  }
}
