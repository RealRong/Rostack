import {
  selection as selectionApi,
  type SelectionAffordance,
  type SelectionSummary,
  type SelectionTarget
} from '@whiteboard/core/selection'
import { node as nodeApi } from '@whiteboard/core/node'
import { store } from '@shared/core'
import type { EdgePresentationRead } from '@whiteboard/editor/query/edge/read'
import type { NodePresentationRead } from '@whiteboard/editor/query/node/read'
import type { SelectionMembers, SelectionModel } from '@whiteboard/editor/types/selectionPresentation'

export type SelectionModelRead = store.ReadStore<SelectionModel>

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
  && selectionApi.derive.isSummaryEqual(left.summary, right.summary)
  && selectionApi.derive.isAffordanceEqual(left.affordance, right.affordance)
)

const readSelectionMembersKey = (
  target: SelectionTarget
) => `${target.nodeIds.join('\0')}\u0001${target.edgeIds.join('\0')}`

const readNodeTransformCapability = (
  node: Pick<NodePresentationRead, 'capability'>,
  entry: SelectionMembers['nodes'][number]
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
  source: store.ReadStore<SelectionTarget>
  node: NodePresentationRead
  edge: Pick<EdgePresentationRead, 'edges' | 'bounds'>
}): SelectionModelRead => {
  const members = store.createDerivedStore<SelectionMembers>({
    get: () => {
      const target = store.read(source)
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

  const summary = store.createDerivedStore<SelectionSummary>({
    get: () => {
      const current = store.read(members)

      return selectionApi.derive.summary({
        target: current.target,
        nodes: current.nodes,
        edges: current.edges,
        readNodeRect: (entry) => store.read(node.projected, entry.id)?.rect,
        readEdgeBounds: (entry) => store.read(edge.bounds, entry.id),
        resolveNodeTransformBehavior: (entry) => nodeApi.transform.resolveBehavior(entry, {
          role: node.capability(entry).role,
          resize: node.capability(entry).resize
        })
      })
    },
    isEqual: selectionApi.derive.isSummaryEqual
  })

  const affordance = store.createDerivedStore<SelectionAffordance>({
    get: () => selectionApi.derive.affordance({
      selection: store.read(summary),
      resolveNodeRole: (entry) => node.capability(entry).role,
      resolveNodeTransformCapability: (entry) => readNodeTransformCapability(node, entry)
    }),
    isEqual: selectionApi.derive.isAffordanceEqual
  })

  return store.createDerivedStore<SelectionModel>({
    get: () => ({
      members: store.read(members),
      summary: store.read(summary),
      affordance: store.read(affordance)
    }),
    isEqual: isSelectionModelEqual
  })
}
