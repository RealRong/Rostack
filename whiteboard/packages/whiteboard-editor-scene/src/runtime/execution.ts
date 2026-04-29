import { idDelta } from '@shared/delta'
import type {
  EdgeId,
  GroupId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import type { Input } from '../contracts/editor'
import type {
  ExecutionScope,
  WhiteboardExecution
} from '../contracts/execution'
import {
  createEmptyWhiteboardExecution
} from '../contracts/execution'

const enqueueAll = <TId extends string>(
  target: Set<TId>,
  values: Iterable<TId>
) => {
  for (const value of values) {
    target.add(value)
  }
}

const toScope = <TId extends string>(
  values: Iterable<TId>
): ExecutionScope<TId> => new Set(values)

export const createWhiteboardExecution = (
  input: Input
): WhiteboardExecution => {
  const execution = createEmptyWhiteboardExecution()
  const graphTargets = input.delta.graph.targets()
  const runtimeDelta = input.runtime.delta

  execution.reset = input.delta.reset === true || graphTargets.reset
  execution.order = execution.reset || graphTargets.order

  if (execution.reset) {
    execution.target = {
      node: 'all',
      edge: 'all',
      mindmap: 'all',
      group: 'all'
    }
  } else {
    const nodeTargets = new Set<NodeId>(graphTargets.nodes as ReadonlySet<NodeId>)
    const edgeTargets = new Set<EdgeId>(graphTargets.edges as ReadonlySet<EdgeId>)
    const mindmapTargets = new Set<MindmapId>(graphTargets.mindmaps as ReadonlySet<MindmapId>)
    const groupTargets = new Set<GroupId>(graphTargets.groups as ReadonlySet<GroupId>)

    enqueueAll(edgeTargets, idDelta.touched(runtimeDelta.session.draft.edges))
    enqueueAll(nodeTargets, idDelta.touched(runtimeDelta.session.preview.nodes))
    enqueueAll(edgeTargets, idDelta.touched(runtimeDelta.session.preview.edges))
    enqueueAll(mindmapTargets, idDelta.touched(runtimeDelta.session.preview.mindmaps))
    enqueueAll(mindmapTargets, runtimeDelta.clock.mindmaps)

    enqueueAll(edgeTargets, input.runtime.session.draft.edges.keys())
    enqueueAll(nodeTargets, input.runtime.session.preview.nodes.keys())
    enqueueAll(edgeTargets, input.runtime.session.preview.edges.keys())

    if (input.runtime.session.edit?.kind === 'node') {
      nodeTargets.add(input.runtime.session.edit.nodeId)
    }
    if (input.runtime.session.edit?.kind === 'edge-label') {
      edgeTargets.add(input.runtime.session.edit.edgeId)
    }

    if (input.runtime.session.preview.mindmap?.rootMove) {
      mindmapTargets.add(input.runtime.session.preview.mindmap.rootMove.mindmapId)
    }
    if (input.runtime.session.preview.mindmap?.subtreeMove) {
      mindmapTargets.add(input.runtime.session.preview.mindmap.subtreeMove.mindmapId)
    }
    input.runtime.session.preview.mindmap?.enter?.forEach((entry) => {
      mindmapTargets.add(entry.mindmapId)
    })

    execution.target = {
      node: toScope(nodeTargets),
      edge: toScope(edgeTargets),
      mindmap: toScope(mindmapTargets),
      group: toScope(groupTargets)
    }
  }

  const runtimeNodeIds = new Set<NodeId>([
    ...idDelta.touched(runtimeDelta.session.preview.nodes),
    ...(input.runtime.session.edit?.kind === 'node'
      ? [input.runtime.session.edit.nodeId]
      : [])
  ])
  const runtimeEdgeIds = new Set<EdgeId>([
    ...idDelta.touched(runtimeDelta.session.draft.edges),
    ...idDelta.touched(runtimeDelta.session.preview.edges),
    ...(input.runtime.session.edit?.kind === 'edge-label'
      ? [input.runtime.session.edit.edgeId]
      : [])
  ])
  const runtimeMindmapIds = new Set<MindmapId>([
    ...idDelta.touched(runtimeDelta.session.preview.mindmaps),
    ...runtimeDelta.clock.mindmaps
  ])

  execution.runtime = {
    node: runtimeNodeIds,
    edge: runtimeEdgeIds,
    mindmap: runtimeMindmapIds,
    ui: Boolean(
      runtimeDelta.session.tool
      || runtimeDelta.session.selection
      || runtimeDelta.session.hover
      || runtimeDelta.session.edit
      || runtimeDelta.session.interaction
      || runtimeDelta.session.preview.marquee
      || runtimeDelta.session.preview.guides
      || runtimeDelta.session.preview.draw
      || runtimeDelta.session.preview.edgeGuide
      || runtimeDelta.session.preview.mindmaps.added.size > 0
      || runtimeDelta.session.preview.mindmaps.updated.size > 0
      || runtimeDelta.session.preview.mindmaps.removed.size > 0
      || runtimeDelta.clock.mindmaps.size > 0
    )
  }

  return execution
}
