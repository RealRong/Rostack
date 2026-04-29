import type {
  ProjectionStoreTree
} from '@shared/projection'
import type { WorkingState } from '../contracts/working'

const sameOrder = <T,>(
  left: readonly T[],
  right: readonly T[]
): boolean => (
  left.length === right.length
  && left.every((value, index) => Object.is(value, right[index]))
)

export const editorSceneStores = {
  document: {
    revision: {
      kind: 'value' as const,
      read: (state) => state.revision.document,
      change: (state) => state.delta.document.revision
    },
    background: {
      kind: 'value' as const,
      read: (state) => state.document.background,
      change: (state) => state.delta.document.background
    }
  },
  graph: {
    node: {
      kind: 'family' as const,
      read: (state) => state.graph.nodes,
      idsEqual: sameOrder,
      change: (state) => state.delta.graph.node
    },
    edge: {
      kind: 'family' as const,
      read: (state) => state.graph.edges,
      idsEqual: sameOrder,
      change: (state) => state.delta.graph.edge
    },
    mindmap: {
      kind: 'family' as const,
      read: (state) => state.graph.owners.mindmaps,
      idsEqual: sameOrder,
      change: (state) => state.delta.graph.mindmap
    },
    group: {
      kind: 'family' as const,
      read: (state) => state.graph.owners.groups,
      idsEqual: sameOrder,
      change: (state) => state.delta.graph.group
    },
    state: {
      node: {
        kind: 'family' as const,
        read: (state) => state.graph.state.node,
        idsEqual: sameOrder,
        change: (state) => state.delta.graph.state.node
      },
      edge: {
        kind: 'family' as const,
        read: (state) => state.graph.state.edge,
        idsEqual: sameOrder,
        change: (state) => state.delta.graph.state.edge
      },
      chrome: {
        kind: 'value' as const,
        read: (state) => state.graph.state.chrome,
        change: (state) => state.delta.graph.state.chrome
      }
    }
  },
  render: {
    node: {
      kind: 'family' as const,
      read: (state) => state.render.node,
      idsEqual: sameOrder,
      change: (state) => state.delta.render.node
    },
    edge: {
      statics: {
        kind: 'family' as const,
        read: (state) => state.render.statics,
        idsEqual: sameOrder,
        change: (state) => state.delta.render.edge.statics
      },
      active: {
        kind: 'family' as const,
        read: (state) => state.render.active,
        idsEqual: sameOrder,
        change: (state) => state.delta.render.edge.active
      },
      labels: {
        kind: 'family' as const,
        read: (state) => state.render.labels,
        idsEqual: sameOrder,
        change: (state) => state.delta.render.edge.labels
      },
      masks: {
        kind: 'family' as const,
        read: (state) => state.render.masks,
        idsEqual: sameOrder,
        change: (state) => state.delta.render.edge.masks
      }
    },
    chrome: {
      scene: {
        kind: 'value' as const,
        read: (state) => state.render.chrome,
        change: (state) => state.delta.render.chrome.scene
      },
      edge: {
        kind: 'value' as const,
        read: (state) => state.render.overlay,
        change: (state) => state.delta.render.chrome.edge
      }
    }
  },
  items: {
    kind: 'family' as const,
    read: (state) => state.items,
    idsEqual: sameOrder,
    change: (state) => state.delta.items
  }
} satisfies ProjectionStoreTree<WorkingState>
