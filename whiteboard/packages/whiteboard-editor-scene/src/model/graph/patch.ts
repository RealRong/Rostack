import { resetGraphDelta } from '../../contracts/delta'
import type { WorkingState } from '../../contracts/working'
import { patchIndexState } from '../index/update'
import { createGraphContext, hasGraphTargets } from './context'
import { buildGraphFacts, graphSpatialChanged } from './facts'
import { patchGraphEdges } from './edges'
import { patchGraphGroups } from './groups'
import { patchGraphMindmaps } from './mindmaps'
import { patchGraphMindmapNodes, patchGraphNodes } from './nodes'
import { seedGraphFanout, seedGraphQueue } from './queue'

export const patchGraphState = (input: {
  revision: number
  current: Parameters<typeof createGraphContext>[0]['current']
  execution: Parameters<typeof createGraphContext>[0]['execution']
  working: WorkingState
  reset?: boolean
  previousDocument?: WorkingState['document']['snapshot']
}): {
  ran: boolean
  count: number
  spatialChanged: boolean
} => {
  const context = createGraphContext(input)

  resetGraphDelta(context.working.delta.graph)
  if (!hasGraphTargets(context)) {
    context.execution.graph = buildGraphFacts(context)
    return {
      ran: false,
      count: 0,
      spatialChanged: false
    }
  }

  context.working.delta.graph.revision = context.revision as typeof context.working.delta.graph.revision
  context.working.delta.graph.order = context.reset || context.target.order

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

  context.working.revision.document = context.current.document.rev
  context.execution.graph = buildGraphFacts(context)

  return {
    ran: true,
    count,
    spatialChanged: graphSpatialChanged(context)
  }
}
