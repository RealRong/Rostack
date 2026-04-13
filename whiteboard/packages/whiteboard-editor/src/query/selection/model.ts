import {
  deriveSelectionAffordance,
  deriveSelectionSummary,
  isSelectionAffordanceEqual,
  isSelectionSummaryEqual,
  resolveSelectionTransformBox,
  type SelectionAffordance,
  type SelectionSummary,
  type SelectionTarget,
  type SelectionTransformBox
} from '@whiteboard/core/selection'
import type { Node } from '@whiteboard/core/types'
import {
  createDerivedStore,
  read,
  sameOptionalRect as isSameOptionalRectTuple,
  type ReadStore
} from '@shared/core'
import type { NodeRead } from '../node/read'
import type { RuntimeTargetRead } from '../target'

export type SelectionModel = {
  summary: SelectionSummary
  transformBox: SelectionTransformBox
  affordance: SelectionAffordance
}

export type SelectionModelRead = ReadStore<SelectionModel>

const isSelectionTransformBoxEqual = (
  left: SelectionTransformBox,
  right: SelectionTransformBox
) => (
  left.canResize === right.canResize
  && isSameOptionalRectTuple(left.box, right.box)
)

const isSelectionModelEqual = (
  left: SelectionModel,
  right: SelectionModel
) => (
  isSelectionSummaryEqual(left.summary, right.summary)
  && isSelectionTransformBoxEqual(left.transformBox, right.transformBox)
  && isSelectionAffordanceEqual(left.affordance, right.affordance)
)

const readNodeTransformCapability = (
  node: Pick<NodeRead, 'capability'>,
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
  target
}: {
  source: ReadStore<SelectionTarget>
  node: NodeRead
  target: RuntimeTargetRead
}): SelectionModelRead => {
  const summary = createDerivedStore<SelectionSummary>({
    get: () => {
      const selectionTarget = read(source)
      const nodes = target.nodes(selectionTarget)
      const edges = target.edges(selectionTarget)

      return deriveSelectionSummary({
        target: selectionTarget,
        nodes,
        edges,
        readBounds: target.bounds,
        isNodeScalable: (entry) => (
          !entry.locked
          && node.capability(entry).role === 'content'
        ),
        resolveNodeTransformCapability: (entry) => readNodeTransformCapability(node, entry)
      })
    },
    isEqual: isSelectionSummaryEqual
  })

  const transformBox = createDerivedStore<SelectionTransformBox>({
    get: () => {
      const selectionTarget = read(source)
      const box = selectionTarget.nodeIds.length > 0
        ? target.bounds({
            nodeIds: selectionTarget.nodeIds,
            edgeIds: []
          })
        : undefined

      return resolveSelectionTransformBox(
        read(summary),
        box
      )
    },
    isEqual: isSelectionTransformBoxEqual
  })

  const affordance = createDerivedStore<SelectionAffordance>({
    get: () => {
      const resolvedSummary = read(summary)
      const resolvedTransformBox = read(transformBox)

      return deriveSelectionAffordance({
        selection: resolvedSummary,
        transformBox: resolvedTransformBox.box,
        resolveNodeRole: (entry) => node.capability(entry).role,
        resolveNodeTransformCapability: (entry) => readNodeTransformCapability(node, entry)
      })
    },
    isEqual: isSelectionAffordanceEqual
  })

  return createDerivedStore<SelectionModel>({
    get: () => ({
      summary: read(summary),
      transformBox: read(transformBox),
      affordance: read(affordance)
    }),
    isEqual: isSelectionModelEqual
  })
}
