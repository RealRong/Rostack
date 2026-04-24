import { changeSet, json } from '@shared/core'
import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'

const setGroupField = <Field extends import('@whiteboard/core/types').GroupField>(
  group: import('@whiteboard/core/types').Group,
  field: Field,
  value: import('@whiteboard/core/types').Group[Field]
): import('@whiteboard/core/types').Group => ({
  ...group,
  [field]: value
})

const unsetGroupField = (
  group: import('@whiteboard/core/types').Group,
  field: import('@whiteboard/core/types').GroupField
): import('@whiteboard/core/types').Group => {
  const next = { ...group } as import('@whiteboard/core/types').Group & Record<string, unknown>
  delete next[field]
  return next
}

export const createGroupFieldApi = (
  tx: ReducerTx
) => ({
  set: <Field extends import('@whiteboard/core/types').GroupField>(
    id: import('@whiteboard/core/types').GroupId,
    field: Field,
    value: import('@whiteboard/core/types').Group[Field]
  ) => {
    const current = tx._runtime.draft.groups.get(id)
    if (!current) {
      throw new Error(`Group ${id} not found.`)
    }
    tx._runtime.inverse.unshift({
      type: 'group.field.set',
      id,
      field,
      value: json.clone((current as Record<string, unknown>)[field])
    })
    tx._runtime.draft.groups.set(id, setGroupField(current, field, value))
    changeSet.markUpdated(tx._runtime.changes.groups, id)
    tx.dirty.group.value(id)
  },
  unset: (
    id: import('@whiteboard/core/types').GroupId,
    field: import('@whiteboard/core/types').GroupField
  ) => {
    const current = tx._runtime.draft.groups.get(id)
    if (!current) {
      throw new Error(`Group ${id} not found.`)
    }
    tx._runtime.inverse.unshift({
      type: 'group.field.set',
      id,
      field,
      value: json.clone((current as Record<string, unknown>)[field])
    })
    tx._runtime.draft.groups.set(id, unsetGroupField(current, field))
    changeSet.markUpdated(tx._runtime.changes.groups, id)
    tx.dirty.group.value(id)
  }
})
