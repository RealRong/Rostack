import {
  selection
} from '@dataview/react/runtime/selection/store'
import type {
  SelectionApi,
  SelectionScope,
  SelectionStore
} from '@dataview/react/runtime/selection/types'

export const createSelectionApi = (input: {
  store: SelectionStore
  scope: SelectionScope
}): SelectionApi => ({
  store: input.store,
  get: input.store.get,
  clear: () => {
    input.store.set(selection.clear())
  },
  all: () => {
    const items = input.scope.items()
    if (!items) {
      return
    }

    input.store.set(
      selection.all(items.ids)
    )
  },
  set: (ids, options) => {
    const items = input.scope.items()
    if (!items) {
      return
    }

    input.store.set(
      selection.set(items.ids, ids, options)
    )
  },
  toggle: ids => {
    const items = input.scope.items()
    if (!items) {
      return
    }

    input.store.set(
      selection.toggle(
        items.ids,
        input.store.get(),
        ids
      )
    )
  },
  extend: to => {
    const items = input.scope.items()
    if (!items) {
      return
    }

    input.store.set(
      selection.extend(
        items.ids,
        input.store.get(),
        to
      )
    )
  }
})
