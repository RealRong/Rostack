import {
  createDerivedStore,
  createValueStore,
  read
} from '@shared/core'
import type {
  CloseValueEditorOptions,
  OpenValueEditorInput,
  ValueEditorAnchor,
  ValueEditorController,
  ValueEditorResult,
  ValueEditorSession,
  ViewFieldRef
} from './types'

const cloneField = (
  field: ViewFieldRef
): ViewFieldRef => ({
  ...field
})

const normalizeAnchor = (
  anchor: ValueEditorAnchor
): ValueEditorAnchor => ({
  x: Number.isFinite(anchor.x)
    ? Math.round(anchor.x)
    : 0,
  y: Number.isFinite(anchor.y)
    ? Math.round(anchor.y)
    : 0,
  width: Number.isFinite(anchor.width)
    ? Math.max(0, Math.round(anchor.width))
    : 0
})

const createSession = (
  input: OpenValueEditorInput
): ValueEditorSession => ({
  field: cloneField(input.field),
  anchor: normalizeAnchor(input.anchor),
  policy: input.policy,
  ...(input.seedDraft !== undefined
    ? {
        seedDraft: input.seedDraft
      }
    : {}),
  ...(input.onResolve
    ? {
        onResolve: input.onResolve
      }
    : {})
})

const dismissSession = (
  store: ValueEditorController['store'],
  options?: {
    result?: ValueEditorResult
    silent?: boolean
  }
) => {
  const current = store.get()
  if (!current) {
    return
  }

  store.set(null)
  if (options?.silent) {
    return
  }

  current.policy.onDismiss?.()
  current.onResolve?.(options?.result ?? {
    kind: 'dismiss'
  })
}

export const createValueEditorApi = (): ValueEditorController => {
  const store = createValueStore<ValueEditorSession | null>({
    initial: null
  })
  const openStore = createDerivedStore<boolean>({
    get: () => Boolean(read(store))
  })

  return {
    store,
    openStore,
    open: input => {
      dismissSession(store)
      store.set(createSession(input))
      return true
    },
    close: (options?: CloseValueEditorOptions) => {
      dismissSession(store, {
        silent: options?.silent
      })
    }
  }
}
