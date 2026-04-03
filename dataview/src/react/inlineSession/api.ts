import {
  createValueStore
} from '@dataview/runtime/store'
import type {
  InlineSessionApi,
  InlineSessionTarget
} from './types'

const sameTarget = (
  left: InlineSessionTarget | null,
  right: InlineSessionTarget | null
) => {
  if (left === right) {
    return true
  }

  if (!left || !right) {
    return false
  }

  return left.viewId === right.viewId
    && left.appearanceId === right.appearanceId
}

export const createInlineSessionApi = (
  initial: InlineSessionTarget | null = null
): InlineSessionApi => {
  const store = createValueStore<InlineSessionTarget | null>({
    initial,
    isEqual: sameTarget
  })

  return {
    store,
    enter: target => {
      store.set(target)
    },
    exit: () => {
      store.set(null)
    },
    isActive: target => sameTarget(store.get(), target)
  }
}
