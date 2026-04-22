import type { WorkingState } from '../contracts/working'
import { EMPTY_SCENE_LAYERS } from './helpers'
import {
  createEmptyDocumentSnapshot,
  createEmptyInput
} from './createEmptySnapshot'

export const createWorking = (): WorkingState => {
  const input = createEmptyInput()

  return {
    input: {
      revision: {
        document: 0,
        input: 0
      },
      document: {
        snapshot: createEmptyDocumentSnapshot()
      },
      session: input.session,
      measure: input.measure,
      interaction: input.interaction,
      viewport: input.viewport,
      clock: input.clock,
      impact: []
    },
    graph: {
      nodes: new Map(),
      edges: new Map(),
      owners: {
        mindmaps: new Map(),
        groups: new Map()
      },
      dirty: {
        nodeIds: new Set(),
        edgeIds: new Set(),
        mindmapIds: new Set(),
        groupIds: new Set()
      }
    },
    measure: {
      nodes: new Map(),
      edgeLabels: new Map(),
      dirty: {
        nodeIds: new Set(),
        edgeIds: new Set()
      }
    },
    structure: {
      mindmaps: new Map(),
      groups: new Map()
    },
    tree: {
      mindmaps: new Map()
    },
    element: {
      nodes: new Map(),
      edges: new Map()
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
      hover: {
        kind: 'none'
      }
    },
    scene: {
      layers: EMPTY_SCENE_LAYERS,
      items: [],
      visible: {
        items: [],
        nodeIds: [],
        edgeIds: [],
        mindmapIds: []
      }
    }
  }
}
