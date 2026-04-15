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

export type SelectionModel = {
  summary: SelectionSummary
  affordance: SelectionAffordance
}

export type SelectionModelRead = ReadStore<SelectionModel>

const isSelectionModelEqual = (
  left: SelectionModel,
  right: SelectionModel
) => (
  isSelectionSummaryEqual(left.summary, right.summary)
  && isSelectionAffordanceEqual(left.affordance, right.affordance)
)

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
  const summary = createDerivedStore<SelectionSummary>({
    get: () => {
      const selectionTarget = read(source)
      const nodes = node.nodes(selectionTarget.nodeIds)
      const edges = edge.edges(selectionTarget.edgeIds)

      return deriveSelectionSummary({
        target: selectionTarget,
        nodes,
        edges,
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
    get: () => {
      return deriveSelectionAffordance({
        selection: read(summary),
        resolveNodeRole: (entry) => node.capability(entry).role,
        resolveNodeTransformCapability: (entry) => readNodeTransformCapability(node, entry)
      })
    },
    isEqual: isSelectionAffordanceEqual
  })

  return createDerivedStore<SelectionModel>({
    get: () => ({
      summary: read(summary),
      affordance: read(affordance)
    }),
    isEqual: isSelectionModelEqual
  })
}
