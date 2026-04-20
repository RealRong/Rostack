import { err } from '@whiteboard/core/result'
import type {
  KernelReduceResult,
  Operation
} from '@whiteboard/core/types'
import {
  applyGroupFieldSet,
  applyGroupFieldUnset
} from '@whiteboard/core/kernel/reduce/apply'
import { cloneGroup } from '@whiteboard/core/kernel/reduce/clone'
import { markChange } from '@whiteboard/core/kernel/reduce/state'
import type { ReduceRuntime } from '@whiteboard/core/kernel/reduce/runtime'
import { cloneValue } from '@whiteboard/core/value'

type GroupOperation = Extract<
  Operation,
  { type: 'group.create' | 'group.restore' | 'group.field.set' | 'group.field.unset' | 'group.delete' }
>

export const handleGroupOperation = (
  runtime: ReduceRuntime,
  operation: GroupOperation
): KernelReduceResult | undefined => {
  switch (operation.type) {
    case 'group.create': {
      runtime.draft.groups.set(operation.group.id, operation.group)
      runtime.inverse.unshift({
        type: 'group.delete',
        id: operation.group.id
      })
      markChange(runtime.changes.groups, 'add', operation.group.id)
      return
    }
    case 'group.restore': {
      runtime.draft.groups.set(operation.group.id, operation.group)
      runtime.inverse.unshift({
        type: 'group.delete',
        id: operation.group.id
      })
      markChange(runtime.changes.groups, 'add', operation.group.id)
      return
    }
    case 'group.field.set': {
      const current = runtime.draft.groups.get(operation.id)
      if (!current) {
        return err('invalid', `Group ${operation.id} not found.`)
      }
      runtime.inverse.unshift({
        type: 'group.field.set',
        id: operation.id,
        field: operation.field,
        value: cloneValue((current as Record<string, unknown>)[operation.field])
      })
      runtime.draft.groups.set(operation.id, applyGroupFieldSet(current, operation))
      markChange(runtime.changes.groups, 'update', operation.id)
      return
    }
    case 'group.field.unset': {
      const current = runtime.draft.groups.get(operation.id)
      if (!current) {
        return err('invalid', `Group ${operation.id} not found.`)
      }
      runtime.inverse.unshift({
        type: 'group.field.set',
        id: operation.id,
        field: operation.field,
        value: cloneValue((current as Record<string, unknown>)[operation.field])
      })
      runtime.draft.groups.set(operation.id, applyGroupFieldUnset(current, operation))
      markChange(runtime.changes.groups, 'update', operation.id)
      return
    }
    case 'group.delete': {
      const current = runtime.draft.groups.get(operation.id)
      if (!current) {
        return
      }
      runtime.inverse.unshift({
        type: 'group.restore',
        group: cloneGroup(current)
      })
      runtime.draft.groups.delete(operation.id)
      markChange(runtime.changes.groups, 'delete', operation.id)
      return
    }
  }
}
