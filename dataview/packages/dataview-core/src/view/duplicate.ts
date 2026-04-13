import type {
  View,
  ViewCreateInput
} from '#core/contracts/index.ts'
import {
  createDuplicateViewPreferredName
} from '#core/view/naming.ts'
import {
  cloneViewOptions
} from '#core/view/shared.ts'

const cloneViewInput = (
  view: View
): Omit<ViewCreateInput, 'name'> => ({
  type: view.type,
  search: {
    ...view.search
  },
  filter: {
    mode: view.filter.mode,
    rules: structuredClone(view.filter.rules)
  },
  sort: structuredClone(view.sort),
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
