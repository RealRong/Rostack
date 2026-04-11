import {
  deriveSelectionAffordance,
  deriveSelectionSummary,
  getTargetBounds,
  isSelectionAffordanceEqual,
  isSelectionSummaryEqual,
  resolveSelectionTransformBox,
  type SelectionAffordance,
  type SelectionSummary,
  type SelectionTarget,
  type SelectionTransformBox
} from '@whiteboard/core/selection'
import type { Edge, Node, Rect } from '@whiteboard/core/types'
import { sameOptionalRect as isSameOptionalRectTuple } from '@shared/core'
import {
  createDerivedStore,
  type ReadFn,
  type ReadStore
} from '@shared/core'
import type { EdgeRead } from './edge'
import type { NodeRead } from './node'
import type { NodeRegistry } from '../../types/node'
import type { Tool } from '../../types/tool'
import type { EditSession } from '../state/edit'
import type { InteractionRuntime } from '../interaction/types'
import type {
  SelectionNodeInfo,
  SelectionOverlay,
  NodeToolbarContext
} from '../../selection'
import { readSelectionNodeInfo } from '../../selection/nodeSummary'
import {
  resolveSelectionOverlay,
  resolveSelectionToolbar
} from './selectionPresentation'

export type SelectionRead = {
  box: ReadStore<Rect | undefined>
  node: ReadStore<SelectionNodeInfo | undefined>
  overlay: ReadStore<SelectionOverlay | undefined>
  nodeToolbar: ReadStore<NodeToolbarContext | undefined>
}

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

const isSelectionNodeInfoEqual = (
  left: SelectionNodeInfo | undefined,
  right: SelectionNodeInfo | undefined
) => {
  if (!left || !right) {
    return left === right
  }

  return (
    left.lock === right.lock
    && left.types.length === right.types.length
    && left.types.every((entry, index) => {
      const other = right.types[index]
      return Boolean(other)
        && entry.key === other.key
        && entry.name === other.name
        && entry.family === other.family
        && entry.icon === other.icon
        && entry.count === other.count
        && entry.nodeIds.length === other.nodeIds.length
        && entry.nodeIds.every((nodeId, nodeIndex) => nodeId === other.nodeIds[nodeIndex])
    })
  )
}

const readSelectedNodes = (
  node: NodeRead,
  target: SelectionTarget,
  readStore: ReadFn
) => target.nodeIds
  .map((nodeId) => readStore(node.item, nodeId)?.node)
  .filter((entry): entry is Node => Boolean(entry))

const readSelectedEdges = (
  edge: EdgeRead,
  target: SelectionTarget,
  readStore: ReadFn
) => target.edgeIds
  .map((edgeId) => readStore(edge.item, edgeId)?.edge)
  .filter((entry): entry is Edge => Boolean(entry))

const readTrackedTargetBounds = (
  readStore: ReadFn,
  node: Pick<NodeRead, 'bounds'>,
  edge: Pick<EdgeRead, 'bounds'>,
  target: SelectionTarget
) => getTargetBounds({
  target,
  readNodeBounds: (nodeId) => readStore(node.bounds, nodeId),
  readEdgeBounds: (edgeId) => readStore(edge.bounds, edgeId)
})

export const createSelectionRead = ({
  source,
  node,
  edge,
  registry,
  tool,
  edit,
  interaction
}: {
  source: ReadStore<SelectionTarget>
  node: NodeRead
  edge: EdgeRead
  registry: Pick<NodeRegistry, 'get'>
  tool: ReadStore<Tool>
  edit: ReadStore<EditSession>
  interaction: Pick<InteractionRuntime, 'mode' | 'chrome'>
}): {
  public: SelectionRead
  model: SelectionModelRead
} => {
  const summary = createDerivedStore<SelectionSummary>({
    get: (readStore) => {
      const selectionTarget = readStore(source)
      const nodes = readSelectedNodes(node, selectionTarget, readStore)
      const edges = readSelectedEdges(edge, selectionTarget, readStore)

      return deriveSelectionSummary({
        target: selectionTarget,
        nodes,
        edges,
        readBounds: (target) => readTrackedTargetBounds(
          readStore,
          node,
          edge,
          target
        ),
        isNodeScalable: (entry) => (
          !entry.locked
          && node.capability(entry).role === 'content'
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
    get: (readStore) => {
      const selectionTarget = readStore(source)
      const box = selectionTarget.nodeIds.length > 0
        ? readTrackedTargetBounds(readStore, node, edge, {
          nodeIds: selectionTarget.nodeIds,
          edgeIds: []
        })
        : undefined

      return resolveSelectionTransformBox(
        readStore(summary),
        box
      )
    },
    isEqual: isSelectionTransformBoxEqual
  })
  const affordance = createDerivedStore<SelectionAffordance>({
    get: (readStore) => {
      const resolvedSummary = readStore(summary)
      const resolvedTransformBox = readStore(transformBox)

      return deriveSelectionAffordance({
        selection: resolvedSummary,
        transformBox: resolvedTransformBox.box,
        resolveNodeRole: (entry) => node.capability(entry).role,
        resolveNodeTransformCapability: (entry) => {
          const capability = node.capability(entry)

          return {
            resize: capability.resize,
            rotate: capability.rotate
          }
        }
      })
    },
    isEqual: isSelectionAffordanceEqual
  })
  const model = createDerivedStore<SelectionModel>({
    get: (readStore) => ({
      summary: readStore(summary),
      transformBox: readStore(transformBox),
      affordance: readStore(affordance)
    }),
    isEqual: isSelectionModelEqual
  })
  const box = createDerivedStore<Rect | undefined>({
    get: (readStore) => readStore(model).summary.box,
    isEqual: isSameOptionalRectTuple
  })
  const nodeInfo = createDerivedStore<SelectionNodeInfo | undefined>({
    get: (readStore) => readSelectionNodeInfo({
      summary: readStore(model).summary,
      registry
    }),
    isEqual: isSelectionNodeInfoEqual
  })
  const overlay = createDerivedStore<SelectionOverlay | undefined>({
    get: (readStore) => {
      const resolvedModel = readStore(model)

      return resolveSelectionOverlay({
        summary: resolvedModel.summary,
        transformBox: resolvedModel.transformBox,
        affordance: resolvedModel.affordance,
        tool: readStore(tool),
        edit: readStore(edit),
        interactionChrome: readStore(interaction.chrome),
        transforming: readStore(interaction.mode) === 'node-transform'
      })
    }
  })
  const nodeToolbar = createDerivedStore<NodeToolbarContext | undefined>({
    get: (readStore) => {
      const resolvedModel = readStore(model)

      return resolveSelectionToolbar({
        summary: resolvedModel.summary,
        affordance: resolvedModel.affordance,
        registry,
        tool: readStore(tool),
        edit: readStore(edit),
        interactionChrome: readStore(interaction.chrome)
      })
    }
  })

  return {
    public: {
      box,
      node: nodeInfo,
      overlay,
      nodeToolbar
    },
    model
  }
}
