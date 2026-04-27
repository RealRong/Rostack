import type { ViewId } from '@dataview/core/types'
import type { ItemId } from '@dataview/engine'
import { store as coreStore } from '@shared/core'
import {
  createListenerSet,
  createNullableControllerStore
} from '@dataview/runtime/session/controller'

export interface InlineSessionTarget {
  viewId: ViewId
  itemId: ItemId
}

export type InlineSessionExitReason =
  | 'submit'
  | 'escape'
  | 'outside'
  | 'selection'
  | 'view-change'
  | 'programmatic'

export interface InlineSessionExitEvent {
  target: InlineSessionTarget
  reason: InlineSessionExitReason
}

export interface InlineSessionApi {
  store: coreStore.ValueStore<InlineSessionTarget | null>
  editing: coreStore.KeyedReadStore<string, boolean>
  key(target: InlineSessionTarget): string
  enter(target: InlineSessionTarget): void
  exit(options?: {
    reason?: InlineSessionExitReason
  }): void
  isActive(target: InlineSessionTarget): boolean
  onExit(listener: (event: InlineSessionExitEvent) => void): () => void
}

export type InlineSessionExitEffect = 'commit' | 'discard'

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

export const resolveInlineSessionExitEffect = (
  reason: InlineSessionExitReason
): InlineSessionExitEffect => {
  switch (reason) {
    case 'submit':
    case 'outside':
    case 'selection':
      return 'commit'
    case 'escape':
    case 'view-change':
    case 'programmatic':
    default:
      return 'discard'
  }
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
  const editing = coreStore.createKeyedDerivedStore<string, boolean>({
    keyOf: key => key,
    get: key => {
      const current = coreStore.read(store)
      return current
        ? inlineSessionKey(current) === key
        : false
    },
    isEqual: Object.is
  })
  const listeners = createListenerSet<InlineSessionExitEvent>()

  return {
    store,
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
