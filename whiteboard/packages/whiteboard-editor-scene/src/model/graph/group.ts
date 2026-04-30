import { equal } from '@shared/core'
import { selection as selectionApi, type SelectionTarget } from '@whiteboard/core/selection'
import type {
  GroupId
} from '@whiteboard/core/types'
import type { GraphPhaseDelta } from '../../contracts/delta'
import type {
  GroupItemRef,
  EdgeView,
  GroupView,
  Input,
  NodeView
} from '../../contracts/editor'
import type {
  GraphGroupEntry,
  WorkingState
} from '../../contracts/working'
import { geometry as geometryApi } from '@whiteboard/core/geometry'
import { applyEntity } from '@shared/projection'

const SIGNATURE_SEPARATOR = '\u0001'
const SIGNATURE_SECTION = '\u0002'

const isCanvasItemRefEqual = (
  left: GroupItemRef,
  right: GroupItemRef
): boolean => left.kind === right.kind
  && left.id === right.id

const isGroupViewEqual = (
  left: GroupView,
  right: GroupView
): boolean => (
  left.base.group === right.base.group
  && equal.sameOrder(left.structure.items, right.structure.items, isCanvasItemRefEqual)
  && equal.sameOptionalRect(left.frame.bounds, right.frame.bounds)
)

const isGroupGeometryChanged = (
  previous: GroupView | undefined,
  next: GroupView | undefined
): boolean => (
  previous === undefined
  || next === undefined
  || !equal.sameOptionalRect(previous.frame.bounds, next.frame.bounds)
)

const patchGroupItems = (
  previous: readonly GroupItemRef[] | undefined,
  next: readonly GroupItemRef[]
): readonly GroupItemRef[] => previous && equal.sameOrder(previous, next, isCanvasItemRefEqual)
  ? previous
  : next

export const readGroupSignatureFromTarget = (
  target: SelectionTarget
): string => [
  target.nodeIds.join(SIGNATURE_SEPARATOR),
  target.edgeIds.join(SIGNATURE_SEPARATOR)
].join(SIGNATURE_SECTION)

export const readGroupSignatureFromItems = (
  items: readonly GroupItemRef[]
): string => {
  const nodeIds: string[] = []
  const edgeIds: string[] = []

  items.forEach((item) => {
    if (item.kind === 'node') {
      nodeIds.push(item.id)
      return
    }

    edgeIds.push(item.id)
  })

  return readGroupSignatureFromTarget(
    selectionApi.target.normalize({
      nodeIds,
      edgeIds
    })
  )
}

export const readGroupTarget = (
  items: readonly GroupItemRef[]
): SelectionTarget => selectionApi.target.normalize({
  nodeIds: items
    .filter((item): item is Extract<GroupItemRef, { kind: 'node' }> => item.kind === 'node')
    .map((item) => item.id),
  edgeIds: items
    .filter((item): item is Extract<GroupItemRef, { kind: 'edge' }> => item.kind === 'edge')
    .map((item) => item.id)
})

const readGroupEntry = (
  input: Input,
  working: WorkingState,
  indexes: WorkingState['indexes'],
  groupId: GroupId
): GraphGroupEntry | undefined => {
  const group = working.document.snapshot.groups[groupId]
  if (!group) {
    return undefined
  }

  return {
    items: indexes.groupItems.get(groupId) ?? []
  }
}

const buildGroupView = (input: {
  previous?: GroupView
  group: GroupView['base']['group']
  items: readonly GroupItemRef[]
  nodes: Pick<WorkingState['graph']['nodes'], 'get'>
  edges: Pick<WorkingState['graph']['edges'], 'get'>
}): GroupView => {
  const rects = input.items.flatMap((item) => {
    if (item.kind === 'node') {
      const rect = input.nodes.get(item.id)?.geometry.bounds
      return rect
        ? [rect]
        : []
    }

    const rect = input.edges.get(item.id)?.route.bounds
    return rect
      ? [rect]
      : []
  })

  return {
    base: {
      group: input.group
    },
    structure: {
      items: patchGroupItems(input.previous?.structure.items, input.items)
    },
    frame: {
      bounds: geometryApi.rect.boundingRect(rects)
    }
  }
}

export const patchGroup = (input: {
  input: Input
  working: WorkingState
  delta: GraphPhaseDelta
  groupId: GroupId
}): {
  changed: boolean
  geometryChanged: boolean
} => {
  const previous = input.working.graph.owners.groups.get(input.groupId)
  const entry = readGroupEntry(input.input, input.working, input.working.indexes, input.groupId)
  const group = input.working.document.snapshot.groups[input.groupId]
  const next = entry && group
    ? buildGroupView({
        previous,
        group,
        items: entry.items,
        nodes: input.working.graph.nodes,
        edges: input.working.graph.edges
      })
    : undefined

  return applyEntity({
    id: input.groupId,
    previous,
    next,
    equal: isGroupViewEqual,
    geometryChanged: isGroupGeometryChanged,
    write: (value) => {
      if (value === undefined) {
        input.working.graph.owners.groups.delete(input.groupId)
        return
      }

      input.working.graph.owners.groups.set(input.groupId, value)
    },
    entityDelta: input.delta.entities.groups,
    geometryDelta: input.delta.geometry.groups
  })
}
