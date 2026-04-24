import type { NodeId } from '@whiteboard/core/types'
import type {
  Input,
  NodeView
} from '../../contracts/editor'
import type { GraphDelta } from '../../contracts/delta'
import type {
  GraphNodeEntry,
  WorkingState
} from '../../contracts/working'
import { isNodeViewEqual } from '../equality'
import { isRectEqual } from '../geometry'
import { buildNodeView } from '../views'
import type { GraphPatchQueue } from './fanout'
import { fanoutNodeGeometry } from './fanout'
import { patchFamilyEntry } from './helpers'

const readNodeEntry = (
  input: Input,
  nodeId: NodeId
): GraphNodeEntry | undefined => {
  const node = input.document.snapshot.state.facts.entities.nodes.get(nodeId)
  if (!node) {
    return undefined
  }

  return {
    base: {
      node,
      owner: input.document.snapshot.state.facts.relations.nodeOwner.get(nodeId)
    },
    draft: input.session.draft.nodes.get(nodeId),
    preview: input.session.preview.nodes.get(nodeId)
  }
}

const isNodeGeometryChanged = (
  previous: NodeView | undefined,
  next: NodeView | undefined
): boolean => (
  previous === undefined
  || next === undefined
  || previous.geometry.rotation !== next.geometry.rotation
  || !isRectEqual(previous.geometry.rect, next.geometry.rect)
  || !isRectEqual(previous.geometry.bounds, next.geometry.bounds)
)

export const patchNode = (input: {
  input: Input
  working: WorkingState
  queue: GraphPatchQueue
  delta: GraphDelta
  nodeId: NodeId
}): boolean => {
  const previous = input.working.graph.nodes.get(input.nodeId)
  const entry = readNodeEntry(input.input, input.nodeId)
  const owner = entry?.base.owner
  const treeRect = owner?.kind === 'mindmap'
    ? input.working.graph.owners.mindmaps.get(owner.id)?.tree.layout?.node[input.nodeId]
    : undefined
  const next = entry
    ? buildNodeView({
        entry,
        measuredSize: input.input.measure.text.nodes.get(input.nodeId)?.size,
        treeRect,
        edit: input.input.session.edit
      })
    : undefined
  const action = patchFamilyEntry({
    family: input.working.graph.nodes,
    id: input.nodeId,
    next,
    isEqual: isNodeViewEqual,
    delta: input.delta.entities.nodes
  })
  const current = input.working.graph.nodes.get(input.nodeId)
  const geometryTouched = action === 'added'
    || action === 'removed'
    || isNodeGeometryChanged(previous, current)

  if (geometryTouched) {
    input.delta.geometry.nodes.add(input.nodeId)
    fanoutNodeGeometry({
      snapshot: input.input.document.snapshot,
      queue: input.queue,
      nodeId: input.nodeId
    })
  }

  return action !== 'unchanged'
}
