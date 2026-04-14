import type {
  InlineSessionApi,
  InlineSessionExitEvent,
  InlineSessionTarget
} from '@dataview/react/runtime/inlineSession/types'
import {
  createListenerSet,
  createNullableControllerStore
} from '@dataview/react/runtime/store'

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
    && left.itemId === right.itemId
}

export const createInlineSessionApi = (
  initial: InlineSessionTarget | null = null
): InlineSessionApi => {
  const {
    store,
    get
  } = createNullableControllerStore<InlineSessionTarget>({
    initial,
    isEqual: sameTarget
  })
  const listeners = createListenerSet<InlineSessionExitEvent>()

  return {
    store,
    enter: target => {
      const current = get()
      if (current && !sameTarget(current, target)) {
        listeners.emit({
          target: current,
          reason: 'programmatic'
        })
      }

      store.set(target)
    },
    exit: options => {
      const current = get()
      if (!current) {
        return
      }

      store.set(null)
      listeners.emit({
        target: current,
        reason: options?.reason ?? 'programmatic'
      })
    },
    isActive: target => sameTarget(get(), target),
    onExit: listeners.subscribe
  }
}
