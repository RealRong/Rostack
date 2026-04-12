import type {
  Edge,
  EdgeDash,
  EdgeId,
  EdgeMarker,
  EdgeTextMode,
  EdgeType
} from '@whiteboard/core/types'
import {
  createDerivedStore,
  read,
  sameOptionalBox as isSameOptionalBoxTuple,
  sameOrder as isOrderedArrayEqual,
  type ReadStore
} from '@shared/core'
import type { Tool } from '../../types/tool'
import type { EditSession } from '../state/edit'
import type { InteractionRuntime } from '../interaction/types'
import type { NodeRead } from './node'
import type { EdgeRead } from './edge'
import type { EdgeToolbarContext } from '../../types/edgePresentation'
import { createTargetRead } from './target'
import { readUniformValue } from './utils'

const isEdgeToolbarEqual = (
  left: EdgeToolbarContext | undefined,
  right: EdgeToolbarContext | undefined
) => {
  if (!left || !right) {
    return left === right
  }

  return (
    left.selectionKey === right.selectionKey
    && isOrderedArrayEqual(left.edgeIds, right.edgeIds)
    && left.primaryEdgeId === right.primaryEdgeId
    && left.type === right.type
    && left.color === right.color
    && left.width === right.width
    && left.dash === right.dash
    && left.start === right.start
    && left.end === right.end
    && left.textMode === right.textMode
    && left.labelCount === right.labelCount
    && isSameOptionalBoxTuple(left.box, right.box)
  )
}

const isEdgeEditingInteraction = (
  mode: ReturnType<InteractionRuntime['mode']['get']>
) => (
  mode === 'edge-drag'
  || mode === 'edge-connect'
  || mode === 'edge-route'
)

export const createEdgeToolbarRead = ({
  selection,
  node,
  edge,
  tool,
  edit,
  interaction
}: {
  selection: ReadStore<{
    nodeIds: readonly string[]
    edgeIds: readonly string[]
  }>
  node: Pick<NodeRead, 'nodes' | 'bounds'>
  edge: Pick<EdgeRead, 'edges' | 'bounds'>
  tool: ReadStore<Tool>
  edit: ReadStore<EditSession>
  interaction: Pick<InteractionRuntime, 'mode' | 'chrome'>
}): ReadStore<EdgeToolbarContext | undefined> => {
  const targetRead = createTargetRead({
    node,
    edge
  })

  return createDerivedStore({
    get: (): EdgeToolbarContext | undefined => {
      const target = read(selection)
      if (target.nodeIds.length > 0 || target.edgeIds.length === 0) {
        return undefined
      }

      if (
        read(tool).type !== 'select'
        || read(edit) !== null
        || !read(interaction.chrome)
        || isEdgeEditingInteraction(read(interaction.mode))
      ) {
        return undefined
      }

      const edges = targetRead.edges(target)

      if (edges.length === 0) {
        return undefined
      }

      const box = targetRead.bounds({
        nodeIds: [],
        edgeIds: edges.map((entry) => entry.id)
      })
      if (!box) {
        return undefined
      }

      const primary = edges[0]
      const edgeIds = edges.map((entry) => entry.id) as readonly EdgeId[]

      return {
        box,
        selectionKey: edgeIds.join('\0'),
        edgeIds,
        primaryEdgeId: primary?.id,
        type: readUniformValue(edges, (entry) => entry.type as EdgeType),
        color: readUniformValue(edges, (entry) => entry.style?.color),
        width: readUniformValue(edges, (entry) => entry.style?.width),
        dash: readUniformValue(edges, (entry) => entry.style?.dash as EdgeDash | undefined),
        start: readUniformValue(edges, (entry) => entry.style?.start as EdgeMarker | undefined),
        end: readUniformValue(edges, (entry) => entry.style?.end as EdgeMarker | undefined),
        textMode: edges.length === 1
          ? (primary?.textMode ?? 'horizontal') as EdgeTextMode
          : undefined,
        labelCount: primary?.labels?.length ?? 0
      } satisfies EdgeToolbarContext
    },
    isEqual: isEdgeToolbarEqual
  })
}
