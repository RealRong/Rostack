import type { GroupId } from '@whiteboard/core/types'
import type { Input, GroupView } from '../../contracts/editor'
import type { GraphDelta } from '../../contracts/delta'
import type {
  GraphGroupEntry,
  WorkingState
} from '../../contracts/working'
import { isGroupViewEqual } from '../equality'
import { isRectEqual } from '../geometry'
import { buildGroupView } from '../views'
import { patchFamilyEntry, patchOrderedIds } from './helpers'

const readGroupEntry = (
  input: Input,
  indexes: WorkingState['indexes'],
  groupId: GroupId
): GraphGroupEntry | undefined => {
  const group = input.document.snapshot.document.groups[groupId]
  if (!group) {
    return undefined
  }

  return {
    items: indexes.groupItems.get(groupId) ?? []
  }
}

const isGroupGeometryChanged = (
  previous: GroupView | undefined,
  next: GroupView | undefined
): boolean => (
  previous === undefined
  || next === undefined
  || !isRectEqual(previous.frame.bounds, next.frame.bounds)
)

export const patchGroup = (input: {
  input: Input
  working: WorkingState
  delta: GraphDelta
  groupId: GroupId
}): boolean => {
  const previous = input.working.graph.owners.groups.get(input.groupId)
  const entry = readGroupEntry(input.input, input.working.indexes, input.groupId)
  const group = input.input.document.snapshot.document.groups[input.groupId]
  const next = entry && group
    ? buildGroupView({
        group,
        items: patchOrderedIds({
          previous: previous?.structure.items,
          next: entry.items
        }),
        nodes: input.working.graph.nodes,
        edges: input.working.graph.edges
      })
    : undefined
  const action = patchFamilyEntry({
    family: input.working.graph.owners.groups,
    id: input.groupId,
    next,
    isEqual: isGroupViewEqual,
    delta: input.delta.entities.groups
  })
  const current = input.working.graph.owners.groups.get(input.groupId)
  const geometryTouched = action === 'added'
    || action === 'removed'
    || isGroupGeometryChanged(previous, current)

  if (geometryTouched) {
    input.delta.geometry.groups.add(input.groupId)
  }

  return action !== 'unchanged'
}
