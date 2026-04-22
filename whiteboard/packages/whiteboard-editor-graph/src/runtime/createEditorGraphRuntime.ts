import type {
  Change,
  Input,
  InputChange,
  Runtime,
  Snapshot
} from '../contracts/editor'
import type { Run } from '../contracts/trace'
import { buildEditorChange, buildEditorSnapshot } from './buildSnapshot'

type State = {
  snapshot: Snapshot
  inputRevision: number
  listeners: Set<(snapshot: Snapshot, change: Change) => void>
}

const createEmptySnapshot = (): Snapshot => ({
  revision: 0,
  base: {
    documentRevision: 0,
    inputRevision: 0
  },
  graph: {
    nodes: {
      ids: [],
      byId: new Map()
    },
    edges: {
      ids: [],
      byId: new Map()
    },
    owners: {
      mindmaps: {
        ids: [],
        byId: new Map()
      },
      groups: {
        ids: [],
        byId: new Map()
      }
    }
  },
  scene: {
    layers: ['owners', 'edges', 'nodes', 'ui'],
    items: [],
    spatial: {
      nodes: [],
      edges: []
    },
    pick: {
      items: []
    }
  },
  ui: {
    selection: {
      nodeIds: [],
      edgeIds: []
    },
    chrome: {
      overlays: []
    }
  }
})

export const createEditorGraphRuntime = (): Runtime => {
  const state: State = {
    snapshot: createEmptySnapshot(),
    inputRevision: 0,
    listeners: new Set()
  }

  return {
    snapshot: () => state.snapshot,
    update: (input: Input, _change: InputChange) => {
      state.inputRevision += 1
      const nextSnapshot = buildEditorSnapshot({
        revision: state.snapshot.revision + 1,
        inputRevision: state.inputRevision,
        document: input.document.snapshot,
        selection: input.interaction.selection
      })
      const nextChange = buildEditorChange(input.document.snapshot)
      state.snapshot = nextSnapshot
      state.listeners.forEach((listener) => {
        listener(nextSnapshot, nextChange)
      })
      const trace: Run = {
        revision: nextSnapshot.revision,
        phases: [],
        totalMs: 0
      }
      return {
        snapshot: nextSnapshot,
        change: nextChange,
        trace
      }
    },
    subscribe: (listener) => {
      state.listeners.add(listener)
      return () => {
        state.listeners.delete(listener)
      }
    }
  }
}
