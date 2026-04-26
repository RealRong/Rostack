import type { Revision } from '@shared/projector/phase'
import type {
  GraphSnapshot,
  Snapshot,
  UiSnapshot
} from '../contracts/editor'
import type { RenderSnapshot } from '../contracts/render'
import type { WorkingState } from '../contracts/working'

const buildGraphSnapshot = (
  state: WorkingState
): GraphSnapshot => ({
  nodes: {
    ids: [...state.graph.nodes.keys()],
    byId: state.graph.nodes
  },
  edges: {
    ids: [...state.graph.edges.keys()],
    byId: state.graph.edges
  },
  owners: {
    mindmaps: {
      ids: [...state.graph.owners.mindmaps.keys()],
      byId: state.graph.owners.mindmaps
    },
    groups: {
      ids: [...state.graph.owners.groups.keys()],
      byId: state.graph.owners.groups
    }
  }
})

const buildRenderSnapshot = (
  state: WorkingState
): RenderSnapshot => ({
  edge: {
    statics: {
      ids: [...state.render.statics.statics.keys()],
      byId: state.render.statics.statics
    },
    active: {
      ids: [...state.render.active.keys()],
      byId: state.render.active
    },
    labels: {
      ids: [...state.render.labels.keys()],
      byId: state.render.labels
    },
    masks: {
      ids: [...state.render.masks.keys()],
      byId: state.render.masks
    },
    overlay: state.render.overlay
  }
})

const buildUiSnapshot = (
  state: WorkingState
): UiSnapshot => ({
  chrome: state.ui.chrome,
  nodes: {
    ids: [...state.ui.nodes.keys()],
    byId: state.ui.nodes
  },
  edges: {
    ids: [...state.ui.edges.keys()],
    byId: state.ui.edges
  }
})

export const createEditorSceneSnapshotReader = (input: {
  state: () => WorkingState
  revision: () => Revision
}): (() => Snapshot) => {
  let cachedRevision = -1 as Revision
  let cachedSnapshot: Snapshot | undefined

  return () => {
    const revision = input.revision()
    if (cachedSnapshot && cachedRevision === revision) {
      return cachedSnapshot
    }

    const state = input.state()
    cachedRevision = revision
    cachedSnapshot = {
      revision,
      documentRevision: state.revision.document,
      graph: buildGraphSnapshot(state),
      render: buildRenderSnapshot(state),
      items: state.items,
      ui: buildUiSnapshot(state)
    }
    return cachedSnapshot
  }
}
