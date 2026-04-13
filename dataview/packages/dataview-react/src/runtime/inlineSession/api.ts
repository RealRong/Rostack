import {
  createValueStore
} from '@shared/core'
import type {
  InlineSessionApi,
  InlineSessionExitEvent,
  InlineSessionTarget
} from '#react/runtime/inlineSession/types.ts'

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
  const store = createValueStore<InlineSessionTarget | null>({
    initial,
    isEqual: sameTarget
  })
  const listeners = new Set<(event: InlineSessionExitEvent) => void>()

  const notifyExit = (event: InlineSessionExitEvent) => {
    Array.from(listeners).forEach(listener => {
      listener(event)
    })
  }

  return {
    store,
    enter: target => {
      const current = store.get()
      if (current && !sameTarget(current, target)) {
        notifyExit({
          target: current,
          reason: 'programmatic'
        })
      }

      store.set(target)
    },
    exit: options => {
      const current = store.get()
      if (!current) {
        return
      }

      store.set(null)
      notifyExit({
        target: current,
        reason: options?.reason ?? 'programmatic'
      })
    },
    isActive: target => sameTarget(store.get(), target)
    ,
    onExit: listener => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }
  }
}
