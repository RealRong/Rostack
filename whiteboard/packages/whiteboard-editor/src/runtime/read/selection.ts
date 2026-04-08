import {
  deriveSelectionAffordance,
  deriveSelectionSummary,
  isSelectionAffordanceEqual,
  isSelectionSummaryEqual,
  resolveSelectionTransformBox,
  resolveSelectionBoxTarget,
  type SelectionAffordance,
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
import type { NodeRegistry } from '../../types/node'
import type { Tool } from '../../types/tool'
import type { EditTarget } from '../state/edit'
import type { InteractionRuntime } from '../interaction/types'
import type { SelectionPresentation } from '../../types/selectionPresentation'
import { resolveSelectionPresentation } from './selectionPresentation'

export type SelectionRead = {
  target: ReadStore<SelectionTarget>
  summary: ReadStore<SelectionSummary>
  transformBox: ReadStore<SelectionTransformBox>
  affordance: ReadStore<SelectionAffordance>
  presentation: ReadStore<SelectionPresentation>
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
  targetBounds,
  registry,
  tool,
  edit,
  interaction
}: {
  source: ReadStore<SelectionTarget>
  node: NodeRead
  edge: EdgeRead
  targetBounds: TargetBoundsQuery
  registry: Pick<NodeRegistry, 'get'>
  tool: ReadStore<Tool>
  edit: ReadStore<EditTarget>
  interaction: Pick<InteractionRuntime, 'mode' | 'chrome'>
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
      const runtimeNodes = readRuntimeNodes({
        node,
        readStore
      })
      const box = selectionTarget.nodeIds.length > 0
        ? targetBounds.track(readStore, resolveSelectionBoxTarget({
          nodeIds: selectionTarget.nodeIds
        }, runtimeNodes))
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
      const selection = readStore(summary)
      const resolvedTransformBox = readStore(transformBox)

      return deriveSelectionAffordance({
        selection,
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
  const presentation = createDerivedStore<SelectionPresentation>({
    get: (readStore) => resolveSelectionPresentation({
      summary: readStore(summary),
      transformBox: readStore(transformBox),
      affordance: readStore(affordance),
      registry,
      tool: readStore(tool),
      edit: readStore(edit),
      interactionChrome: readStore(interaction.chrome),
      transforming: readStore(interaction.mode) === 'node-transform'
    })
  })

  return {
    target: source,
    summary,
    transformBox,
    affordance,
    presentation
  }
}
