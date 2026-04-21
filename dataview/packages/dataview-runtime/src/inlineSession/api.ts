import type {
  InlineSessionApi,
  InlineSessionExitEvent,
  InlineSessionTarget
} from '@dataview/runtime/inlineSession/types'
import {
  createListenerSet,
  createNullableControllerStore
} from '@dataview/runtime/store'
import { store as coreStore } from '@shared/core'


const INLINE_SESSION_SEPARATOR = '\u0000'

const inlineSessionKey = (
  target: InlineSessionTarget
) => `${target.viewId}${INLINE_SESSION_SEPARATOR}${target.itemId}`

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
    store: stateStore,
    get
  } = createNullableControllerStore<InlineSessionTarget>({
    initial,
    isEqual: sameTarget
  })
  const editing = coreStore.createKeyedDerivedStore<string, boolean>({
    keyOf: key => key,
    get: key => {
      const current = coreStore.read(stateStore)
      return current
        ? inlineSessionKey(current) === key
        : false
    },
    isEqual: Object.is
  })
  const listeners = createListenerSet<InlineSessionExitEvent>()

  return {
    store: stateStore,
    editing,
    key: inlineSessionKey,
    enter: target => {
      const current = get()
      if (current && !sameTarget(current, target)) {
        listeners.emit({
          target: current,
          reason: 'programmatic'
        })
      }

      stateStore.set(target)
    },
    exit: options => {
      const current = get()
      if (!current) {
        return
      }

      stateStore.set(null)
      listeners.emit({
        target: current,
        reason: options?.reason ?? 'programmatic'
      })
    },
    isActive: target => sameTarget(get(), target),
    onExit: listeners.subscribe
  }
}
