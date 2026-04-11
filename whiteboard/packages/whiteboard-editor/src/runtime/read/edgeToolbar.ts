import type {
  Edge,
  EdgeDash,
  EdgeId,
  EdgeMarker,
  EdgeTextMode,
  EdgeType
} from '@whiteboard/core/types'
import {
  sameOptionalBox as isSameOptionalBoxTuple,
  sameOrder as isOrderedArrayEqual
} from '@shared/core'
import { createDerivedStore, type ReadStore } from '@shared/core'
import type { TargetBoundsQuery } from '../query/targetBounds'
import type { Tool } from '../../types/tool'
import type { EditSession } from '../state/edit'
import type { InteractionRuntime } from '../interaction/types'
import type { EdgeRead } from './edge'
import type { EdgeToolbarContext } from '../../types/edgePresentation'

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

const readUniformValue = <TValue,>(
  edges: readonly Edge[],
  read: (edge: Edge) => TValue
): TValue | undefined => {
  if (edges.length === 0) {
    return undefined
  }

  const first = read(edges[0]!)
  return edges.every((edge) => Object.is(first, read(edge)))
    ? first
    : undefined
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
  edge,
  targetBounds,
  tool,
  edit,
  interaction
}: {
  selection: ReadStore<{
    nodeIds: readonly string[]
    edgeIds: readonly string[]
  }>
  edge: Pick<EdgeRead, 'item'>
  targetBounds: TargetBoundsQuery
  tool: ReadStore<Tool>
  edit: ReadStore<EditSession>
  interaction: Pick<InteractionRuntime, 'mode' | 'chrome'>
}): ReadStore<EdgeToolbarContext | undefined> => createDerivedStore({
  get: (readStore): EdgeToolbarContext | undefined => {
    const target = readStore(selection)
    if (target.nodeIds.length > 0 || target.edgeIds.length === 0) {
      return undefined
    }

    if (
      readStore(tool).type !== 'select'
      || readStore(edit) !== null
      || !readStore(interaction.chrome)
      || isEdgeEditingInteraction(readStore(interaction.mode))
    ) {
      return undefined
    }

    const edges = target.edgeIds
      .map((edgeId) => readStore(edge.item, edgeId)?.edge)
      .filter((entry): entry is Edge => Boolean(entry))

    if (edges.length === 0) {
      return undefined
    }

    const box = targetBounds.track(readStore, {
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
