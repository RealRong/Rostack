import type {
  EdgeId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import type { SceneItemKey } from '../contracts/delta'
import { sceneItemKey } from '../contracts/delta'
import type { ExecutionScope } from '../contracts/execution'
import type { WorkingState } from '../contracts/working'

export const appendIds = <TId extends string>(
  target: Set<TId>,
  ids: Iterable<TId>
) => {
  for (const id of ids) {
    target.add(id)
  }
}

export const resolveScope = <TId extends string>(
  scope: ExecutionScope<TId>,
  readAll: () => Iterable<TId>
): ReadonlySet<TId> => scope === 'all'
  ? new Set(readAll())
  : new Set(scope)

export const appendScopeIds = <TId extends string>(
  target: Set<TId>,
  scope: ExecutionScope<TId>,
  readAll: () => Iterable<TId>
) => {
  if (scope === 'all') {
    appendIds(target, readAll())
    return
  }

  appendIds(target, scope)
}

export const appendMindmapNodeIds = (input: {
  target: Set<NodeId>
  mindmapIds: Iterable<MindmapId>
  working: WorkingState
}) => {
  for (const mindmapId of input.mindmapIds) {
    input.working.graph.owners.mindmaps
      .get(mindmapId)
      ?.structure.nodeIds
      .forEach((nodeId) => {
        input.target.add(nodeId)
      })
  }
}

export const appendMindmapNodeScope = (input: {
  target: Set<NodeId>
  scope: ExecutionScope<MindmapId>
  working: WorkingState
}) => {
  if (input.scope === 'all') {
    appendIds(input.target, input.working.graph.nodes.keys())
    return
  }

  appendMindmapNodeIds({
    target: input.target,
    mindmapIds: input.scope,
    working: input.working
  })
}

export const appendEdgeItemScope = (input: {
  target: Set<EdgeId>
  scope: ExecutionScope<SceneItemKey>
  working: WorkingState
}) => {
  if (input.scope === 'all') {
    input.working.items.ids.forEach((key) => {
      const entry = sceneItemKey.read(key)
      if (entry.kind === 'edge') {
        input.target.add(entry.id)
      }
    })
    return
  }

  input.scope.forEach((key) => {
    const entry = sceneItemKey.read(key)
    if (entry.kind === 'edge') {
      input.target.add(entry.id)
    }
  })
}
