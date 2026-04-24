import type { WorkingState } from '../contracts/working'
import { EMPTY_SCENE_LAYERS } from './geometry'
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
    scene: {
      layers: EMPTY_SCENE_LAYERS,
      items: [],
      visible: {
        items: [],
        nodeIds: [],
        edgeIds: [],
        mindmapIds: []
      },
      spatial: {
        nodes: [],
        edges: [],
        mindmaps: []
      },
      pick: {
        items: []
      }
    },
    delta: {
      graph: createGraphDelta(),
      spatial: createSpatialDelta(),
      publish: createPublishDelta()
    }
  }
}
