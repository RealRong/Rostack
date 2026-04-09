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
    const appearances = input.scope.appearances()
    if (!appearances) {
      return
    }

    input.store.set(
      selection.all(appearances.ids)
    )
  },
  set: (ids, options) => {
    const appearances = input.scope.appearances()
    if (!appearances) {
      return
    }

    input.store.set(
      selection.set(appearances.ids, ids, options)
    )
  },
  toggle: ids => {
    const appearances = input.scope.appearances()
    if (!appearances) {
      return
    }

    input.store.set(
      selection.toggle(
        appearances.ids,
        input.store.get(),
        ids
      )
    )
  },
  extend: to => {
    const appearances = input.scope.appearances()
    if (!appearances) {
      return
    }

    input.store.set(
      selection.extend(
        appearances.ids,
        input.store.get(),
        to
      )
    )
  }
})
