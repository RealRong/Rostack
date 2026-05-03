import type { Input } from '../../contracts/editor'
import type {
  EditorSceneInputFacts
} from '../../contracts/facts'
import type { WorkingState } from '../../contracts/working'
import { resolveScope } from '../scope'
import { createGraphQueue, type GraphQueue } from './queue'

export interface GraphContext {
  revision: number
  current: Input
  working: WorkingState
  facts: EditorSceneInputFacts
  reset: boolean
  previousDocument?: WorkingState['document']['snapshot']
  target: {
    node: ReadonlySet<string>
    edge: ReadonlySet<string>
    mindmap: ReadonlySet<string>
    group: ReadonlySet<string>
    order: boolean
  }
  queue: GraphQueue
}

export const createGraphContext = (input: {
  revision: number
  current: Input
  facts: EditorSceneInputFacts
  working: WorkingState
  reset?: boolean
  previousDocument?: WorkingState['document']['snapshot']
}): GraphContext => {
  const reset = Boolean(input.reset)
  const target = {
    node: resolveScope(
      reset
        ? 'all'
        : input.facts.graph.node,
      () => [
        ...Object.keys(input.working.document.snapshot.nodes),
        ...input.working.graph.nodes.keys()
      ]
    ),
    edge: resolveScope(
      reset
        ? 'all'
        : input.facts.graph.edge,
      () => [
        ...Object.keys(input.working.document.snapshot.edges),
        ...input.working.graph.edges.keys()
      ]
    ),
    mindmap: resolveScope(
      reset
        ? 'all'
        : input.facts.graph.mindmap,
      () => [
        ...Object.keys(input.working.document.snapshot.mindmaps),
        ...input.working.graph.owners.mindmaps.keys()
      ]
    ),
    group: resolveScope(
      reset
        ? 'all'
        : input.facts.graph.group,
      () => [
        ...Object.keys(input.working.document.snapshot.groups),
        ...input.working.graph.owners.groups.keys()
      ]
    ),
    order: reset || input.facts.order
  }
  const queue = createGraphQueue()

  return {
    revision: input.revision,
    current: input.current,
    working: input.working,
    facts: input.facts,
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
