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

const setGroupField = <Field extends GroupField>(
  group: Group,
  field: Field,
  value: Group[Field]
): Group => ({
  ...group,
  [field]: value
})

const unsetGroupField = (
  group: Group,
  field: GroupField
): Group => {
  const next = { ...group } as Group & Record<string, unknown>
  delete next[field]
  return next
}

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

export const setGroupFieldValue = <Field extends GroupField>(
  state: WhiteboardReduceState,
  id: GroupId,
  field: Field,
  value: Group[Field]
): void => {
  const current = getGroup(state.draft, id)
  if (!current) {
    throw new Error(`Group ${id} not found.`)
  }

  state.inverse.prepend({
    type: 'group.field.set',
    id,
    field,
    value: json.clone((current as Record<string, unknown>)[field])
  })
  state.draft.groups.set(id, setGroupField(current, field, value))
  markGroupUpdated(state, id)
}

export const unsetGroupFieldValue = (
  state: WhiteboardReduceState,
  id: GroupId,
  field: GroupField
): void => {
  const current = getGroup(state.draft, id)
  if (!current) {
    throw new Error(`Group ${id} not found.`)
  }

  state.inverse.prepend({
    type: 'group.field.set',
    id,
    field,
    value: json.clone((current as Record<string, unknown>)[field])
  })
  state.draft.groups.set(id, unsetGroupField(current, field))
  markGroupUpdated(state, id)
}
