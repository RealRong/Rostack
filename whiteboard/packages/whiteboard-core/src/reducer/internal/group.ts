import { json } from '@shared/core'
import type {
  Group,
  GroupField,
  GroupId
} from '@whiteboard/core/types'
import {
  captureGroup,
  getGroup,
  markGroupAdded,
  markGroupRemoved,
  markGroupUpdated,
  type WhiteboardReduceState
} from './state'

const GROUP_PATCH_FIELDS = ['locked', 'name'] as const

const hasOwn = <T extends object>(
  value: T,
  key: PropertyKey
): boolean => Object.prototype.hasOwnProperty.call(value, key)

export const createGroup = (
  state: WhiteboardReduceState,
  group: Group
): void => {
  state.draft.groups.set(group.id, group)
  state.inverse.prepend({
    type: 'group.delete',
    id: group.id
  })
  markGroupAdded(state, group.id)
}

export const restoreGroup = (
  state: WhiteboardReduceState,
  group: Group
): void => {
  state.draft.groups.set(group.id, group)
  state.inverse.prepend({
    type: 'group.delete',
    id: group.id
  })
  markGroupAdded(state, group.id)
}

export const deleteGroup = (
  state: WhiteboardReduceState,
  id: GroupId
): void => {
  const current = getGroup(state.draft, id)
  if (!current) {
    return
  }

  state.inverse.prepend({
    type: 'group.restore',
    group: captureGroup(state, id)
  })
  state.draft.groups.delete(id)
  markGroupRemoved(state, id)
}

export const patchGroup = (
  state: WhiteboardReduceState,
  id: GroupId,
  fields?: Partial<Record<GroupField, Group[GroupField] | undefined>>
): void => {
  const current = getGroup(state.draft, id)
  if (!current) {
    throw new Error(`Group ${id} not found.`)
  }

  if (!fields) {
    return
  }

  const inverse: Partial<Record<GroupField, Group[GroupField] | undefined>> = {}
  let next = current
  GROUP_PATCH_FIELDS.forEach((field) => {
    if (!hasOwn(fields, field)) {
      return
    }

    inverse[field] = json.clone(current[field]) as Group[typeof field]
    next = {
      ...next,
      [field]: json.clone(fields[field])
    }
  })

  state.inverse.prepend({
    type: 'group.patch',
    id,
    fields: inverse
  })
  state.draft.groups.set(id, next)
  markGroupUpdated(state, id)
}
