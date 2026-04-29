import type {
  EdgeId,
  GroupId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import type { Input } from '../../contracts/editor'
import type {
  WhiteboardExecution
} from '../../contracts/execution'
import type { WorkingState } from '../../contracts/working'
import { resolveScope } from '../scope'
import { createGraphQueue, type GraphQueue } from './queue'

export interface GraphContext {
  revision: number
  current: Input
  working: WorkingState
  execution: WhiteboardExecution
  reset: boolean
  previousDocument?: WorkingState['document']['snapshot']
  target: {
    node: ReadonlySet<NodeId>
    edge: ReadonlySet<EdgeId>
    mindmap: ReadonlySet<MindmapId>
    group: ReadonlySet<GroupId>
    order: boolean
  }
  queue: GraphQueue
}

export const createGraphContext = (input: {
  revision: number
  current: Input
  execution: WhiteboardExecution
  working: WorkingState
  reset?: boolean
  previousDocument?: WorkingState['document']['snapshot']
}): GraphContext => {
  const reset = Boolean(input.reset)
  const target = {
    node: resolveScope(
      reset
        ? 'all'
        : input.execution.target.node,
      () => [
        ...(Object.keys(input.working.document.snapshot.nodes) as readonly NodeId[]),
        ...input.working.graph.nodes.keys()
      ]
    ),
    edge: resolveScope(
      reset
        ? 'all'
        : input.execution.target.edge,
      () => [
        ...(Object.keys(input.working.document.snapshot.edges) as readonly EdgeId[]),
        ...input.working.graph.edges.keys()
      ]
    ),
    mindmap: resolveScope(
      reset
        ? 'all'
        : input.execution.target.mindmap,
      () => [
        ...(Object.keys(input.working.document.snapshot.mindmaps) as readonly MindmapId[]),
        ...input.working.graph.owners.mindmaps.keys()
      ]
    ),
    group: resolveScope(
      reset
        ? 'all'
        : input.execution.target.group,
      () => [
        ...(Object.keys(input.working.document.snapshot.groups) as readonly GroupId[]),
        ...input.working.graph.owners.groups.keys()
      ]
    ),
    order: reset || input.execution.order
  }
  const queue = createGraphQueue()

  return {
    revision: input.revision,
    current: input.current,
    working: input.working,
    execution: input.execution,
    reset,
    previousDocument: input.previousDocument,
    target,
    queue
  }
}

export const hasGraphTargets = (
  context: GraphContext
): boolean => (
  context.reset
  || context.target.order
  || context.target.node.size > 0
  || context.target.edge.size > 0
  || context.target.mindmap.size > 0
  || context.target.group.size > 0
)
