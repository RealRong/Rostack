import type {
  GalleryViewCreateInput,
  KanbanViewCreateInput,
  TableViewCreateInput,
  View,
  ViewCreateInput
} from '@dataview/core/types'
import { createId, entityTable } from '@shared/core'
import {
  createDuplicateViewPreferredName
} from '@dataview/core/view/model/naming'
import {
  cloneViewOptions
} from '@dataview/core/view/options'

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
      rules: entityTable.normalize.list(
        entityTable.read.list(view.filter.rules).map(rule => ({
          ...structuredClone(rule),
          id: createFilterRuleId()
        }))
      )
    },
    sort: {
      rules: entityTable.normalize.list(
        entityTable.read.list(view.sort.rules).map(rule => ({
          ...structuredClone(rule),
          id: createSortRuleId()
        }))
      )
    },
    calc: {
      ...view.calc
    },
    display: {
      fields: [...view.display.fields]
    },
    orders: [...view.orders]
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
