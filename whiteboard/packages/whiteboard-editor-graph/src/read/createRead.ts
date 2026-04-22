import type {
  EdgeId,
  GroupId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import type {
  Read,
  Runtime
} from '../contracts/editor'

export interface CreateEditorGraphReadInput {
  runtime: Pick<Runtime, 'snapshot'>
}

export const createEditorGraphRead = (
  input: CreateEditorGraphReadInput
): Read => ({
  snapshot: () => input.runtime.snapshot(),
  node: (id: NodeId) => input.runtime.snapshot().graph.nodes.byId.get(id),
  edge: (id: EdgeId) => input.runtime.snapshot().graph.edges.byId.get(id),
  mindmap: (id: MindmapId) => input.runtime.snapshot().graph.owners.mindmaps.byId.get(id),
  group: (id: GroupId) => input.runtime.snapshot().graph.owners.groups.byId.get(id),
  scene: () => input.runtime.snapshot().scene,
  ui: () => input.runtime.snapshot().ui
})
