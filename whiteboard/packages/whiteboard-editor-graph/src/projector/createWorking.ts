import type { WorkingState } from '../contracts/working'
import { createEmptyDocumentSnapshot } from './createEmptySnapshot'
import { createGraphDelta } from '../domain/graphPatch/delta'
import {
  createGraphPublishDelta,
  createUiPublishDelta
} from './publish/delta'
import { createSpatialDelta } from '../domain/spatial/update'
import { createSpatialState } from '../domain/spatial/state'

export const createWorking = (): WorkingState => {
  const snapshot = createEmptyDocumentSnapshot()

  return {
    revision: {
      document: snapshot.revision
    },
    graph: {
      nodes: new Map(),
      edges: new Map(),
      owners: {
        mindmaps: new Map(),
        groups: new Map()
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
      chrome: {
        overlays: [],
        hover: {
          kind: 'none'
        },
      preview: {
        guides: [],
        draw: null,
        mindmap: null
      },
      edit: null
      },
      nodes: new Map(),
      edges: new Map()
    },
    items: [],
    delta: {
      graph: createGraphDelta(),
      spatial: createSpatialDelta()
    },
    publish: {
      graph: {
        revision: 0,
        delta: createGraphPublishDelta()
      },
      ui: {
        revision: 0,
        delta: createUiPublishDelta()
      },
      items: {
        revision: 0,
        changed: false
      }
    }
  }
}
