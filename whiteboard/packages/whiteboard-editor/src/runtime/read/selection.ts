import {
  deriveSelectionSummary,
  isSelectionSummaryEqual,
  resolveSelectionTransformBox,
  resolveSelectionBoxTarget,
  type SelectionSummary,
  type SelectionTransformBox,
  type SelectionTarget
} from '@whiteboard/core/selection'
import {
  createDerivedStore,
  type ReadFn,
  type ReadStore
} from '@whiteboard/engine'
import type { Edge, Node } from '@whiteboard/core/types'
import type { EdgeRead } from './edge'
import type { NodeRead } from './node'
import type { TargetBoundsQuery } from '../query/targetBounds'

export type SelectionRead = {
  target: ReadStore<SelectionTarget>
  summary: ReadStore<SelectionSummary>
  transformBox: ReadStore<SelectionTransformBox>
}

const readRuntimeNodes = (input: {
  node: Pick<NodeRead, 'item' | 'list'>
  readStore: ReadFn
}) => input.readStore(input.node.list)
  .map((nodeId) => input.readStore(input.node.item, nodeId)?.node)
  .filter((entry): entry is Node => Boolean(entry))

const isSelectionTransformBoxEqual = (
  left: SelectionTransformBox,
  right: SelectionTransformBox
) => (
  left.canResize === right.canResize
  && left.box?.x === right.box?.x
  && left.box?.y === right.box?.y
  && left.box?.width === right.box?.width
  && left.box?.height === right.box?.height
)

export const createSelectionRead = ({
  source,
  node,
  edge,
  targetBounds
}: {
  source: ReadStore<SelectionTarget>
  node: NodeRead
  edge: EdgeRead
  targetBounds: TargetBoundsQuery
}): SelectionRead => {
  const summary = createDerivedStore<SelectionSummary>({
    get: (readStore) => {
      const selectionTarget = readStore(source)
      const runtimeNodes = readRuntimeNodes({
        node,
        readStore
      })
      const nodes = selectionTarget.nodeIds
        .map((nodeId) => readStore(node.item, nodeId)?.node)
        .filter((entry): entry is Node => Boolean(entry))
      const edges = selectionTarget.edgeIds
        .map((edgeId) => readStore(edge.item, edgeId)?.edge)
        .filter((entry): entry is Edge => Boolean(entry))

      return deriveSelectionSummary({
        target: selectionTarget,
        nodes,
        edges,
        readBounds: (target) => targetBounds.track(
          readStore,
          resolveSelectionBoxTarget(target, runtimeNodes)
        ),
        isNodeScalable: (entry) => (
          !entry.locked
          && node.capability(entry).role !== 'frame'
        ),
        resolveNodeTransformCapability: (entry) => {
          const capability = node.capability(entry)

          return {
            resize: capability.resize,
            rotate: capability.rotate
          }
        }
      })
    },
    isEqual: isSelectionSummaryEqual
  })
  const transformBox = createDerivedStore<SelectionTransformBox>({
    get: (readStore) => resolveSelectionTransformBox(
      readStore(summary)
    ),
    isEqual: isSelectionTransformBoxEqual
  })

  return {
    target: source,
    summary,
    transformBox
  }
}
