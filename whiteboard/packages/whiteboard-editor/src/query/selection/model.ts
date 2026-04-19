import {
  deriveSelectionAffordance,
  deriveSelectionSummary,
  isSelectionAffordanceEqual,
  isSelectionSummaryEqual,
  type SelectionAffordance,
  type SelectionSummary,
  type SelectionTarget
} from '@whiteboard/core/selection'
import type { Node } from '@whiteboard/core/types'
import { resolveNodeTransformBehavior } from '@whiteboard/core/node'
import {
  createDerivedStore,
  read,
  type ReadStore
} from '@shared/core'
import type { EdgePresentationRead } from '@whiteboard/editor/query/edge/read'
import type { NodePresentationRead } from '@whiteboard/editor/query/node/read'
import type { SelectionMembers, SelectionModel } from '@whiteboard/editor/types/selectionPresentation'

export type SelectionModelRead = ReadStore<SelectionModel>

const isSelectionMembersEqual = (
  left: SelectionMembers,
  right: SelectionMembers
) => (
  left.key === right.key
  && left.target === right.target
  && left.nodes === right.nodes
  && left.edges === right.edges
  && left.primaryNode === right.primaryNode
  && left.primaryEdge === right.primaryEdge
)

const isSelectionModelEqual = (
  left: SelectionModel,
  right: SelectionModel
) => (
  isSelectionMembersEqual(left.members, right.members)
  && isSelectionSummaryEqual(left.summary, right.summary)
  && isSelectionAffordanceEqual(left.affordance, right.affordance)
)

const readSelectionMembersKey = (
  target: SelectionTarget
) => `${target.nodeIds.join('\0')}\u0001${target.edgeIds.join('\0')}`

const readNodeTransformCapability = (
  node: Pick<NodePresentationRead, 'capability'>,
  entry: Node
) => {
  const capability = node.capability(entry)

  return {
    resize: capability.resize,
    rotate: capability.rotate
  }
}

export const createSelectionModelRead = ({
  source,
  node,
  edge
}: {
  source: ReadStore<SelectionTarget>
  node: NodePresentationRead
  edge: Pick<EdgePresentationRead, 'edges' | 'bounds'>
}): SelectionModelRead => {
  const members = createDerivedStore<SelectionMembers>({
    get: () => {
      const target = read(source)
      const nodes = node.nodes(target.nodeIds)
      const edges = edge.edges(target.edgeIds)

      return {
        key: readSelectionMembersKey(target),
        target,
        nodes,
        edges,
        primaryNode: nodes[0],
        primaryEdge: edges[0]
      }
    },
    isEqual: isSelectionMembersEqual
  })

  const summary = createDerivedStore<SelectionSummary>({
    get: () => {
      const current = read(members)

      return deriveSelectionSummary({
        target: current.target,
        nodes: current.nodes,
        edges: current.edges,
        readNodeRect: (entry) => read(node.rect, entry.id),
        readEdgeBounds: (entry) => read(edge.bounds, entry.id),
        resolveNodeTransformBehavior: (entry) => resolveNodeTransformBehavior(entry, {
          role: node.capability(entry).role,
          resize: node.capability(entry).resize
        })
      })
    },
    isEqual: isSelectionSummaryEqual
  })

  const affordance = createDerivedStore<SelectionAffordance>({
    get: () => deriveSelectionAffordance({
      selection: read(summary),
      resolveNodeRole: (entry) => node.capability(entry).role,
      resolveNodeTransformCapability: (entry) => readNodeTransformCapability(node, entry)
    }),
    isEqual: isSelectionAffordanceEqual
  })

  return createDerivedStore<SelectionModel>({
    get: () => ({
      members: read(members),
      summary: read(summary),
      affordance: read(affordance)
    }),
    isEqual: isSelectionModelEqual
  })
}
