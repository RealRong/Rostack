import {
  compileFamilyChangeFromIdDelta,
  resetGraphPhaseDelta
} from '../../contracts/delta'
import type { EditorSceneInputFacts } from '../../contracts/facts'
import type { WorkingState } from '../../contracts/working'
import { createGraphFacts } from '../facts'
import { patchIndexState } from '../index/update'
import { createGraphContext, hasGraphTargets } from './context'
import { patchGraphEdges } from './edges'
import { patchGraphGroups } from './groups'
import { patchGraphMindmaps } from './mindmaps'
import { patchGraphMindmapNodes, patchGraphNodes } from './nodes'
import { seedGraphFanout, seedGraphQueue } from './queue'

export const patchGraphState = (input: {
  revision: number
  current: Parameters<typeof createGraphContext>[0]['current']
  facts: EditorSceneInputFacts
  working: WorkingState
  reset?: boolean
  previousDocument?: WorkingState['document']['snapshot']
}): {
  ran: boolean
  count: number
} => {
  const context = createGraphContext(input)
  const graphDelta = context.working.phase.graph

  resetGraphPhaseDelta(graphDelta)
  if (!hasGraphTargets(context)) {
    context.working.facts.graph = createGraphFacts({
      current: context.current,
      working: context.working,
      reset: false
    })
    context.working.delta.graph.node = 'skip'
    context.working.delta.graph.edge = 'skip'
    context.working.delta.graph.mindmap = 'skip'
    context.working.delta.graph.group = 'skip'
    return {
      ran: false,
      count: 0
    }
  }

  graphDelta.revision = context.revision as typeof graphDelta.revision
  graphDelta.order = context.reset || context.target.order

  patchIndexState({
    state: context.working.indexes,
    previous: context.previousDocument,
    next: context.working.document.snapshot,
    scope: {
      reset: context.reset,
      order: context.target.order,
      nodes: context.target.node,
      edges: context.target.edge,
      mindmaps: context.target.mindmap,
      groups: context.target.group
    }
  })

  seedGraphQueue(context)
  seedGraphFanout(context)

  const count = (
    patchGraphNodes(context)
    + patchGraphMindmaps(context)
    + patchGraphMindmapNodes(context)
    + patchGraphEdges(context)
    + patchGraphGroups(context)
  )

  context.working.facts.graph = createGraphFacts({
    current: context.current,
    working: context.working,
    reset: context.reset
  })

  context.working.delta.graph.node = compileFamilyChangeFromIdDelta({
    snapshot: context.working.graph.nodes,
    delta: graphDelta.entities.nodes,
    order: graphDelta.order
  })
  context.working.delta.graph.edge = compileFamilyChangeFromIdDelta({
    snapshot: context.working.graph.edges,
    delta: graphDelta.entities.edges,
    order: graphDelta.order
  })
  context.working.delta.graph.mindmap = compileFamilyChangeFromIdDelta({
    snapshot: context.working.graph.owners.mindmaps,
    delta: graphDelta.entities.mindmaps,
    order: graphDelta.order
  })
  context.working.delta.graph.group = compileFamilyChangeFromIdDelta({
    snapshot: context.working.graph.owners.groups,
    delta: graphDelta.entities.groups
  })

  return {
    ran: true,
    count
  }
}
