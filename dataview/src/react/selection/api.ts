import {
  selection
} from './store'
import type {
  SelectionApi,
  SelectionScope,
  SelectionStore
} from './types'

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
    const currentView = input.scope.currentView()
    if (!currentView) {
      return
    }

    input.store.set(
      selection.all(currentView.appearances.ids)
    )
  },
  set: (ids, options) => {
    const currentView = input.scope.currentView()
    if (!currentView) {
      return
    }

    input.store.set(
      selection.set(currentView.appearances.ids, ids, options)
    )
  },
  toggle: ids => {
    const currentView = input.scope.currentView()
    if (!currentView) {
      return
    }

    input.store.set(
      selection.toggle(
        currentView.appearances.ids,
        input.store.get(),
        ids
      )
    )
  },
  extend: to => {
    const currentView = input.scope.currentView()
    if (!currentView) {
      return
    }

    input.store.set(
      selection.extend(
        currentView.appearances.ids,
        input.store.get(),
        to
      )
    )
  }
})
