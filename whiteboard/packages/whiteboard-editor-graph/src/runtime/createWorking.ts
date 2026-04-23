import type { WorkingState } from '../contracts/working'
import { EMPTY_SCENE_LAYERS } from './geometry'
import { createEmptyDocumentSnapshot } from './createEmptySnapshot'

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
    ui: {
      selection: {
        target: {
          nodeIds: [],
          edgeIds: []
        },
        kind: 'none',
        summary: {
          count: 0,
          nodeCount: 0,
          edgeCount: 0,
          groupIds: []
        },
        affordance: {
          owner: 'none',
          moveHit: 'none',
          canMove: false,
          canResize: false,
          canRotate: false,
          handles: []
        }
      },
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
    }
  }
}
