import type { Revision } from '@shared/projection'
import type { Capture, GraphCapture, UiCapture } from '../contracts/capture'
import type { RenderCapture } from '../contracts/capture'
import type { WorkingState } from '../contracts/working'

export const buildGraphCapture = (
  state: WorkingState
): GraphCapture => ({
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

export const buildRenderCapture = (
  state: WorkingState
): RenderCapture => ({
  edge: {
    statics: {
      ids: state.render.statics.ids,
      byId: state.render.statics.byId
    },
    active: {
      ids: [...state.render.active.keys()],
      byId: state.render.active
    },
    labels: {
      ids: state.render.labels.ids,
      byId: state.render.labels.byId
    },
    masks: {
      ids: state.render.masks.ids,
      byId: state.render.masks.byId
    },
    overlay: state.render.overlay
  }
})

export const buildUiCapture = (
  state: WorkingState
): UiCapture => ({
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

export const buildEditorSceneCapture = (
  state: WorkingState,
  revision: Revision
): Capture => ({
  revision,
  documentRevision: state.revision.document,
  graph: buildGraphCapture(state),
  render: buildRenderCapture(state),
  items: state.items,
  ui: buildUiCapture(state)
})

export const createEditorSceneCaptureReader = (input: {
  state: () => WorkingState
  revision: () => Revision
}): (() => Capture) => {
  let cachedRevision = -1 as Revision
  let cachedCapture: Capture | undefined

  return () => {
    const revision = input.revision()
    if (cachedCapture && cachedRevision === revision) {
      return cachedCapture
    }

    const state = input.state()
    cachedRevision = revision
    cachedCapture = buildEditorSceneCapture(state, revision)
    return cachedCapture
  }
}
