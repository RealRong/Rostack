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
import type { Edge, Node, Rect } from '@whiteboard/core/types'
import {
  read,
  sameOptionalRect as isSameOptionalRectTuple
} from '@shared/core'
import {
  createDerivedStore,
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
} from '../../types/selectionPresentation'
import {
  readSelectionNodeInfo,
  resolveSelectionOverlay,
  resolveSelectionToolbar
} from './presentation'
import { createTargetRead } from './target'

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
  const targetRead = createTargetRead({
    node,
    edge
  })
  const summary = createDerivedStore<SelectionSummary>({
    get: () => {
      const selectionTarget = read(source)
      const nodes = targetRead.nodes(selectionTarget)
      const edges = targetRead.edges(selectionTarget)

      return deriveSelectionSummary({
        target: selectionTarget,
        nodes,
        edges,
        readBounds: targetRead.bounds,
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
        ? targetRead.bounds({
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
  const model = createDerivedStore<SelectionModel>({
    get: () => ({
      summary: read(summary),
      transformBox: read(transformBox),
      affordance: read(affordance)
    }),
    isEqual: isSelectionModelEqual
  })
  const box = createDerivedStore<Rect | undefined>({
    get: () => read(model).summary.box,
    isEqual: isSameOptionalRectTuple
  })
  const nodeInfo = createDerivedStore<SelectionNodeInfo | undefined>({
    get: () => readSelectionNodeInfo({
      summary: read(model).summary,
      registry
    }),
    isEqual: isSelectionNodeInfoEqual
  })
  const overlay = createDerivedStore<SelectionOverlay | undefined>({
    get: () => {
      const resolvedModel = read(model)

      return resolveSelectionOverlay({
        summary: resolvedModel.summary,
        transformBox: resolvedModel.transformBox,
        affordance: resolvedModel.affordance,
        tool: read(tool),
        edit: read(edit),
        interactionChrome: read(interaction.chrome),
        transforming: read(interaction.mode) === 'node-transform'
      })
    }
  })
  const nodeToolbar = createDerivedStore<NodeToolbarContext | undefined>({
    get: () => {
      const resolvedModel = read(model)

      return resolveSelectionToolbar({
        summary: resolvedModel.summary,
        affordance: resolvedModel.affordance,
        registry,
        tool: read(tool),
        edit: read(edit),
        interactionChrome: read(interaction.chrome)
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
