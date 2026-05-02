import type {
  FilterRule,
  GalleryViewCreateInput,
  KanbanViewCreateInput,
  SortRule,
  TableViewCreateInput,
  View,
  ViewCreateInput
} from '@dataview/core/types'
import { createId } from '@shared/core'
import {
  createDuplicateViewPreferredName
} from '@dataview/core/view/model/naming'
import {
  cloneViewOptions
} from '@dataview/core/view/options'
import {
  cloneViewFields
} from '@dataview/core/view/fields'
import {
  readViewOrderIds
} from '@dataview/core/view/order'

const createFilterRuleId = (): string => createId('filter')
const createSortRuleId = (): string => createId('sort')

const cloneViewInput = (
  view: View
): Omit<TableViewCreateInput, 'name'>
  | Omit<GalleryViewCreateInput, 'name'>
  | Omit<KanbanViewCreateInput, 'name'> => {
  const base = {
    search: {
      ...view.search
    },
    filter: {
      mode: view.filter.mode,
      rules: view.filter.rules.map((rule): FilterRule => ({
        ...structuredClone(rule),
        id: createFilterRuleId()
      }))
    },
    sort: {
      rules: view.sort.rules.map((rule): SortRule => ({
        ...structuredClone(rule),
        id: createSortRuleId()
      }))
    },
    calc: {
      ...view.calc
    },
    fields: cloneViewFields(view.fields),
    order: [...readViewOrderIds(view)]
  }

  switch (view.type) {
    case 'table':
      return {
        ...base,
        type: 'table',
        ...(view.group
          ? { group: structuredClone(view.group) }
          : {}),
        options: cloneViewOptions('table', view.options)
      }
    case 'gallery':
      return {
        ...base,
        type: 'gallery',
        ...(view.group
          ? { group: structuredClone(view.group) }
          : {}),
        options: cloneViewOptions('gallery', view.options)
      }
    case 'kanban':
      return {
        ...base,
        type: 'kanban',
        group: structuredClone(view.group),
        options: cloneViewOptions('kanban', view.options)
      }
  }
}

export const createDuplicateViewInput = (
  view: View,
  preferredName = createDuplicateViewPreferredName(view.name)
): ViewCreateInput => {
  const cloned = cloneViewInput(view)
  switch (cloned.type) {
    case 'table':
      return {
        name: preferredName,
        ...cloned
      }
    case 'gallery':
      return {
        name: preferredName,
        ...cloned
      }
    case 'kanban':
      return {
        name: preferredName,
        ...cloned
      }
  }
}
