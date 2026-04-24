import type { WorkingState } from '../contracts/working'
import { createEmptyDocumentSnapshot } from './createEmptySnapshot'
import { createGraphDelta } from './graphPatch/delta'
import { createPublishDelta } from './publish/delta'
import { createSpatialDelta } from './spatial/update'
import { createSpatialState } from './spatial/state'

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
      spatial: createSpatialDelta(),
      publish: createPublishDelta()
    }
  }
}
