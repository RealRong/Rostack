import type {
  EdgeId,
  GroupId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import type {
  Read,
  Runtime
} from '@whiteboard/editor-graph'

export const createEditorGraphRead = (
  runtime: Pick<Runtime, 'snapshot'>
): Read => ({
  snapshot: () => runtime.snapshot(),
  node: (id: NodeId) => runtime.snapshot().graph.nodes.byId.get(id),
  edge: (id: EdgeId) => runtime.snapshot().graph.edges.byId.get(id),
  mindmap: (id: MindmapId) => runtime.snapshot().graph.owners.mindmaps.byId.get(id),
  group: (id: GroupId) => runtime.snapshot().graph.owners.groups.byId.get(id),
  scene: () => runtime.snapshot().scene,
  ui: () => runtime.snapshot().ui
})
