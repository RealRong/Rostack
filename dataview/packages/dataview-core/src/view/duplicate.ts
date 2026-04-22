import type {
  View,
  ViewCreateInput
} from '@dataview/core/contracts'
import { entityTable } from '@shared/core'
import { id as dataviewId } from '@dataview/core/id'
import {
  createDuplicateViewPreferredName
} from '@dataview/core/view/naming'
import {
  cloneViewOptions
} from '@dataview/core/view/shared'

const cloneViewInput = (
  view: View
): Omit<ViewCreateInput, 'name'> => ({
  type: view.type,
  search: {
    ...view.search
  },
  filter: {
    mode: view.filter.mode,
    rules: entityTable.normalize.list(
      entityTable.read.list(view.filter.rules).map(rule => ({
        ...structuredClone(rule),
        id: dataviewId.create('filterRule')
      }))
    )
  },
  sort: {
    rules: entityTable.normalize.list(
      entityTable.read.list(view.sort.rules).map(rule => ({
        ...structuredClone(rule),
        id: dataviewId.create('sortRule')
      }))
    )
  },
  ...(view.group
    ? { group: structuredClone(view.group) }
    : {}),
  calc: {
    ...view.calc
  },
  display: {
    fields: [...view.display.fields]
  },
  options: cloneViewOptions(view.options),
  orders: [...view.orders]
})

export const createDuplicateViewInput = (
  view: View,
  preferredName = createDuplicateViewPreferredName(view.name)
): ViewCreateInput => ({
  name: preferredName,
  ...cloneViewInput(view)
})
