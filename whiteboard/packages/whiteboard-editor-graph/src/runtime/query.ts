import type {
  EdgeId,
  GroupId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import type { Read, Runtime } from '../contracts/editor'
import type { SpatialIndexState } from './spatial/state'
import { createSpatialRead } from './spatial/query'

export const createEditorGraphQuery = (
  runtime: {
    snapshot: Runtime['snapshot']
    spatial: () => SpatialIndexState
  }
): Read => ({
  snapshot: () => runtime.snapshot(),
  node: (id: NodeId) => runtime.snapshot().graph.nodes.byId.get(id),
  edge: (id: EdgeId) => runtime.snapshot().graph.edges.byId.get(id),
  mindmap: (id: MindmapId) => runtime.snapshot().graph.owners.mindmaps.byId.get(id),
  group: (id: GroupId) => runtime.snapshot().graph.owners.groups.byId.get(id),
  nodeUi: (id: NodeId) => runtime.snapshot().ui.nodes.byId.get(id),
  edgeUi: (id: EdgeId) => runtime.snapshot().ui.edges.byId.get(id),
  spatial: createSpatialRead({
    state: runtime.spatial
  }),
  scene: () => runtime.snapshot().scene,
  ui: () => runtime.snapshot().ui,
  selection: () => runtime.snapshot().ui.selection,
  chrome: () => runtime.snapshot().ui.chrome
})
