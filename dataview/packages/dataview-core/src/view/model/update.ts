import { field as fieldApi } from '@dataview/core/field'
import { fieldSpec } from '@dataview/core/field/spec'
import type {
  Field,
  View,
  ViewGroup,
  ViewType
} from '@dataview/core/types'
import {
  view as viewApi
} from '@dataview/core/view'

export const resolveDefaultKanbanGroup = (
  fields: readonly Field[]
): ViewGroup | undefined => {
  const isGroupable = (
    field: Field
  ) => field.kind !== 'title'
    && fieldApi.group.meta(field).modes.length > 0

  const groupableFields = fields.filter(isGroupable)
  const best = groupableFields.reduce<Field | undefined>((current, candidate) => {
    if (!current) {
      return candidate
    }

    return fieldSpec.view.kanbanGroupPriority(candidate) > fieldSpec.view.kanbanGroupPriority(current)
      ? candidate
      : current
  }, undefined)

  return best
    ? viewApi.group.write.set(undefined, best)
    : undefined
}

export const setViewType = (input: {
  view: View
  type: ViewType
  fields: readonly Field[]
}): View | undefined => {
  const current = input.view
  if (current.type === input.type) {
    return current
  }

  const shared = {
    id: current.id,
    name: current.name,
    search: viewApi.search.state.clone(current.search),
    filter: viewApi.filter.state.clone(current.filter),
    sort: {
      rules: viewApi.sort.rules.read.clone(current.sort.rules)
    },
    calc: viewApi.calc.clone(current.calc),
    fields: viewApi.fields.clone(current.fields),
    order: [...viewApi.order.read.ids(current)]
  }

  switch (input.type) {
    case 'table':
      return {
        ...shared,
        type: 'table',
        ...(current.group
          ? {
              group: viewApi.group.state.clone(current.group)
            }
          : {}),
        options: viewApi.options.defaults('table', input.fields)
      }
    case 'gallery':
      return {
        ...shared,
        type: 'gallery',
        ...(current.group
          ? {
              group: viewApi.group.state.clone(current.group)
            }
          : {}),
        options: viewApi.options.defaults('gallery', input.fields)
      }
    case 'kanban': {
      const resolvedGroup = current.group
        ? viewApi.group.state.clone(current.group)
        : resolveDefaultKanbanGroup(input.fields)
      if (!resolvedGroup) {
        return undefined
      }

      return {
        ...shared,
        type: 'kanban',
        group: resolvedGroup,
        options: viewApi.options.defaults('kanban', input.fields)
      }
    }
  }
}
